import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeResult,
  resolveRunContext,
  extractCandidateIds,
  materializeJudgments,
} from '../src/operations.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('normalizeResult: full stage carries items/digest paths', () => {
  const r = normalizeResult(
    {
      itemsPath: 'out/items-2026-07-01.jsonl',
      digestPath: 'out/digest-2026-07-01.md',
      count: 12,
    },
    { date: '2026-07-01', stage: 'full' }
  );
  assert.deepEqual(r, {
    status: 'ok',
    stage: 'full',
    date: '2026-07-01',
    itemsPath: 'out/items-2026-07-01.jsonl',
    digestPath: 'out/digest-2026-07-01.md',
    inspectionPath: null,
    candidatesPath: null,
    count: 12,
  });
});

test('normalizeResult: candidates stage carries candidatesPath + judgingTaskPath', () => {
  const r = normalizeResult(
    {
      candidatesPath: 'out/candidates-2026-07-01.jsonl',
      count: 5,
      judgingTaskPath: 'out/judging-task-2026-07-01.json',
    },
    { date: '2026-07-01', stage: 'candidates' }
  );
  assert.equal(r.status, 'ok');
  assert.equal(r.stage, 'candidates');
  assert.equal(r.candidatesPath, 'out/candidates-2026-07-01.jsonl');
  assert.equal(r.judgingTaskPath, 'out/judging-task-2026-07-01.json');
  assert.equal(r.itemsPath, null);
  assert.equal(r.digestPath, null);
  assert.equal(r.count, 5);
});

test('normalizeResult: count defaults to 0 when absent', () => {
  const r = normalizeResult({}, { date: '2026-07-01', stage: 'full' });
  assert.equal(r.count, 0);
});

test('resolveRunContext: loads the given config and honors an explicit date', () => {
  const ctx = resolveRunContext('config/feeds.ci.yaml', '2026-01-02');
  assert.ok(ctx.cfg && typeof ctx.cfg === 'object');
  assert.equal(ctx.date, '2026-01-02');
  assert.ok(path.isAbsolute(ctx.outDir));
});

test('resolveRunContext: falls back to the example config when path is missing', () => {
  const ctx = resolveRunContext('config/does-not-exist.yaml', '2026-01-02');
  // Example config is loaded (keyword filter default lives in config.js).
  assert.ok(ctx.cfg && typeof ctx.cfg === 'object');
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
    date: '2026-07-01',
  });
  assert.equal(p, 'out/judgments-x.jsonl');
});

test('materializeJudgments: writes an inline array to out/judgments-<date>.jsonl', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-mat-'));
  const p = materializeJudgments({
    judgments: [
      { id: 'reddit:1', relevant: true, score: 0.9 },
      { id: 'hackernews:2', relevant: false, score: 0.1 },
    ],
    outDir: dir,
    date: '2026-07-01',
  });
  assert.equal(p, path.join(dir, 'judgments-2026-07-01.jsonl'));
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).id, 'reddit:1');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('materializeJudgments: returns undefined when nothing is supplied', () => {
  const p = materializeJudgments({ outDir: os.tmpdir(), date: '2026-07-01' });
  assert.equal(p, undefined);
});
