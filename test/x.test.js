import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyXRetweetPolicy, enrichX } from '../src/sources/x.js';

const cfgX = (following = {}) => ({ platforms: { x: { following } } });

test('applyXRetweetPolicy drops RTs when include_retweets false', () => {
  const items = [
    { platform: 'x', id: '1', text: 'RT @a: hi' },
    { platform: 'x', id: '2', text: 'original' },
    { platform: 'rss', id: '3', text: 'RT @a: not x' },
  ];
  const out = applyXRetweetPolicy(items, cfgX({ include_retweets: false }));
  assert.deepEqual(
    out.map((i) => i.id),
    ['2', '3']
  ); // x RT dropped; non-x untouched
});

test('applyXRetweetPolicy caps RT count', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({
    platform: 'x',
    id: String(i),
    text: 'RT @a: hi',
  }));
  const out = applyXRetweetPolicy(items, cfgX({ max_retweets: 2 }));
  assert.equal(out.length, 2);
});

test('applyXRetweetPolicy penalizes RT score, leaves non-RT', () => {
  const items = [
    { platform: 'x', id: '1', text: 'RT @a: hi', score: 10 },
    { platform: 'x', id: '2', text: 'original', score: 10 },
  ];
  const out = applyXRetweetPolicy(items, cfgX({ retweet_penalty: 0.5 }));
  assert.equal(out.find((i) => i.id === '1').score, 5);
  assert.equal(out.find((i) => i.id === '2').score, 10);
});

test('enrichX unfurls a link-only tweet from cache (no network)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-x-'));
  const url = 'https://t.co/abc';
  // Pre-seed the cache so enrichX never calls the network.
  fs.writeFileSync(
    path.join(dir, 'state-unfurl.json'),
    JSON.stringify({
      [url]: { title: 'Real Title', finalUrl: 'https://example.com/post' },
    })
  );

  const items = [
    { platform: 'x', id: '1', text: `${url}`, url: 'https://x/1' },
    {
      platform: 'x',
      id: '2',
      text: 'a substantial original thought with plenty of words',
      url: 'https://x/2',
    },
    { platform: 'rss', id: '3', text: url, url: 'https://r/3' },
  ];
  const out = await enrichX(items, cfgX(), { outDir: dir });
  assert.equal(out[0].title, 'Real Title'); // link-only X tweet enriched
  assert.equal(out[0].debug.unfurl.finalUrl, 'https://example.com/post');
  assert.equal(out[1].title, undefined); // substantial text → skipped
  assert.equal(out[2].title, undefined); // non-x → skipped
});

test('enrichX disabled by config returns items unchanged', async () => {
  const items = [{ platform: 'x', id: '1', text: 'https://t.co/x', url: 'u' }];
  const out = await enrichX(items, cfgX({ unfurl: { enabled: false } }), {
    outDir: os.tmpdir(),
  });
  assert.equal(out[0].title, undefined);
});
