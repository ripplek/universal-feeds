# AGENTS.md — how any agent uses universal-feeds

This is the **runtime-agnostic contract** for driving universal-feeds from an AI
agent (Claude Code / Desktop, OpenClaw/Clawdbot, Hermes, or your own). It depends
on **no skill loader** — everything below is plain CLI commands, stdin/stdout, and
files on disk. Per-runtime skill packaging (Clawdbot `SKILL.md`, Claude Code
skills) is a thin wrapper over this; if a wrapper and this doc disagree, this doc
wins.

Two ways to integrate, pick one:

- **MCP (recommended, zero bespoke wiring)** — run the bundled MCP server and
  call its tools. Works with any MCP-capable agent. See [MCP](#mcp-server).
- **CLI** — shell out to `node bin/digest …` and parse `--json` stdout. See
  [CLI contract](#cli-contract).

---

## Capability tiers (what works where)

| Tier                   | Sources                                                                                            | Requirement                                                             | CI / headless   |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------- |
| **tier-0 (public)**    | RSS, V2EX, Hacker News, 36Kr, X-via-`bird`                                                         | none (or `bird` cookies for X)                                          | ✅ works        |
| **reach (auth-gated)** | YouTube, Twitter, Reddit, Bilibili, Xiaohongshu, Weibo, LinkedIn, Xueqiu, TikTok, Substack, … (16) | OpenCLI + its Chrome extension, logged into the sites, **desktop only** | ❌ desktop only |

An agent running in a headless/CI/cloud environment can only use tier-0. The
reach layer drives a real logged-in Chrome and cannot run headless (see
`docs/adr/0001-*`). Check reach health with `node bin/digest reach doctor`.

---

## CLI contract

All commands are `node bin/digest …` (installed bin: `universal-feeds`). Add
`--json` to get one machine-readable JSON object on stdout; **exit code is
non-zero on failure**. Human progress/warnings go to **stderr** (safe to ignore
when parsing `--json`).

### Full digest

```bash
node bin/digest --config config/feeds.yaml --date today --json
```

stdout (one object):

```json
{
  "status": "ok",
  "stage": "full",
  "date": "2026-07-01",
  "itemsPath": "…/out/items-2026-07-01.jsonl",
  "digestPath": "…/out/digest-2026-07-01.md",
  "inspectionPath": "…/out/digest-inspection-2026-07-01.md",
  "candidatesPath": null,
  "count": 30
}
```

On failure: `{"status":"error","stage":"full","error":"<message>"}` and exit ≠ 0.

Files written: `out/items-<date>.jsonl` (ranked `FeedItem`s, see `docs/SCHEMA.md`);
`out/digest-<date>.md` (the reader-facing digest — clean, deduplicated, grouped
by topic, the file you deliver); and `out/digest-inspection-<date>.md` (the same
items with scores, tags, keyword hits, and the full per-platform list — for
debugging ranking/filtering, not for readers).

### AI relevance filtering — the three-step loop

When `filter.mode` is `llm` or `hybrid`, the digest delegates the relevance
decision to **you (the agent)**. The CLI never calls an LLM or holds a key. The
loop is: **emit candidates → you judge → render**.

```
① node bin/digest --config c.yaml --stage candidates --json
     → out/candidates-<date>.jsonl   (compact items to judge)
     → out/judging-task-<date>.json  (self-contained: profile + schema + paths)
② you judge each candidate           → out/judgments-<date>.jsonl
③ node bin/digest --config c.yaml --judgments out/judgments-<date>.jsonl --json
     → out/digest-<date>.md
```

**Step ① output** — `--json` returns `stage:"candidates"`, `candidatesPath`,
`judgingTaskPath`, `count`. Read `judging-task-<date>.json`; it contains
everything you need to judge **without loading any skill**:

```json
{"task":"universal-feeds/relevance-judging","date":"…","model":"claude-haiku-4-5",
 "profile":"<the user's interest profile>","topics":["agentic-ai", …],
 "min_relevance":0.5,"require_topic_match":true,"count":145,
 "candidatesPath":"out/candidates-…jsonl","instructions":"…",
 "judgment_schema":{ "type":"object","required":["id","relevant","score"], … },
 "output":{"path":"out/judgments-…jsonl","format":"jsonl"}}
```

Each **candidate** line: `{"id":"<platform>:<id>","platform":"…","title":"…","text":"…","url":"…"}`.
`id` is platform-qualified so it never collides across sources.

**Step ② — you emit one judgment per candidate** matching `judgment_schema`:

```json
{
  "id": "<same id>",
  "relevant": true,
  "score": 0.82,
  "topics": ["agentic-ai"],
  "why": "one line"
}
```

- Echo `id` **verbatim**. Judge on meaning, not keywords — cross-language is
  expected (a Chinese post about model releases is relevant to an English AI
  profile).
- `topics`: reuse the names from `judging-task`'s `topics` where they fit; add
  new ones sparingly. They drive the digest's grouping and boosts.
- Use the cheap bulk model in `judging-task.model` (default `claude-haiku-4-5`).

**Validate before rendering** (optional dry-run, writes no digest, exit ≠ 0 on
hard errors — malformed / unknown id / out-of-range score / duplicate):

```bash
node bin/digest --config c.yaml --validate-judgments out/judgments-<date>.jsonl --json
# → {"status":"ok|error","ok":true,"counts":{total,valid,unknownId,outOfRange,…},"warnings":[…]}
```

**Step ③ — render**: pass `--judgments`. In strict mode
(`output.require_topic_match: true`) items you didn't mark relevant, or scored
below `filter.min_relevance`, are dropped. If no judgments file is supplied while
`mode: llm`, the digest falls back to the keyword gate (so CI / offline still
works). Full semantics: `docs/FILTERING.md`.

Self-test the loop offline with the fixture in `examples/judging/`.

### Reach (auth-gated, desktop only)

```bash
node bin/digest reach doctor                    # health of every channel
node bin/digest reach watch                      # compact health; exit ≠ 0 if unhealthy
node bin/digest reach fetch reddit "AI agents"   # one-off → FeedItem JSONL on stdout
```

Full setup: `docs/REACH.md`.

---

## MCP server

Run the bundled server (stdio transport); it exposes the loop above as tools so
**any MCP-capable agent uses universal-feeds with zero bespoke skill packaging.**

```bash
node bin/mcp        # installed bin: universal-feeds-mcp
```

Register it with your agent. Example (Claude Code / Desktop `mcpServers` entry):

```json
{
  "mcpServers": {
    "universal-feeds": {
      "command": "node",
      "args": ["bin/mcp"],
      "cwd": "/absolute/path/to/universal-feeds"
    }
  }
}
```

Tools (each returns a JSON object as text):

| Tool              | Purpose                                       | Key args                                                           |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `run_digest`      | Full digest; optionally apply judgments       | `config?`, `date?`, `judgments?` (inline array) / `judgmentsPath?` |
| `emit_candidates` | Step ①; returns paths + inlined `judgingTask` | `config?`, `date?`                                                 |
| `apply_judgments` | Step ③; validates then renders                | `config?`, `date?`, `judgments?` / `judgmentsPath?`                |
| `reach_fetch`     | One-off auth-gated fetch (desktop only)       | `platform` (required), `query?`                                    |

A full agent run of the AI loop: `emit_candidates` → judge the returned
candidates against `judgingTask.profile` → `apply_judgments` with the inline
`judgments` array. Paths default to `config/feeds.yaml` (falling back to the
example) and `date:"today"`.

---

## Library API

`runDigest` is the pure programmatic entry point if you embed rather than shell
out:

```js
import { loadConfig } from 'universal-feeds/src/config.js';
import { runDigest } from 'universal-feeds/src/pipeline.js';

const cfg = loadConfig('config/feeds.yaml');
const { itemsPath, digestPath, count } = await runDigest({
  cfg,
  date: '2026-07-01',
  outDir: 'out',
  stage: 'full',
  judgmentsPath: 'out/judgments-2026-07-01.jsonl', // optional
});
```

`stage: 'candidates'` returns `{ candidatesPath, judgingTaskPath, count }` and
stops before rendering. It writes files but performs no LLM calls — judging is
always the caller's responsibility.

---

## Quick reference

| I want to…                       | Command                                                               |
| -------------------------------- | --------------------------------------------------------------------- |
| Run the digest, parse the result | `node bin/digest --config c.yaml --json`                              |
| Emit candidates to judge         | `node bin/digest --config c.yaml --stage candidates --json`           |
| Check my judgments are valid     | `node bin/digest --config c.yaml --validate-judgments f.jsonl --json` |
| Render with my judgments         | `node bin/digest --config c.yaml --judgments f.jsonl --json`          |
| Fetch one auth-gated platform    | `node bin/digest reach fetch reddit "query"`                          |
| Serve everything over MCP        | `node bin/mcp`                                                        |
