import test from 'node:test';
import assert from 'node:assert/strict';
import { rankItems } from '../src/rank.js';

test('rankItems applies platform weight and source weight/reliability', () => {
  const cfg = {
    ranking: { platform_weights: { rss: 1 }, max_per_platform: {} },
    output: { recency_hours: 24 },
  };
  const now = new Date().toISOString();
  const items = [
    {
      platform: 'rss',
      publishedAt: now,
      metrics: { like: 100 },
      source: { weight: 1, reliability: 1 },
      url: 'a',
    },
    {
      platform: 'rss',
      publishedAt: now,
      metrics: { like: 100 },
      source: { weight: 1, reliability: 0.5 },
      url: 'b',
    },
  ];
  const out = rankItems(items, cfg);
  assert.equal(out[0].url, 'a');
});

test('rankItems gives reach items with no metrics a base score', () => {
  const items = [
    {
      platform: '36kr',
      title: 't1',
      url: 'https://36kr.com/1',
      source: { name: 'reach:36kr' },
    },
    {
      platform: 'rss',
      title: 't2',
      url: 'https://x/2',
      source: { name: 'RSS' },
    },
  ];
  const cfg = {
    output: { recency_hours: 24 },
    ranking: { platform_weights: { '36kr': 0.8 } },
  };
  const ranked = rankItems(items, cfg);
  const kr = ranked.find((x) => x.platform === '36kr');
  const rss = ranked.find((x) => x.platform === 'rss');
  assert.ok(kr.score > 0, 'reach item gets nonzero base score');
  assert.equal(rss.score, 0, 'non-reach item with no metrics stays 0');
});
