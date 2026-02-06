import test from 'node:test';
import assert from 'node:assert/strict';
import { rankItems } from '../src/rank.js';

test('rankItems applies platform weight and source weight/reliability', () => {
  const cfg = { ranking: { platform_weights: { rss: 1 }, max_per_platform: {} }, output: { recency_hours: 24 } };
  const now = new Date().toISOString();
  const items = [
    { platform: 'rss', publishedAt: now, metrics: { like: 100 }, source: { weight: 1, reliability: 1 }, url: 'a' },
    { platform: 'rss', publishedAt: now, metrics: { like: 100 }, source: { weight: 1, reliability: 0.5 }, url: 'b' },
  ];
  const out = rankItems(items, cfg);
  assert.equal(out[0].url, 'a');
});
