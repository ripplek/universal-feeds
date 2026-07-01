import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow, normalizeRows } from '../src/reach/normalize.js';

test('reddit home row → FeedItem', () => {
  const row = {
    rank: 1,
    title: 'Big news',
    subreddit: 'r/tech',
    score: 4200,
    comments: 120,
    postId: 'abc',
    author: 'alice',
    url: 'https://www.reddit.com/r/tech/comments/abc',
  };
  const it = normalizeRow(row, { platform: 'reddit', sourceType: 'trending' });
  assert.equal(it.platform, 'reddit');
  assert.equal(it.id, 'abc');
  assert.equal(it.title, 'Big news');
  assert.equal(it.url, row.url);
  assert.equal(it.author.name, 'alice');
  assert.equal(it.metrics.like, 4200);
  assert.equal(it.metrics.reply, 120);
});

test('twitter search row → FeedItem with ISO date + views', () => {
  const row = {
    id: '1',
    author: 'bob',
    text: 'hello world',
    created_at: 'Thu Mar 26 10:30:00 +0000 2026',
    likes: 7,
    views: 12,
    url: 'https://x.com/bob/status/1',
  };
  const it = normalizeRow(row, { platform: 'x', sourceType: 'search' });
  assert.equal(it.id, '1');
  assert.equal(it.text, 'hello world');
  assert.equal(it.metrics.like, 7);
  assert.equal(it.metrics.view, 12);
  assert.match(it.publishedAt, /^2026-03-26T/);
});

test('facebook feed row (content + shares) → FeedItem', () => {
  const row = {
    index: 0,
    author: 'Carol',
    content: 'a post',
    likes: 3,
    comments: 1,
    shares: 2,
    url: 'https://fb.com/p/1',
  };
  const it = normalizeRow(row, { platform: 'facebook' });
  assert.equal(it.text, 'a post');
  assert.equal(it.metrics.repost, 2);
});

test('instagram explore row (user + caption) → FeedItem', () => {
  const row = {
    rank: 1,
    user: 'dave',
    caption: 'nice',
    likes: 9,
    comments: 2,
    type: 'reel',
    url: 'https://instagram.com/p/x',
  };
  const it = normalizeRow(row, { platform: 'instagram' });
  assert.equal(it.author.name, 'dave');
  assert.equal(it.text, 'nice');
});

test('reddit created_utc (unix seconds) → ISO', () => {
  const it = normalizeRow(
    { id: 'x', title: 't', url: 'https://r/1', created_utc: 1779832236 },
    { platform: 'reddit' }
  );
  assert.equal(it.publishedAt, new Date(1779832236 * 1000).toISOString());
  assert.match(it.publishedAt, /^2026-/);
});

test('millisecond epoch is not double-scaled', () => {
  const ms = 1779832236000;
  const it = normalizeRow(
    { title: 't', url: 'u://x', timestamp: ms },
    { platform: 'p' }
  );
  assert.equal(it.publishedAt, new Date(ms).toISOString());
});

test('numeric strings with commas parse to numbers', () => {
  const it = normalizeRow(
    { title: 't', url: 'u://x', play: '1,234' },
    { platform: 'bilibili' }
  );
  assert.equal(it.metrics.view, 1234);
});

test('missing id falls back to deterministic hash', () => {
  const a = normalizeRow({ title: 'x', url: 'https://a/1' }, { platform: 'p' });
  const b = normalizeRow({ title: 'x', url: 'https://a/1' }, { platform: 'p' });
  assert.equal(a.id, b.id);
  assert.match(a.id, /^p:[0-9a-f]{16}$/);
});

test('normalizeRows drops rows without url and empty rows', () => {
  const rows = [
    { title: 'keep', url: 'https://a/1' },
    { title: 'no url' },
    null,
    {},
  ];
  const out = normalizeRows(rows, { platform: 'p' });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'keep');
});

test('non-array input → empty', () => {
  assert.deepEqual(normalizeRows(undefined, { platform: 'p' }), []);
});
