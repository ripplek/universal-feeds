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
];

export function getAllChannels() {
  return CHANNELS;
}

export function getChannel(name) {
  return CHANNELS.find((c) => c.name === name) || null;
}

export function channelForUrl(url, canHandleFn) {
  return CHANNELS.find((c) => canHandleFn(c, url)) || null;
}
