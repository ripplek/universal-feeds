// Ingest AI relevance judgments and apply them to items.
//
// A judgment (produced by the Clawdbot agent, one per candidate) looks like:
//   { "id": "reddit:1", "relevant": true, "score": 0.82,
//     "topics": ["agentic-ai"], "why": "hands-on agent framework" }
// See src/candidates.js for the id contract and SKILL.md for the judging prompt.

import { candidateKey } from './candidates.js';

// Accepts a JSON array or JSONL text; skips malformed lines.
export function parseJudgments(text) {
  const t = (text || '').trim();
  if (!t) return [];
  if (t[0] === '[') {
    try {
      const arr = JSON.parse(t);
      return Array.isArray(arr) ? arr : [];
    } catch {
      // fall through to line-by-line
    }
  }
  const out = [];
  for (const line of t.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      // skip malformed line
    }
  }
  return out;
}

export function indexJudgments(judgments) {
  const m = new Map();
  for (const j of judgments || []) {
    if (j && j.id != null) m.set(String(j.id), j);
  }
  return m;
}

// Apply judgments to items: filter (when requireRelevant), tag with the judge's
// topics, and fold relevance into the score. Non-destructive (returns new items).
export function applyJudgments(
  items,
  judgeIndex,
  { minRelevance = 0.5, requireRelevant = true, boost = 1.0 } = {}
) {
  const out = [];
  for (const it of items) {
    const j = judgeIndex.get(candidateKey(it));

    if (requireRelevant) {
      if (!j) continue; // unjudged item is dropped in strict mode
      if (j.relevant === false) continue;
      if (typeof j.score === 'number' && j.score < minRelevance) continue;
    }

    const topics = Array.isArray(j?.topics) ? j.topics : [];
    const tags = [...new Set([...(it.tags || []), ...topics])];
    const rel = typeof j?.score === 'number' ? j.score : 0;
    const score = (it.score || 0) + rel * boost;
    const debug = j?.why
      ? { ...(it.debug || {}), relevance: { score: rel, why: j.why } }
      : it.debug;

    out.push({ ...it, tags, score, debug });
  }
  return out.sort((a, b) => (b.score || 0) - (a.score || 0));
}
