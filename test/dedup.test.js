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
