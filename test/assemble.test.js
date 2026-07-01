import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleDigest } from '../src/assemble.js';
import { indexJudgments } from '../src/judgments.js';

// Minimal cfg with topic gate; recency window wide so recencyBoost is stable.
function cfg(extra = {}) {
  return {
    output: { max_items: 30, recency_hours: 24, require_topic_match: false },
    ranking: { platform_weights: {} },
    topics: [{ name: 'ai', match: 'any', keywords: ['ai'] }],
    ...extra,
  };
}

test('keyword gate: require_topic_match keeps only topic hits', () => {
  const items = [
    {
      platform: 'rss',
      id: '1',
      url: 'https://a/1',
      title: 'AI news',
      metrics: { like: 5 },
    },
    {
      platform: 'rss',
      id: '2',
      url: 'https://a/2',
      title: 'cooking recipes',
      metrics: { like: 5 },
    },
  ];
  const { items: out } = assembleDigest({
    items,
    cfg: cfg({
      output: { max_items: 30, recency_hours: 24, require_topic_match: true },
    }),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '1');
  assert.ok(out[0].tags.includes('ai'));
});

test('keyword gate off: keeps all, still tags matches', () => {
  const items = [
    { platform: 'rss', id: '1', url: 'https://a/1', title: 'AI news' },
    { platform: 'rss', id: '2', url: 'https://a/2', title: 'cooking' },
  ];
  const { items: out } = assembleDigest({ items, cfg: cfg() });
  assert.equal(out.length, 2);
});

test('judgment gate replaces keyword gate when judgeIndex provided', () => {
  const items = [
    { platform: 'reddit', id: '1', url: 'https://r/1', title: 'anything' },
    { platform: 'reddit', id: '2', url: 'https://r/2', title: 'anything' },
  ];
  const judgeIndex = indexJudgments([
    { id: 'reddit:1', relevant: true, score: 0.9, topics: ['ai'] },
    { id: 'reddit:2', relevant: false, score: 0.1 },
  ]);
  const { items: out } = assembleDigest({
    items,
    cfg: cfg({
      output: { max_items: 30, recency_hours: 24, require_topic_match: true },
    }),
    judgeIndex,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '1');
  assert.ok(out[0].tags.includes('ai'));
});

test('retweet policy: drops RTs when include_retweets false', () => {
  const items = [
    { platform: 'x', id: '1', url: 'https://x/1', text: 'RT @a: hi' },
    { platform: 'x', id: '2', url: 'https://x/2', text: 'original thought' },
  ];
  const { items: out } = assembleDigest({
    items,
    cfg: cfg({
      output: { max_items: 30, recency_hours: 24, require_topic_match: false },
      platforms: { x: { following: { include_retweets: false } } },
    }),
  });
  assert.equal(
    out.some((it) => /^RT/.test(it.text)),
    false
  );
  assert.equal(out.length, 1);
});

test('retweet penalty multiplies RT score', () => {
  const items = [
    {
      platform: 'x',
      id: '1',
      url: 'https://x/1',
      text: 'RT @a: hi',
      metrics: { like: 100 },
    },
  ];
  const base = assembleDigest({
    items,
    cfg: cfg({
      output: { max_items: 30, recency_hours: 24, require_topic_match: false },
      platforms: { x: { following: {} } },
    }),
  }).items[0].score;
  const penalized = assembleDigest({
    items,
    cfg: cfg({
      output: { max_items: 30, recency_hours: 24, require_topic_match: false },
      platforms: { x: { following: { retweet_penalty: 0.5 } } },
    }),
  }).items[0].score;
  assert.ok(penalized < base);
  assert.ok(Math.abs(penalized - base * 0.5) < 1e-9);
});

test('trim caps total to max_items and sorts by score desc', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    platform: 'rss',
    id: String(i),
    url: `https://a/${i}`,
    title: 'x',
    metrics: { like: i },
  }));
  const { items: out } = assembleDigest({
    items,
    cfg: cfg({
      output: { max_items: 3, recency_hours: 24, require_topic_match: false },
    }),
  });
  assert.equal(out.length, 3);
  for (let i = 1; i < out.length; i++) {
    assert.ok((out[i - 1].score || 0) >= (out[i].score || 0));
  }
});

test('returns a recommended array', () => {
  const { recommended } = assembleDigest({ items: [], cfg: cfg() });
  assert.ok(Array.isArray(recommended));
});
