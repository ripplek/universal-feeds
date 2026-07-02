// Agent-facing operations — the shared core beneath every transport adapter.
//
// The CLI (src/cli.js) and the MCP server (src/mcp/tools.js) are two adapters
// over the same verbs. Every verb is run-snapshot aware: one fetch freezes a
// run under out/runs/<runId>/, and candidates / validation / rendering all
// read that same snapshot — judgments can never drift against a re-fetch.
//
// Result contract (--json / MCP): two orthogonal fields, never conflated:
//   status  — process outcome: ok | awaiting_judgments | error (throw, exit≠0)
//   health  — content integrity: ok | warning | degraded (from sourceHealth)

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import {
  createRunSnapshot,
  emitCandidatesForRun,
  renderFromItems,
  readJudgingTask,
} from './pipeline.js';
import {
  parseJudgments,
  indexJudgments,
  validateJudgments,
  formatValidationReport,
} from './judgments.js';
import {
  assertRunId,
  runDir,
  latestRunId,
  runIdFromPath,
  readRunMeta,
  readRunItems,
  writeRunFile,
  configHashes,
  cleanupRuns,
} from './run_store.js';
import { buildSourceHealth, overallHealth } from './health.js';

function ymdInTz(d = new Date(), tz = 'Asia/Shanghai') {
  // Simple YYYY-MM-DD using Intl; good enough for reports.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Resolve everything a run needs from a (possibly absent) config path and date.
// An EXPLICITLY passed config path that doesn't exist is a hard failure — the
// old silent fallback to the example config produced a plausible-looking but
// wrong digest on a typo'd path (the exact failure mode this project exists to
// kill). Only the implicit default falls back to the example.
export function resolveRunContext(
  configPath,
  date,
  { explicitConfig = false } = {}
) {
  const p = configPath || 'config/feeds.yaml';
  if (explicitConfig && !fs.existsSync(p)) {
    throw new Error(
      `config not found: ${p} (refusing to silently fall back to the example config)`
    );
  }
  const resolved = fs.existsSync(p) ? p : 'config/feeds.example.yaml';
  const cfg = loadConfig(resolved);
  const tz = cfg?.output?.tz || 'Asia/Shanghai';
  const resolvedDate =
    !date || date === 'today' ? ymdInTz(new Date(), tz) : date;
  const outDir = path.resolve('out');
  fs.mkdirSync(outDir, { recursive: true });
  return { cfg, date: resolvedDate, outDir };
}

// Read back the candidate ids from a run's candidates.jsonl.
export function extractCandidateIds(candidatesPath) {
  return fs
    .readFileSync(candidatesPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line).id);
}

const isLlmMode = (cfg) =>
  cfg?.filter?.mode === 'llm' || cfg?.filter?.mode === 'hybrid';

// ── run resolution ──────────────────────────────────────────────────────────

// Ensure a run exists for the date: reuse the latest valid one (idempotent —
// a same-day re-invocation replays instead of re-fetching) unless `refetch`.
// Always leaves candidates.jsonl + judging-task.json present in the run dir.
async function ensureRun(ctx, { refetch = false, sources } = {}) {
  const { cfg, date, outDir } = ctx;
  let runId = refetch ? null : latestRunId(outDir, date);
  let items;
  let meta;
  let reused = false;

  if (runId) {
    meta = readRunMeta(outDir, runId);
    items = readRunItems(outDir, runId);
    reused = true;
  } else {
    const created = await createRunSnapshot({ cfg, date, outDir, sources });
    runId = created.runId;
    items = created.items;
    meta = readRunMeta(outDir, runId);
  }

  const dir = runDir(outDir, runId);
  let candInfo;
  if (fs.existsSync(path.join(dir, 'candidates.jsonl'))) {
    const candidatesPath = path.join(dir, 'candidates.jsonl');
    candInfo = {
      candidatesPath,
      judgingTaskPath: path.join(dir, 'judging-task.json'),
      count: extractCandidateIds(candidatesPath).length,
    };
  } else {
    candInfo = emitCandidatesForRun({ runId, dir, items, cfg, date });
  }
  return { runId, dir, items, meta, reused, ...candInfo };
}

// Resolve which run a judgments file/args refer to. Priority: explicit runId >
// path-derived (out/runs/<runId>/… — the path IS the binding) > latest run for
// the date, guarded so judgments written against an older run are never
// silently applied to a newer snapshot (cron re-runs, concurrent sessions).
function resolveRunForJudgments(ctx, { judgmentsPath, runId } = {}) {
  const { date, outDir } = ctx;
  const derived = runIdFromPath(judgmentsPath);
  if (runId && derived && runId !== derived) {
    throw new Error(
      `runId mismatch: --run ${runId} but the judgments path is bound to ${derived}`
    );
  }
  let chosen = runId || derived;
  if (chosen) {
    // An explicit runId is globally unique and self-dating — validate it exists
    // (readRunMeta throws otherwise) rather than checking it against ctx.date.
    // Checking against "today" would defeat the whole midnight-rollover contract:
    // a run emitted at 23:58 and applied at 00:02 is legitimately yesterday's.
    assertRunId(chosen);
    readRunMeta(outDir, chosen); // throws "run … is invalid" if missing/corrupt
    return chosen;
  }
  // No explicit binding: fall back to the latest run FOR THE RESOLVED DATE. This
  // path is date-scoped by design — without a runId we can only guess "today".
  chosen = latestRunId(outDir, date);
  if (!chosen) {
    throw new Error(
      `no run found for ${date} — run \`--stage candidates\` first. ` +
        `(--judgments no longer re-fetches; the render is bound to the run the judgments were written against. See AGENTS.md → Migration.)`
    );
  }
  if (judgmentsPath) {
    const meta = readRunMeta(outDir, chosen);
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(judgmentsPath).mtimeMs;
    } catch {
      throw new Error(`cannot read judgments file: ${judgmentsPath}`);
    }
    const runMs = Date.parse(meta.fetchedAt || '');
    if (Number.isFinite(runMs) && mtimeMs < runMs) {
      throw new Error(
        `judgments file predates the latest run ${chosen} — a newer fetch exists. ` +
          `Pass --run <id> (or apply_judgments runId) to bind explicitly.`
      );
    }
  }
  return chosen;
}

// Load a run for rendering, enforcing the config-drift contract: a change to
// filter/topics/entities between candidates and render means the agent judged
// under different semantics — reject unless explicitly allowed. Output-only
// changes are a warning.
function loadRunForRender(ctx, runId, { allowConfigDrift = false } = {}) {
  const { cfg, outDir } = ctx;
  const meta = readRunMeta(outDir, runId);
  const items = readRunItems(outDir, runId);
  const warnings = [];
  const now = configHashes(cfg);
  if (meta.filterHash && meta.filterHash !== now.filterHash) {
    if (!allowConfigDrift) {
      throw new Error(
        `config drift: filter/topics/entities changed since run ${runId} was judged — ` +
          `re-run \`--stage candidates --refetch\`, or pass --allow-config-drift to render anyway`
      );
    }
    warnings.push(
      'config drift allowed: filter semantics changed since judging'
    );
  } else if (meta.cfgHash && meta.cfgHash !== now.cfgHash) {
    warnings.push(
      'config changed since the run was fetched (output-only drift)'
    );
  }
  return { meta, items, warnings, dir: runDir(outDir, runId) };
}

// ── judgments loading (hard gate) ───────────────────────────────────────────

// Read + parse an explicitly supplied judgments file. Unreadable file or
// malformed JSONL lines are hard failures — an explicit --judgments must never
// silently fall back to the keyword gate or partially apply.
function readJudgmentsStrict(judgmentsPath) {
  let text;
  try {
    text = fs.readFileSync(judgmentsPath, 'utf8');
  } catch (e) {
    throw new Error(
      `cannot read judgments ${judgmentsPath}: ${e?.message || e}`
    );
  }
  const t = text.trim();
  if (!t) {
    throw new Error(`judgments ${judgmentsPath} is empty`);
  }
  if (t[0] === '[') {
    // JSON-array form must parse cleanly. parseJudgments swallows a bad array by
    // falling through to line-by-line (→ []), which would silently drop every
    // item in strict mode — parse it strictly here instead.
    let arr;
    try {
      arr = JSON.parse(t);
    } catch (e) {
      throw new Error(
        `judgments ${judgmentsPath} is not valid JSON — refusing to render: ${e?.message || e}`
      );
    }
    if (!Array.isArray(arr)) {
      throw new Error(
        `judgments ${judgmentsPath} must be a JSON array or JSONL — got ${typeof arr}`
      );
    }
    return arr;
  }
  // JSONL: every non-blank line must parse — a partial parse is a hard error.
  const parsed = parseJudgments(text);
  const lines = t.split('\n').filter((l) => l.trim()).length;
  if (lines !== parsed.length) {
    throw new Error(
      `judgments ${judgmentsPath} contains ${lines - parsed.length} malformed JSONL line(s) — refusing to render partially`
    );
  }
  return parsed;
}

function coverageFromReport(report, candidateCount) {
  const missing = report?.counts?.unjudged ?? 0;
  return {
    candidates: candidateCount,
    judged: candidateCount - missing,
    missing,
  };
}

// ── render + report ─────────────────────────────────────────────────────────

function renderRun(
  ctx,
  { runId, meta, items, judgeIndex, judgmentCoverage, warnings = [] }
) {
  const { cfg, date, outDir } = ctx;
  const result = renderFromItems({
    items,
    cfg,
    date,
    outDir,
    fetchedAt: meta.fetchedAt,
    judgeIndex,
    perSource: meta.perSource || [],
  });

  let health = overallHealth(result.sourceHealth);
  if ((judgmentCoverage?.missing ?? 0) > 0 && health === 'ok') {
    health = 'warning';
  }

  const dir = runDir(outDir, runId);
  const report = {
    runId,
    date,
    fetchedAt: meta.fetchedAt,
    generatedAt: new Date().toISOString(),
    health,
    sourceHealth: result.sourceHealth,
    judgmentCoverage: judgmentCoverage ?? null,
    itemCount: result.count,
    warnings,
  };
  // Terminal marker: run-report.json existence tells cleanup the run finished.
  writeRunFile(dir, 'run-report.json', JSON.stringify(report, null, 2));

  return {
    status: 'ok',
    health,
    stage: 'full',
    date,
    runId,
    itemsPath: result.itemsPath,
    digestPath: result.digestPath,
    inspectionPath: result.inspectionPath,
    candidatesPath: null,
    count: result.count,
    sourceHealth: result.sourceHealth,
    judgmentCoverage: judgmentCoverage ?? null,
    reportPath: path.join(dir, 'run-report.json'),
    warnings,
  };
}

function cleanupBestEffort(ctx) {
  try {
    cleanupRuns(ctx.outDir, {
      keepDays: ctx.cfg?.output?.runs_keep_days ?? 7,
    });
  } catch {
    // retention is housekeeping — never fail a run over it
  }
}

// ── public verbs ────────────────────────────────────────────────────────────

// Stage 1: ensure a run and emit candidates + judging task (idempotent per
// day; `refetch` forces a fresh snapshot).
export async function emitCandidates(ctx, { refetch = false, sources } = {}) {
  const run = await ensureRun(ctx, { refetch, sources });
  const sourceHealth = buildSourceHealth({
    perSource: run.meta.perSource || [],
    cfg: ctx.cfg,
  });
  cleanupBestEffort(ctx);
  return {
    status: 'ok',
    health: overallHealth(sourceHealth),
    stage: 'candidates',
    date: ctx.date,
    runId: run.runId,
    itemsPath: null,
    digestPath: null,
    inspectionPath: null,
    candidatesPath: run.candidatesPath,
    judgingTaskPath: run.judgingTaskPath,
    count: run.count,
    sourceHealth,
    reused: run.reused,
  };
}

// Render the digest (stage 3 / full run). With judgmentsPath: bound to the
// judgments' run, validated hard before rendering. Without: the keyword-gate
// path — fresh fetch that also drops a run (so CI/cron keep working and a
// later --judgments can still bind).
export async function runFullDigest(
  ctx,
  { judgmentsPath, runId, allowConfigDrift = false, sources } = {}
) {
  const { cfg, date, outDir } = ctx;

  if (judgmentsPath) {
    const boundRunId = resolveRunForJudgments(ctx, { judgmentsPath, runId });
    const { meta, items, warnings } = loadRunForRender(ctx, boundRunId, {
      allowConfigDrift,
    });
    const judgments = readJudgmentsStrict(judgmentsPath);
    const candidateIds = extractCandidateIds(
      path.join(runDir(outDir, boundRunId), 'candidates.jsonl')
    );
    const report = validateJudgments(judgments, {
      candidateIds,
      minRelevance: cfg?.filter?.min_relevance ?? 0.5,
    });
    if (!report.ok) {
      throw new Error(
        `judgments failed validation — refusing to render:\n${formatValidationReport(report, judgmentsPath)}`
      );
    }
    const out = renderRun(ctx, {
      runId: boundRunId,
      meta,
      items,
      judgeIndex: indexJudgments(judgments),
      judgmentCoverage: coverageFromReport(report, candidateIds.length),
      warnings,
    });
    out.validation = report;
    cleanupBestEffort(ctx);
    return out;
  }

  // Keyword path: always a fresh fetch (existing CI/cron semantics).
  const created = await createRunSnapshot({ cfg, date, outDir, sources });
  emitCandidatesForRun({
    runId: created.runId,
    dir: created.dir,
    items: created.items,
    cfg,
    date,
  });
  const meta = readRunMeta(outDir, created.runId);
  // Surface the silent degradation: mode says llm/hybrid but no judgments were
  // supplied, so this rendered via the keyword matcher, not the AI judge. The
  // pre-snapshot pipeline logged this to stderr; keep it in the result so an
  // agent/operator sees that AI relevance filtering did NOT run.
  const warnings = [];
  if (isLlmMode(cfg)) {
    warnings.push(
      'filter.mode is llm/hybrid but no judgments were supplied — rendered via the keyword gate (AI relevance filtering did NOT run). Use `--stage candidates` then `--judgments`, or `daily`.'
    );
  }
  const out = renderRun(ctx, {
    runId: created.runId,
    meta,
    items: created.items,
    judgeIndex: null,
    judgmentCoverage: null,
    warnings,
  });
  cleanupBestEffort(ctx);
  return out;
}

// Dry-run gate against the run snapshot (no fetch, no digest). Reports
// problems instead of throwing so an agent can self-correct.
export async function validateJudgmentsFile(
  ctx,
  judgmentsFilePath,
  { runId } = {}
) {
  const boundRunId = resolveRunForJudgments(ctx, {
    judgmentsPath: judgmentsFilePath,
    runId,
  });
  const candidateIds = extractCandidateIds(
    path.join(runDir(ctx.outDir, boundRunId), 'candidates.jsonl')
  );
  let judgments;
  try {
    judgments = readJudgmentsStrict(judgmentsFilePath);
  } catch (e) {
    return {
      ok: false,
      runId: boundRunId,
      counts: {},
      warnings: [String(e?.message || e)],
    };
  }
  const report = validateJudgments(judgments, {
    candidateIds,
    minRelevance: ctx.cfg?.filter?.min_relevance ?? 0.5,
  });
  return { ...report, runId: boundRunId };
}

// Accept judgments as a file path, a JSONL/JSON string, or an array of
// objects; inline data is materialized INTO the run directory so the path
// itself carries the binding.
export function materializeJudgments({
  judgments,
  judgmentsPath,
  outDir,
  runId,
}) {
  if (judgmentsPath) return judgmentsPath;
  if (judgments == null) return undefined;
  const arr = Array.isArray(judgments)
    ? judgments
    : parseJudgments(String(judgments));
  const p = path.join(runDir(outDir, runId), 'judgments.jsonl');
  fs.writeFileSync(
    p,
    arr.map((j) => JSON.stringify(j)).join('\n') + '\n',
    'utf8'
  );
  return p;
}

// Step 3 for the agent loop: validate + render against the judgments' run.
// In llm/hybrid mode the runId must be resolvable (explicit param or a
// judgments path inside the run dir) — echo judging-task.runId; "today" may
// have rolled over since the candidates were emitted.
export async function applyJudgments(
  ctx,
  { judgments, judgmentsPath, runId, allowConfigDrift = false } = {}
) {
  if (judgments == null && !judgmentsPath) {
    throw new Error(
      'apply_judgments requires `judgments` (array/JSONL) or `judgmentsPath`'
    );
  }
  let boundRunId = runId || runIdFromPath(judgmentsPath);
  if (boundRunId) {
    assertRunId(boundRunId);
  } else if (judgments != null) {
    // Inline judgments with no run binding = a one-shot call (e.g. MCP
    // run_digest with an inline array). Materialize a fresh run so candidates
    // and judgments come from the SAME fetch — drift-free — and we never blow
    // up on a runDir(undefined). Works in keyword and llm mode alike.
    const run = await ensureRun(ctx, {});
    boundRunId = run.runId;
  } else {
    // A bare judgmentsPath outside any run dir, no runId: we can't know which
    // snapshot it was judged against. Requiring the runId here is what keeps a
    // scheduled loop from silently binding to the wrong (or a re-fetched) run.
    throw new Error(
      'apply_judgments needs a `runId` (or a --judgments path inside out/runs/<runId>/) ' +
        'to bind judgments to their snapshot — echo the runId from judging-task.json ' +
        '(the date may have rolled over since candidates were emitted)'
    );
  }
  const resolvedPath = materializeJudgments({
    judgments,
    judgmentsPath,
    outDir: ctx.outDir,
    runId: boundRunId,
  });
  return runFullDigest(ctx, {
    judgmentsPath: resolvedPath,
    runId: boundRunId,
    allowConfigDrift,
  });
}

// The daily state machine — a run-scoped orchestrator, NOT a judge (the CLI
// never calls an LLM; judging stays on the agent side):
//
//   llm/hybrid, no judgments yet → emit candidates, STOP: awaiting_judgments
//   llm/hybrid, judgments present → validate + render (terminal)
//   keyword (or --no-judge), any → render straight through (terminal)
//   zero candidates              → render health-only digest (terminal)
//
// Idempotent: a repeat call replays/advances the current state; `refetch`
// forces a new snapshot.
export async function daily(
  ctx,
  { refetch = false, noJudge = false, allowConfigDrift = false, sources } = {}
) {
  const run = await ensureRun(ctx, { refetch, sources });
  const llmLoop = isLlmMode(ctx.cfg) && !noJudge;
  const judgmentsPath = path.join(run.dir, 'judgments.jsonl');

  if (llmLoop && run.count > 0 && !fs.existsSync(judgmentsPath)) {
    const sourceHealth = buildSourceHealth({
      perSource: run.meta.perSource || [],
      cfg: ctx.cfg,
    });
    cleanupBestEffort(ctx);
    return {
      status: 'awaiting_judgments',
      health: overallHealth(sourceHealth),
      stage: 'daily',
      date: ctx.date,
      runId: run.runId,
      candidatesPath: run.candidatesPath,
      judgingTaskPath: run.judgingTaskPath,
      judgingTask: readJudgingTask(run.dir),
      count: run.count,
      sourceHealth,
    };
  }

  let out;
  if (llmLoop && run.count > 0) {
    out = await runFullDigest(ctx, {
      judgmentsPath,
      runId: run.runId,
      allowConfigDrift,
    });
  } else {
    // Keyword closure — or an all-empty run (nothing to judge): render the
    // health-only digest so the failure is delivered, not hidden.
    const { meta, items, warnings } = loadRunForRender(ctx, run.runId, {
      allowConfigDrift: true,
    });
    out = renderRun(ctx, {
      runId: run.runId,
      meta,
      items,
      judgeIndex: null,
      judgmentCoverage: null,
      warnings,
    });
  }
  out.stage = 'daily';
  cleanupBestEffort(ctx);
  return out;
}
