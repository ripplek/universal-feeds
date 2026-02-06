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

test('pickRecommended caps max_per_domain', () => {
  const cfg = {
    topics: [],
    entities: [],
    recommended: { enabled: true, use_platforms: ['rss'], min_score: 0, max_items: 10, max_per_source: 10, max_per_domain: 2 }
  };
  const items = [
    { platform: 'rss', url: 'https://a.com/1', title: 'a', tags: [], score: 10, source: { name: 'S1' } },
    { platform: 'rss', url: 'https://a.com/2', title: 'b', tags: [], score: 9, source: { name: 'S2' } },
    { platform: 'rss', url: 'https://a.com/3', title: 'c', tags: [], score: 8, source: { name: 'S3' } },
  ];
  const out = pickRecommended(items, cfg);
  assert.equal(out.length, 2);
});

test('pickRecommended boosts items matching entity aliases', () => {
  const cfg = {
    topics: [],
    entities: [{ name: 'NVIDIA', aliases: ['nvidia', 'nvda'] }],
    recommended: { enabled: true, use_platforms: ['rss'], min_score: 0, max_items: 10, max_per_source: 10, max_per_domain: 10 }
  };

  const items = [
    { platform: 'rss', url: 'https://a.com/1', title: 'NVDA launches new GPU', text: '', tags: [], score: 1, source: { name: 'S1' } },
    { platform: 'rss', url: 'https://b.com/2', title: 'Unrelated headline', text: '', tags: [], score: 1, source: { name: 'S2' } },
  ];

  const out = pickRecommended(items, cfg);
  // Even though base hot score is lower, the NVIDIA item should rank above due to interest boost.
  assert.equal(out[0].url, 'https://a.com/1');
});
