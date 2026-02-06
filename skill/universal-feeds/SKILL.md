---
name: universal-feeds
description: Generate a daily topic-based digest from multiple feeds (X Following via bird, RSS packs, V2EX, YouTube) with de-noising, ranking, and RSSHub route support. Use when setting up or running daily briefings/digests.
---

# universal-feeds (Clawdbot Skill)

This repo ships a digest pipeline that:
- fetches items from multiple sources
- normalizes to `FeedItem`
- de-dups + ranks + topic-tags
- renders a daily Markdown digest

## Install (local)

Clawdbot loads skills in this precedence order:

1) `<workspace>/skills/<name>/SKILL.md` (highest)
2) `~/.clawdbot/skills/<name>/SKILL.md`
3) Bundled skills
4) `skills.load.extraDirs`

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

## Notes

- Prefer RSS sources for stability.
- HTML seeds are best-effort and use `out/state-html.json` for change detection.
