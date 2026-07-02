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
  id: [
    'id',
    'postId',
    'bvid',
    'note_id',
    'pk',
    'video_id',
    'videoId',
    'group_id',
    'pmid', // pubmed
    'key', // dblp canonical key
  ],
  url: ['url', 'link', 'permalink', 'url_overridden_by_dest'],
  // `repo`/`name`/`word`/`topic` are last-resort titles (github-trending repo
  // slug, producthunt product name, weibo hot term) — real `title` always wins.
  title: ['title', 'word', 'name', 'topic', 'repo'],
  text: [
    'text',
    'content',
    'caption',
    'selftext',
    'brief',
    'body',
    'desc',
    'description', // github-trending, medium
    'summary',
    'abstract',
  ],
  authorName: [
    'author',
    'authors', // arxiv, hugging face, openreview
    'user',
    'screen_name',
    'username',
    'nickname',
    'channel', // youtube feed/search
  ],
  publishedAt: [
    'created_at',
    'created_utc',
    'published_at',
    'published', // youtube feed/search (relative, e.g. "10小时前")
    'creation_date', // stackoverflow
    'pdate', // openreview
    'lastModified', // hugging face models
    'created', // linux.do
    'posted_at',
    'publishedAt',
    'createTime',
    'timestamp',
    'time',
    'date',
  ],
  like: [
    'likes',
    'like',
    'score',
    'reactions', // dev.to
    'votes',
    'upvotes',
    'karma', // lesswrong
    'stars', // github-trending
    'claps', // medium
    'cited', // google-scholar (citation count as impact proxy)
    'favorite_count',
    'digg_count',
  ],
  view: ['views', 'view', 'play', 'plays', 'view_count', 'downloads'],
  reply: [
    'comments',
    'comment',
    'reply',
    'replies',
    'answers', // stackoverflow
    'num_comments',
    'reply_count',
  ],
  repost: ['reposts', 'repost', 'shares', 'share', 'retweetCount', 'forks'],
};

function pick(row, aliases) {
  for (const a of aliases) {
    const v = row[a];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// Suffix multipliers on counts: Chinese 万/亿 and western K/M/B (YouTube/Bilibili
// emit localized, human-formatted counts like "1.2万次观看" or "1.7M views").
const COUNT_MULTIPLIER = {
  万: 1e4,
  亿: 1e8,
  億: 1e8,
  k: 1e3,
  m: 1e6,
  b: 1e9,
};

function toNum(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  // Leading number (with grouping separators) + optional unit; trailing prose
  // ("次观看", "views") is ignored.
  const m = /(-?\d[\d,._]*)\s*(万|亿|億|[kmb])?/i.exec(String(v));
  if (!m) return undefined;
  const base = Number(m[1].replace(/[,_\s]/g, ''));
  if (!Number.isFinite(base)) return undefined;
  const mult = m[2] ? COUNT_MULTIPLIER[m[2].toLowerCase()] || 1 : 1;
  return base * mult;
}

// Relative timestamps ("10小时前", "2 hours ago") → absolute, anchored to `refMs`
// (the fetch time). Month/year are approximate (30/365 days) — good enough for
// recency-weighted ranking, not for display precision.
const REL_UNIT_MS = {
  秒: 1e3,
  分钟: 6e4,
  分: 6e4,
  小时: 36e5,
  天: 864e5,
  日: 864e5,
  周: 6048e5,
  个月: 2592e6,
  月: 2592e6,
  年: 31536e6,
  second: 1e3,
  minute: 6e4,
  hour: 36e5,
  day: 864e5,
  week: 6048e5,
  month: 2592e6,
  year: 31536e6,
};

function parseRelative(v, refMs) {
  if (!Number.isFinite(refMs)) return undefined;
  const s = String(v).trim();
  const zh = /(\d+)\s*(秒|分钟|分|小时|天|日|周|个月|月|年)前/.exec(s);
  const en = /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(
    s
  );
  const m = zh || en;
  if (!m) return undefined;
  const unit = REL_UNIT_MS[zh ? m[2] : m[2].toLowerCase()];
  if (!unit) return undefined;
  const d = new Date(refMs - Number(m[1]) * unit);
  return isNaN(d) ? undefined : d.toISOString();
}

function toIso(v, refMs) {
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
  if (!isNaN(d)) return d.toISOString();
  // Localized/relative forms (YouTube: "10小时前") anchored to the fetch time.
  return parseRelative(v, refMs);
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

  const refMs = fetchedAt ? Date.parse(fetchedAt) : Date.now();
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
    publishedAt: toIso(
      pick(row, FIELD_ALIASES.publishedAt),
      Number.isFinite(refMs) ? refMs : undefined
    ),
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
