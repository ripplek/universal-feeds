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
} from './candidates.js';
import { assembleDigest } from './assemble.js';
import { renderDigestMarkdown, renderReaderDigest } from './render.js';
import { buildSourceHealth, formatHealthLine } from './health.js';
import {
  createRun,
  writeRunSnapshot,
  writeRunFile,
  configHashes,
} from './run_store.js';

// Mechanisms only — run orchestration (which run to use, judgments validation,
// status/health contract) lives in src/operations.js. Data flow:
//
//   createRunSnapshot        fetch → de-noise → dedup → recency → enrich
//        │                   → out/runs/<runId>/{items.jsonl, meta.json}
//        ▼
//   emitCandidatesForRun     items.jsonl → candidates.jsonl + judging-task.json
//        ▼                                  (agent judges → judgments.jsonl)
//   renderFromItems          snapshot items + judgeIndex → digest/inspection
//                            (zero network, zero wall-clock: now = fetchedAt)

// Fetch + de-noise + de-dup + recency filter. The recency cut happens exactly
// once, at fetch time, anchored to fetchedAt — a snapshot replay never
// re-filters by the current clock (items would silently vanish mid-judging).
export async function collectBaseItems({ cfg, outDir, fetchedAt, sources }) {
  const { items: fetched, perSource } = await fetchAllSources(
    cfg,
    { fetchedAt, outDir },
    sources
  );

  let items = filterXNoise(fetched, cfg);
  items = dedupItems(items);

  const recencyH = cfg?.output?.recency_hours ?? 24;
  const nowMs = Date.parse(fetchedAt) || Date.now();
  items = items.filter((it) => {
    const ts = Date.parse(it.publishedAt || '');
    if (!Number.isFinite(ts)) return true;
    const ageH = (nowMs - ts) / 36e5;
    return ageH <= recencyH;
  });
  return { items, perSource };
}

// One fetch → one immutable run. Items are stored POST-enrich so a replay is
// byte-stable (no unfurl network/cache side effects at render time); a failing
// enricher degrades to unenriched items rather than blocking the snapshot.
export async function createRunSnapshot({ cfg, date, outDir, sources }) {
  const fetchedAt = new Date().toISOString();
  const collected = await collectBaseItems({ cfg, outDir, fetchedAt, sources });
  const items = await runEnrichers(
    collected.items,
    cfg,
    { fetchedAt, outDir },
    sources
  );
  const { runId, dir } = createRun(outDir, date);
  const { filterHash, cfgHash } = configHashes(cfg);
  writeRunSnapshot(dir, {
    items,
    meta: {
      runId,
      date,
      fetchedAt,
      filterHash,
      cfgHash,
      perSource: collected.perSource,
      count: items.length,
    },
  });
  return { runId, dir, items, perSource: collected.perSource, fetchedAt };
}

// Stage 1 artifacts, written INTO the run directory: the compact candidate
// list and the self-contained judging task (carries runId; the judgments
// output path inside the run dir is the binding).
export function emitCandidatesForRun({ runId, dir, items, cfg, date }) {
  const cands = buildCandidates(items, {
    maxTextLen: cfg?.filter?.max_text_len ?? 500,
  });
  const candidatesPath = path.join(dir, 'candidates.jsonl');
  writeRunFile(dir, 'candidates.jsonl', serializeCandidates(cands));

  const judgingTaskPath = path.join(dir, 'judging-task.json');
  const task = buildJudgingTask({
    cfg,
    date,
    count: cands.length,
    candidatesPath,
    runId,
    outputPath: path.join(dir, 'judgments.jsonl'),
  });
  writeRunFile(dir, 'judging-task.json', JSON.stringify(task, null, 2));

  return { candidatesPath, judgingTaskPath, count: cands.length };
}

export function readJudgingTask(dir) {
  return JSON.parse(
    fs.readFileSync(path.join(dir, 'judging-task.json'), 'utf8')
  );
}

// Full render from snapshot items. No enrichment and no judgments-file I/O
// here — the caller (operations) validates judgments and passes the index.
// `fetchedAt` doubles as the ranking clock so scores don't drift between
// judging and rendering.
export function renderFromItems({
  items,
  cfg,
  date,
  outDir,
  fetchedAt,
  judgeIndex = null,
  perSource = [],
}) {
  const sourceHealth = buildSourceHealth({ perSource, cfg });
  const healthLine = formatHealthLine(sourceHealth, cfg);

  const assembled = assembleDigest({
    items,
    cfg,
    judgeIndex,
    postScore: collectPostScore(cfg),
    nowMs: Date.parse(fetchedAt) || Date.now(),
  });
  const outItems = assembled.items;

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
    recommended: assembled.recommended,
    recommendedJudged: assembled.recommendedJudged,
    healthLine,
  });
  fs.writeFileSync(digestPath, readerMd, 'utf8');

  // Inspection view keeps the full ranking/tag/hit detail for debugging + agents.
  const inspectionPath = path.join(outDir, `digest-inspection-${date}.md`);
  const inspectionMd = renderDigestMarkdown(outItems, {
    cfg,
    date,
    fetchedAt,
    recommended: assembled.recommended,
  });
  fs.writeFileSync(inspectionPath, inspectionMd, 'utf8');

  return {
    itemsPath,
    digestPath,
    inspectionPath,
    count: outItems.length,
    sourceHealth,
  };
}
