#!/usr/bin/env bash
set -euo pipefail

MESSAGE_FILE="${CLAUDE_COMMIT_MSG_FILE:-.git/claude-commit-message.txt}"

ensure_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
    echo "Not a git repository."
    exit 1
  }
}

ensure_changes() {
  if [[ -z "$(git status --porcelain)" ]]; then
    echo "No changes to commit."
    exit 1
  fi
}

ensure_claude() {
  command -v claude >/dev/null 2>&1 || {
    echo "Missing dependency: claude"
    echo "Install Claude Code CLI: https://docs.anthropic.com/en/docs/claude-code"
    exit 1
  }
}

build_prompt() {
  echo "Write a git commit message for the following changes."
  echo "Rules:"
  echo "- Return ONLY the commit message text."
  echo "- First line must be <= 72 chars and imperative mood."
  echo "- Add a blank line then optional body bullets only when useful."
  echo "- Focus on why the change exists."
  echo
  echo "Recent commit style:"
  git log -8 --oneline
  echo
  echo "Staged diff:"
  git diff --staged
  echo
  echo "Unstaged diff:"
  git diff
}

generate_message() {
  ensure_git_repo
  ensure_changes
  ensure_claude

  local tmp_prompt
  local tmp_msg
  local commit_msg
  tmp_prompt="$(mktemp)"
  tmp_msg="$(mktemp)"
  trap 'rm -f "$tmp_prompt" "$tmp_msg"' EXIT

  build_prompt >"$tmp_prompt"
  claude -p "$(cat "$tmp_prompt")" >"$tmp_msg"
  commit_msg="$(awk 'BEGIN{start=0} { if (start || NF) { start=1; print } }' "$tmp_msg")"

  if [[ -z "$commit_msg" ]]; then
    echo "Claude returned an empty commit message."
    exit 1
  fi

  printf "%s\n" "$commit_msg" >"$MESSAGE_FILE"
  echo "Saved Claude message to: $MESSAGE_FILE"
  echo
  echo "Proposed commit message:"
  echo "----------------------------------------"
  cat "$MESSAGE_FILE"
  echo "----------------------------------------"
}

apply_commit_push() {
  ensure_git_repo
  ensure_changes
  if [[ ! -s "$MESSAGE_FILE" ]]; then
    echo "Missing commit message file: $MESSAGE_FILE"
    echo "Run: $0 generate-message"
    exit 1
  fi

  echo
  echo "Using commit message from: $MESSAGE_FILE"
  echo "----------------------------------------"
  cat "$MESSAGE_FILE"
  echo "----------------------------------------"
  echo

  read -r -p "Commit and push to current branch? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    echo "Cancelled."
    exit 1
  fi

  git add -A
  git commit -F "$MESSAGE_FILE"
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  git push origin "$current_branch"
}

usage() {
  cat <<'EOF'
Usage: scripts/claude-commit-push.sh <command>

Commands:
  show-prompt       Print the exact prompt sent to Claude
  generate-message  Ask Claude to draft a commit message and save it
  apply             Commit and push using saved message file
  run               Generate message, then commit and push (default)
EOF
}

cmd="${1:-run}"
case "$cmd" in
  show-prompt)
    ensure_git_repo
    ensure_changes
    build_prompt
    ;;
  generate-message)
    generate_message
    ;;
  apply)
    apply_commit_push
    ;;
  run)
    generate_message
    apply_commit_push
    ;;
  -h | --help | help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd"
    usage
    exit 1
    ;;
esac
