# universal-feeds

English | [中文](README.zh-CN.md)

A feed aggregator for [Clawdbot/OpenClaw](https://github.com/jackwener/opencli).
It pulls trending, hot-list, and following content from a range of US and China
platforms, normalizes everything into one `FeedItem` schema, ranks and
de-duplicates it, and writes a daily Markdown digest.

The hard part of a personal aggregator isn't ranking — it's reaching login-gated
content across many platforms. universal-feeds handles the public sources
directly and, for auth-gated ones, drives your real logged-in Chrome through
OpenCLI's browser bridge (the "reach" layer) instead of juggling API tokens.

## What it does

- **Sources** — X (via `bird` or reach), RSS packs, V2EX natively;
  plus 34 platforms through the reach layer (OpenCLI, desktop): YouTube, Twitter,
  Reddit, Bilibili, Xiaohongshu, Facebook, Instagram, LinkedIn, Xueqiu, Weibo,
  Zhihu, Medium, Jike, LINUX DO, and public tech/AI/research feeds — GitHub
  Trending, arXiv, dblp, Google Scholar, PubMed, Stack Overflow, Lobsters, DEV,
  LessWrong, OpenReview, AIbase, Toutiao, BBC, Bloomberg, Hacker News, Product
  Hunt, 36Kr, Juejin, TikTok, Substack.
- **One schema** — every source normalizes to `FeedItem` (see `docs/SCHEMA.md`),
  so ranking, de-dup, and rendering don't care where an item came from.
- **Two ways to filter** — a keyword/anchor matcher (default, zero-config), or
  AI relevance judgment where a Clawdbot agent scores each item against a
  natural-language interest profile (`filter.mode: llm`, see `docs/FILTERING.md`).
- **Ranking** — engagement + recency + per-source weight/reliability, with
  de-duplication that keeps the richer copy of a repeated URL.
- **Output** — `out/items-YYYY-MM-DD.jsonl`, the reader-facing
  `out/digest-YYYY-MM-DD.md` (clean, deduplicated, grouped by topic), and
  `out/digest-inspection-YYYY-MM-DD.md` (the same items with scores, tags, and
  keyword hits, for debugging the ranking).

## Status

Usable and dogfooded as a daily digest since early 2026. The reach layer is
desktop-only (it reuses a running Chrome — see `docs/adr/0001-*.md`); CI runs the
unit tests plus a digest smoke test. Public sources (RSS / V2EX / HN /
36Kr) need no login; the rest (YouTube included) are opt-in once you're signed in.

## See it in action

This is a real run, unedited — 2026-07-08, `filter.mode: hybrid`, 9 sources
enabled (RSS + V2EX + 8 reach channels): **203 candidates → 40 rendered
items**, with the source-health banner surfacing `v2ex`'s empty fetch instead
of silently shipping a shorter digest:

```text
# 每日简报 — 2026-07-08

> ⚠ 数据源健康 — 今日无产出：v2ex

## Agentic AI / 工作流

- 我们常用的Fable 5使用模式之一：把它当"顾问"——由执行者（Sonnet 5）调用Fable 5获取指导 — ClaudeDevs (X, 2026-07-07)
  https://x.com/ClaudeDevs/status/2074606058128224365
- Anthropic将Claude Cowork上线移动端和网页端 (RSS, 2026-07-07)
  https://www.theverge.com/ai-artificial-intelligence/961978/anthropic-claude-cowork-mobile-web
```

Full digest, run report, and an earlier screenshot in
[`docs/SHOWCASE.md`](docs/SHOWCASE.md).

## Quick start

```bash
npm ci
cp config/feeds.example.yaml config/feeds.yaml   # then edit your preferences
node bin/digest --config config/feeds.yaml --date today
```

That writes today's digest to `out/`. To try it without topic filtering:

```bash
node bin/digest --config config/feeds.demo.yaml --date today
```

Full setup — reach platforms, AI filtering, scheduled delivery — is in
[`INSTALL.md`](INSTALL.md). Keeping it current is in [`UPDATE.md`](UPDATE.md).

## Use with your agent

The digest is a CLI that reads/writes plain files, so any agent runtime can drive
it. The full runtime-agnostic contract — commands, `--json` output, exit codes,
and the candidates → judgments → render loop — is in [`AGENTS.md`](AGENTS.md).

- **Any MCP agent (Claude Code / Desktop, …)** — run the bundled MCP server;
  no bespoke skill needed:

  ```bash
  node bin/mcp   # exposes run_digest / emit_candidates / apply_judgments / reach_fetch
  ```

  Register it per [`AGENTS.md`](AGENTS.md#mcp-server).

- **Claude Code (as a skill)** — `bash scripts/install_skill.sh claude`
- **Clawdbot / OpenClaw (as a skill)** — `bash scripts/install_skill.sh` (default)
- **Anything else** — shell out and parse `--json`:

  ```bash
  node bin/digest --config config/feeds.yaml --json
  ```

**Capability tiers.** Tier-0 sources (RSS / V2EX / Hacker News / 36Kr)
need no login and run anywhere, including headless/CI. The reach layer (YouTube,
Reddit, Twitter, Bilibili, Xiaohongshu, …) drives a real logged-in Chrome and is
**desktop-only** — an agent in a headless/cloud environment can use tier-0 only.

Scheduled delivery has a copy-paste cron template with a pluggable delivery seam
in [`examples/cron/`](examples/cron/).

## Reach layer (auth-gated platforms)

```bash
node bin/digest reach doctor    # health of every channel
node bin/digest reach watch     # compact health + update check (cron-friendly)
node bin/digest reach fetch reddit "AI agents"   # one-off fetch → FeedItem JSONL
```

Requires OpenCLI and its Chrome extension, on a desktop where you're logged into
the target sites. Details in [`docs/REACH.md`](docs/REACH.md).

## Optional X/Twitter companion

`universal-feeds` is optimized for read-heavy daily digests. For OpenClaw workflows that act on X/Twitter items after the digest, pair it with [TweetClaw](https://github.com/Xquik-dev/tweetclaw), an OpenClaw plugin for:

- search tweets and search tweet replies
- post tweets and post tweet replies
- follower export and user lookup
- media upload/download and direct messages
- tweet monitors, webhooks, and giveaway draws

```bash
openclaw plugins install @xquik/tweetclaw
```

See the [npm package](https://www.npmjs.com/package/@xquik/tweetclaw) or [ClawHub listing](https://clawhub.ai/plugins/@xquik/tweetclaw).

## Configuration

Configs are YAML; start from `config/feeds.example.yaml`. A source entry takes
optional quality knobs:

```yaml
- name: OpenAI News
  url: https://openai.com/news/rss.xml
  type: rss
  weight: 1.2 # ranking preference
  reliability: 1.0 # 0..1 stability/trust
  tags: [ai, model-releases]
```

Enable an auth-gated platform per-source:

```yaml
platforms:
  reddit:
    reach:
      enabled: true
      mode: search # feed | search | trending
      query: 'AI agents'
      tags: [ai]
```

## Docs

| Topic                | File                                           |
| -------------------- | ---------------------------------------------- |
| Showcase / real run  | [`docs/SHOWCASE.md`](docs/SHOWCASE.md)         |
| Agent integration    | [`AGENTS.md`](AGENTS.md)                       |
| Install / setup      | [`INSTALL.md`](INSTALL.md)                     |
| Update / maintenance | [`UPDATE.md`](UPDATE.md)                       |
| Reach layer          | [`docs/REACH.md`](docs/REACH.md)               |
| Relevance filtering  | [`docs/FILTERING.md`](docs/FILTERING.md)       |
| Item schema          | [`docs/SCHEMA.md`](docs/SCHEMA.md)             |
| Config reference     | [`docs/CONFIG.md`](docs/CONFIG.md)             |
| Architecture         | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Roadmap              | [`docs/ROADMAP.md`](docs/ROADMAP.md)           |
| Decisions (ADRs)     | [`docs/adr/`](docs/adr/)                       |

## Contributing / Security / License

See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), and
[`LICENSE`](LICENSE) (MIT). The reach layer is ported from
[Agent-Reach](https://github.com/Panniantong/Agent-Reach) (MIT).
