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

test('linkedin timeline row (posted_at + reactions) → FeedItem', () => {
  const row = {
    rank: 1,
    author: 'Eve',
    author_url: 'https://linkedin.com/in/eve',
    headline: 'CTO',
    text: 'we are hiring',
    posted_at: '2026-06-30',
    reactions: 42,
    comments: 5,
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
  };
  const it = normalizeRow(row, {
    platform: 'linkedin',
    sourceType: 'following',
  });
  assert.equal(it.author.name, 'Eve');
  assert.equal(it.text, 'we are hiring');
  assert.equal(it.metrics.like, 42);
  assert.equal(it.metrics.reply, 5);
  assert.match(it.publishedAt, /^2026-06-30/);
});

test('xueqiu feed row (replies) → FeedItem', () => {
  const row = {
    author: 'trader',
    text: '$NVDA 涨',
    likes: 12,
    replies: 3,
    url: 'https://xueqiu.com/1/2',
  };
  const it = normalizeRow(row, { platform: 'xueqiu', sourceType: 'following' });
  assert.equal(it.metrics.like, 12);
  assert.equal(it.metrics.reply, 3);
});

test('weibo feed row → FeedItem (reposts + time)', () => {
  const row = {
    id: '5',
    author: 'user',
    text: '热点',
    reposts: 10,
    comments: 4,
    likes: 88,
    time: '2026-06-30 12:00',
    url: 'https://weibo.com/1/5',
  };
  const it = normalizeRow(row, { platform: 'weibo', sourceType: 'following' });
  assert.equal(it.metrics.repost, 10);
  assert.equal(it.metrics.like, 88);
  assert.match(it.publishedAt, /^2026-06-30/);
});

test('hackernews top row → FeedItem', () => {
  const row = {
    rank: 1,
    id: 42,
    title: 'Show HN: thing',
    score: 500,
    author: 'pg',
    comments: 200,
    url: 'https://news.ycombinator.com/item?id=42',
  };
  const it = normalizeRow(row, {
    platform: 'hackernews',
    sourceType: 'trending',
  });
  assert.equal(it.id, '42');
  assert.equal(it.title, 'Show HN: thing');
  assert.equal(it.metrics.like, 500);
  assert.equal(it.metrics.reply, 200);
});

test('producthunt hot row (name→title, votes→like)', () => {
  const row = {
    rank: 1,
    name: 'CoolApp',
    votes: 320,
    url: 'https://producthunt.com/posts/coolapp',
  };
  const it = normalizeRow(row, {
    platform: 'producthunt',
    sourceType: 'trending',
  });
  assert.equal(it.title, 'CoolApp');
  assert.equal(it.metrics.like, 320);
});

test('juejin hot row (brief→text)', () => {
  const row = {
    article_id: 'a1',
    title: 'Vue tips',
    brief: 'short summary',
    views: 900,
    likes: 30,
    comments: 5,
    author: 'dev',
    url: 'https://juejin.cn/post/a1',
  };
  const it = normalizeRow(row, { platform: 'juejin' });
  assert.equal(it.text, 'short summary');
  assert.equal(it.metrics.view, 900);
});

test('tiktok explore row (desc→text, createTime→ISO, shares→repost)', () => {
  const row = {
    index: 0,
    id: 't1',
    author: 'creator',
    url: 'https://tiktok.com/@creator/video/t1',
    title: 'clip',
    desc: 'fun',
    plays: 10000,
    likes: 500,
    comments: 20,
    shares: 8,
    createTime: 1779832236,
  };
  const it = normalizeRow(row, { platform: 'tiktok', sourceType: 'trending' });
  assert.equal(it.text, 'fun');
  assert.equal(it.metrics.view, 10000);
  assert.equal(it.metrics.repost, 8);
  assert.match(it.publishedAt, /^2026-/);
});

test('youtube search row (channel→author, video_id→id, localized views + relative date)', () => {
  const fetchedAt = '2026-07-01T12:00:00.000Z';
  const row = {
    rank: 1,
    title: 'Claude Sonnet 5 Is HERE',
    channel: 'Bijan Bowen',
    video_id: 'tIyQoLeTT3s',
    views: '19,805次观看',
    duration: '34:05',
    published: '10小时前',
    url: 'https://www.youtube.com/watch?v=tIyQoLeTT3s',
  };
  const it = normalizeRow(row, {
    platform: 'youtube',
    sourceType: 'search',
    fetchedAt,
  });
  assert.equal(it.id, 'tIyQoLeTT3s');
  assert.equal(it.author.name, 'Bijan Bowen');
  assert.equal(it.metrics.view, 19805);
  // "10小时前" is anchored to fetchedAt (12:00Z) → 02:00Z same day.
  assert.equal(it.publishedAt, '2026-07-01T02:00:00.000Z');
});

test('localized count suffixes (万/亿, K/M) parse to numbers', () => {
  const mk = (views) =>
    normalizeRow(
      { title: 't', url: 'https://y/1', views },
      { platform: 'youtube' }
    ).metrics.view;
  assert.equal(mk('1.2万次观看'), 12000);
  assert.equal(mk('3亿'), 3e8);
  assert.equal(mk('1.7M views'), 1.7e6);
  assert.equal(mk('820K'), 820000);
});

test('english relative time ("2 hours ago") anchored to fetchedAt', () => {
  const fetchedAt = '2026-07-01T12:00:00.000Z';
  const it = normalizeRow(
    { title: 't', url: 'https://y/2', published: '2 hours ago' },
    { platform: 'youtube', fetchedAt }
  );
  assert.equal(it.publishedAt, '2026-07-01T10:00:00.000Z');
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
