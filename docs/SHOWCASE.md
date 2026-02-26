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

This section is based on the maintainer's real local run using local config (`config/feeds.yaml`) and generated output files on 2026-02-26.

Effective local config highlights:

- `require_topic_match: true`
- `recency_hours: 24`
- `recommended.enabled: true`
- Enabled platforms: `x`, `rss`, `v2ex`, `youtube`

Command run:

```bash
node bin/digest --config config/feeds.yaml --date today
```

Result files on 2026-02-26:

- `out/items-2026-02-26.jsonl`: `8` lines
- `out/digest-2026-02-26.md`: `64` lines

Digest excerpt:

```text
# 每日简报 — 2026-02-26

抓取时间：2026-02-26T00:00:32.632Z

## 主题覆盖
- OpenClaw / Clawdbot 动态: 3 (rss:3)
- Agentic AI / 工作流: 1 (x:1)

## 实体覆盖
- NVIDIA: 4 (x:3, rss:1)
```

Example matched item excerpt (`out/items-2026-02-26.jsonl`):

```text
{"platform":"x", ... "id":"2026800632317792392", ... "author":{"name":"GitHub"...}, "tags":["agentic-ai"]}
{"platform":"rss", ... "title":"OpenClaw Users Are Allegedly Bypassing Anti-Bot Systems", ... "tags":["tech","culture","security","ai","openclaw"]}
```

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
