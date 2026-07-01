// Channel registry — one descriptor per auth-gated platform served via OpenCLI.
//
// Each descriptor declares:
//   name        reach/config key (e.g. `twitter_backend` override)
//   platform    FeedItem.platform value
//   description human label (doctor output)
//   tier        0 zero-config · 1 needs login/session · 2 needs setup
//   backends    ordered candidate list (only OpenCLI wired today)
//   hosts       URL host suffixes for canHandle()
//   commands    named OpenCLI commands → { cmd, sourceType }
//
// `commands.feed` is the personalized/hot list (no query); `commands.search`
// takes a topic query. The pipeline picks per config. Command names and their
// output columns were read from the installed OpenCLI adapters; live column
// mapping is defensive (see ../normalize.js) and should be calibrated with one
// desktop run of `digest reach doctor` + a real fetch.

export const CHANNELS = [
  {
    name: 'twitter',
    platform: 'x',
    description: 'Twitter/X 推文',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['x.com', 'twitter.com'],
    commands: {
      feed: { cmd: 'timeline', sourceType: 'following' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    // youtube `feed` is the personalized homepage; `search` takes a topic query.
    // Output columns (rank, title, channel, video_id, views, duration,
    // published, url) are localized — normalize parses "10小时前"/"1.2万" forms.
    name: 'youtube',
    platform: 'youtube',
    description: 'YouTube 视频',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['youtube.com', 'youtu.be'],
    commands: {
      feed: { cmd: 'feed', sourceType: 'trending' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'reddit',
    platform: 'reddit',
    description: 'Reddit 帖子',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['reddit.com'],
    commands: {
      feed: { cmd: 'home', sourceType: 'following' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'bilibili',
    platform: 'bilibili',
    description: 'Bilibili 视频',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['bilibili.com', 'b23.tv'],
    commands: {
      feed: { cmd: 'dynamic', sourceType: 'following' },
      trending: { cmd: 'hot', sourceType: 'trending' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'xiaohongshu',
    platform: 'xiaohongshu',
    description: '小红书笔记',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['xiaohongshu.com', 'xhslink.com'],
    commands: {
      feed: { cmd: 'feed', sourceType: 'following' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'facebook',
    platform: 'facebook',
    description: 'Facebook 帖子',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['facebook.com', 'fb.com'],
    commands: {
      feed: { cmd: 'feed', sourceType: 'following' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'instagram',
    platform: 'instagram',
    description: 'Instagram 帖子',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['instagram.com'],
    commands: {
      feed: { cmd: 'explore', sourceType: 'trending' },
      search: { cmd: 'explore', sourceType: 'search' },
    },
  },
  {
    // linkedin `search` is job-listings (different schema); the content feed is
    // `timeline`. Backend is tier-2 (off until configured) — see reach doctor.
    name: 'linkedin',
    platform: 'linkedin',
    description: 'LinkedIn 动态',
    tier: 2,
    backends: ['OpenCLI'],
    hosts: ['linkedin.com'],
    commands: {
      feed: { cmd: 'timeline', sourceType: 'following' },
    },
  },
  {
    // xueqiu `search` returns stock symbols, not posts; content lives in
    // `feed` (following) and `hot` (trending).
    name: 'xueqiu',
    platform: 'xueqiu',
    description: '雪球讨论',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['xueqiu.com'],
    commands: {
      feed: { cmd: 'feed', sourceType: 'following' },
      trending: { cmd: 'hot', sourceType: 'trending' },
    },
  },
  {
    name: 'weibo',
    platform: 'weibo',
    description: '微博',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['weibo.com', 'weibo.cn'],
    commands: {
      feed: { cmd: 'feed', sourceType: 'following' },
      trending: { cmd: 'hot', sourceType: 'trending' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'hackernews',
    platform: 'hackernews',
    description: 'Hacker News',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['news.ycombinator.com'],
    commands: {
      feed: { cmd: 'top', sourceType: 'trending' },
      trending: { cmd: 'top', sourceType: 'trending' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    // producthunt exposes only `hot` (no search command).
    name: 'producthunt',
    platform: 'producthunt',
    description: 'Product Hunt',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['producthunt.com'],
    commands: {
      feed: { cmd: 'hot', sourceType: 'trending' },
      trending: { cmd: 'hot', sourceType: 'trending' },
    },
  },
  {
    name: '36kr',
    platform: '36kr',
    description: '36氪',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['36kr.com'],
    commands: {
      feed: { cmd: 'hot', sourceType: 'trending' },
      trending: { cmd: 'hot', sourceType: 'trending' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'juejin',
    platform: 'juejin',
    description: '掘金',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['juejin.cn'],
    commands: {
      feed: { cmd: 'hot', sourceType: 'trending' },
      trending: { cmd: 'hot', sourceType: 'trending' },
    },
  },
  {
    name: 'tiktok',
    platform: 'tiktok',
    description: 'TikTok',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['tiktok.com'],
    commands: {
      feed: { cmd: 'explore', sourceType: 'trending' },
      trending: { cmd: 'explore', sourceType: 'trending' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'substack',
    platform: 'substack',
    description: 'Substack',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['substack.com'],
    commands: {
      feed: { cmd: 'feed', sourceType: 'following' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
];

// Note: xiaoyuzhou (小宇宙) is intentionally omitted — its OpenCLI adapter is
// podcast-lookup only (episode/podcast/transcript), with no feed/search command
// that fits the digest's generic feed model.

export function getAllChannels() {
  return CHANNELS;
}

export function getChannel(name) {
  return CHANNELS.find((c) => c.name === name) || null;
}

export function channelForUrl(url, canHandleFn) {
  return CHANNELS.find((c) => canHandleFn(c, url)) || null;
}
