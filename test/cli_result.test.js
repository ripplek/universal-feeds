import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCliResult } from '../src/cli.js';

test('normalizeCliResult: full stage carries items/digest paths', () => {
  const r = normalizeCliResult(
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
    candidatesPath: null,
    count: 12,
  });
});

test('normalizeCliResult: candidates stage carries candidatesPath only', () => {
  const r = normalizeCliResult(
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

test('normalizeCliResult: count defaults to 0 when absent', () => {
  const r = normalizeCliResult({}, { date: '2026-07-01', stage: 'full' });
  assert.equal(r.count, 0);
});
