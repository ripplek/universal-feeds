#!/usr/bin/env bash
set -euo pipefail

# Daily digest cron template with a pluggable delivery seam.
#
# Runs the digest and hands the rendered Markdown to whatever you set in
# $UF_DELIVER (a command that reads the digest on stdin). Wire it up in cron:
#
#   # every day at 08:00
#   0 8 * * *  UF_REPO=/path/to/universal-feeds \
#              UF_CONFIG=config/feeds.yaml \
#              UF_DELIVER='imessage-send +15551234567' \
#              /path/to/universal-feeds/examples/cron/daily-digest.sh >> /tmp/uf.log 2>&1
#
# Delivery is a seam, not a dependency — $UF_DELIVER can be anything that reads
# stdin: imessage/telegram/slack senders, `mail -s`, a curl webhook, `cat`, etc.
#
# NOTE ON AI FILTERING: with `filter.mode: llm`, a bare cron run cannot judge
# candidates (no agent in the loop) and falls back to the keyword gate. To run
# the judged loop on a schedule, invoke your agent on this repo instead (see
# AGENTS.md → AI relevance filtering) and let it perform the emit→judge→render
# steps; you can still reuse the delivery block below.

REPO="${UF_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
CONFIG="${UF_CONFIG:-config/feeds.yaml}"
DATE="${UF_DATE:-today}"

cd "$REPO"

# Run the digest; --json gives us a parseable result and a non-zero exit on error.
RESULT="$(node bin/digest --config "$CONFIG" --date "$DATE" --json)"
echo "$RESULT" >&2

# Extract digestPath without a JSON dependency.
DIGEST_PATH="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).digestPath||"")}catch{}})' <<<"$RESULT")"

if [[ -z "$DIGEST_PATH" || ! -f "$DIGEST_PATH" ]]; then
  echo "No digest produced; nothing to deliver." >&2
  exit 1
fi

if [[ -n "${UF_DELIVER:-}" ]]; then
  # Delivery command reads the digest Markdown on stdin.
  "${SHELL:-/bin/sh}" -c "$UF_DELIVER" <"$DIGEST_PATH"
  echo "Delivered $DIGEST_PATH via: $UF_DELIVER" >&2
else
  echo "UF_DELIVER not set; digest at $DIGEST_PATH (no delivery)." >&2
fi
