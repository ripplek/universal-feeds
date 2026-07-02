import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveRunContext,
  extractCandidateIds,
  materializeJudgments,
} from '../src/operations.js';
import { createRun } from '../src/run_store.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('resolveRunContext: loads the given config and honors an explicit date', () => {
  const ctx = resolveRunContext('config/feeds.ci.yaml', '2026-01-02');
  assert.ok(ctx.cfg && typeof ctx.cfg === 'object');
  assert.equal(ctx.date, '2026-01-02');
  assert.ok(path.isAbsolute(ctx.outDir));
});

test('resolveRunContext: implicit default falls back to the example config', () => {
  // No explicitConfig flag → the legacy fallback still applies.
  const ctx = resolveRunContext('config/does-not-exist.yaml', '2026-01-02');
  assert.ok(ctx.cfg && typeof ctx.cfg === 'object');
});

test('resolveRunContext: an EXPLICIT missing config path is a hard failure', () => {
  assert.throws(
    () =>
      resolveRunContext('config/does-not-exist.yaml', '2026-01-02', {
        explicitConfig: true,
      }),
    /config not found/
  );
});

test('resolveRunContext: "today" resolves to a YYYY-MM-DD string', () => {
  const ctx = resolveRunContext('config/feeds.ci.yaml', 'today');
  assert.match(ctx.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('extractCandidateIds reads platform-qualified ids from a JSONL file', () => {
  const p = path.join(
    here,
    '..',
    'examples',
    'judging',
    'candidates-sample.jsonl'
  );
  const ids = extractCandidateIds(p);
  assert.deepEqual(ids, [
    'reddit:1tolh94',
    'hackernews:39001122',
    '36kr:5567788',
    'reddit:crypto42',
  ]);
});

test('materializeJudgments: passes through an existing path unchanged', () => {
  const p = materializeJudgments({
    judgmentsPath: 'out/judgments-x.jsonl',
    outDir: os.tmpdir(),
    runId: '2026-07-01-1',
  });
  assert.equal(p, 'out/judgments-x.jsonl');
});

test('materializeJudgments: writes an inline array INTO the run directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-mat-'));
  const { runId } = createRun(dir, '2026-07-01');
  const p = materializeJudgments({
    judgments: [
      { id: 'reddit:1', relevant: true, score: 0.9 },
      { id: 'hackernews:2', relevant: false, score: 0.1 },
    ],
    outDir: dir,
    runId,
  });
  assert.equal(p, path.join(dir, 'runs', runId, 'judgments.jsonl'));
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).id, 'reddit:1');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('materializeJudgments: returns undefined when nothing is supplied', () => {
  const p = materializeJudgments({
    outDir: os.tmpdir(),
    runId: '2026-07-01-1',
  });
  assert.equal(p, undefined);
});
