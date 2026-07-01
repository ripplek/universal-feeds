// Build the compact candidate list handed to an AI judge for relevance review.
//
// The digest emits candidates (post cheap pre-filtering), a Clawdbot agent
// judges each against the user's interest profile, and the digest ingests the
// judgments (see src/judgments.js + skill/universal-feeds/SKILL.md). Keeping the
// payload compact — id, platform, title, truncated text, url — controls the
// token cost of the judging call.

// Stable cross-platform key for round-tripping a judgment back to its item.
// FeedItem.id is only unique within a platform (e.g. a reddit and a bilibili
// item can share a numeric id), so the judge key is `<platform>:<id>`.
export function candidateKey(item) {
  return `${item.platform}:${item.id}`;
}

export function buildCandidates(items, { maxTextLen = 500 } = {}) {
  return items.map((it) => {
    const c = { id: candidateKey(it), platform: it.platform, url: it.url };
    if (it.title) c.title = it.title;
    const text = (it.text || '').trim();
    if (text)
      c.text =
        text.length > maxTextLen ? `${text.slice(0, maxTextLen)}…` : text;
    return c;
  });
}

export function serializeCandidates(cands) {
  return (
    cands.map((c) => JSON.stringify(c)).join('\n') + (cands.length ? '\n' : '')
  );
}

// The judgment object schema an agent must emit for each candidate. Kept inline
// (not a $ref) so judging-task.json is fully self-contained.
const JUDGMENT_SCHEMA = {
  type: 'object',
  required: ['id', 'relevant', 'score'],
  properties: {
    id: {
      type: 'string',
      description: 'Echo the candidate id verbatim (<platform>:<id>).',
    },
    relevant: {
      type: 'boolean',
      description: 'Is this worth the user’s attention given the profile?',
    },
    score: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'How strongly relevant, 0..1.',
    },
    topics: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Reuse the task’s topic names where they fit; add new ones sparingly.',
    },
    why: { type: 'string', description: 'One short line of rationale.' },
  },
};

// Self-contained judging task written alongside the candidates file. An agent
// can read this one JSON object and judge without loading any skill: it carries
// the interest profile, the topic whitelist, the exact output schema, and the
// input/output paths. See docs/FILTERING.md and AGENTS.md.
export function buildJudgingTask({ cfg = {}, date, count, candidatesPath }) {
  const filter = cfg.filter || {};
  const topics = Array.isArray(cfg.topics)
    ? cfg.topics.map((t) => t?.name).filter((n) => typeof n === 'string')
    : [];
  const outputPath = `out/judgments-${date}.jsonl`;
  return {
    task: 'universal-feeds/relevance-judging',
    date,
    model: filter.model || 'claude-haiku-4-5',
    profile:
      typeof filter.profile === 'string' && filter.profile.trim()
        ? filter.profile
        : 'No profile configured; judge general tech/AI relevance and be conservative.',
    topics,
    min_relevance:
      typeof filter.min_relevance === 'number' ? filter.min_relevance : 0.5,
    require_topic_match: cfg.output?.require_topic_match === true,
    count,
    candidatesPath,
    instructions: [
      `Read every JSONL candidate in ${candidatesPath}.`,
      'For each candidate emit exactly one judgment object matching judgment_schema.',
      'Echo `id` verbatim. Judge on meaning, not keywords — cross-language is expected.',
      'Reuse `topics` names where they fit; add new ones sparingly.',
      `Write all judgments (JSONL, one per line) to ${outputPath}, then re-run:`,
      `  node bin/digest --config <cfg> --judgments ${outputPath}`,
    ].join(' '),
    judgment_schema: JUDGMENT_SCHEMA,
    output: { path: outputPath, format: 'jsonl' },
  };
}
