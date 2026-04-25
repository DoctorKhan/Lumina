#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$OSTYPE" == "darwin"* ]]; then
  DEFAULT_LOCAL_MODEL="$HOME/Library/Application Support/Lumina/install-estimates.tsv"
else
  DEFAULT_LOCAL_MODEL="${XDG_STATE_HOME:-$HOME/.local/state}/lumina/install-estimates.tsv"
fi

LOCAL_MODEL="${1:-${LUMINA_INSTALL_MODEL_FILE:-$DEFAULT_LOCAL_MODEL}}"
GLOBAL_MODEL="${2:-$ROOT_DIR/scripts/install-estimates-global.tsv}"

if [[ ! -f "$LOCAL_MODEL" ]]; then
  echo "Local estimate model not found: $LOCAL_MODEL" >&2
  exit 1
fi

if [[ ! -f "$GLOBAL_MODEL" ]]; then
  echo "Global estimate model not found: $GLOBAL_MODEL" >&2
  exit 1
fi

tmp_file="$(mktemp)"
{
  echo "# step_key	observations	mean_seconds"
  echo "# Aggregated seed model for install progress estimates."
  echo "# Keep this file free of machine names, paths, timestamps, and raw user logs."
  awk -F '\t' -v OFS='\t' '
    FNR == NR {
      if ($0 ~ /^#/ || NF < 3) next
      global_count[$1] = $2 + 0
      global_mean[$1] = $3 + 0
      next
    }
    $0 ~ /^#/ || NF < 3 { next }
    {
      key = $1
      local_count = $2 + 0
      local_mean = $3 + 0
      count = global_count[key] + local_count
      if (count <= 0) next
      mean = ((global_count[key] * global_mean[key]) + (local_count * local_mean)) / count
      global_count[key] = count
      global_mean[key] = mean
    }
    END {
      key_count = split("checkout_clone checkout_update fetch_refs reset_checkout js_deps tauri_icons tauri_build copy_app cli_launcher file_associations", keys, " ")
      for (i = 1; i <= key_count; i++) {
        key = keys[i]
        if (global_count[key] > 0) {
          print key, int(global_count[key] + 0.5), int(global_mean[key] + 0.5)
        }
      }
    }
  ' "$GLOBAL_MODEL" "$LOCAL_MODEL"
} >"$tmp_file"

mv "$tmp_file" "$GLOBAL_MODEL"
echo "Updated $GLOBAL_MODEL from $LOCAL_MODEL"
