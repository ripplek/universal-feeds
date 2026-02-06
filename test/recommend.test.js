import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRecommended } from '../src/recommend.js';

test('pickRecommended excludes items that already match topics', () => {
  const cfg = {
    topics: [{ name: 't1', keywords: ['openclaw'] }],
    entities: [],
    recommended: { enabled: true, use_platforms: ['rss'], min_score: 0 }
  };

  const items = [
    { platform: 'rss', url: 'https://a.com/1', title: 'OpenClaw', tags: ['t1'], score: 10, source: { name: 'S' } },
    { platform: 'rss', url: 'https://a.com/2', title: 'Other', tags: [], score: 10, source: { name: 'S' } },
  ];

  const out = pickRecommended(items, cfg);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://a.com/2');
});

test('pickRecommended caps max_per_source', () => {
  const cfg = {
    topics: [],
    entities: [],
    recommended: { enabled: true, use_platforms: ['rss'], min_score: 0, max_items: 10, max_per_source: 2, max_per_domain: 10 }
  };
  const items = [
    { platform: 'rss', url: 'https://a.com/1', title: 'a', tags: [], score: 10, source: { name: 'S' } },
    { platform: 'rss', url: 'https://a.com/2', title: 'b', tags: [], score: 9, source: { name: 'S' } },
    { platform: 'rss', url: 'https://a.com/3', title: 'c', tags: [], score: 8, source: { name: 'S' } },
  ];
  const out = pickRecommended(items, cfg);
  assert.equal(out.length, 2);
});
