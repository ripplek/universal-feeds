import test from 'node:test';
import assert from 'node:assert/strict';
import { tagAndScore } from '../src/tagging.js';

test('tagAndScore: topic match any + exclude + source filters', () => {
  const cfg = {
    output: { require_topic_match: false },
    topics: [
      {
        name: 'openclaw',
        match: 'any',
        keywords: ['OpenClaw'],
        exclude_keywords: ['airdrop'],
        source_pack_allow: ['sources/us-ai-labs.yaml'],
        boost: 2.0
      }
    ],
    entities: []
  };

  const items = [
    { platform: 'rss', url: 'https://example.com', title: 'OpenClaw update', source: { pack: 'sources/us-ai-labs.yaml' }, score: 1 },
    { platform: 'rss', url: 'https://example.com/2', title: 'OpenClaw airdrop', source: { pack: 'sources/us-ai-labs.yaml' }, score: 1 },
    { platform: 'rss', url: 'https://example.com/3', title: 'OpenClaw update', source: { pack: 'sources/other.yaml' }, score: 1 }
  ];

  const out = tagAndScore(items, cfg);
  const a = out.find((x) => x.url.endsWith('/'));
  assert.ok(out[0].tags.includes('openclaw'));
  assert.ok(out[0].score > 1);
  // excluded
  assert.equal(out.some((x) => x.url.includes('/2') && (x.tags || []).includes('openclaw')), false);
  // pack filter
  assert.equal(out.some((x) => x.url.includes('/3') && (x.tags || []).includes('openclaw')), false);
});

test('tagAndScore: entities add entity:<name> and entities-news topic', () => {
  const cfg = {
    output: {},
    topics: [],
    entities: [{ name: 'NVIDIA', aliases: ['nvda', 'nvidia'], boost: 1.1 }]
  };
  const items = [{ platform: 'x', url: 'https://x.com/a', text: 'NVDA is up', score: 0 }];
  const out = tagAndScore(items, cfg);
  assert.ok(out[0].tags.includes('entity:NVIDIA'));
  assert.ok(out[0].tags.includes('entities-news'));
});
