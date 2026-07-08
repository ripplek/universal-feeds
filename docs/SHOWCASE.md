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

## Live run (2026-07-08, run-snapshot pipeline, `filter.mode: hybrid`)

This section is the maintainer's real local run, end to end, on the current
pipeline — not a curated excerpt. It uses the run-snapshot reliability
contract (see `docs/adr/`): every fetch freezes an immutable snapshot under
`out/runs/<runId>/`, and the `candidates → judge → render` loop is bound to
that one snapshot so agent judgments can't drift against a re-fetch.

Effective local config highlights (`config/feeds.yaml`):

- `filter.mode: hybrid` — an agent (Claude Code, in this run) judges each
  candidate against a natural-language interest profile; a keyword gate is
  the fallback for headless/cron runs.
- `output.translate: true` — the judging agent returns each kept title in
  `output.language` (`zh`), no extra API call.
- Reach layer enabled: `twitter`, `youtube`, `reddit`, `bilibili`,
  `xiaohongshu`, `weibo`, `hackernews`, `36kr` (8 of the 34 reach channels),
  plus native `rss` and `v2ex`.

Commands run:

```bash
node bin/digest --config config/feeds.yaml --date today --stage candidates --json
# → out/runs/2026-07-08-1/candidates.jsonl (203 candidates), judging-task.json

# the agent judges all 203 candidates against the interest profile,
# writing one line per candidate to judgments.jsonl

node bin/digest --config config/feeds.yaml \
  --judgments out/runs/2026-07-08-1/judgments.jsonl --json
```

Real result, unedited (full JSON in
[`docs/showcase/run-report-2026-07-08.json`](showcase/run-report-2026-07-08.json)):

- **203 candidates → 203 judged → 40 rendered** (`output.max_items: 40` cap;
  55 cleared the `min_relevance: 0.4` bar).
- `health: "warning"` — **surfaced, not hidden**: `v2ex` was enabled and
  returned zero items, and that's exactly what a reader sees as the digest's
  top-of-file banner (`out/digest-2026-07-08.md` line 5), not a silently
  short digest.
- Every other enabled source reported healthy fetch counts (`rss: 165`
  across 15 feeds, `reddit: 20`, `hackernews: 20`, `twitter/youtube/bilibili/
xiaohongshu/weibo: 15` each, `36kr: 15`) — see the full per-source/per-feed
  breakdown in the linked JSON.

Full rendered digest, checked in verbatim:
[`docs/showcase/digest-2026-07-08.md`](showcase/digest-2026-07-08.md).
Excerpt:

```text
# 每日简报 — 2026-07-08

生成时间: 2026-07-08 02:00 UTC

> ⚠ 数据源健康 — 今日无产出：v2ex

## Agentic AI / 工作流

- 我们常用的Fable 5使用模式之一：把它当"顾问"——由执行者（Sonnet 5）调用Fable 5获取指导，多数token按更低的执行者费率计费 — ClaudeDevs (X, 2026-07-07)
  https://x.com/ClaudeDevs/status/2074606058128224365
- Anthropic将Claude Cowork上线移动端和网页端 (RSS, 2026-07-07)
  https://www.theverge.com/ai-artificial-intelligence/961978/anthropic-claude-cowork-mobile-web

## AI 模型发布/更新

- 北京并未考虑限制海外访问中国顶级AI模型（驳斥路透社报道） — Stannis_Loyalist (Reddit)
  https://www.reddit.com/r/LocalLLaMA/comments/1upvw37/beijing_is_not_looking_at_curbing_overseas_access/
```

An earlier render from the same pipeline, as a screenshot:
[`docs/showcase/digest-2026-07-03.png`](showcase/digest-2026-07-03.png)
(189 candidates → 32 items, same health-banner and "Other relevant" behavior).

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
