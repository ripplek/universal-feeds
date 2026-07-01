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

// items: post fetch/dedup/recency/enrich candidates.
// judgeIndex: Map from indexJudgments(), or null to use the keyword gate.
// postScore: pure (items, cfg) → items hooks applied after scoring/gating,
//   before the final sort/trim (e.g. the X retweet policy). Kept as injected
//   hooks so this core stays platform-agnostic.
// Returns { items, recommended } — both fully computed, sorted, trimmed.
export function assembleDigest({
  items,
  cfg,
  judgeIndex = null,
  postScore = [],
}) {
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

  for (const hook of postScore) out = hook(out, cfg);
  // Re-sort: boosts/penalties changed scores.
  out = out.sort((a, b) => (b.score || 0) - (a.score || 0));
  out = trimByPlatform(out, cfg);

  return { items: out, recommended };
}
