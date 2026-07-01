---
name: universal-feeds
description: Generate a daily topic-based digest from multiple feeds (X Following via bird, RSS packs, V2EX, YouTube) with de-noising, ranking, and RSSHub route support. Use when setting up or running daily briefings/digests.
---

# universal-feeds (Clawdbot Skill)

> This is the Clawdbot wrapper. The runtime-agnostic contract (CLI, `--json`
> output, exit codes, the judging loop, and the MCP server) lives in
> [`AGENTS.md`](../../AGENTS.md) — if the two disagree, `AGENTS.md` wins.

This repo ships a digest pipeline that:

- fetches items from multiple sources
- normalizes to `FeedItem`
- de-dups + ranks + topic-tags
- renders a daily Markdown digest

## Install (local)

Clawdbot loads skills in this precedence order:

1. `<workspace>/skills/<name>/SKILL.md` (highest)
2. `~/.clawdbot/skills/<name>/SKILL.md`
3. Bundled skills
4. `skills.load.extraDirs`

Recommended install (workspace):

```bash
# from your Clawdbot workspace
mkdir -p ~/clawd/skills
ln -s "$(pwd)/skill/universal-feeds" ~/clawd/skills/universal-feeds
```

Alternative (managed overrides):

```bash
mkdir -p ~/.clawdbot/skills
ln -s "$(pwd)/skill/universal-feeds" ~/.clawdbot/skills/universal-feeds
```

There is also an installer script in this repo:

```bash
bash scripts/install_skill.sh
```

## Quick start

Run digest:

```bash
node bin/digest --config config/feeds.yaml --date today
```

Outputs:

- `out/items-YYYY-MM-DD.jsonl`
- `out/digest-YYYY-MM-DD.md`

## Configuration

- Copy `config/feeds.example.yaml` → `config/feeds.yaml` and edit.
- For a clean topic-only report set:
  - `output.require_topic_match: true`

## X Following

Uses `bird` (cookie auth from local Chrome). Verify:

```bash
bird check
bird whoami
```

If X is flaky, temporarily disable:

```yaml
platforms:
  x:
    enabled: false
```

## RSSHub routes

In `sources/*.yaml` you can use `rsshub_route` instead of `url`:

```yaml
- name: Example
  type: rss
  rsshub_route: telegram/channel/awesomeRSSHub
```

RSSHub base URL is configured in `config/feeds.yaml`:

```yaml
rsshub:
  base_url: https://rsshub.app
```

Helper:

```bash
node scripts/rsshub_suggest.mjs --config config/feeds.yaml "公众号"
```

## AI relevance filtering (agent-judged)

When `filter.mode` is `llm` (or `hybrid`) in `feeds.yaml`, the digest delegates
relevance judgment to you (the agent) instead of matching keywords. This is a
three-step hand-off — you run the judging middle step:

1. **Emit candidates** — run:

   ```bash
   node bin/digest --config config/feeds.yaml --stage candidates
   ```

   Writes `out/candidates-<date>.jsonl`, one compact item per line:
   `{"id":"<platform:id>","platform":"…","title":"…","text":"…","url":"…"}`,
   plus `out/judging-task-<date>.json` — a self-contained brief (profile, topic
   whitelist, output schema, paths) you can judge from without re-reading this
   file.

2. **Judge each candidate** against the interest profile in `feeds.yaml`
   (`filter.profile`). **Use `claude-haiku-4-5`** for this bulk classification —
   it is cheap and fast; delegate to it (e.g. a Haiku sub-task) rather than
   judging with a larger model. For every candidate output one JSON object:

   ```json
   {"id":"<same id>","relevant":true,"score":0.0-1.0,"topics":["agentic-ai"],"why":"one line"}
   ```
   - `relevant` / `score`: is this worth the user's attention, and how strongly.
   - `topics`: reuse the `topics[].name` values from `feeds.yaml` where they fit
     (they drive the digest's grouping and boosts); add new ones sparingly.
   - Judge on meaning, not keywords — cross-language is expected (a Chinese post
     about model releases is relevant to an English AI profile).
   - If the task carries `target_language` (set when `output.translate: true`),
     also emit `title_translated`: the title in that language (echo unchanged if
     already in it; keep product names/proper nouns as-is). It makes the reader
     digest single-language.
     Write all objects (JSONL or a JSON array) to `out/judgments-<date>.jsonl`.

3. **Render** — run (optionally dry-run `--validate-judgments <file>` first to
   catch malformed / unknown-id / out-of-range judgments before rendering):
   ```bash
   node bin/digest --config config/feeds.yaml --judgments out/judgments-<date>.jsonl
   ```
   The digest keeps items you marked relevant (score ≥ `filter.min_relevance`
   when `output.require_topic_match: true`), tags them with your `topics`, folds
   `score` into ranking, and renders `out/digest-<date>.md`.

Full contract: `docs/FILTERING.md`. If no judgments file is supplied while
`mode: llm`, the digest falls back to the keyword gate (so CI / offline / no-agent
runs still work).

## Notes

- Prefer RSS sources for stability.
- HTML seeds are best-effort and use `out/state-html.json` for change detection.
- `filter.mode: keyword` (default) uses the legacy keyword/anchor matcher; no agent needed.
