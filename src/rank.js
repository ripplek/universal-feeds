function hoursAgo(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 36e5;
}

export function rankItems(items, cfg) {
  const recencyHours = cfg?.output?.recency_hours ?? 24;
  const platformWeights = cfg?.ranking?.platform_weights || {};

  return items
    .map((x) => {
      const m = x.metrics || {};
      const engagementRaw = (m.like || 0) + 2 * (m.repost || 0) + (m.reply || 0) + (m.quote || 0);
      // log scale so X doesn't drown everything.
      const engagement = Math.log1p(engagementRaw);

      const ageH = hoursAgo(x.publishedAt);
      const recencyBoost = ageH <= recencyHours ? (recencyHours - ageH) / recencyHours : 0;

      const w = typeof platformWeights?.[x.platform] === 'number' ? platformWeights[x.platform] : 1.0;
      const sourceW = typeof x?.source?.weight === 'number' ? x.source.weight : 1.0;
      const score = (engagement + recencyBoost) * w * sourceW;
      return { ...x, score };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}
