function hoursAgo(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 36e5;
}

export function rankItems(items, cfg) {
  const recencyHours = cfg?.output?.recency_hours ?? 24;
  const platformWeights = cfg?.ranking?.platform_weights || {};
  // Reach trending lists (e.g. 36kr hot, HN top) often carry no engagement
  // metrics or timestamps, which would zero their score. Give them a small base
  // signal so they rank above nothing; stable sort preserves the upstream
  // hot-rank order among equal scores.
  const reachBase =
    typeof cfg?.ranking?.reach_base_score === 'number'
      ? cfg.ranking.reach_base_score
      : 0.5;

  return items
    .map((x) => {
      const m = x.metrics || {};
      const engagementRaw =
        (m.like || 0) + 2 * (m.repost || 0) + (m.reply || 0) + (m.quote || 0);
      // log scale so X doesn't drown everything.
      const engagement = Math.log1p(engagementRaw);

      const ageH = hoursAgo(x.publishedAt);
      const recencyBoost =
        ageH <= recencyHours ? (recencyHours - ageH) / recencyHours : 0;

      const isReach =
        typeof x?.source?.name === 'string' &&
        x.source.name.startsWith('reach:');
      const base = isReach && engagementRaw === 0 ? reachBase : 0;

      const w =
        typeof platformWeights?.[x.platform] === 'number'
          ? platformWeights[x.platform]
          : 1.0;
      const sourceW =
        typeof x?.source?.weight === 'number' ? x.source.weight : 1.0;
      const rel =
        typeof x?.source?.reliability === 'number' ? x.source.reliability : 1.0;
      const score = (engagement + recencyBoost + base) * w * sourceW * rel;
      return { ...x, score };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}
