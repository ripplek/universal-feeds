// Pure digest-assembly core: candidate items in → ranked/filtered/tagged items
// plus the recommended section out. No I/O — the interface is the test surface.
//
// The runDigest shell owns the impure edges (fetch, unfurl enrichment, reading
// the judgments file, writing outputs). Everything here is a deterministic
// transform of (items, cfg, judgeIndex), so ranking × topic-gate × retweet
// policy × trim interplay is unit-testable through one call.

import { rankItems } from './rank.js';
import { tagAndScore } from './tagging.js';
import { pickRecommended } from './recommend.js';
import { applyJudgments } from './judgments.js';
import { trimByPlatform } from './trim.js';

function applyRetweetPolicy(items, cfg) {
  const xCfg = cfg?.platforms?.x?.following || {};
  const includeRT = xCfg.include_retweets !== false;
  const rtPenalty =
    typeof xCfg.retweet_penalty === 'number' ? xCfg.retweet_penalty : 1.0;
  const maxRt =
    typeof xCfg.max_retweets === 'number' ? xCfg.max_retweets : Infinity;
  let rtCount = 0;
  const isRT = (it) => it.platform === 'x' && /^RT\s+@/i.test(it.text || '');

  return items
    .filter((it) => {
      if (!isRT(it)) return true;
      if (!includeRT) return false;
      rtCount += 1;
      return rtCount <= maxRt;
    })
    .map((it) =>
      isRT(it) ? { ...it, score: (it.score || 0) * rtPenalty } : it
    );
}

// items: post fetch/dedup/recency/unfurl candidates.
// judgeIndex: Map from indexJudgments(), or null to use the keyword gate.
// Returns { items, recommended } — both fully computed, sorted, trimmed.
export function assembleDigest({ items, cfg, judgeIndex = null }) {
  let out = rankItems(items, cfg);

  // Two views: allTagged (topic match not required) feeds the recommended
  // section; the main list may require a topic/relevance match.
  const cfgAll = {
    ...cfg,
    output: { ...(cfg.output || {}), require_topic_match: false },
  };
  const allTagged = tagAndScore(out, cfgAll);

  // Main gate: AI relevance judgments when supplied, else the keyword matcher.
  if (judgeIndex) {
    out = applyJudgments(out, judgeIndex, {
      minRelevance: cfg?.filter?.min_relevance ?? 0.5,
      requireRelevant: cfg?.output?.require_topic_match === true,
      boost: cfg?.filter?.relevance_boost ?? 1.0,
    });
  } else {
    out = tagAndScore(out, cfg);
  }

  const recommended = pickRecommended(allTagged, cfg);

  out = applyRetweetPolicy(out, cfg);
  // Re-sort: boosts/penalties changed scores.
  out = out.sort((a, b) => (b.score || 0) - (a.score || 0));
  out = trimByPlatform(out, cfg);

  return { items: out, recommended };
}
