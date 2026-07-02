import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertRunId,
  createRun,
  writeRunSnapshot,
  readRunMeta,
  readRunItems,
  latestRunId,
  runIdFromPath,
  cleanupRuns,
  writeRunFile,
  configHashes,
} from '../src/run_store.js';

function tmpOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'uf-run-'));
}

test('assertRunId rejects path traversal and malformed ids', () => {
  assert.throws(() => assertRunId('../../etc'), /invalid runId/);
  assert.throws(() => assertRunId('2026-07-02'), /invalid runId/);
  assert.throws(() => assertRunId('2026-07-02-'), /invalid runId/);
  assert.equal(assertRunId('2026-07-02-1'), '2026-07-02-1');
  assert.equal(assertRunId('2026-07-02-42'), '2026-07-02-42');
});

test('createRun allocates distinct sequential dirs (concurrent-safe mkdir)', () => {
  const out = tmpOut();
  const a = createRun(out, '2026-07-02');
  const b = createRun(out, '2026-07-02');
  assert.equal(a.runId, '2026-07-02-1');
  assert.equal(b.runId, '2026-07-02-2');
  assert.ok(fs.existsSync(a.dir) && fs.existsSync(b.dir));
  fs.rmSync(out, { recursive: true, force: true });
});

test('snapshot round-trips items and meta', () => {
  const out = tmpOut();
  const { runId, dir } = createRun(out, '2026-07-02');
  const items = [{ platform: 'rss', id: '1', url: 'https://a' }];
  writeRunSnapshot(dir, {
    items,
    meta: { runId, fetchedAt: '2026-07-02T00:00:00Z' },
  });
  assert.deepEqual(readRunItems(out, runId), items);
  assert.equal(readRunMeta(out, runId).fetchedAt, '2026-07-02T00:00:00Z');
  fs.rmSync(out, { recursive: true, force: true });
});

test('a run with corrupt meta.json is invalid and skipped by latestRunId', () => {
  const out = tmpOut();
  const a = createRun(out, '2026-07-02');
  writeRunSnapshot(a.dir, {
    items: [],
    meta: { runId: a.runId, fetchedAt: 'x' },
  });
  const b = createRun(out, '2026-07-02');
  fs.writeFileSync(path.join(b.dir, 'meta.json'), '{corrupt', 'utf8');
  // b has the higher seq but is invalid → a wins.
  assert.equal(latestRunId(out, '2026-07-02'), a.runId);
  assert.throws(() => readRunMeta(out, b.runId), /corrupt meta/);
  // A run dir with no meta at all is invalid too.
  const c = createRun(out, '2026-07-03');
  assert.throws(() => readRunMeta(out, c.runId), /missing meta/);
  assert.equal(latestRunId(out, '2026-07-03'), null);
  fs.rmSync(out, { recursive: true, force: true });
});

test('runIdFromPath derives the binding from a path inside a run dir', () => {
  assert.equal(
    runIdFromPath('out/runs/2026-07-02-3/judgments.jsonl'),
    '2026-07-02-3'
  );
  assert.equal(
    runIdFromPath('/abs/out/runs/2026-07-02-1/x.jsonl'),
    '2026-07-02-1'
  );
  assert.equal(runIdFromPath('out/judgments-2026-07-02.jsonl'), null);
  assert.equal(runIdFromPath('out/runs/not-a-run/j.jsonl'), null);
  assert.equal(runIdFromPath(null), null);
});

test('configHashes: filter changes move filterHash, output changes only cfgHash', () => {
  const base = { filter: { profile: 'a' }, output: { language: 'zh' } };
  const h0 = configHashes(base);
  const h1 = configHashes({ ...base, output: { language: 'en' } });
  assert.equal(h0.filterHash, h1.filterHash);
  assert.notEqual(h0.cfgHash, h1.cfgHash);
  const h2 = configHashes({ ...base, filter: { profile: 'b' } });
  assert.notEqual(h0.filterHash, h2.filterHash);
});

test('cleanupRuns removes old terminal runs, protects fresh non-terminal ones', () => {
  const out = tmpOut();
  const nowMs = Date.parse('2026-07-10T00:00:00Z');
  const mk = (date, fetchedAt, terminal) => {
    const { runId, dir } = createRun(out, date);
    writeRunSnapshot(dir, { items: [], meta: { runId, fetchedAt } });
    if (terminal) writeRunFile(dir, 'run-report.json', '{}');
    return runId;
  };
  const oldTerminal = mk('2026-07-01', '2026-07-01T00:00:00Z', true); // 9d old
  const oldOpen = mk('2026-07-01', '2026-07-01T01:00:00Z', false); // 9d old, no report → beyond 48h guard, removed
  const freshOpen = mk('2026-07-09', '2026-07-09T23:00:00Z', false); // 1h old
  const freshTerminal = mk('2026-07-09', '2026-07-09T22:00:00Z', true);

  const removed = cleanupRuns(out, { keepDays: 7, nowMs });
  assert.ok(removed.includes(oldTerminal));
  assert.ok(removed.includes(oldOpen));
  assert.ok(!removed.includes(freshOpen));
  assert.ok(!removed.includes(freshTerminal));
  assert.equal(latestRunId(out, '2026-07-09') !== null, true);
  fs.rmSync(out, { recursive: true, force: true });
});
