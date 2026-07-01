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

// Validate agent-produced judgments against the emitted candidate id set and the
// config thresholds. Unlike parse/apply (which silently drop bad input), this
// surfaces every problem so an agent can self-correct before the digest renders.
//
// Hard errors (→ ok:false): malformed entries, ids not among the candidates,
// out-of-range/wrong-typed scores, duplicate ids. Soft signals (warnings only):
// candidates left unjudged (strict mode simply drops them).
export function validateJudgments(
  judgments,
  { candidateIds = [], minRelevance = 0.5 } = {}
) {
  const known = new Set(candidateIds.map(String));
  const counts = {
    total: 0,
    valid: 0,
    malformed: 0,
    unknownId: 0,
    outOfRange: 0,
    duplicate: 0,
    unjudged: 0,
    wouldKeep: 0,
  };
  const warnings = [];
  const seen = new Set();

  for (const j of judgments || []) {
    counts.total++;
    if (!j || typeof j !== 'object' || j.id == null || j.id === '') {
      counts.malformed++;
      warnings.push(`malformed judgment (missing id): ${JSON.stringify(j)}`);
      continue;
    }
    const id = String(j.id);

    if (seen.has(id)) {
      counts.duplicate++;
      warnings.push(`duplicate judgment for id ${id} (last one wins)`);
    }
    seen.add(id);

    if (known.size && !known.has(id)) {
      counts.unknownId++;
      warnings.push(`unknown id not among candidates: ${id}`);
      continue;
    }

    let bad = false;
    if ('score' in j) {
      if (
        typeof j.score !== 'number' ||
        !Number.isFinite(j.score) ||
        j.score < 0 ||
        j.score > 1
      ) {
        counts.outOfRange++;
        warnings.push(
          `score out of range [0,1] for ${id}: ${JSON.stringify(j.score)}`
        );
        bad = true;
      }
    }
    if ('relevant' in j && typeof j.relevant !== 'boolean') {
      counts.malformed++;
      warnings.push(
        `relevant must be boolean for ${id}: ${JSON.stringify(j.relevant)}`
      );
      bad = true;
    }
    if ('topics' in j && !Array.isArray(j.topics)) {
      counts.malformed++;
      warnings.push(
        `topics must be an array for ${id}: ${JSON.stringify(j.topics)}`
      );
      bad = true;
    }
    if ('title_translated' in j && typeof j.title_translated !== 'string') {
      counts.malformed++;
      warnings.push(
        `title_translated must be a string for ${id}: ${JSON.stringify(j.title_translated)}`
      );
      bad = true;
    }
    if (bad) continue;

    counts.valid++;
    const relevant = j.relevant !== false;
    const score = typeof j.score === 'number' ? j.score : 0;
    if (relevant && score >= minRelevance) counts.wouldKeep++;
  }

  // Coverage: candidates with no judgment at all.
  if (known.size) {
    for (const id of known) if (!seen.has(id)) counts.unjudged++;
    if (counts.unjudged) {
      warnings.push(
        `${counts.unjudged}/${known.size} candidate(s) left unjudged (dropped in strict mode)`
      );
    }
  }

  const ok =
    counts.malformed === 0 &&
    counts.unknownId === 0 &&
    counts.outOfRange === 0 &&
    counts.duplicate === 0;

  return { ok, counts, warnings };
}

export function formatValidationReport(report, sourcePath = '') {
  const { ok, counts, warnings } = report;
  const lines = [];
  lines.push(
    `${ok ? 'OK' : 'FAIL'}: judgments ${sourcePath ? `(${sourcePath}) ` : ''}` +
      `— ${counts.valid}/${counts.total} valid, ${counts.wouldKeep} would pass the gate`
  );
  const problems = [];
  if (counts.malformed) problems.push(`${counts.malformed} malformed`);
  if (counts.unknownId) problems.push(`${counts.unknownId} unknown id`);
  if (counts.outOfRange) problems.push(`${counts.outOfRange} bad score`);
  if (counts.duplicate) problems.push(`${counts.duplicate} duplicate`);
  if (problems.length) lines.push(`  errors: ${problems.join(', ')}`);
  if (counts.unjudged)
    lines.push(`  note: ${counts.unjudged} candidate(s) unjudged`);
  const shown = warnings.slice(0, 20);
  for (const w of shown) lines.push(`  - ${w}`);
  if (warnings.length > shown.length) {
    lines.push(`  … and ${warnings.length - shown.length} more`);
  }
  return lines.join('\n');
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

    // Carry the judge's translated title (opt-in, output.translate) so the
    // reader view can render a single-language digest. Absent → render falls
    // back to the original title.
    const next = { ...it, tags, score, debug };
    const tt =
      typeof j?.title_translated === 'string' && j.title_translated.trim();
    if (tt) next.titleTranslated = j.title_translated.trim();

    out.push(next);
  }
  return out.sort((a, b) => (b.score || 0) - (a.score || 0));
}
