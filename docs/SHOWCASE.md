# Showcase

This page is for humans deciding whether to contribute.

## What this project does

**universal-feeds** generates a daily briefing from multiple sources (RSS/V2EX/YouTube and optional X), then:
- normalizes items to a shared schema
- de-dups and ranks
- (optionally) filters by user-defined topics/entities
- renders a Markdown digest you can send anywhere

## Demo: run it in ~30 seconds

```bash
npm ci
node bin/digest --config config/feeds.demo.yaml --date today
open out/digest-$(date +%F).md
```

If you prefer a topic-only briefing (recommended):

```bash
cp config/feeds.example.yaml config/feeds.yaml
node bin/digest --config config/feeds.yaml --date today
```

## Local snapshot (real run on 2026-02-26)

This snapshot reflects the current local setup in this workspace:

- `config/feeds.yaml` is missing, so CLI default falls back to `config/feeds.example.yaml`.
- Effective output mode: `require_topic_match: true`, `recency_hours: 24`, `recommended.enabled: true`.
- Enabled platforms: `rss`, `v2ex`, `youtube` (`x.enabled: false`).

Commands run:

```bash
node bin/digest --config config/feeds.example.yaml --date today
node bin/digest --config config/feeds.demo.yaml --date today
```

Result files on 2026-02-26:

- `out/items-2026-02-26.jsonl`: `0` lines
- `out/digest-2026-02-26.md`: digest generated with empty items

```text
# Daily Digest — 2026-02-26

Fetched at: 2026-02-26T09:54:02.157Z

## All Items (by platform)
_No items._
```

Connectivity probe done the same day:

- `https://openai.com/news/rss.xml` -> `fetch failed`
- `https://www.v2ex.com/?tab=hot` -> `fetch failed`
- `https://www.youtube.com/feeds/videos.xml?...` -> `fetch failed`

## Why contribute

- **Adapters are small and modular**: adding a new source type is a contained change.
- **Ranking is transparent**: weights are explicit (`weight`, `reliability`).
- **Good testability**: core logic (dedup/rank/tagging/rsshub) has unit tests.

## Easy first contributions

- Add a high-quality RSS source pack (with `weight` and `reliability`).
- Improve HTML extraction robustness for a specific site.
- Add a topic pack for a niche (security, chips, VC, open-source releases).
- Add fixtures + parsing tests for a source module.

## Maintainer expectations

- Keep PRs small and well-scoped.
- Do not add scraping that violates site terms or requires bypassing paywalls.
- Never commit secrets.
