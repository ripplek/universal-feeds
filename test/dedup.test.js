import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupItems } from '../src/dedup.js';

test('dedupItems canonicalizes utm params', () => {
  const items = [
    { id: '1', url: 'https://example.com/a?utm_source=x' },
    { id: '2', url: 'https://example.com/a' },
  ];
  const out = dedupItems(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://example.com/a');
});

test('dedupItems keeps the richer duplicate (metrics win over bare entry)', () => {
  const items = [
    {
      id: 'rss',
      platform: 'rss',
      url: 'https://news.ycombinator.com/item?id=1',
      title: 'X',
    },
    {
      id: 'hn',
      platform: 'hackernews',
      url: 'https://news.ycombinator.com/item?id=1',
      title: 'X',
      metrics: { like: 500, reply: 200 },
      author: { name: 'pg' },
    },
  ];
  const out = dedupItems(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].platform, 'hackernews'); // richer copy replaced the bare one
  assert.equal(out[0].metrics.like, 500);
});

test('dedupItems does not replace a richer earlier item with a barer later one', () => {
  const items = [
    {
      id: 'hn',
      platform: 'hackernews',
      url: 'https://a/1',
      metrics: { like: 9 },
    },
    { id: 'rss', platform: 'rss', url: 'https://a/1' },
  ];
  const out = dedupItems(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].platform, 'hackernews');
});
