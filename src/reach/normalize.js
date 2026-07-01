// Map OpenCLI command output rows → FeedItem (see docs/SCHEMA.md).
//
// OpenCLI commands emit flat objects whose column names vary per platform, e.g.
//   reddit home:  { rank, title, subreddit, score, comments, postId, author, url }
//   twitter search:{ id, author, text, created_at, likes, views, url }
//   xiaohongshu:  { rank, title, author, likes, published_at, url }
//   facebook feed:{ index, author, content, likes, comments, shares }
//   instagram:    { rank, user, caption, likes, comments, type }
//   bilibili:     { id, author, text/title, likes/play, url, bvid }
//
// Rather than a brittle per-command map, we resolve each FeedItem field from a
// list of known column aliases. Unknown platforms still normalize sensibly.

import crypto from 'node:crypto';

const FIELD_ALIASES = {
  id: ['id', 'postId', 'bvid', 'note_id', 'pk'],
  url: ['url', 'link', 'permalink', 'url_overridden_by_dest'],
  title: ['title'],
  text: ['text', 'content', 'caption', 'selftext', 'body', 'desc'],
  authorName: ['author', 'user', 'screen_name', 'username', 'nickname'],
  publishedAt: [
    'created_at',
    'created_utc',
    'published_at',
    'publishedAt',
    'timestamp',
    'time',
    'date',
  ],
  like: ['likes', 'like', 'score', 'favorite_count', 'digg_count'],
  view: ['views', 'view', 'play', 'view_count'],
  reply: ['comments', 'comment', 'reply', 'num_comments', 'reply_count'],
  repost: ['reposts', 'repost', 'shares', 'share', 'retweetCount'],
};

function pick(row, aliases) {
  for (const a of aliases) {
    const v = row[a];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function toNum(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n =
    typeof v === 'number' ? v : Number(String(v).replace(/[,_\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function toIso(v) {
  if (v === undefined || v === null || v === '') return undefined;
  // UNIX epoch (some adapters emit created_utc in seconds, some in ms).
  const asNum =
    typeof v === 'number' ? v : /^\d{9,13}$/.test(String(v)) ? Number(v) : NaN;
  if (Number.isFinite(asNum)) {
    const ms = asNum < 1e12 ? asNum * 1000 : asNum; // <1e12 ⇒ seconds
    const d = new Date(ms);
    return isNaN(d) ? undefined : d.toISOString();
  }
  const d = new Date(v);
  return isNaN(d) ? undefined : d.toISOString();
}

function strip(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashId(platform, ...parts) {
  const h = crypto
    .createHash('sha1')
    .update(parts.filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 16);
  return `${platform}:${h}`;
}

// Normalize a single OpenCLI row. Returns null if there is nothing usable.
export function normalizeRow(
  row,
  { platform, sourceType = 'trending', source, fetchedAt } = {}
) {
  if (!row || typeof row !== 'object') return null;

  const url = pick(row, FIELD_ALIASES.url);
  const title = strip(pick(row, FIELD_ALIASES.title)) || undefined;
  const text = strip(pick(row, FIELD_ALIASES.text)) || undefined;
  if (!url && !title && !text) return null; // empty/garbage row

  const rawId = pick(row, FIELD_ALIASES.id);
  const id =
    rawId !== undefined ? String(rawId) : hashId(platform, url, title || text);

  const authorName = pick(row, FIELD_ALIASES.authorName);
  const metrics = {
    like: toNum(pick(row, FIELD_ALIASES.like)),
    view: toNum(pick(row, FIELD_ALIASES.view)),
    reply: toNum(pick(row, FIELD_ALIASES.reply)),
    repost: toNum(pick(row, FIELD_ALIASES.repost)),
  };
  const hasMetric = Object.values(metrics).some((v) => v !== undefined);

  const item = {
    platform,
    sourceType,
    id,
    url: url ? String(url) : undefined,
    title,
    text,
    publishedAt: toIso(pick(row, FIELD_ALIASES.publishedAt)),
    fetchedAt,
  };
  if (source) item.source = source;
  if (authorName) item.author = { name: strip(authorName) };
  if (hasMetric) item.metrics = metrics;

  return item;
}

// Normalize a list; drop empty rows and rows without a url (undeliverable).
export function normalizeRows(rows, opts = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => normalizeRow(r, opts)).filter((it) => it && it.url);
}
