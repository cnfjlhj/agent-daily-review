#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_SKILLS_DIR="${CODEX_HOME:-$HOME/.codex}/skills"
TARGET_LINK="$CODEX_SKILLS_DIR/agent-daily-review"
SOURCE_DIR="$REPO_ROOT/skills/agent-daily-review"

mkdir -p "$CODEX_SKILLS_DIR"

if [[ -L "$TARGET_LINK" || -e "$TARGET_LINK" ]]; then
  rm -rf "$TARGET_LINK"
fi

ln -s "$SOURCE_DIR" "$TARGET_LINK"
echo "Installed Codex skill: $TARGET_LINK -> $SOURCE_DIR"
