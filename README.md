# universal-feeds

A **universal information feed aggregation framework** for **Clawdbot/OpenClaw**.

Goal: fetch daily **Trending / 热搜 / Following** content from major US + Mainland China platforms (and anywhere else), normalize it into a consistent schema, then produce **ranked digests** (daily briefing, topic alerts, etc.).

Platforms in scope (phased):
- X (via `bird`)
- RSS / "Most popular" pages (US/CN mainstream media)
- V2EX
- YouTube
- Weibo (hot search)
- WeChat Official Accounts (via third-party hot lists / later: account-following if feasible)
- TikTok (later)

> Note: "Following" feeds may require user authentication (OAuth/API tokens where possible; otherwise local cookies or browser relay). This project prioritizes **least privilege** and clear security boundaries.

## What this repo will contain

- A Clawdbot Skill (or a set of Skills) with pluggable **adapters** per platform
- A unified **normalized item schema** (`FeedItem`)
- A preference system (topics/entities/keywords) that compiles into platform-specific queries
- Ranking + de-duplication
- Summarization hooks (e.g. integrate `summarize` CLI)
- Cron templates to deliver a daily report to messaging channels

## Status

- **Stage:** MVP executable skeleton (X Following) + docs
- **Next:** add RSS/V2EX/YouTube adapters + preferences-based filtering

## Quick start (MVP)

```bash
cd projects/universal-feeds

# 1) install deps
npm i

# 2) (optional) copy config
cp config/feeds.example.yaml config/feeds.yaml

# 3) run digest (defaults to config/feeds.yaml if present, otherwise uses example config)
node bin/digest --date today

# outputs
ls out/
```

X Following requires you to be logged into x.com in a local Chrome profile that `bird` can read.

## Quick links

- Product doc: `docs/PRD.md`
- Architecture: `docs/ARCHITECTURE.md`
- Roadmap: `docs/ROADMAP.md`
- Preferences spec: `docs/PREFERENCES.md`
- Source seed list: `docs/SOURCES.md`
- RSSHub notes: `docs/RSSHUB.md`

## License

MIT (see `LICENSE`).
