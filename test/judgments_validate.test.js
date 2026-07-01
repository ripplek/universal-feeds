import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJudgments, formatValidationReport } from '../src/judgments.js';

const candidateIds = ['reddit:1', 'hackernews:2', '36kr:3'];

test('validateJudgments: clean input is ok with full coverage', () => {
  const r = validateJudgments(
    [
      { id: 'reddit:1', relevant: true, score: 0.9, topics: ['ai'], why: 'x' },
      { id: 'hackernews:2', relevant: false, score: 0.1 },
      { id: '36kr:3', relevant: true, score: 0.6 },
    ],
    { candidateIds, minRelevance: 0.5 }
  );
  assert.equal(r.ok, true);
  assert.equal(r.counts.total, 3);
  assert.equal(r.counts.valid, 3);
  assert.equal(r.counts.unknownId, 0);
  assert.equal(r.counts.malformed, 0);
  assert.equal(r.counts.outOfRange, 0);
  assert.equal(r.counts.unjudged, 0);
  // reddit:1 (0.9) and 36kr:3 (0.6) survive the strict gate
  assert.equal(r.counts.wouldKeep, 2);
});

test('validateJudgments: unknown id is a hard error', () => {
  const r = validateJudgments([{ id: 'ghost:9', score: 0.9, relevant: true }], {
    candidateIds,
  });
  assert.equal(r.ok, false);
  assert.equal(r.counts.unknownId, 1);
  assert.ok(r.warnings.some((w) => w.includes('ghost:9')));
});

test('validateJudgments: out-of-range and wrong-typed score flagged', () => {
  const r = validateJudgments(
    [
      { id: 'reddit:1', score: 1.5, relevant: true },
      { id: 'hackernews:2', score: 'high', relevant: true },
    ],
    { candidateIds }
  );
  assert.equal(r.ok, false);
  assert.equal(r.counts.outOfRange, 2);
});

test('validateJudgments: missing/duplicate id', () => {
  const r = validateJudgments(
    [
      { score: 0.5, relevant: true }, // no id → malformed
      { id: 'reddit:1', score: 0.5, relevant: true },
      { id: 'reddit:1', score: 0.7, relevant: true }, // duplicate
    ],
    { candidateIds }
  );
  assert.equal(r.counts.malformed, 1);
  assert.equal(r.counts.duplicate, 1);
  assert.ok(!r.ok);
});

test('validateJudgments: unjudged candidates counted as a warning, not fatal', () => {
  const r = validateJudgments(
    [{ id: 'reddit:1', score: 0.9, relevant: true }],
    { candidateIds, minRelevance: 0.5 }
  );
  assert.equal(r.counts.unjudged, 2);
  assert.equal(r.ok, true); // unjudged is not a hard error (strict mode just drops them)
});

test('formatValidationReport renders counts and an OK/FAIL header', () => {
  const r = validateJudgments(
    [{ id: 'reddit:1', score: 0.9, relevant: true }],
    {
      candidateIds,
    }
  );
  const s = formatValidationReport(r, 'out/judgments.jsonl');
  assert.ok(/judgments/.test(s));
  assert.ok(/valid/.test(s));
});
