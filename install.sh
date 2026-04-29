#!/usr/bin/env bash
set -euo pipefail

# Piped invocations (e.g. `curl | bash`) often have stderr non-TTY; still show build progress.
if ! [[ -t 2 ]]; then
  export CARGO_TERM_PROGRESS="${CARGO_TERM_PROGRESS:-always}"
fi

REPO_URL="${REPO_URL:-https://github.com/DoctorKhan/Lumina.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.lumina}"
GIT_REF="${GIT_REF:-origin/main}"
APP_NAME="Lumina.app"
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.doctorkhan.lumina}"
INSTALL_STARTED_AT="$(date +%s)"
INSTALL_STEP=0
CURRENT_STEP_KEY=""
CURRENT_STEP_STARTED_AT=0
if [[ "$OSTYPE" == "darwin"* ]]; then
  INSTALL_STATE_DIR="${LUMINA_INSTALL_STATE_DIR:-$HOME/Library/Application Support/Lumina}"
else
  INSTALL_STATE_DIR="${LUMINA_INSTALL_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/lumina}"
fi
INSTALL_MODEL_FILE="${LUMINA_INSTALL_MODEL_FILE:-$INSTALL_STATE_DIR/install-estimates.tsv}"
INSTALL_LOG_FILE="$INSTALL_STATE_DIR/install-events.jsonl"
BAYESIAN_PRIOR_WEIGHT="${LUMINA_INSTALL_PRIOR_WEIGHT:-2}"
LOCAL_MODEL_WEIGHT="${LUMINA_INSTALL_LOCAL_WEIGHT:-8}"
GLOBAL_MODEL_BASENAME="scripts/install-estimates-global.tsv"
INSTALL_STEP_KEYS=()
INSTALL_TOTAL_STEPS=0

if [[ -d "$INSTALL_DIR/.git" ]]; then
  INSTALL_STEP_KEYS=(checkout_update fetch_refs reset_checkout js_deps tauri_icons tauri_build)
else
  INSTALL_STEP_KEYS=(checkout_clone fetch_refs reset_checkout js_deps tauri_icons tauri_build)
fi
if [[ "$OSTYPE" == "darwin"* ]]; then
  INSTALL_STEP_KEYS+=(copy_app cli_launcher file_associations)
fi
INSTALL_TOTAL_STEPS="${#INSTALL_STEP_KEYS[@]}"
# Bar width for plain + TTY; keep in sync for consistent %
INSTALL_BAR_WIDTH=22

# Colors & Unicode: TTY, respect NO_COLOR / LUMINA_INSTALL_NO_COLOR. See https://no-color.org/
install_use_color() {
  [[ -t 1 && -z "${NO_COLOR:-}" && -z "${LUMINA_INSTALL_NO_COLOR:-}" ]]
}
install_use_unicode() {
  [[ "${LUMINA_INSTALL_BARS:-auto}" == "unicode" ]] && return 0
  [[ "${LUMINA_INSTALL_BARS:-auto}" == "ascii" ]] && return 1
  case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
    *utf* | *UTF*) return 0 ;;
  esac
  return 1
}
install_init_term() {
  if install_use_color; then
    C_RESET=$'\e[0m'
    C_BOLD=$'\e[1m'
    C_DIM=$'\e[2m'
    C_RED=$'\e[31m'
    C_GREEN=$'\e[32m'
    C_VIO=$'\e[38;2;129;140;248m'
    C_SKY=$'\e[38;2;56;189;248m'
    C_AMBER=$'\e[38;2;251;191;36m'
    C_BAR_H=$'\e[38;2;99;102;241m'
    C_BAR_L=$'\e[2;38;2;100;116;139m'
  else
    C_RESET=''
    C_BOLD=''
    C_DIM=''
    C_RED=''
    C_GREEN=''
    C_VIO=''
    C_SKY=''
    C_AMBER=''
    C_BAR_H=''
    C_BAR_L=''
  fi
}
install_init_term

format_duration() {
  local total_seconds="$1"
  local hours=$((total_seconds / 3600))
  local minutes=$(((total_seconds % 3600) / 60))
  local seconds=$((total_seconds % 60))

  if ((hours > 0)); then
    printf "%dh %dm %ds" "$hours" "$minutes" "$seconds"
  elif ((minutes > 0)); then
    printf "%dm %ds" "$minutes" "$seconds"
  else
    printf "%ds" "$seconds"
  fi
}

elapsed_seconds() {
  local now
  now="$(date +%s)"
  echo $((now - INSTALL_STARTED_AT))
}

default_step_duration() {
  local key="$1"

  case "$key" in
    checkout_clone) echo 60 ;;
    checkout_update) echo 20 ;;
    fetch_refs) echo 10 ;;
    reset_checkout) echo 5 ;;
    js_deps) echo 90 ;;
    tauri_icons) echo 15 ;;
    tauri_build) echo 720 ;; # often cargo link + strip on macOS; prior errs low when cold
    copy_app) echo 10 ;;
    cli_launcher) echo 2 ;;
    file_associations) echo 5 ;;
    *) echo 30 ;;
  esac
}

global_model_file() {
  if [[ -n "${LUMINA_INSTALL_GLOBAL_MODEL_FILE:-}" ]]; then
    echo "$LUMINA_INSTALL_GLOBAL_MODEL_FILE"
    return
  fi

  if [[ -f "$INSTALL_DIR/$GLOBAL_MODEL_BASENAME" ]]; then
    echo "$INSTALL_DIR/$GLOBAL_MODEL_BASENAME"
    return
  fi

  if [[ -f "./$GLOBAL_MODEL_BASENAME" ]]; then
    echo "./$GLOBAL_MODEL_BASENAME"
    return
  fi

  echo ""
}

read_model_record() {
  local model_file="$1"
  local key="$2"

  [[ -f "$model_file" ]] || return 1
  awk -F '\t' -v key="$key" '
    $0 ~ /^#/ || NF < 3 { next }
    $1 == key {
      print int($2 + 0.5), int($3 + 0.5)
      found = 1
      exit
    }
    END { if (!found) exit 1 }
  ' "$model_file" 2>/dev/null
}

estimate_step_duration() {
  local key="$1"
  local default_mean
  local global_model
  local global_count=0
  local global_mean=0
  local local_count=0
  local local_mean=0
  local numerator
  local denominator
  local estimate

  default_mean="$(default_step_duration "$key")"
  global_model="$(global_model_file)"
  if [[ -n "$global_model" ]]; then
    if read -r global_count global_mean < <(read_model_record "$global_model" "$key"); then
      :
    else
      global_count=0
      global_mean=0
    fi
  fi
  if read -r local_count local_mean < <(read_model_record "$INSTALL_MODEL_FILE" "$key"); then
    :
  else
    local_count=0
    local_mean=0
  fi

  global_count="${global_count:-0}"
  global_mean="${global_mean:-0}"
  local_count="${local_count:-0}"
  local_mean="${local_mean:-0}"

  if ((local_count > 0)); then
    # Same-machine timings are far more predictive than the bundled seed.
    numerator=$((default_mean + local_count * LOCAL_MODEL_WEIGHT * local_mean))
    denominator=$((1 + local_count * LOCAL_MODEL_WEIGHT))
  else
    numerator=$((BAYESIAN_PRIOR_WEIGHT * default_mean + global_count * global_mean))
    denominator=$((BAYESIAN_PRIOR_WEIGHT + global_count))
  fi

  estimate=$((numerator / denominator))
  if ((estimate < 1)); then
    estimate=1
  fi
  echo "$estimate"
}

estimated_remaining() {
  # “Remaining time” = sum of per-step means, EXCEPT: for the step currently running
  # (CURRENT_STEP_KEY) subtract time already spent in that step. Otherwise a long
  # tauri build looks like 1m left for the whole install until it finishes and the
  # next record_step_duration() updates the local model.
  local first_index="$1"
  local total=0
  local index
  local key
  local est
  local now
  local in_step
  now="$(date +%s)"
  for ((index = first_index; index < INSTALL_TOTAL_STEPS; index++)); do
    key="${INSTALL_STEP_KEYS[$index]}"
    est="$(estimate_step_duration "$key")"
    if
      [[ -n "${CURRENT_STEP_KEY:-}" && "$key" == "$CURRENT_STEP_KEY" && -n "${CURRENT_STEP_STARTED_AT:-}" ]]
    then
      in_step=$((now - CURRENT_STEP_STARTED_AT))
      if ((in_step < est)); then
        est=$((est - in_step))
      else
        est=0
      fi
    fi
    total=$((total + est))
  done
  echo "$total"
}

progress_percent() {
  local elapsed="$1"
  local remaining="$2"
  local completed_steps="${3:-0}"
  local total_steps="${4:-0}"
  local predicted_total=$((elapsed + remaining))
  local percent
  local step_floor=0

  if ((predicted_total <= 0)); then
    percent=0
  else
    percent=$(((elapsed * 100) / predicted_total))
  fi

  if ((total_steps > 0 && completed_steps > 0)); then
    step_floor=$(((completed_steps * 100) / total_steps))
  fi

  if ((percent < step_floor)); then
    percent="$step_floor"
  fi

  echo "$percent"
}

# Plain-text bar (logs, non-TTY, or LUMINA_INSTALL_NO_COLOR) — # and -
# Percent uses overall elapsed + remaining step estimates.
format_progress_bar_plain() {
  local percent="$1"
  local width="${2:-$INSTALL_BAR_WIDTH}"
  local filled
  if ((percent < 0)); then
    percent=0
  elif ((percent > 100)); then
    percent=100
  fi
  filled=$(( (percent * width) / 100 ))
  if ((percent > 0 && filled < 1)); then
    filled=1
  fi
  if ((percent < 100 && filled >= width)); then
    filled=$((width - 1))
  elif ((percent == 100)); then
    filled=$width
  fi

  local out="["
  local i
  for ((i = 0; i < width; i++)); do
    if ((i < filled)); then
      out+="#"
    else
      out+="-"
    fi
  done
  out+="]"
  printf "%s %3d%%" "$out" "$percent"
}

install_bar_filled_width() {
  local percent="$1"
  local width="${2:-$INSTALL_BAR_WIDTH}"
  local filled
  if ((percent < 0)); then
    percent=0
  elif ((percent > 100)); then
    percent=100
  fi
  filled=$(( (percent * width) / 100 ))
  if ((percent > 0 && filled < 1)); then
    filled=1
  fi
  if ((percent < 100 && filled >= width)); then
    filled=$((width - 1))
  elif ((percent == 100)); then
    filled=$width
  fi
  echo "$filled"
}

# One line: bar, time left, elapsed.
# When stdout is a TTY: 24-bit color + Unicode (█/░) or #/-; same " |  about … left  | " for the app parser.
install_progress_line() {
  local remaining_from_index="$1"
  local elapsed="$2"
  local remaining
  local percent
  remaining="$(estimated_remaining "$remaining_from_index")"
  percent="$(progress_percent "$elapsed" "$remaining" "$remaining_from_index" "$INSTALL_TOTAL_STEPS")"
  if ((percent > 99 && remaining > 0)); then
    percent=99
  fi

  if ! install_use_color; then
    printf "%s  |  about %s left  |  %s elapsed" \
      "$(format_progress_bar_plain "$percent")" \
      "$(format_duration "$remaining")" \
      "$(format_duration "$elapsed")"
    printf "\n"
    return
  fi

  local width="$INSTALL_BAR_WIDTH"
  local filled
  local i
  local rem
  local elp
  rem="$(format_duration "$remaining")"
  elp="$(format_duration "$elapsed")"
  filled="$(install_bar_filled_width "$percent" "$width")"

  printf "  %s" "${C_DIM}[${C_RESET}"
  for ((i = 0; i < width; i++)); do
    if ((i < filled)); then
      if install_use_unicode; then
        printf "%s█" "$C_BAR_H"
      else
        printf "%s#" "$C_BAR_H"
      fi
    else
      if install_use_unicode; then
        printf "%s░" "$C_BAR_L"
      else
        printf "%s" "${C_DIM}-"
      fi
    fi
  done
  printf "%s" "${C_DIM}]${C_RESET}  ${C_BOLD}%3d%%${C_RESET}  " "$percent"
  printf " |  about "
  printf "%s" "${C_AMBER}"
  printf "%s" "$rem"
  printf "%s" "$C_RESET"
  printf " left  |  "
  printf "%s" "${C_DIM}"
  printf "%s" "$elp"
  printf " elapsed%s\n" "$C_RESET"
}

start_step() {
  local key="$1"
  local label="$2"
  local elapsed
  INSTALL_STEP=$((INSTALL_STEP + 1))
  CURRENT_STEP_KEY="$key"
  CURRENT_STEP_STARTED_AT="$(date +%s)"
  elapsed="$(elapsed_seconds)"
  echo
  # Refresh progress at the start of every step so long-running steps (e.g. tauri) do
  # not show a stale “time left” from the previous step’s finish.
  # remaining_from_index = 0-based index of the first not-yet-finished work (INSTALL_STEP is 1-based).
  printf "%s\n" "$(install_progress_line $((INSTALL_STEP - 1)) "$elapsed")"
  if install_use_color; then
    printf "  %s" "${C_BOLD}${C_VIO}"
    printf "[%d/%d]" "$INSTALL_STEP" "$INSTALL_TOTAL_STEPS"
    printf "%s  %s\n" "${C_RESET}" "$label"
  else
    printf "[%d/%d] %s\n" "$INSTALL_STEP" "$INSTALL_TOTAL_STEPS" "$label"
  fi
}

finish_step() {
  local label="$1"
  local elapsed
  local now
  local duration
  now="$(date +%s)"
  duration=$((now - CURRENT_STEP_STARTED_AT))
  record_step_duration "$CURRENT_STEP_KEY" "$label" "$duration"
  elapsed="$(elapsed_seconds)"
  if install_use_color; then
    if install_use_unicode; then
      printf "  ${C_GREEN}✓${C_RESET} ${C_DIM}done${C_RESET}  %s  ${C_DIM}·${C_RESET}  %s\n" \
        "$label" "$(format_duration "$duration")"
    else
      printf "  ${C_GREEN}*${C_RESET} ${C_DIM}done${C_RESET}  %s  ${C_DIM}·${C_RESET}  %s\n" \
        "$label" "$(format_duration "$duration")"
    fi
  else
    printf "Done: %s in %s\n" "$label" "$(format_duration "$duration")"
  fi
  printf "%s\n" "$(install_progress_line "$INSTALL_STEP" "$elapsed")"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf "%s" "$value"
}

record_step_duration() {
  local key="$1"
  local label="$2"
  local duration="$3"
  local timestamp
  local tmp_file

  [[ -z "$key" ]] && return
  mkdir -p "$INSTALL_STATE_DIR" 2>/dev/null || return
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '{"timestamp":"%s","git_ref":"%s","step_key":"%s","step_label":"%s","duration_seconds":%s}\n' \
    "$timestamp" "$(json_escape "$GIT_REF")" "$(json_escape "$key")" "$(json_escape "$label")" "$duration" >>"$INSTALL_LOG_FILE" || true

  tmp_file="${INSTALL_MODEL_FILE}.$$"
  if [[ -f "$INSTALL_MODEL_FILE" ]]; then
    awk -F '\t' -v OFS='\t' -v key="$key" -v duration="$duration" '
      $1 == key {
        count = $2 + 1
        mean = (($2 * $3) + duration) / count
        print key, count, mean
        updated = 1
        next
      }
      { print }
      END {
        if (!updated) {
          print key, 1, duration
        }
      }
    ' "$INSTALL_MODEL_FILE" >"$tmp_file" && mv "$tmp_file" "$INSTALL_MODEL_FILE" || rm -f "$tmp_file"
  else
    printf "%s\t1\t%s\n" "$key" "$duration" >"$INSTALL_MODEL_FILE" || true
  fi
}

if [[ "${LUMINA_INSTALL_LIB_ONLY:-0}" == "1" ]]; then
  return 0 2>/dev/null || exit 0
fi

is_interactive_shell() {
  [[ -t 0 && -t 1 ]]
}

confirm() {
  local prompt="$1"
  local default="${2:-N}"
  local reply=""

  if ! is_interactive_shell; then
    return 1
  fi

  if [[ "$default" == "Y" ]]; then
    printf "%s [Y/n]: " "$prompt"
  else
    printf "%s [y/N]: " "$prompt"
  fi

  read -r reply || return 1
  if [[ -z "$reply" ]]; then
    [[ "$default" == "Y" ]]
    return
  fi

  [[ "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]
}

install_cli_launcher() {
  local launcher_target="/Applications/${APP_NAME}"
  local bin_dir="$HOME/.local/bin"
  local launcher_path=""
  mkdir -p "$bin_dir"

  launcher_path="${bin_dir}/lumina"
  if [[ -L "$launcher_path" || -f "$launcher_path" ]]; then
    rm -f "$launcher_path"
  elif [[ -e "$launcher_path" ]]; then
    echo "Cannot install CLI launcher: $launcher_path exists and is not a file or symlink."
    return 1
  fi

  cat >"$launcher_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "update" ]]; then
  echo "Downloading the Lumina installer from GitHub (this may take a while on slow networks)..." >&2
  curl -fL --connect-timeout 30 --retry 2 https://raw.githubusercontent.com/DoctorKhan/Lumina/main/install.sh | bash
  open -a "$launcher_target"
  exit 0
fi

if [[ "\${1:-}" == "--update" ]]; then
  echo "Downloading the Lumina installer from GitHub (this may take a while on slow networks)..." >&2
  curl -fL --connect-timeout 30 --retry 2 https://raw.githubusercontent.com/DoctorKhan/Lumina/main/install.sh | bash
  exit 0
fi

if [[ \$# -gt 0 ]]; then
  # Prefer explicit CLI targets over restored app session windows.
  open -F -a "$launcher_target" "\$@"
else
  open -a "$launcher_target"
fi
EOF
  chmod +x "$launcher_path"

  echo "Installed CLI launcher: $launcher_path"

  if [[ ":$PATH:" == *":$bin_dir:"* ]]; then
    return
  fi

  local linked_dir=""
  local old_ifs="$IFS"
  local seen_dirs=":"
  IFS=':'
  for path_dir in $PATH; do
    [[ -z "$path_dir" ]] && continue
    if [[ "$seen_dirs" == *":$path_dir:"* ]]; then
      continue
    fi
    seen_dirs="${seen_dirs}${path_dir}:"

    if [[ "$path_dir/lumina" == "$launcher_path" ]]; then
      continue
    fi

    if [[ -d "$path_dir" && -w "$path_dir" ]]; then
      if ln -sf "$launcher_path" "$path_dir/lumina" 2>/dev/null; then
        linked_dir="$path_dir"
        echo "Linked launcher at: $path_dir/lumina"
        break
      fi
    fi
  done
  IFS="$old_ifs"

  if [[ -z "$linked_dir" ]]; then
    for fallback_dir in /usr/local/bin /opt/homebrew/bin; do
      if [[ -d "$fallback_dir" && -w "$fallback_dir" ]]; then
        ln -sf "$launcher_path" "$fallback_dir/lumina" || true
        echo "Linked launcher at: $fallback_dir/lumina"
        linked_dir="$fallback_dir"
        break
      fi
    done
  fi

  if [[ -n "$linked_dir" ]]; then
    return
  fi

  if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
    echo "Add $bin_dir to your PATH to use 'lumina' from terminal."
  else
    echo "No writable PATH directory found for symlink; using $launcher_path directly."
  fi
}

associate_markdown_files() {
  if ! command -v duti >/dev/null 2>&1; then
    if command -v brew >/dev/null 2>&1 && confirm "Install duti to set file associations now?" "N"; then
      brew install duti
    else
      echo "Optional: install duti later to set .md defaults automatically:"
      echo "  brew install duti"
      return
    fi
  fi

  if ! command -v duti >/dev/null 2>&1; then
    echo "duti is not available; skipping file association setup."
    return
  fi

  if ! confirm "Associate .md/.markdown/.txt with Lumina?" "Y"; then
    echo "Skipped file association setup."
    return
  fi

  duti -s "$APP_BUNDLE_ID" .md all
  duti -s "$APP_BUNDLE_ID" .markdown all
  duti -s "$APP_BUNDLE_ID" .txt all
  echo "Associated .md/.markdown/.txt with $APP_NAME"
}

# Must stay in sync with processInstallProgressLine in src/installProgressParse.js
emit_lumina_install_done_marker() {
  printf '%s\n' 'LUMINA_INSTALL_COMPLETE'
}

require_command() {
  local cmd="$1"
  local help="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd"
    echo "$help"
    exit 1
  fi
}

require_command git "Install git from https://git-scm.com/"
require_command pnpm "Install pnpm from https://pnpm.io/installation"
require_command cargo "Install Rust via https://rustup.rs/"

git_ref_resolves() {
  git -C "$1" rev-parse -q --verify "$GIT_REF^{commit}" >/dev/null 2>&1
}

if [[ -d "$INSTALL_DIR/.git" ]]; then
  start_step "checkout_update" "Updating existing checkout in $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch --all --tags --progress
  if ! git_ref_resolves "$INSTALL_DIR"; then
    echo "error: $GIT_REF is not a valid git ref in $INSTALL_DIR after fetch."
    echo "If you are installing a release, ensure the tag exists on the remote (e.g. push the tag to GitHub)."
    exit 1
  fi
  # This install directory is managed by the installer, so we can safely
  # discard local/untracked build artifacts before updating.
  git -C "$INSTALL_DIR" reset --hard "$GIT_REF"
  git -C "$INSTALL_DIR" clean -fd
  finish_step "Updated existing checkout"
else
  start_step "checkout_clone" "Cloning repository to $INSTALL_DIR"
  git clone --progress "$REPO_URL" "$INSTALL_DIR"
  finish_step "Cloned repository"
fi

cd "$INSTALL_DIR"
if [[ ! -d ".git" ]]; then
  echo "Install directory is not a git checkout: $INSTALL_DIR"
  exit 1
fi

if install_use_color; then
  printf "\n  ${C_BOLD}${C_VIO}Lumina${C_RESET}  ${C_DIM}·${C_RESET}  install  ${C_DIM}·${C_RESET}  ${C_SKY}%s${C_RESET}\n\n" "$GIT_REF"
else
  echo "Installing Lumina from $GIT_REF"
fi
start_step "fetch_refs" "Fetching refs"
git fetch --all --tags --progress
finish_step "Fetched refs"
if ! git rev-parse -q --verify "$GIT_REF^{commit}" >/dev/null 2>&1; then
  echo "error: $GIT_REF is not a valid git ref after fetch."
  echo "If you are installing a release, ensure the tag exists on the remote (e.g. push the tag to GitHub)."
  exit 1
fi
start_step "reset_checkout" "Resetting checkout to $GIT_REF"
git reset --hard "$GIT_REF"
git clean -fd
finish_step "Reset checkout"
start_step "js_deps" "Installing JavaScript dependencies"
./run.sh setup
finish_step "Installed JavaScript dependencies"
start_step "tauri_icons" "Preparing Tauri icons"
./scripts/ensure-tauri-icons.sh
finish_step "Prepared Tauri icons"

if [[ "$OSTYPE" == "darwin"* ]]; then
  start_step "tauri_build" "Building macOS app bundle"
  # Refresh ETA/percent while the build runs (this step is usually much longer than the mean;
  # the in-step adjustment in estimated_remaining() updates “about … left” as time elapses).
  ./run.sh tauri-build-app &
  build_pid=$!
  (
    while sleep 20; do
      if ! kill -0 "$build_pid" 2>/dev/null; then
        break
      fi
      printf "%s\n" "$(install_progress_line $((INSTALL_STEP - 1)) "$(elapsed_seconds)")" || true
    done
  ) &
  ticker=$!
  if ! wait "$build_pid"; then
    kill "$ticker" 2>/dev/null || true
    wait "$ticker" 2>/dev/null || true
    exit 1
  fi
  kill "$ticker" 2>/dev/null || true
  wait "$ticker" 2>/dev/null || true
  finish_step "Built macOS app bundle"
else
  start_step "tauri_build" "Building Tauri app"
  ./run.sh tauri-build &
  build_pid=$!
  (
    while sleep 20; do
      if ! kill -0 "$build_pid" 2>/dev/null; then
        break
      fi
      printf "%s\n" "$(install_progress_line $((INSTALL_STEP - 1)) "$(elapsed_seconds)")" || true
    done
  ) &
  ticker=$!
  if ! wait "$build_pid"; then
    kill "$ticker" 2>/dev/null || true
    wait "$ticker" 2>/dev/null || true
    exit 1
  fi
  kill "$ticker" 2>/dev/null || true
  wait "$ticker" 2>/dev/null || true
  finish_step "Built Tauri app"
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  BUNDLE_PATH="$INSTALL_DIR/src-tauri/target/release/bundle/macos/$APP_NAME"
  if [[ -d "$BUNDLE_PATH" ]]; then
    start_step "copy_app" "Copying app to /Applications"
    rm -rf "/Applications/$APP_NAME"
    ditto "$BUNDLE_PATH" "/Applications/$APP_NAME"
    if install_use_color; then
      if install_use_unicode; then
        printf "\n  ${C_GREEN}✓${C_RESET}  ${C_BOLD}Installed${C_RESET}  %s\n\n" "/Applications/$APP_NAME"
      else
        printf "\n  ${C_GREEN}*${C_RESET}  ${C_BOLD}Installed${C_RESET}  %s\n\n" "/Applications/$APP_NAME"
      fi
    else
      echo "Installed /Applications/$APP_NAME"
    fi
    finish_step "Copied app to /Applications"
    start_step "cli_launcher" "Installing CLI launcher"
    install_cli_launcher
    finish_step "Installed CLI launcher"
    start_step "file_associations" "Configuring file associations"
    associate_markdown_files
    finish_step "Configured file associations"
    emit_lumina_install_done_marker
    exit 0
  fi
fi

echo "Build complete."
echo "Install artifact is in: $INSTALL_DIR/src-tauri/target/release/bundle"
emit_lumina_install_done_marker
