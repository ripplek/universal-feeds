// Run snapshot store — the seam that makes candidate drift structurally
// impossible. One fetch writes an immutable run under out/runs/<date>-<seq>/;
// candidates, validation, and rendering all read from that same snapshot.
//
//   out/runs/2026-07-02-1/
//     meta.json         fetchedAt, config hashes, per-source fetch counts
//     items.jsonl       post-enrich FeedItems (the frozen base pool)
//     candidates.jsonl  compact judge payload derived from items.jsonl
//     judging-task.json self-contained task (carries runId)
//     judgments.jsonl   written by the agent — path IS the runId binding
//     run-report.json   terminal marker, written by the render stage
//
// All writes are atomic (tmp + rename) so a crash never leaves a half-written
// run that a later command would consume.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// runId is the only user-controllable path component — validate before any
// path join so `--run ../../etc` can never traverse out of out/runs/.
export const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}-\d+$/;

export function assertRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) {
    throw new Error(
      `invalid runId '${runId}' (expected <YYYY-MM-DD>-<seq>, e.g. 2026-07-02-1)`
    );
  }
  return runId;
}

export function runsRoot(outDir) {
  return path.join(outDir, 'runs');
}

export function runDir(outDir, runId) {
  return path.join(runsRoot(outDir), assertRunId(runId));
}

function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

// Config hashes for drift detection between the candidates stage and render.
// filterHash covers everything that changes what the agent judged (profile,
// thresholds, topics, entities); cfgHash covers the whole config (rendering
// knobs included). filter drift → reject render; output-only drift → warning.
// Order-insensitive stringify: YAML key order is not semantically meaningful,
// so a reordered config must not read as a drift. Sort object keys recursively.
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function configHashes(cfg = {}) {
  const sha = (v) =>
    crypto
      .createHash('sha256')
      .update(stableStringify(v))
      .digest('hex')
      .slice(0, 12);
  return {
    filterHash: sha({
      filter: cfg.filter ?? null,
      topics: cfg.topics ?? null,
      entities: cfg.entities ?? null,
    }),
    cfgHash: sha(cfg),
  };
}

// Allocate out/runs/<date>-<seq>/ with mkdir's exclusive semantics: on EEXIST
// bump seq and retry, so two concurrent same-day invocations never clobber
// each other's run.
export function createRun(outDir, date) {
  const root = runsRoot(outDir);
  fs.mkdirSync(root, { recursive: true });
  for (let seq = 1; seq < 10000; seq++) {
    const runId = `${date}-${seq}`;
    try {
      fs.mkdirSync(path.join(root, runId));
      return { runId, dir: path.join(root, runId) };
    } catch (e) {
      if (e?.code === 'EEXIST') continue;
      throw e;
    }
  }
  throw new Error(`could not allocate a run directory for ${date}`);
}

export function writeRunSnapshot(dir, { items, meta }) {
  const jsonl =
    items.map((x) => JSON.stringify(x)).join('\n') + (items.length ? '\n' : '');
  atomicWrite(path.join(dir, 'items.jsonl'), jsonl);
  atomicWrite(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
}

export function writeRunFile(dir, name, data) {
  atomicWrite(path.join(dir, name), data);
}

export function readRunMeta(outDir, runId) {
  const p = path.join(runDir(outDir, runId), 'meta.json');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    throw new Error(
      `run ${runId} is invalid (missing meta.json) — re-fetch with --refetch`
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `run ${runId} is invalid (corrupt meta.json) — re-fetch with --refetch`
    );
  }
}

export function readRunItems(outDir, runId) {
  const p = path.join(runDir(outDir, runId), 'items.jsonl');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    throw new Error(
      `run ${runId} is invalid (missing items.jsonl) — re-fetch with --refetch`
    );
  }
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function metaIsValid(outDir, runId) {
  try {
    readRunMeta(outDir, runId);
    return true;
  } catch {
    return false;
  }
}

// Latest valid run for a date (highest seq with a readable meta.json), or null.
export function latestRunId(outDir, date) {
  const root = runsRoot(outDir);
  let entries;
  try {
    entries = fs.readdirSync(root);
  } catch {
    return null;
  }
  const seqs = entries
    .filter((n) => RUN_ID_RE.test(n) && n.startsWith(`${date}-`))
    .map((n) => Number(n.slice(date.length + 1)))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  for (const seq of seqs) {
    const runId = `${date}-${seq}`;
    if (metaIsValid(outDir, runId)) return runId;
  }
  return null;
}

// Derive the runId from a judgments path living inside a run directory —
// the path IS the binding (out/runs/<runId>/judgments.jsonl).
export function runIdFromPath(p) {
  if (!p) return null;
  const parts = path.resolve(p).split(path.sep);
  const i = parts.lastIndexOf('runs');
  if (i < 0 || i + 1 >= parts.length) return null;
  const cand = parts[i + 1];
  return RUN_ID_RE.test(cand) ? cand : null;
}

export function hasRunReport(outDir, runId) {
  return fs.existsSync(path.join(runDir(outDir, runId), 'run-report.json'));
}

// Retention: delete runs older than keepDays (by meta.fetchedAt). A run with
// no run-report.json (not terminal — judging may be in flight) is protected
// for 48h regardless. Invalid runs (unreadable meta) age by dir mtime.
export function cleanupRuns(outDir, { keepDays = 7, nowMs = Date.now() } = {}) {
  const root = runsRoot(outDir);
  let entries;
  try {
    entries = fs.readdirSync(root);
  } catch {
    return [];
  }
  const removed = [];
  const keepMs = keepDays * 864e5;
  const guardMs = 48 * 36e5;
  for (const name of entries) {
    if (!RUN_ID_RE.test(name)) continue;
    const dir = path.join(root, name);
    let ageMs;
    try {
      const meta = readRunMeta(outDir, name);
      ageMs = nowMs - Date.parse(meta.fetchedAt || '');
    } catch {
      try {
        ageMs = nowMs - fs.statSync(dir).mtimeMs;
      } catch {
        continue;
      }
    }
    if (!Number.isFinite(ageMs) || ageMs <= keepMs) continue;
    if (!hasRunReport(outDir, name) && ageMs <= guardMs) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}
