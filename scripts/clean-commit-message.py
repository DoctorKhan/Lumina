#!/usr/bin/env python3
"""Rewrite commit messages: drop AI co-author trailers and neutralize agent branding."""

import re
import sys


def clean(text: str) -> str:
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^Co-[Aa]uthored-[Bb]y:", stripped):
            continue
        if re.match(r"^Made-with:", stripped, re.IGNORECASE):
            continue
        lines.append(line)

    body = "\n".join(lines).strip()

    replacements = [
        (r"fix: polish find/replace and use Hermes for commit message drafts",
         "fix: polish find/replace and improve commit message drafts"),
        (r"generate git commit messages via Hermes with a local staged-path fallback when the CLI is unavailable",
         "generate git commit messages with a local fallback when generation is unavailable"),
        (r"feat: find/replace, AI agent pane, autosave, and preview improvements",
         "feat: find/replace, autosave, and preview improvements"),
        (r"introduce a unified Agent assistant pane \(Cursor/Hermes\) alongside Claude, and ",
         ""),
        (r"feat\(git\): AI commit messages with auto-fill on stage",
         "feat(git): auto-generate commit messages on stage"),
        (r"drafts a commit message from the\s+staged diff via `claude -p`, including",
         "drafts a commit message from the staged diff, including"),
        (r"Add in-app Lumina source editing via Claude",
         "Add in-app Lumina source editing from local checkout"),
        (r"Add justfile groups and Claude-assisted commit helpers",
         "Add justfile groups and commit message helpers"),
        (r"Enhance terminal and Claude pane functionality",
         "Enhance terminal and chat pane functionality"),
        (r"Refactor Claude integration and improve build scripts",
         "Refactor chat integration and improve build scripts"),
        (r"Enhance Claude integration and recent file management",
         "Enhance chat integration and recent file management"),
        (r"Auto-scroll the terminal and Claude panes",
         "Auto-scroll the terminal and chat panes"),
        (r"resizable git/terminal/claude side panes",
         "resizable git/terminal/chat side panes"),
        (r"terminal/Claude side rail",
         "terminal/chat side rail"),
        (r'"Lumina src" toggle in the Claude pane respawns Claude in the',
         '"Lumina src" toggle in the chat pane respawns the assistant in the'),
        (r"when launching Claude on the current file",
         "when launching the assistant on the current file"),
        (r"so Claude's edits never flowed back",
         "so external edits never flowed back"),
        (r"mid-write by Claude Code or another external editor",
         "mid-write by an external editor"),
        (r"mid-write by Claude\)",
         "mid-write by an external editor)"),
        (r"`claude-commit-\*`", "`commit-*`"),
        (r"Claude-assisted", ""),
        (r"\bClaude\b", "chat"),
        (r"\bHermes\b", "CLI"),
        (r"\bCursor/Hermes\b", ""),
        (r"\bAI agent pane,?\s*", ""),
        (r"\bAI agent\b", "assistant"),
        (r"\bAI commit messages\b", "auto-generated commit messages"),
        (r"\bClaude-assisted\b", ""),
    ]

    for pattern, repl in replacements:
        body = re.sub(pattern, repl, body)

    body = re.sub(r"\s*Made-with:\s*Cursor\s*", "", body, flags=re.IGNORECASE)
    body = re.sub(r"[ \t]{2,}", " ", body)
    body = re.sub(r" +\n", "\n", body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    body = re.sub(r" styles -\s*\n", " styles\n\n", body)
    body = re.sub(r" install -\s*\n", " install\n\n", body)
    body = re.sub(r" checks -\s*\n", " checks\n\n", body)
    body = repair_merged_subject(body.strip()) + "\n"
    return body


def repair_merged_subject(text: str) -> str:
    """Restore a blank line between subject and body when cleanup collapsed them."""
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return text

    first = lines[0]
    tail = lines[1:]

    body_start = (
        r"Add|Expose|Wire|Detect|Open|Serialize|Make|Introduce|Auto-scroll|The first|Also|"
        r"Group all|Pin script|Promote|Use a fresh|Remove error|Updated filename|Detects a local|"
        r"Drafts a|Staging now|OpenedFile was|Switch @tauri|Add a \"|Add resizable|Add LUMINA"
    )

    patterns = [
        rf"^((?:feat|fix|chore|refactor|docs|test|style|perf)(?:\([^)]+\))?: .{{10,160}}?)( ({body_start})[\s\S]*)$",
        rf"^((?:Add|Fix|Remove|Enhance|Implement|Refactor) .{{8,160}}?)( ({body_start})[\s\S]*)$",
        rf"^((?:Fix|Add) [^.]{{10,160}}?)( (?:Use a fresh|Detects a local)[\s\S]*)$",
    ]

    for pattern in patterns:
        match = re.match(pattern, first)
        if not match:
            continue
        subject = match.group(1).rstrip()
        body_start = match.group(2).strip()
        if len(subject) >= 12 and len(body_start) >= 12:
            rebuilt = [subject, "", body_start, *tail]
            return "\n".join(rebuilt)

    return text


def main() -> None:
    raw = sys.stdin.buffer.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="replace")
    sys.stdout.buffer.write(clean(text).encode("utf-8"))


if __name__ == "__main__":
    main()
