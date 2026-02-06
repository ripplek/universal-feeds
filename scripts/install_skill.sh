#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_SRC="$ROOT_DIR/skill/universal-feeds"

if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "SKILL.md not found at: $SKILL_SRC" >&2
  exit 1
fi

# Default Clawdbot workspace skills dir
WORKSPACE_SKILLS="$HOME/clawd/skills"
MANAGED_SKILLS="$HOME/.clawdbot/skills"

pick_target() {
  if [[ -d "$WORKSPACE_SKILLS" ]]; then
    echo "$WORKSPACE_SKILLS"
  else
    echo "$MANAGED_SKILLS"
  fi
}

TARGET_BASE="$(pick_target)"
TARGET="$TARGET_BASE/universal-feeds"

mkdir -p "$TARGET_BASE"

if [[ -e "$TARGET" ]]; then
  echo "Target already exists: $TARGET" >&2
  echo "Remove it first if you want to re-install." >&2
  exit 1
fi

ln -s "$SKILL_SRC" "$TARGET"

echo "Installed skill symlink:" 
ls -l "$TARGET"

echo
echo "Tip: restart gateway if needed, then ensure your channel config allows this skill." 
