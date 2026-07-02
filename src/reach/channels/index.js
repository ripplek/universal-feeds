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

  // ── Tier-0 public (OpenCLI; no login, some need no browser at all). Columns
  // verified against a live fetch; normalize aliases cover their field names. ──
  {
    name: 'github-trending',
    platform: 'github',
    description: 'GitHub Trending 仓库',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['github.com'],
    commands: {
      feed: { cmd: 'repos', sourceType: 'trending' },
      trending: { cmd: 'repos', sourceType: 'trending' },
    },
  },
  {
    // `recent` needs a category arg; expose search (topic query) only.
    name: 'arxiv',
    platform: 'arxiv',
    description: 'arXiv 论文',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['arxiv.org'],
    commands: {
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'lobsters',
    platform: 'lobsters',
    description: 'Lobsters 技术讨论',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['lobste.rs'],
    commands: {
      feed: { cmd: 'active', sourceType: 'following' },
      trending: { cmd: 'hot', sourceType: 'trending' },
    },
  },
  {
    name: 'devto',
    platform: 'devto',
    description: 'DEV 社区文章',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['dev.to'],
    commands: {
      feed: { cmd: 'latest', sourceType: 'following' },
      trending: { cmd: 'top', sourceType: 'trending' },
    },
  },
  {
    name: 'lesswrong',
    platform: 'lesswrong',
    description: 'LessWrong 帖子',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['lesswrong.com'],
    commands: {
      feed: { cmd: 'frontpage', sourceType: 'following' },
      trending: { cmd: 'top', sourceType: 'trending' },
    },
  },
  {
    name: 'stackoverflow',
    platform: 'stackoverflow',
    description: 'Stack Overflow 问答',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['stackoverflow.com'],
    commands: {
      trending: { cmd: 'hot', sourceType: 'trending' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'aibase',
    platform: 'aibase',
    description: 'AIbase AI 资讯',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['aibase.com'],
    commands: {
      feed: { cmd: 'news', sourceType: 'trending' },
      trending: { cmd: 'news', sourceType: 'trending' },
    },
  },
  {
    // `venue` needs a venue id; expose search only.
    name: 'openreview',
    platform: 'openreview',
    description: 'OpenReview 论文',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['openreview.net'],
    commands: {
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'toutiao',
    platform: 'toutiao',
    description: '今日头条热榜',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['toutiao.com'],
    commands: {
      feed: { cmd: 'hot', sourceType: 'trending' },
      trending: { cmd: 'hot', sourceType: 'trending' },
    },
  },

  // ── Tier-1 (OpenCLI, needs login) ──
  {
    // `hot` emits no url; `recommend` (home) and `search` carry one. Verified.
    name: 'zhihu',
    platform: 'zhihu',
    description: '知乎',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['zhihu.com'],
    commands: {
      feed: { cmd: 'recommend', sourceType: 'following' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    // `feed` emits no url; expose search (verified) only.
    name: 'medium',
    platform: 'medium',
    description: 'Medium 文章',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['medium.com'],
    commands: {
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    // Column mapping from OpenCLI `--help` (content→text, likes, comments, time,
    // url); not login-verified in this session — best-effort at runtime.
    name: 'jike',
    platform: 'jike',
    description: '即刻动态',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['okjike.com'],
    commands: {
      feed: { cmd: 'feed', sourceType: 'following' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    // Columns from `--help` (title, replies, created, likes, views, url); not
    // login-verified in this session — best-effort at runtime.
    name: 'linux-do',
    platform: 'linux-do',
    description: 'LINUX DO 论坛',
    tier: 1,
    backends: ['OpenCLI'],
    hosts: ['linux.do'],
    commands: {
      feed: { cmd: 'feed', sourceType: 'following' },
      search: { cmd: 'search', sourceType: 'search' },
    },
  },

  // ── Academic (tier-0 public, search-only). Papers carry no reliable per-item
  // date, so items rank on fetch time. semanticscholar/openalex were evaluated
  // but their OpenCLI commands errored on every live run — omitted until fixed. ──
  {
    name: 'google-scholar',
    platform: 'google-scholar',
    description: 'Google Scholar 论文',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['scholar.google.com'],
    commands: {
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'dblp',
    platform: 'dblp',
    description: 'dblp 计算机文献',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['dblp.org'],
    commands: {
      search: { cmd: 'search', sourceType: 'search' },
    },
  },
  {
    name: 'pubmed',
    platform: 'pubmed',
    description: 'PubMed 生物医学论文',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['pubmed.ncbi.nlm.nih.gov'],
    commands: {
      search: { cmd: 'search', sourceType: 'search' },
    },
  },

  // ── News (tier-0 public RSS). No per-item timestamp surfaced → rank on fetch. ──
  {
    name: 'bbc',
    platform: 'bbc',
    description: 'BBC News',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['bbc.com', 'bbc.co.uk'],
    commands: {
      feed: { cmd: 'news', sourceType: 'trending' },
      trending: { cmd: 'news', sourceType: 'trending' },
    },
  },
  {
    // url arrives as `link`, body as `summary` (both covered by normalize
    // aliases). feed → `tech` section (AI/tech focus); trending → `main` homepage.
    name: 'bloomberg',
    platform: 'bloomberg',
    description: 'Bloomberg',
    tier: 0,
    backends: ['OpenCLI'],
    hosts: ['bloomberg.com'],
    commands: {
      feed: { cmd: 'tech', sourceType: 'trending' },
      trending: { cmd: 'main', sourceType: 'trending' },
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
