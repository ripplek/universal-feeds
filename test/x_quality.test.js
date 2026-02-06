import test from 'node:test';
import assert from 'node:assert/strict';
import { filterXNoise } from '../src/filters.js';

test('filterXNoise drops link+mention only tweets even if keyword matches', () => {
  const cfg = {
    platforms: { x: { following: { min_effective_len: 20, min_effective_tokens: 6 } } },
    topics: [{ name: 'openclaw', keywords: ['OpenClaw'], anchors: [] }]
  };
  const items = [
    { platform: 'x', text: 'OpenClaw → F.R.I.D.A.Y @iamfriday4u https://t.co/abc', url: 'https://x.com/a', id: '1' },
  ];
  const out = filterXNoise(items, cfg);
  assert.equal(out.length, 0);
});
