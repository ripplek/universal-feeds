// Agent-facing operations — the shared core beneath every transport adapter.
//
// The CLI (src/cli.js) and the MCP server (src/mcp/tools.js) are two adapters
// over the same verbs: resolve a run context, then emit candidates / validate
// judgments / render the digest. Each verb returns plain data (no console, no
// exit codes, no MCP types) so it is unit-testable without a transport, and so
// neither adapter has to import the other. I/O (fetch, file reads/writes) is
// allowed here — this is the orchestration shell, not a pure-function module.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { runDigest, runFullDigestOnce } from './pipeline.js';
import { parseJudgments, validateJudgments } from './judgments.js';

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
// Falls back to the example config when the given one is missing, resolves the
// timezone-local date for "today", and ensures the out/ directory exists.
export function resolveRunContext(configPath, date) {
  const p = configPath || 'config/feeds.yaml';
  const resolved = fs.existsSync(p) ? p : 'config/feeds.example.yaml';
  const cfg = loadConfig(resolved);
  const tz = cfg?.output?.tz || 'Asia/Shanghai';
  const resolvedDate =
    !date || date === 'today' ? ymdInTz(new Date(), tz) : date;
  const outDir = path.resolve('out');
  fs.mkdirSync(outDir, { recursive: true });
  return { cfg, date: resolvedDate, outDir };
}

// Normalize the shape returned by runDigest into a single stable object that an
// agent can parse regardless of stage. Adapters print/serialize exactly this.
export function normalizeResult(result = {}, { date, stage }) {
  const out = {
    status: 'ok',
    stage,
    date,
    itemsPath: result.itemsPath ?? null,
    digestPath: result.digestPath ?? null,
    candidatesPath: result.candidatesPath ?? null,
    count: typeof result.count === 'number' ? result.count : 0,
  };
  // Present only for the candidates stage (see docs/FILTERING.md).
  if (result.judgingTaskPath) out.judgingTaskPath = result.judgingTaskPath;
  return out;
}

// Read back the candidate ids emitted at out/candidates-<date>.jsonl.
export function extractCandidateIds(candidatesPath) {
  return fs
    .readFileSync(candidatesPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line).id);
}

// Accept judgments as a file path, a JSONL/JSON string, or an array of objects.
// Returns a path on disk (writing inline data to out/judgments-<date>.jsonl), or
// undefined when nothing was supplied.
export function materializeJudgments({
  judgments,
  judgmentsPath,
  outDir,
  date,
}) {
  if (judgmentsPath) return judgmentsPath;
  if (judgments == null) return undefined;
  const arr = Array.isArray(judgments)
    ? judgments
    : parseJudgments(String(judgments));
  const p = path.join(outDir, `judgments-${date}.jsonl`);
  fs.writeFileSync(
    p,
    arr.map((j) => JSON.stringify(j)).join('\n') + '\n',
    'utf8'
  );
  return p;
}

// Emit the compact candidate list + self-contained judging task (stage 1).
export async function emitCandidates(ctx) {
  const { cfg, date, outDir } = ctx;
  const result = await runDigest({ cfg, date, outDir, stage: 'candidates' });
  return normalizeResult(result, { date, stage: 'candidates' });
}

// Render the digest, optionally applying a judgments file (stage 3 / full run).
export async function runFullDigest(ctx, { judgmentsPath } = {}) {
  const { cfg, date, outDir } = ctx;
  const result = await runDigest({
    cfg,
    date,
    outDir,
    stage: 'full',
    judgmentsPath,
  });
  return normalizeResult(result, { date, stage: 'full' });
}

// Dry-run gate: re-emit candidates to learn the valid id set, then validate the
// judgments file against it and the config threshold. Writes no digest.
export async function validateJudgmentsFile(ctx, judgmentsFilePath) {
  const { cfg, date, outDir } = ctx;
  const cand = await runDigest({ cfg, date, outDir, stage: 'candidates' });
  const candidateIds = extractCandidateIds(cand.candidatesPath);
  const judgments = parseJudgments(fs.readFileSync(judgmentsFilePath, 'utf8'));
  return validateJudgments(judgments, {
    candidateIds,
    minRelevance: cfg?.filter?.min_relevance ?? 0.5,
  });
}

// Validate + render in a SINGLE fetch. The digest is gated against the same base
// pool the judgments are validated against, so the returned `validation` always
// describes the digest that was produced (no validate/render drift). Accepts
// inline judgments or a path. `sources` is injectable for tests.
export async function applyJudgments(
  ctx,
  { judgments, judgmentsPath, sources } = {}
) {
  const { cfg, date, outDir } = ctx;
  const resolvedPath = materializeJudgments({
    judgments,
    judgmentsPath,
    outDir,
    date,
  });
  if (!resolvedPath) {
    throw new Error(
      'apply_judgments requires `judgments` (array/JSONL) or `judgmentsPath`'
    );
  }
  const { candidateIds, ...result } = await runFullDigestOnce({
    cfg,
    date,
    outDir,
    judgmentsPath: resolvedPath,
    sources,
  });
  const out = normalizeResult(result, { date, stage: 'full' });
  // Advisory: report how the judgments fared against the very set that was
  // rendered. Never blocks the digest.
  try {
    out.validation = validateJudgments(
      parseJudgments(fs.readFileSync(resolvedPath, 'utf8')),
      { candidateIds, minRelevance: cfg?.filter?.min_relevance ?? 0.5 }
    );
  } catch {
    // validation is advisory; the digest already rendered
  }
  return out;
}
