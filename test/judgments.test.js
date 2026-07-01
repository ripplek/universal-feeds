import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJudgments,
  indexJudgments,
  applyJudgments,
} from '../src/judgments.js';

test('parseJudgments handles JSON array', () => {
  const j = parseJudgments('[{"id":"a"},{"id":"b"}]');
  assert.equal(j.length, 2);
});

test('parseJudgments handles JSONL and skips malformed lines', () => {
  const j = parseJudgments('{"id":"a"}\nnot json\n{"id":"b"}\n');
  assert.deepEqual(
    j.map((x) => x.id),
    ['a', 'b']
  );
});

test('parseJudgments empty → []', () => {
  assert.deepEqual(parseJudgments(''), []);
  assert.deepEqual(parseJudgments('   '), []);
});

const items = [
  { platform: 'reddit', id: '1', url: 'https://r/1', title: 'A', score: 1 },
  { platform: 'hackernews', id: '2', url: 'https://h/2', title: 'B', score: 1 },
  { platform: '36kr', id: '3', url: 'https://k/3', title: 'C', score: 1 },
];

test('applyJudgments (strict) keeps relevant above threshold, drops the rest', () => {
  const idx = indexJudgments([
    { id: 'reddit:1', relevant: true, score: 0.9, topics: ['ai'], why: 'core' },
    { id: 'hackernews:2', relevant: false, score: 0.1 },
    // 36kr:3 unjudged
  ]);
  const out = applyJudgments(items, idx, {
    minRelevance: 0.5,
    requireRelevant: true,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].platform, 'reddit');
  assert.deepEqual(out[0].tags, ['ai']);
  assert.equal(out[0].score, 1 + 0.9); // base + relevance*boost
  assert.equal(out[0].debug.relevance.why, 'core');
});

test('applyJudgments drops relevant-but-below-threshold', () => {
  const idx = indexJudgments([
    { id: 'reddit:1', relevant: true, score: 0.3, topics: [] },
  ]);
  const out = applyJudgments(items, idx, {
    minRelevance: 0.5,
    requireRelevant: true,
  });
  assert.equal(out.length, 0);
});

test('applyJudgments (non-strict) keeps all, still tags + boosts judged ones', () => {
  const idx = indexJudgments([
    { id: 'reddit:1', relevant: true, score: 0.8, topics: ['ai'] },
  ]);
  const out = applyJudgments(items, idx, { requireRelevant: false });
  assert.equal(out.length, 3);
  const r = out.find((x) => x.platform === 'reddit');
  assert.equal(r.score, 1.8);
  const unjudged = out.find((x) => x.platform === '36kr');
  assert.equal(unjudged.score, 1); // untouched
});

test('applyJudgments sorts by score desc', () => {
  const idx = indexJudgments([
    { id: 'reddit:1', relevant: true, score: 0.2, topics: [] },
    { id: 'hackernews:2', relevant: true, score: 0.9, topics: [] },
    { id: '36kr:3', relevant: true, score: 0.5, topics: [] },
  ]);
  const out = applyJudgments(items, idx, {
    requireRelevant: true,
    minRelevance: 0,
  });
  // scores: hackernews 1.9, 36kr 1.5, reddit 1.2
  assert.deepEqual(
    out.map((x) => x.platform),
    ['hackernews', '36kr', 'reddit']
  );
});
