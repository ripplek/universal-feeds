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

// Human-readable name for the digest output language, used to instruct the judge
// when translation is on. Falls back to the raw code for anything unmapped.
const LANGUAGE_NAMES = { en: 'English', zh: 'Chinese (Simplified)' };
export function languageName(code) {
  return LANGUAGE_NAMES[code] || code || 'English';
}

// Self-contained judging task written alongside the candidates file. An agent
// can read this one JSON object and judge without loading any skill: it carries
// the interest profile, the topic whitelist, the exact output schema, and the
// input/output paths. See docs/FILTERING.md and AGENTS.md.
export function buildJudgingTask({
  cfg = {},
  date,
  count,
  candidatesPath,
  runId = null,
  outputPath: outputPathArg = null,
}) {
  const filter = cfg.filter || {};
  const topics = Array.isArray(cfg.topics)
    ? cfg.topics.map((t) => t?.name).filter((n) => typeof n === 'string')
    : [];
  // Judgments live inside the run directory — the path IS the runId binding
  // (see src/run_store.js). Legacy fallback kept for callers without a run.
  const outputPath =
    outputPathArg ||
    (runId
      ? `out/runs/${runId}/judgments.jsonl`
      : `out/judgments-${date}.jsonl`);

  // Optional: unify the digest's display language. When on, the judge also
  // returns each title rendered in `output.language`, so the reader view isn't a
  // mix of English and Chinese headlines. Folded into the existing judging pass
  // (no extra hand-off) — the agent already reads every candidate.
  const translate = cfg.output?.translate === true;
  const targetLanguage = languageName(cfg.output?.language);
  const schema = translate
    ? {
        ...JUDGMENT_SCHEMA,
        properties: {
          ...JUDGMENT_SCHEMA.properties,
          title_translated: {
            type: 'string',
            description: `The candidate's title rendered in ${targetLanguage}. If it is already in ${targetLanguage}, echo it unchanged. Translate meaning, keep proper nouns/product names as-is.`,
          },
        },
      }
    : JUDGMENT_SCHEMA;

  const instructions = [
    `Read every JSONL candidate in ${candidatesPath}.`,
    'For each candidate emit exactly one judgment object matching judgment_schema.',
    'Echo `id` verbatim. Judge on meaning, not keywords — cross-language is expected.',
    'Reuse `topics` names where they fit; add new ones sparingly.',
  ];
  if (translate) {
    instructions.push(
      `Also set \`title_translated\`: the title in ${targetLanguage} (echo unchanged if already in ${targetLanguage}).`
    );
  }
  instructions.push(
    `Write all judgments (JSONL, one per line) to ${outputPath}, then re-run:`,
    `  node bin/digest --config <cfg> --judgments ${outputPath}`
  );
  if (runId) {
    instructions.push(
      `This task is bound to run ${runId} — via MCP, call apply_judgments with runId "${runId}" (do NOT re-resolve "today"; the date may roll over mid-loop).`
    );
  }

  const task = {
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
    instructions: instructions.join(' '),
    judgment_schema: schema,
    output: { path: outputPath, format: 'jsonl' },
  };
  if (runId) task.runId = runId;
  if (translate) task.target_language = targetLanguage;
  return task;
}
