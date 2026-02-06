import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDigestMarkdown } from '../src/render.js';

test('renderDigestMarkdown caps repeated items per source within a topic', () => {
  const cfg = {
    output: { language: 'en', require_topic_match: true, max_per_topic: 10 },
    ranking: { max_per_source_per_topic: 2 },
    topics: [{ name: 't1' }],
    entities: []
  };

  const items = [
    { platform: 'rss', url: 'u1', title: 'a', tags: ['t1'], score: 1, source: { name: 'S' } },
    { platform: 'rss', url: 'u2', title: 'b', tags: ['t1'], score: 1, source: { name: 'S' } },
    { platform: 'rss', url: 'u3', title: 'c', tags: ['t1'], score: 1, source: { name: 'S' } },
    { platform: 'rss', url: 'u4', title: 'd', tags: ['t1'], score: 1, source: { name: 'T' } },
  ];

  const md = renderDigestMarkdown(items, { cfg, date: '2026-02-06', fetchedAt: 'x' });
  // Only 2 occurrences from source S should appear in the By Topic section.
  assert.ok(md.includes('### t1'));
  assert.ok(md.includes('u1'));
  assert.ok(md.includes('u2'));
  assert.equal(md.includes('u3'), false);
  assert.ok(md.includes('u4'));
});
