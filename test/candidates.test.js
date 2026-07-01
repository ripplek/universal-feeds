import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateKey,
  buildCandidates,
  serializeCandidates,
} from '../src/candidates.js';

test('candidateKey is platform-qualified', () => {
  assert.equal(candidateKey({ platform: 'reddit', id: '1' }), 'reddit:1');
  assert.equal(
    candidateKey({ platform: 'hackernews', id: '1' }),
    'hackernews:1'
  );
});

test('buildCandidates keeps compact fields and qualified id', () => {
  const items = [
    {
      platform: 'reddit',
      id: 'abc',
      url: 'https://r/1',
      title: 'T',
      text: 'body',
    },
  ];
  const [c] = buildCandidates(items);
  assert.equal(c.id, 'reddit:abc');
  assert.equal(c.platform, 'reddit');
  assert.equal(c.url, 'https://r/1');
  assert.equal(c.title, 'T');
  assert.equal(c.text, 'body');
});

test('buildCandidates truncates long text with ellipsis', () => {
  const long = 'x'.repeat(600);
  const [c] = buildCandidates(
    [{ platform: 'p', id: '1', url: 'u://1', text: long }],
    { maxTextLen: 100 }
  );
  assert.equal(c.text.length, 101); // 100 + ellipsis char
  assert.ok(c.text.endsWith('…'));
});

test('buildCandidates omits empty title/text', () => {
  const [c] = buildCandidates([
    { platform: 'p', id: '1', url: 'u://1', text: '   ' },
  ]);
  assert.equal('title' in c, false);
  assert.equal('text' in c, false);
});

test('serializeCandidates emits JSONL with trailing newline', () => {
  const out = serializeCandidates([{ id: 'a' }, { id: 'b' }]);
  assert.equal(out, '{"id":"a"}\n{"id":"b"}\n');
  assert.equal(serializeCandidates([]), '');
});
