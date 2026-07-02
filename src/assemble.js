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
import { candidateKey } from './candidates.js';
import { trimByPlatform } from './trim.js';

// items: post fetch/dedup/recency/enrich candidates.
// judgeIndex: Map from indexJudgments(), or null to use the keyword gate.
// postScore: pure (items, cfg) → items hooks applied after scoring/gating,
//   before the final sort/trim (e.g. the X retweet policy). Kept as injected
//   hooks so this core stays platform-agnostic.
// nowMs: ranking clock — a snapshot replay passes the run's fetchedAt so
//   recency scores don't drift with the wall clock.
// Returns { items, recommended, recommendedJudged } — items sorted + trimmed.
// When recommendedJudged is true, `recommended` is the UNCAPPED judged-passing
// pool; the render seam subtracts the rendered main list and applies caps
// (the residual = judged-relevant items that missed the main list's cut).
export function assembleDigest({
  items,
  cfg,
  judgeIndex = null,
  postScore = [],
  nowMs = Date.now(),
}) {
  let out = rankItems(items, cfg, nowMs);
  const ranked = out;

  // Two views: allTagged (topic match not required) feeds the keyword-mode
  // recommended section; the main list may require a topic/relevance match.
  const cfgAll = {
    ...cfg,
    output: { ...(cfg.output || {}), require_topic_match: false },
  };
  const allTagged = tagAndScore(out, cfgAll);

  // Main gate: AI relevance judgments when supplied, else the keyword matcher.
  if (judgeIndex) {
    const minRel = cfg?.filter?.min_relevance ?? 0.5;
    out = applyJudgments(out, judgeIndex, {
      minRelevance: minRel,
      requireRelevant: cfg?.output?.require_topic_match === true,
      boost: cfg?.filter?.relevance_boost ?? 1.0,
    });
    // Mark reader eligibility so the reader view can keep judge-approved items
    // whose topics aren't in the configured topic list (they'd otherwise be
    // silently dropped by topic grouping — the exact content loss the trustworthy
    // digest is meant to prevent). Keyword mode leaves this unset → renderer
    // preserves its existing topic-only behavior.
    for (const it of out) {
      const j = judgeIndex.get(candidateKey(it));
      const relevant = j?.relevant !== false;
      const score = typeof j?.score === 'number' ? j.score : 0;
      it.debug = {
        ...(it.debug || {}),
        readerRelevant: relevant && score >= minRel,
      };
    }
  } else {
    out = tagAndScore(out, cfg);
  }

  // Recommended section. Judged mode replaces the keyword-era additive pool:
  // judged three ways (relevant/irrelevant/unjudged) the old "exclude topic
  // hits" filter would duplicate the main list, so the pool is the full
  // judged-passing set and the render seam subtracts what the main list shows.
  // `recommended.unfiltered: true` keeps the legacy engagement-based picker.
  let recommended;
  let recommendedJudged = false;
  const unfiltered = cfg?.recommended?.unfiltered === true;
  if (judgeIndex && !unfiltered) {
    recommendedJudged = true;
    recommended =
      cfg?.recommended?.enabled === false
        ? []
        : applyJudgments(ranked, judgeIndex, {
            minRelevance: cfg?.filter?.min_relevance ?? 0.5,
            requireRelevant: true,
            boost: cfg?.filter?.relevance_boost ?? 1.0,
          });
  } else {
    recommended = pickRecommended(allTagged, cfg);
    // Carry the judge's translated titles into the legacy recommended section
    // too (output.translate), so the reader digest stays single-language.
    if (judgeIndex) {
      recommended = recommended.map((it) => {
        const j = judgeIndex.get(candidateKey(it));
        const tt =
          typeof j?.title_translated === 'string' && j.title_translated.trim();
        return tt ? { ...it, titleTranslated: tt.trim() } : it;
      });
    }
  }

  for (const hook of postScore) out = hook(out, cfg);
  // Re-sort: boosts/penalties changed scores.
  out = out.sort((a, b) => (b.score || 0) - (a.score || 0));
  out = trimByPlatform(out, cfg);

  return { items: out, recommended, recommendedJudged };
}
