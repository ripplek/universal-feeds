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

| Tier                    | Sources                                                                                                                                                                                                                                          | Requirement                                                                                                          | CI / headless   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------- |
| **tier-0 (public)**     | RSS, V2EX, Hacker News, 36Kr, X-via-`bird`                                                                                                                                                                                                       | none (or `bird` cookies for X)                                                                                       | ✅ works        |
| **reach (via OpenCLI)** | YouTube, Twitter, Reddit, Bilibili, Xiaohongshu, Weibo, Zhihu, Medium, Jike, LINUX DO, GitHub Trending, arXiv, dblp, Google Scholar, PubMed, Stack Overflow, Lobsters, DEV, LessWrong, OpenReview, AIbase, Toutiao, BBC, Bloomberg, … (34 total) | OpenCLI + its Chrome extension; **desktop only**. Auth-gated sites also need a logged-in session (~17 need no login) | ❌ desktop only |

An agent running in a headless/CI/cloud environment can only use tier-0. The
reach layer drives Chrome via OpenCLI and cannot run headless — even the
no-login channels (GitHub Trending, arXiv, …) are gated by the OpenCLI health
check (see `docs/adr/0001-*`). Check reach health with `node bin/digest reach doctor`.

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
  "health": "warning",
  "stage": "full",
  "date": "2026-07-01",
  "runId": "2026-07-01-1",
  "itemsPath": "…/out/items-2026-07-01.jsonl",
  "digestPath": "…/out/digest-2026-07-01.md",
  "inspectionPath": "…/out/digest-inspection-2026-07-01.md",
  "candidatesPath": null,
  "count": 30,
  "sourceHealth": [
    {
      "source": "v2ex",
      "platform": "v2ex",
      "enabled": true,
      "fetched": 0,
      "severity": "warning",
      "message": "enabled source returned zero items"
    }
  ],
  "judgmentCoverage": { "candidates": 145, "judged": 145, "missing": 0 },
  "reportPath": "…/out/runs/2026-07-01-1/run-report.json"
}
```

**Two orthogonal status fields — read both, never conflate them:**

- **`status`** is the _process_ outcome: `ok` | `awaiting_judgments` (the `daily`
  state machine paused for you to judge) | `error` (a thrown failure — the object
  is `{"status":"error","stage":"…","error":"<message>"}` and **exit ≠ 0**).
- **`health`** is _content integrity_ (present when `status` is `ok`/`awaiting_judgments`):
  `ok` | `warning` (a required source came back empty) | `degraded` (a required
  source errored, but the digest still rendered). `sourceHealth[]` is the
  per-source breakdown behind it; `formatHealthLine` renders the same summary as
  a `>` blockquote at the top of the digest so a reader sees what failed today.

Exit code is 0 for `ok`/`awaiting_judgments`/`warning`/`degraded` (an agent needs
the JSON, not a crash) and non-zero only for `error`. Pass `--strict-exit` to also
fail the process when `health` is `warning`/`degraded` (cron semantics).

**Optional sources.** `platforms.<name>.health: optional` demotes an empty/failed
source to `info` so it never lifts top-level `health` — use it for experimental or
low-frequency reach channels you don't want raising the alarm every day.

Files written: `out/items-<date>.jsonl` (ranked `FeedItem`s, see `docs/SCHEMA.md`);
`out/digest-<date>.md` (the reader-facing digest — clean, deduplicated, grouped
by topic, the file you deliver); and `out/digest-inspection-<date>.md` (the same
items with scores, tags, keyword hits, and the full per-platform list — for
debugging ranking/filtering, not for readers). Every fetch also freezes an
immutable **run snapshot** under `out/runs/<runId>/` (`items.jsonl`, `meta.json`,
`candidates.jsonl`, `judging-task.json`, `judgments.jsonl`, `run-report.json`);
runs older than `output.runs_keep_days` (default 7) are pruned automatically.

### AI relevance filtering — the three-step loop

When `filter.mode` is `llm` or `hybrid`, the digest delegates the relevance
decision to **you (the agent)**. The CLI never calls an LLM or holds a key. The
loop is: **emit candidates → you judge → render**, all bound to one run snapshot.

```
① node bin/digest --config c.yaml --stage candidates --json
     → out/runs/<runId>/candidates.jsonl    (compact items to judge)
     → out/runs/<runId>/judging-task.json   (self-contained: runId + profile + schema + paths)
② you judge each candidate → out/runs/<runId>/judgments.jsonl
③ node bin/digest --config c.yaml --judgments out/runs/<runId>/judgments.jsonl --json
     → out/digest-<date>.md
```

**The run snapshot binds the loop.** Step ① fetches once and freezes the base
pool under `out/runs/<runId>/`; steps ② and ③ read _that_ snapshot — the render
never re-fetches, so judgments can't drift against a fresh pull. Write your
judgments to the path in `judging-task.json`'s `output.path` (inside the run
dir) — that path **is** the run binding. Step ① is idempotent per day: a repeat
call reuses the day's run (pass `--refetch` to force a new one).

**Step ① output** — `--json` returns `stage:"candidates"`, `runId`,
`candidatesPath`, `judgingTaskPath`, `count`, `sourceHealth`. Read
`judging-task.json`; it contains everything you need to judge **without loading
any skill**:

```json
{"task":"universal-feeds/relevance-judging","date":"…","runId":"2026-07-01-1",
 "model":"claude-haiku-4-5",
 "profile":"<the user's interest profile>","topics":["agentic-ai", …],
 "min_relevance":0.5,"require_topic_match":true,"count":145,
 "candidatesPath":"out/runs/2026-07-01-1/candidates.jsonl","instructions":"…",
 "judgment_schema":{ "type":"object","required":["id","relevant","score"], … },
 "output":{"path":"out/runs/2026-07-01-1/judgments.jsonl","format":"jsonl"}}
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

**Validate before rendering** (optional dry-run, reads the run snapshot, writes
no digest, exit ≠ 0 on hard errors — malformed / unknown id / out-of-range score
/ duplicate):

```bash
node bin/digest --config c.yaml --validate-judgments out/runs/<runId>/judgments.jsonl --json
# → {"status":"ok|error","ok":true,"runId":"…","counts":{total,valid,unknownId,…},"warnings":[…]}
```

**Step ③ — render**: pass `--judgments` (the run is inferred from its path;
`--run <runId>` overrides). In strict mode (`output.require_topic_match: true`)
items you didn't mark relevant, or scored below `filter.min_relevance`, are
dropped. Rendering is a **hard gate**: an unreadable or partially-malformed
judgments file, or judgments that fail validation, refuse to render (they no
longer silently fall back to the keyword gate). If you never supply judgments
under `mode: llm`, use the keyword path (`--stage full` with no `--judgments`,
or `daily --no-judge`) which does fall back to the keyword gate so CI / offline
still works. Full semantics: `docs/FILTERING.md`.

Self-test the loop offline with the fixture in `examples/judging/`.

### `daily` — the scheduled-session state machine

For an agent driven on a schedule (a cron-triggered Clawdbot/Claude session that
posts the digest in-chat), `daily` collapses the loop into one re-entrant verb:

```bash
node bin/digest daily --config c.yaml --json
```

- **`llm`/`hybrid`, no judgments yet** → creates/reuses the run, emits candidates,
  returns `status:"awaiting_judgments"` with `runId` + inlined `judgingTask`, then
  **stops**. Judge, write to the run's `judgments.jsonl`, and call `daily` again.
- **judgments present** → validates + renders (terminal `status:"ok"`).
- **`keyword` mode, or `--no-judge`** → renders straight through in one call
  (this is the CI smoke path).
- **zero candidates** → renders a health-only digest (`status:"ok"`,
  `health:"degraded"`/`"warning"`) rather than hanging — the failure is delivered,
  not hidden.

Idempotent: a repeat `daily` call advances or replays the current run without
re-fetching (`--refetch` forces a fresh snapshot). A scheduled session only needs
`status` + `health` + `sourceHealth` + `digestPath` to decide what to post — see
`examples/cron/agent-session-digest.mjs`.

### Migration (from the pre-run-snapshot CLI)

- **Candidate/judgment files moved into the run dir.** Old
  `out/candidates-<date>.jsonl` / `out/judging-task-<date>.json` /
  `out/judgments-<date>.jsonl` are now `out/runs/<runId>/{candidates,judging-task,judgments}.…`.
  Always take the exact paths from step ①'s JSON (`candidatesPath`,
  `judgingTaskPath`) and from `judging-task.json`'s `output.path`; never hardcode.
- **`--judgments` no longer re-fetches.** It binds to the run the judgments were
  written against and errors with guidance if no run exists (run `--stage candidates`
  first). This is what kills the cross-invocation drift.
- **Hard failures replace silent fallbacks.** An explicit `--config <path>` that
  doesn't exist, an unreadable/malformed `--judgments`, or a filter/topics config
  change between judging and rendering (`config drift`) now fail loudly. Pass
  `--allow-config-drift` to render across a filter change deliberately.
- **MCP `apply_judgments` now needs `runId`** in `llm`/`hybrid` mode — echo
  `judgingTask.runId` from `emit_candidates`. Don't re-resolve "today"; a
  scheduled run can cross midnight between emit and apply.
- **Result JSON gained `health`, `runId`, `sourceHealth`, `judgmentCoverage`,
  `reportPath`.** `status` no longer doubles as a health signal (see above).

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

| Tool              | Purpose                                         | Key args                                                                                                   |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `run_digest`      | Full digest; optionally apply judgments         | `config?`, `date?`, `judgments?` (inline array) / `judgmentsPath?`, `runId?`                               |
| `emit_candidates` | Step ①; returns `runId` + paths + `judgingTask` | `config?`, `date?`, `refetch?`                                                                             |
| `apply_judgments` | Step ③; validates then renders                  | `config?`, `date?`, `judgments?` / `judgmentsPath?`, **`runId`** (req. in llm/hybrid), `allowConfigDrift?` |
| `reach_fetch`     | One-off auth-gated fetch (desktop only)         | `platform` (required), `query?`                                                                            |

A full agent run of the AI loop: `emit_candidates` → **capture `runId` from the
result** → judge the returned candidates against `judgingTask.profile` →
`apply_judgments` with `runId` and the inline `judgments` array. Passing `runId`
is what binds the judgments to the exact snapshot they were written against; in
`llm`/`hybrid` mode `apply_judgments` requires it (a scheduled run can cross
midnight between the two calls, so "today" is not a safe re-resolve). Paths
default to `config/feeds.yaml` (an explicit missing path is an error; only the
implicit default falls back to the example) and `date:"today"`.

---

## Library API

The `src/operations.js` verbs are the programmatic entry points if you embed
rather than shell out. They take a run context (`{ cfg, date, outDir }`) and
return the same objects the CLI/MCP serialize:

```js
import { loadConfig } from 'universal-feeds/src/config.js';
import {
  resolveRunContext,
  emitCandidates,
  applyJudgments,
  runFullDigest,
  daily,
} from 'universal-feeds/src/operations.js';

const ctx = resolveRunContext('config/feeds.yaml', '2026-07-01');

// AI loop:
const { runId, candidatesPath } = await emitCandidates(ctx);
// … agent judges, writes out/runs/<runId>/judgments.jsonl …
const res = await applyJudgments(ctx, {
  runId,
  judgmentsPath: `${ctx.outDir}/runs/${runId}/judgments.jsonl`,
});

// Keyword path (no judging): runFullDigest(ctx) — or the scheduled state
// machine: daily(ctx, { noJudge: true }).
```

`emitCandidates` writes the run snapshot + candidate files but performs no LLM
calls — judging is always the caller's responsibility. `sources` is injectable
on every verb (`emitCandidates(ctx, { sources })`, etc.) for tests.

---

## Quick reference

| I want to…                       | Command                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Run the digest, parse the result | `node bin/digest --config c.yaml --json`                                                       |
| Drive a scheduled agent session  | `node bin/digest daily --config c.yaml --json`                                                 |
| Emit candidates to judge         | `node bin/digest --config c.yaml --stage candidates --json` (returns `runId`)                  |
| Check my judgments are valid     | `node bin/digest --config c.yaml --validate-judgments out/runs/<runId>/judgments.jsonl --json` |
| Render with my judgments         | `node bin/digest --config c.yaml --judgments out/runs/<runId>/judgments.jsonl --json`          |
| Fail cron on empty/broken source | add `--strict-exit`                                                                            |
| Fetch one auth-gated platform    | `node bin/digest reach fetch reddit "query"`                                                   |
| Serve everything over MCP        | `node bin/mcp`                                                                                 |
