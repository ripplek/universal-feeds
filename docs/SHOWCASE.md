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

## Example output (real run)

Below is an excerpt from a real run on **2026-02-06** using the demo config.

```text
# Daily Digest — 2026-02-06

## All Items (by platform)

### Media (RSS)
- [rss] 机器之心（公众号合集，__biz+album） (WeChat article) [wechat, cn, ai, research] (score 1.00)
  https://mp.weixin.qq.com/s?__biz=...
- [rss] Olympic figure skating starts with the team event. Here's what to know about it (score 0.94)
  https://www.npr.org/2026/02/06/...

### YouTube
- [youtube] Growing a family tamale shop | with ChatGPT (score 0.54)
  https://www.youtube.com/watch?v=...
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
