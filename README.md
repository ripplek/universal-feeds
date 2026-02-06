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

- **Stage:** usable CLI + skill entrypoint; actively iterating
- **CI:** GitHub Actions runs unit tests + digest smoke test

## Install

```bash
npm ci
```

## Quick start

### Option A — Demo (always produces output)

```bash
node bin/digest --config config/feeds.demo.yaml --date today
```

### Option B — Topic-only daily briefing (recommended)

```bash
cp config/feeds.example.yaml config/feeds.yaml
node bin/digest --config config/feeds.yaml --date today
```

Outputs:
- `out/items-YYYY-MM-DD.jsonl`
- `out/digest-YYYY-MM-DD.md`

Run tests:

```bash
npm test
```

X Following requires you to be logged into x.com in a local Chrome profile that `bird` can read.

## Configuration

Configs are YAML. Start from:
- `config/feeds.demo.yaml` — demo config (`require_topic_match: false`)
- `config/feeds.example.yaml` — topic-only config (ship your real preferences here)

A source entry supports optional quality knobs:

```yaml
- name: OpenAI News
  url: https://openai.com/news/rss.xml
  type: rss
  weight: 1.2        # ranking preference
  reliability: 1.0   # 0..1 stability/trust
  tags: [ai, model-releases]
```

## What the output looks like

Excerpt from `out/digest-YYYY-MM-DD.md`:

```text
## All Items (by platform)

### Media (RSS)
- [rss] ... (score 0.94)
  https://...

### YouTube
- [youtube] ... (score 0.54)
  https://...
```

See `docs/EXAMPLES.md` for copy/paste recipes and `docs/SHOWCASE.md` for a contributor-oriented overview.

## Quick links

- Product doc: `docs/PRD.md`
- Architecture: `docs/ARCHITECTURE.md`
- Roadmap: `docs/ROADMAP.md`
- Preferences spec: `docs/PREFERENCES.md`
- Source seed list: `docs/SOURCES.md`
- RSSHub notes: `docs/RSSHUB.md`

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and the PR template.

## Security

See [`SECURITY.md`](SECURITY.md).

## License

MIT (see [`LICENSE`](LICENSE)).
