#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICONS_DIR="$ROOT_DIR/src-tauri/icons"
SVG_PATH="$ICONS_DIR/icon.svg"
PNG_PATH="$ICONS_DIR/icon.png"

mkdir -p "$ICONS_DIR"

if [[ ! -f "$SVG_PATH" ]]; then
  cat >"$SVG_PATH" <<'EOF'
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2a68"/>
      <stop offset="100%" stop-color="#6a3bd2"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect x="64" y="64" width="896" height="896" rx="210" fill="url(#bg)"/>
  <path
    d="M354 250v494h330"
    fill="none"
    stroke="#ffffff"
    stroke-width="110"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#glow)"
  />
  <circle cx="694" cy="744" r="42" fill="#47d8ff"/>
</svg>
EOF
  echo "Created fallback Tauri icon source at $SVG_PATH"
fi

if [[ ! -f "$PNG_PATH" ]]; then
  echo "Generating Tauri icon assets from $SVG_PATH"
  pnpm tauri icon "$SVG_PATH"
fi
