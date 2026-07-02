// Source health contract — turns per-source fetch outcomes into the
// machine-readable report that makes "zero silent failures" real.
//
// Severity is judged on `fetched` (raw items from the source), NOT on how many
// survived filtering — fetched>0 with 0 candidates is filter behavior, not a
// source failure. The fetch-time reach health gate already probed the channel,
// so its outcome doubles as the "source empty vs channel broken" signal —
// no extra probe pass is needed here.
//
//   entry:  { source, platform, channel?, enabled, fetched, severity, message?,
//             optional?, feeds? }
//   health: 'ok' | 'warning' (a required source is empty)
//                | 'degraded' (a required source errored; digest still renders)

const SEV_RANK = { ok: 0, info: 1, warning: 2, error: 3 };

function isOptional(cfg, platform) {
  return cfg?.platforms?.[platform]?.health === 'optional';
}

// perSource entries come from fetchAllSources: {source, platform, channel?,
// fetched, error?, outcome?, feeds?}. `outcome` is the reach fetch-time status
// ('unavailable' | 'no-command' | 'missing-query') for non-throw failures.
export function buildSourceHealth({ perSource = [], cfg = {} } = {}) {
  const entries = [];
  for (const src of perSource) {
    const platform = src.platform || src.source;
    const optional = isOptional(cfg, platform);
    let severity = 'ok';
    let message = src.error || '';

    // Per-feed failures inside an aggregate source (rss packs): a feed that
    // errored is a partial outage even when the aggregate `fetched` is >0 —
    // this is the "OpenAI/Anthropic feeds 404 but rss total looks normal"
    // silent failure the per-feed counts exist to catch.
    const deadFeeds = Array.isArray(src.feeds)
      ? src.feeds.filter((f) => f && f.error)
      : [];

    if (src.error || src.outcome === 'unavailable') {
      severity = 'error';
      if (!message) message = `channel unavailable (${src.outcome})`;
    } else if (
      src.outcome === 'no-command' ||
      src.outcome === 'missing-query'
    ) {
      severity = 'error';
      message = message || `misconfigured (${src.outcome})`;
    } else if ((src.fetched || 0) === 0) {
      // Fetch-time health already passed (reach) or the source simply returned
      // nothing (tier-0): the source is reachable but empty today.
      severity = 'warning';
      message = message || 'enabled source returned zero items';
    } else if (deadFeeds.length) {
      severity = 'warning';
      message =
        message ||
        `${deadFeeds.length} feed(s) failed: ${deadFeeds
          .map((f) => f.feed)
          .slice(0, 5)
          .join(', ')}`;
    }

    if (optional && SEV_RANK[severity] >= SEV_RANK.warning) {
      // Experimental/low-frequency sources opt out of raising the alarm.
      severity = 'info';
    }

    const entry = {
      source: src.source,
      platform,
      enabled: true,
      fetched: src.fetched || 0,
      severity,
    };
    if (src.channel) entry.channel = src.channel;
    if (message) entry.message = message;
    if (optional) entry.optional = true;
    if (Array.isArray(src.feeds) && src.feeds.length) entry.feeds = src.feeds;
    entries.push(entry);
  }
  return entries;
}

// Top-level content health from the entries (optional sources never lift it).
export function overallHealth(entries = []) {
  let health = 'ok';
  for (const e of entries) {
    if (e.optional) continue;
    if (e.severity === 'error') return 'degraded';
    if (e.severity === 'warning') health = 'warning';
  }
  return health;
}

// One reader-facing line for the digest header naming what failed today, or ''
// when everything required is healthy. Keeps the renderer dumb.
export function formatHealthLine(entries = [], cfg = {}) {
  const zh = cfg?.output?.language === 'zh';
  const bad = entries.filter(
    (e) => !e.optional && (e.severity === 'warning' || e.severity === 'error')
  );
  if (!bad.length) return '';
  const empty = bad
    .filter((e) => e.severity === 'warning')
    .map((e) => e.platform);
  const broken = bad
    .filter((e) => e.severity === 'error')
    .map((e) => e.platform);
  const parts = [];
  if (empty.length)
    parts.push(
      zh
        ? `今日无产出：${empty.join('、')}`
        : `no items today: ${empty.join(', ')}`
    );
  if (broken.length)
    parts.push(
      zh ? `通道故障：${broken.join('、')}` : `failed: ${broken.join(', ')}`
    );
  return (zh ? '⚠ 数据源健康 — ' : '⚠ Source health — ') + parts.join('；');
}
