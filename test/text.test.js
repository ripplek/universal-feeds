import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities } from '../src/text.js';

test('decodeEntities: numeric, hex, named, and safety cases', () => {
  assert.equal(decodeEntities('Anthropic&#8217;s model'), 'Anthropic’s model');
  assert.equal(decodeEntities('&#x2019;'), '’');
  assert.equal(decodeEntities('A &amp; B'), 'A & B');
  assert.equal(
    decodeEntities('&lt;tag&gt; &quot;q&quot; &#39;a&#39;'),
    '<tag> "q" \'a\''
  );
  assert.equal(decodeEntities('a&hellip;'), 'a…');
  assert.equal(decodeEntities('plain text'), 'plain text');
});

test('decodeEntities: empty/nullish inputs return empty string', () => {
  assert.equal(decodeEntities(''), '');
  assert.equal(decodeEntities(null), '');
  assert.equal(decodeEntities(undefined), '');
});

test('decodeEntities: unknown entity left untouched, no double-decode', () => {
  assert.equal(decodeEntities('&notareal;'), '&notareal;');
  // A single left-to-right pass: the decoded '&' from &amp; must not combine
  // with the trailing "#8217;" and get decoded again.
  assert.equal(decodeEntities('&amp;#8217;'), '&#8217;');
});
