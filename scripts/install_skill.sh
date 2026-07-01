#!/usr/bin/env bash
set -euo pipefail

# Install the universal-feeds skill for your agent runtime.
#
#   bash scripts/install_skill.sh [clawdbot|claude] [--project]
#
#   clawdbot  (default) — symlink into the Clawdbot/OpenClaw skills dir
#   claude              — symlink into Claude Code's skills dir
#   --project           — (claude only) install into ./.claude/skills instead of ~
#
# Any MCP-capable agent can skip this entirely and register the MCP server:
#   node bin/mcp   (see AGENTS.md → MCP server)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_SRC="$ROOT_DIR/skill/universal-feeds"

if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "SKILL.md not found at: $SKILL_SRC" >&2
  exit 1
fi

TARGET_RUNTIME="clawdbot"
PROJECT_SCOPE=0
for arg in "$@"; do
  case "$arg" in
    clawdbot | claude) TARGET_RUNTIME="$arg" ;;
    --project) PROJECT_SCOPE=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: install_skill.sh [clawdbot|claude] [--project]" >&2
      exit 2
      ;;
  esac
done

pick_target_base() {
  case "$TARGET_RUNTIME" in
    clawdbot)
      # Prefer a workspace skills dir if present, else the managed override dir.
      if [[ -d "$HOME/clawd/skills" ]]; then
        echo "$HOME/clawd/skills"
      else
        echo "$HOME/.clawdbot/skills"
      fi
      ;;
    claude)
      if [[ "$PROJECT_SCOPE" -eq 1 ]]; then
        echo "$ROOT_DIR/.claude/skills"
      else
        echo "$HOME/.claude/skills"
      fi
      ;;
  esac
}

TARGET_BASE="$(pick_target_base)"
TARGET="$TARGET_BASE/universal-feeds"

mkdir -p "$TARGET_BASE"

if [[ -e "$TARGET" ]]; then
  echo "Target already exists: $TARGET" >&2
  echo "Remove it first if you want to re-install." >&2
  exit 1
fi

ln -s "$SKILL_SRC" "$TARGET"

echo "Installed $TARGET_RUNTIME skill symlink:"
ls -l "$TARGET"

echo
case "$TARGET_RUNTIME" in
  clawdbot)
    echo "Tip: restart the gateway if needed, then ensure your channel config allows this skill."
    ;;
  claude)
    echo "Tip: restart Claude Code (or /reload) so it discovers the skill."
    echo "Prefer MCP? Register the server instead — see AGENTS.md -> MCP server."
    ;;
esac
