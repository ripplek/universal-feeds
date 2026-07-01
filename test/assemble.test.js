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

test('postScore hooks run after scoring, before sort/trim', () => {
  const items = [
    {
      platform: 'rss',
      id: '1',
      url: 'https://a/1',
      title: 'x',
      metrics: { like: 1 },
    },
    {
      platform: 'rss',
      id: '2',
      url: 'https://a/2',
      title: 'x',
      metrics: { like: 100 },
    },
  ];
  // A stub hook that drops id '2' and zeroes remaining scores.
  const drop2 = (list) =>
    list.filter((it) => it.id !== '2').map((it) => ({ ...it, score: 0 }));
  const { items: out } = assembleDigest({
    items,
    cfg: cfg(),
    postScore: [drop2],
  });
  assert.deepEqual(
    out.map((it) => it.id),
    ['1']
  );
  assert.equal(out[0].score, 0);
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

test('recommended items carry judge title_translated (output.translate)', () => {
  const items = [
    {
      platform: 'rss',
      id: 'r1',
      url: 'https://x/1',
      title: 'AI model launch',
      publishedAt: '2026-07-01T00:00:00Z',
    },
  ];
  const judgeIndex = indexJudgments([
    {
      id: 'rss:r1',
      relevant: true,
      score: 0.9,
      title_translated: 'AI 模型发布',
    },
  ]);
  // Topic keyword deliberately does NOT match the title, so the item lands in
  // the additive recommended section (which excludes topic-matched items).
  const c = cfg({
    recommended: { enabled: true, max_items: 5, min_score: 0 },
    topics: [{ name: 'zzz', match: 'any', keywords: ['zzz'] }],
  });
  const { recommended } = assembleDigest({ items, cfg: c, judgeIndex });
  const hit = recommended.find((x) => x.url === 'https://x/1');
  assert.ok(hit, 'item is recommended');
  assert.equal(hit.titleTranslated, 'AI 模型发布');
});
