import fs from 'node:fs';
import path from 'node:path';
import {
  fetchAllSources,
  runEnrichers,
  collectPostScore,
} from './fetch_sources.js';
import { dedupItems } from './dedup.js';
import { filterXNoise } from './filters.js';
import {
  buildCandidates,
  serializeCandidates,
  buildJudgingTask,
  candidateKey,
} from './candidates.js';
import { parseJudgments, indexJudgments } from './judgments.js';
import { assembleDigest } from './assemble.js';
import { renderDigestMarkdown, renderReaderDigest } from './render.js';

// Fetch + de-noise + de-dup + recency filter — the prefix every stage shares.
// `sources` is injectable (defaults to the SOURCES registry) for tests. This is
// the single fetch seam: run it once and both candidate emission and rendering
// can be derived from the same item set.
export async function collectBaseItems({ cfg, outDir, fetchedAt, sources }) {
  let items = await fetchAllSources(cfg, { fetchedAt, outDir }, sources);

  items = filterXNoise(items, cfg);
  items = dedupItems(items);

  // Hard recency filter (product behavior): drop items older than recency_hours
  // when publishedAt is known.
  const recencyH = cfg?.output?.recency_hours ?? 24;
  const nowMs = Date.now();
  return items.filter((it) => {
    const ts = Date.parse(it.publishedAt || '');
    if (!Number.isFinite(ts)) return true;
    const ageH = (nowMs - ts) / 36e5;
    return ageH <= recencyH;
  });
}

// Stage 1: emit the compact candidate list + a self-contained judging task from
// already-collected base items. See SKILL.md + docs/FILTERING.md + AGENTS.md.
export function emitCandidatesFromItems({ items, cfg, date, outDir }) {
  const cands = buildCandidates(items, {
    maxTextLen: cfg?.filter?.max_text_len ?? 500,
  });
  const candidatesPath = path.join(outDir, `candidates-${date}.jsonl`);
  fs.writeFileSync(candidatesPath, serializeCandidates(cands), 'utf8');

  const judgingTaskPath = path.join(outDir, `judging-task-${date}.json`);
  const task = buildJudgingTask({
    cfg,
    date,
    count: cands.length,
    candidatesPath,
  });
  fs.writeFileSync(judgingTaskPath, JSON.stringify(task, null, 2), 'utf8');

  return { candidatesPath, judgingTaskPath, count: cands.length };
}

// Resolve the relevance gate input (I/O stays in the shell). AI judgments when
// filter.mode is llm/hybrid and a judgments file is present; otherwise null →
// assembleDigest uses the keyword matcher.
function resolveJudgeIndex(cfg, judgmentsPath) {
  const filterMode = cfg?.filter?.mode || 'keyword';
  let judgeIndex = null;
  if ((filterMode === 'llm' || filterMode === 'hybrid') && judgmentsPath) {
    try {
      judgeIndex = indexJudgments(
        parseJudgments(fs.readFileSync(judgmentsPath, 'utf8'))
      );
    } catch (e) {
      console.error(
        `# filter: could not read judgments ${judgmentsPath}: ${e?.message || e}`
      );
    }
  }
  if (filterMode === 'llm' && !judgeIndex) {
    console.error(
      '# filter: mode=llm but no --judgments file; falling back to keyword gate'
    );
  }
  return judgeIndex;
}

// Full render from already-collected base items: enrich → assemble → write.
export async function renderFromItems({
  items,
  cfg,
  date,
  outDir,
  fetchedAt,
  judgmentsPath,
}) {
  // Post-fetch enrichment (per-source `enrich` hook; e.g. X unfurl — I/O).
  items = await runEnrichers(items, cfg, { fetchedAt, outDir });

  const judgeIndex = resolveJudgeIndex(cfg, judgmentsPath);

  // Pure core: rank → topic/relevance gate → recommended → postScore → trim.
  const assembled = assembleDigest({
    items,
    cfg,
    judgeIndex,
    postScore: collectPostScore(cfg),
  });
  const outItems = assembled.items;
  const recommended = assembled.recommended;

  const itemsPath = path.join(outDir, `items-${date}.jsonl`);
  const jsonl =
    outItems.map((x) => JSON.stringify(x)).join('\n') +
    (outItems.length ? '\n' : '');
  fs.writeFileSync(itemsPath, jsonl, 'utf8');

  // Reader view is the deliverable users (and cron) open at digest-<date>.md.
  const digestPath = path.join(outDir, `digest-${date}.md`);
  const readerMd = renderReaderDigest(outItems, {
    cfg,
    date,
    fetchedAt,
    recommended,
  });
  fs.writeFileSync(digestPath, readerMd, 'utf8');

  // Inspection view keeps the full ranking/tag/hit detail for debugging + agents.
  const inspectionPath = path.join(outDir, `digest-inspection-${date}.md`);
  const inspectionMd = renderDigestMarkdown(outItems, {
    cfg,
    date,
    fetchedAt,
    recommended,
  });
  fs.writeFileSync(inspectionPath, inspectionMd, 'utf8');

  return { itemsPath, digestPath, inspectionPath, count: outItems.length };
}

export async function runDigest({
  cfg,
  date,
  outDir,
  stage = 'full',
  judgmentsPath,
}) {
  const fetchedAt = new Date().toISOString();
  const items = await collectBaseItems({ cfg, outDir, fetchedAt });

  if (stage === 'candidates') {
    return emitCandidatesFromItems({ items, cfg, date, outDir });
  }
  return renderFromItems({
    items,
    cfg,
    date,
    outDir,
    fetchedAt,
    judgmentsPath,
  });
}

// Render the digest AND report the candidate id set — from a single fetch. The
// returned candidateIds are exactly the base pool the render is derived from, so
// a caller can validate judgments against the same set the digest is gated on
// (no drift between a separate validate fetch and the render fetch).
export async function runFullDigestOnce({
  cfg,
  date,
  outDir,
  judgmentsPath,
  sources,
}) {
  const fetchedAt = new Date().toISOString();
  const items = await collectBaseItems({ cfg, outDir, fetchedAt, sources });
  const candidateIds = items.map(candidateKey);
  const result = await renderFromItems({
    items,
    cfg,
    date,
    outDir,
    fetchedAt,
    judgmentsPath,
  });
  return { ...result, candidateIds };
}
