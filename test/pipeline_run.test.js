import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emitCandidates,
  runFullDigest,
  applyJudgments,
  validateJudgmentsFile,
  daily,
} from '../src/operations.js';

// The whole loop is exercised through injected sources against a temp outDir —
// no network, no real config. `state.count` proves how many fetches happened.

function tmpOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'uf-loop-'));
}

function spySource(itemsBatches) {
  // Each fetch returns the NEXT batch (simulating live-feed drift between
  // fetches); the last batch repeats.
  const state = { count: 0 };
  const source = {
    id: 'test',
    enabled: () => true,
    fetch: () => {
      const i = Math.min(state.count, itemsBatches.length - 1);
      state.count++;
      return itemsBatches[i].map((it) => ({ ...it }));
    },
  };
  return { source, state };
}

const BATCH_A = [
  {
    platform: 'reddit',
    id: '1',
    url: 'https://r/1',
    title: 'agent frameworks',
  },
  {
    platform: 'hackernews',
    id: '2',
    url: 'https://h/2',
    title: 'model release',
  },
];
const BATCH_B = [
  // Drifted feed: reddit:1 disappeared, a new item arrived.
  {
    platform: 'hackernews',
    id: '2',
    url: 'https://h/2',
    title: 'model release',
  },
  { platform: 'reddit', id: '9', url: 'https://r/9', title: 'something else' },
];

const LLM_CFG = {
  output: { require_topic_match: true },
  filter: { mode: 'llm', min_relevance: 0.5 },
};

function ctxFor(outDir, cfg, date = '2026-07-02') {
  return { cfg, date, outDir };
}

function writeRaw(outDir, runId, text) {
  const p = path.join(outDir, 'runs', runId, 'judgments.jsonl');
  fs.writeFileSync(p, text, 'utf8');
  return p;
}

function writeJudgments(outDir, runId, judgments) {
  const p = path.join(outDir, 'runs', runId, 'judgments.jsonl');
  fs.writeFileSync(
    p,
    judgments.map((j) => JSON.stringify(j)).join('\n') + '\n',
    'utf8'
  );
  return p;
}

test('snapshot binding: candidates → judge → render all read one fetch, immune to feed drift', async () => {
  const outDir = tmpOut();
  const { source, state } = spySource([BATCH_A, BATCH_B]);
  const ctx = ctxFor(outDir, LLM_CFG);

  const cand = await emitCandidates(ctx, { sources: [source] });
  assert.equal(cand.status, 'ok');
  assert.equal(state.count, 1);
  assert.equal(cand.count, 2);
  assert.ok(cand.runId.startsWith('2026-07-02-'));

  // Judging task carries the runId and the run-dir output path.
  const task = JSON.parse(fs.readFileSync(cand.judgingTaskPath, 'utf8'));
  assert.equal(task.runId, cand.runId);
  assert.ok(task.output.path.includes(`runs/${cand.runId}/`));

  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:1', relevant: true, score: 0.9 },
    { id: 'hackernews:2', relevant: false, score: 0.1 },
  ]);

  // Validation reads the SNAPSHOT (drifted BATCH_B is never fetched).
  const report = await validateJudgmentsFile(ctx, jpath);
  assert.equal(report.ok, true);
  assert.equal(report.counts.unknownId, 0);
  assert.equal(report.counts.unjudged, 0);

  const res = await runFullDigest(ctx, { judgmentsPath: jpath });
  assert.equal(state.count, 1, 'render did NOT re-fetch');
  assert.equal(res.status, 'ok');
  assert.equal(res.runId, cand.runId);
  const rendered = fs
    .readFileSync(res.itemsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((it) => `${it.platform}:${it.id}`);
  assert.deepEqual(rendered, ['reddit:1']);
  assert.ok(fs.existsSync(res.reportPath));
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('CRITICAL regression #1: same-day candidates re-invocation reuses the run; --refetch creates a new one', async () => {
  const outDir = tmpOut();
  const { source, state } = spySource([BATCH_A, BATCH_B]);
  const ctx = ctxFor(outDir, LLM_CFG);

  const first = await emitCandidates(ctx, { sources: [source] });
  const second = await emitCandidates(ctx, { sources: [source] });
  assert.equal(state.count, 1, 'second call replayed the run — no new fetch');
  assert.equal(second.runId, first.runId);
  assert.equal(second.reused, true);

  const third = await emitCandidates(ctx, { refetch: true, sources: [source] });
  assert.equal(state.count, 2, '--refetch forces a fresh snapshot');
  assert.notEqual(third.runId, first.runId);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('CRITICAL regression #2: --judgments with no run is a hard error with guidance (no silent re-fetch)', async () => {
  const outDir = tmpOut();
  const ctx = ctxFor(outDir, LLM_CFG);
  const jpath = path.join(outDir, 'j.jsonl');
  fs.writeFileSync(
    jpath,
    JSON.stringify({ id: 'a:1', relevant: true, score: 1 }) + '\n'
  );
  await assert.rejects(
    () => runFullDigest(ctx, { judgmentsPath: jpath }),
    /no run found for 2026-07-02.*--stage candidates/s
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('explicit judgments file that is unreadable or malformed is a hard failure (no keyword fallback)', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, LLM_CFG);
  const cand = await emitCandidates(ctx, { sources: [source] });

  await assert.rejects(
    () =>
      runFullDigest(ctx, {
        judgmentsPath: path.join(outDir, 'missing.jsonl'),
        runId: cand.runId,
      }),
    /cannot read judgments/
  );

  const bad = path.join(outDir, 'runs', cand.runId, 'judgments.jsonl');
  fs.writeFileSync(
    bad,
    JSON.stringify({ id: 'reddit:1', relevant: true, score: 0.9 }) +
      '\n{broken\n'
  );
  await assert.rejects(
    () => runFullDigest(ctx, { judgmentsPath: bad }),
    /malformed JSONL line/
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('judgments failing validation (unknown id) refuse to render', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, LLM_CFG);
  const cand = await emitCandidates(ctx, { sources: [source] });
  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:1', relevant: true, score: 0.9 },
    { id: 'hackernews:2', relevant: true, score: 0.9 },
    { id: 'stale:999', relevant: true, score: 0.9 },
  ]);
  await assert.rejects(
    () => runFullDigest(ctx, { judgmentsPath: jpath }),
    /failed validation.*unknown id/s
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('runId binding: path-derived runId wins; explicit mismatch is an error; cross-date rejected', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, LLM_CFG);
  const cand = await emitCandidates(ctx, { sources: [source] });
  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:1', relevant: true, score: 0.9 },
    { id: 'hackernews:2', relevant: false, score: 0.1 },
  ]);

  await assert.rejects(
    () => runFullDigest(ctx, { judgmentsPath: jpath, runId: '2026-07-02-99' }),
    /runId mismatch/
  );
  // Midnight rollover: an explicit runId from a path binds even when ctx.date
  // has advanced to the next day (the whole point of the runId contract). The
  // path-derived runId wins; ctx.date is NOT used to reject it.
  const rolledOver = await runFullDigest(
    ctxFor(outDir, LLM_CFG, '2026-07-03'),
    { judgmentsPath: jpath }
  );
  assert.equal(rolledOver.status, 'ok');
  assert.equal(rolledOver.runId, cand.runId);
  // Traversal-shaped runId is rejected before any path join.
  await assert.rejects(
    () => runFullDigest(ctx, { judgmentsPath: jpath, runId: '../../etc' }),
    /invalid runId|runId mismatch/
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('midnight rollover via apply_judgments: explicit runId binds across a date change', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  // Emit "yesterday".
  const cand = await emitCandidates(ctxFor(outDir, LLM_CFG, '2026-07-01'), {
    sources: [source],
  });
  // Apply "today" (date rolled over), echoing the runId as judging-task instructs.
  const res = await applyJudgments(ctxFor(outDir, LLM_CFG, '2026-07-02'), {
    runId: cand.runId,
    judgments: [
      { id: 'reddit:1', relevant: true, score: 0.9 },
      { id: 'hackernews:2', relevant: false, score: 0.1 },
    ],
  });
  assert.equal(res.status, 'ok');
  assert.equal(res.runId, cand.runId);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('config drift: filter change rejects render unless --allow-config-drift; output change only warns', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const cfg = JSON.parse(JSON.stringify(LLM_CFG));
  const ctx = ctxFor(outDir, cfg);
  const cand = await emitCandidates(ctx, { sources: [source] });
  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:1', relevant: true, score: 0.9 },
    { id: 'hackernews:2', relevant: false, score: 0.1 },
  ]);

  const driftedFilter = {
    ...cfg,
    filter: { ...cfg.filter, profile: 'totally different interests' },
  };
  await assert.rejects(
    () =>
      runFullDigest(ctxFor(outDir, driftedFilter), { judgmentsPath: jpath }),
    /config drift/
  );
  const allowed = await runFullDigest(ctxFor(outDir, driftedFilter), {
    judgmentsPath: jpath,
    allowConfigDrift: true,
  });
  assert.equal(allowed.status, 'ok');
  assert.ok(allowed.warnings.some((w) => /drift/.test(w)));

  const driftedOutput = {
    ...cfg,
    output: { ...cfg.output, max_per_topic: 3 },
  };
  const out = await runFullDigest(ctxFor(outDir, driftedOutput), {
    judgmentsPath: jpath,
  });
  assert.equal(out.status, 'ok');
  assert.ok(out.warnings.some((w) => /output-only drift/.test(w)));
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('replay is clock-frozen: rank/recency anchored to the run fetchedAt', async () => {
  const outDir = tmpOut();
  // An item published just inside the recency window at fetch time.
  const nearBoundary = new Date(Date.now() - 23.5 * 36e5).toISOString();
  const { source } = spySource([
    [
      {
        platform: 'reddit',
        id: '1',
        url: 'https://r/1',
        title: 'agent frameworks',
        publishedAt: nearBoundary,
      },
    ],
  ]);
  const cfg = { ...LLM_CFG, output: { ...LLM_CFG.output, recency_hours: 24 } };
  const ctx = ctxFor(outDir, cfg);
  const cand = await emitCandidates(ctx, { sources: [source] });
  assert.equal(cand.count, 1);

  // Pretend judging took a long time by backdating the snapshot's fetchedAt is
  // not possible without mocking the clock — instead verify determinism: two
  // renders of the same run produce byte-identical items output.
  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:1', relevant: true, score: 0.9 },
  ]);
  const r1 = await runFullDigest(ctx, { judgmentsPath: jpath });
  const first = fs.readFileSync(r1.itemsPath, 'utf8');
  const r2 = await runFullDigest(ctx, { judgmentsPath: jpath });
  const second = fs.readFileSync(r2.itemsPath, 'utf8');
  assert.equal(first, second, 'same run renders byte-identical');
  const item = JSON.parse(first.trim());
  assert.ok(item.score > 0, 'recency score present and stable');
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('apply_judgments: explicit runId binds; inline judgments without a runId are a one-shot fresh run (no crash)', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, LLM_CFG);
  const cand = await emitCandidates(ctx, { sources: [source] });

  // Explicit runId: binds to the emitted run.
  const ok = await applyJudgments(ctx, {
    runId: cand.runId,
    judgments: [
      { id: 'reddit:1', relevant: true, score: 0.9 },
      { id: 'hackernews:2', relevant: false, score: 0.1 },
    ],
  });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.runId, cand.runId);
  assert.equal(ok.judgmentCoverage.missing, 0);

  // Inline judgments, no runId: a one-shot — materializes a fresh run and
  // renders rather than crashing on runDir(undefined). (Regression: previously
  // threw "invalid runId 'undefined'".)
  const oneShot = await applyJudgments(ctxFor(outDir, LLM_CFG), {
    sources: [source],
    judgments: [
      { id: 'reddit:1', relevant: true, score: 0.9 },
      { id: 'hackernews:2', relevant: false, score: 0.1 },
    ],
  });
  // Binds to a valid same-day run (reuses the day's snapshot rather than
  // re-fetching) and renders — the point is it doesn't crash on runDir(undefined).
  assert.equal(oneShot.status, 'ok');
  assert.match(oneShot.runId, /^2026-07-02-\d+$/);

  // A bare judgmentsPath outside any run dir, no runId, still errors (can't
  // know which snapshot it was judged against).
  const stray = path.join(outDir, 'stray.jsonl');
  fs.writeFileSync(
    stray,
    JSON.stringify({ id: 'reddit:1', relevant: true, score: 1 }) + '\n'
  );
  await assert.rejects(
    () => applyJudgments(ctxFor(outDir, LLM_CFG), { judgmentsPath: stray }),
    /needs a `runId`/
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('SC3: judged-irrelevant high-engagement item never enters Recommended; residual relevant item does', async () => {
  const outDir = tmpOut();
  const topicCfg = {
    output: { require_topic_match: true, max_per_topic: 1, language: 'en' },
    filter: { mode: 'llm', min_relevance: 0.4 },
    topics: [{ name: 'agentic-ai', match: 'any', anchors: ['agent'] }],
    recommended: { enabled: true, max_items: 5 },
  };
  const items = [
    {
      platform: 'reddit',
      id: 'top',
      url: 'https://r/top',
      title: 'agent runtime deep dive',
      metrics: { like: 500 },
    },
    {
      platform: 'reddit',
      id: 'edge',
      url: 'https://r/edge',
      title: 'agent memory tricks',
      metrics: { like: 10 },
    },
    {
      platform: 'rss',
      id: 'promo',
      url: 'https://shop/grill',
      title: 'best grill deals this weekend',
      metrics: { like: 9999 },
    },
  ];
  const { source } = spySource([items]);
  const ctx = ctxFor(outDir, topicCfg);
  const cand = await emitCandidates(ctx, { sources: [source] });
  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:top', relevant: true, score: 0.9, topics: ['agentic-ai'] },
    { id: 'reddit:edge', relevant: true, score: 0.6, topics: ['agentic-ai'] },
    { id: 'rss:promo', relevant: false, score: 0.05 },
  ]);
  const res = await runFullDigest(ctx, { judgmentsPath: jpath });
  const digest = fs.readFileSync(res.digestPath, 'utf8');

  assert.ok(!digest.includes('grill'), 'judged-irrelevant promo stays out');
  // max_per_topic=1 → only one item in the main section; the other relevant
  // item lands in Recommended as the residual.
  const recSection = digest.split('## Recommended')[1] || '';
  assert.ok(recSection.length > 0, 'recommended section rendered');
  const inMain = digest.split('## Recommended')[0];
  const mainHasTop = inMain.includes('https://r/top');
  const residual = mainHasTop ? 'https://r/edge' : 'https://r/top';
  assert.ok(
    recSection.includes(residual),
    'residual relevant item recommended'
  );
  assert.ok(!recSection.includes('grill'));
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('daily state machine: awaiting_judgments → judged → terminal; idempotent replay', async () => {
  const outDir = tmpOut();
  const { source, state } = spySource([BATCH_A, BATCH_B]);
  const ctx = ctxFor(outDir, LLM_CFG);

  const step1 = await daily(ctx, { sources: [source] });
  assert.equal(step1.status, 'awaiting_judgments');
  assert.equal(step1.stage, 'daily');
  assert.ok(step1.runId);
  assert.ok(step1.judgingTask.runId === step1.runId);

  // Repeat call while awaiting: same run, no re-fetch.
  const step1b = await daily(ctx, { sources: [source] });
  assert.equal(step1b.status, 'awaiting_judgments');
  assert.equal(step1b.runId, step1.runId);
  assert.equal(state.count, 1);

  writeJudgments(outDir, step1.runId, [
    { id: 'reddit:1', relevant: true, score: 0.9 },
    { id: 'hackernews:2', relevant: false, score: 0.1 },
  ]);
  const step2 = await daily(ctx, { sources: [source] });
  assert.equal(step2.status, 'ok');
  assert.equal(step2.runId, step1.runId);
  assert.equal(state.count, 1, 'the whole loop used exactly one fetch');
  assert.ok(fs.existsSync(step2.reportPath));
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('daily --no-judge closes the loop in one call under llm config (keyword gate)', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, { ...LLM_CFG, output: {} });
  const res = await daily(ctx, { noJudge: true, sources: [source] });
  assert.equal(res.status, 'ok');
  assert.ok(fs.existsSync(res.digestPath));
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('daily with zero candidates goes terminal (health degraded/warning), never awaits', async () => {
  const outDir = tmpOut();
  const { source } = spySource([[]]);
  const ctx = ctxFor(outDir, LLM_CFG);
  const res = await daily(ctx, { sources: [source] });
  assert.equal(res.status, 'ok');
  assert.notEqual(res.health, 'ok');
  const digest = fs.readFileSync(res.digestPath, 'utf8');
  assert.match(digest, /Source health|数据源健康|No items|暂无内容/);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('keyword full run drops a run snapshot and reports sourceHealth', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, { output: {}, filter: {} });
  const res = await runFullDigest(ctx, { sources: [source] });
  assert.equal(res.status, 'ok');
  assert.equal(res.health, 'ok');
  assert.ok(res.runId);
  assert.ok(fs.existsSync(path.join(outDir, 'runs', res.runId, 'items.jsonl')));
  assert.ok(Array.isArray(res.sourceHealth));
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('sourceHealth: an enabled-but-empty source surfaces as warning in the result and digest header', async () => {
  const outDir = tmpOut();
  const sources = [
    {
      id: 'good',
      enabled: () => true,
      fetch: () => BATCH_A.map((x) => ({ ...x })),
    },
    { id: 'empty', enabled: () => true, fetch: () => [] },
  ];
  const ctx = ctxFor(outDir, { output: { language: 'en' }, filter: {} });
  const res = await runFullDigest(ctx, { sources });
  assert.equal(res.health, 'warning');
  const entry = res.sourceHealth.find((e) => e.platform === 'empty');
  assert.equal(entry.severity, 'warning');
  const digest = fs.readFileSync(res.digestPath, 'utf8');
  assert.match(digest, /Source health/);
  assert.match(digest, /empty/);
  fs.rmSync(outDir, { recursive: true, force: true });
});

// ── Regressions from the high-effort code review (2026-07-02) ────────────────

test('review#1: id-only judgments (missing relevant/score) are malformed, not a silent no-op gate', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, LLM_CFG); // require_topic_match: true (strict)
  const cand = await emitCandidates(ctx, { sources: [source] });
  // Agent forgot relevant/score on every line.
  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:1' },
    { id: 'hackernews:2' },
  ]);
  const report = await validateJudgmentsFile(ctx, jpath);
  assert.equal(report.ok, false, 'id-only judgments fail validation');
  assert.ok(report.counts.malformed >= 2);
  await assert.rejects(
    () => runFullDigest(ctx, { judgmentsPath: jpath }),
    /failed validation/
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('review#2: a truncated JSON-array judgments file is a hard error, not zero judgments', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, LLM_CFG);
  const cand = await emitCandidates(ctx, { sources: [source] });
  // Looks like a JSON array but is truncated mid-object.
  const jpath = writeRaw(
    outDir,
    cand.runId,
    '[{"id":"reddit:1","relevant":true,"score":0.9},{"id"'
  );
  await assert.rejects(
    () => runFullDigest(ctx, { judgmentsPath: jpath }),
    /not valid JSON/
  );
  const report = await validateJudgmentsFile(ctx, jpath);
  assert.equal(report.ok, false);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('review#4: llm-mode keyword fallback (no judgments) renders but warns loudly', async () => {
  const outDir = tmpOut();
  const { source } = spySource([BATCH_A]);
  const ctx = ctxFor(outDir, { ...LLM_CFG, output: {} });
  const res = await runFullDigest(ctx, { sources: [source] });
  assert.equal(res.status, 'ok');
  assert.ok(
    res.warnings.some((w) => /AI relevance filtering did NOT run/.test(w)),
    'the silent keyword degradation is now surfaced as a warning'
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('review#10: a dead feed inside the rss aggregate raises health even when the total is >0', async () => {
  const outDir = tmpOut();
  const rssLike = {
    id: 'rss',
    enabled: () => true,
    fetch: () => ({
      items: [{ platform: 'rss', id: 'a', url: 'https://a', title: 'ok item' }],
      perSource: [
        {
          source: 'rss',
          platform: 'rss',
          fetched: 1,
          feeds: [
            { feed: 'TechCrunch', fetched: 1 },
            { feed: 'Anthropic', fetched: 0, error: '404' },
          ],
        },
      ],
    }),
  };
  const ctx = ctxFor(outDir, { output: { language: 'en' }, filter: {} });
  const res = await runFullDigest(ctx, { sources: [rssLike] });
  assert.equal(res.health, 'warning', 'partial rss outage is not silently ok');
  const entry = res.sourceHealth.find((e) => e.platform === 'rss');
  assert.equal(entry.severity, 'warning');
  assert.match(entry.message, /Anthropic/);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('review#3b: a judged-relevant item with an off-config topic still reaches the reader (Other relevant)', async () => {
  const outDir = tmpOut();
  const cfg = {
    output: { require_topic_match: false, language: 'en' },
    filter: { mode: 'llm', min_relevance: 0.4 },
    topics: [{ name: 'agentic-ai', match: 'any', anchors: ['agent'] }],
    recommended: { enabled: false },
  };
  const items = [
    {
      platform: 'reddit',
      id: 'onlist',
      url: 'https://r/onlist',
      title: 'agent runtime',
    },
    {
      platform: 'rss',
      id: 'offlist',
      url: 'https://x/offlist',
      title: 'anthropic funding round',
    },
  ];
  const { source } = spySource([items]);
  const ctx = ctxFor(outDir, cfg);
  const cand = await emitCandidates(ctx, { sources: [source] });
  // offlist judged relevant but tagged with a topic NOT in cfg.topics.
  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:onlist', relevant: true, score: 0.9, topics: ['agentic-ai'] },
    { id: 'rss:offlist', relevant: true, score: 0.8, topics: ['ai-industry'] },
  ]);
  const res = await runFullDigest(ctx, { judgmentsPath: jpath });
  const digest = fs.readFileSync(res.digestPath, 'utf8');
  assert.match(digest, /Other relevant/);
  assert.ok(
    digest.includes('https://x/offlist'),
    'off-topic relevant item is not dropped'
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('review#3b: a judged-IRRELEVANT off-topic item does NOT leak into Other relevant', async () => {
  const outDir = tmpOut();
  const cfg = {
    output: { require_topic_match: false, language: 'en' },
    filter: { mode: 'llm', min_relevance: 0.4 },
    topics: [{ name: 'agentic-ai', match: 'any', anchors: ['agent'] }],
    recommended: { enabled: false },
  };
  const items = [
    {
      platform: 'reddit',
      id: 'onlist',
      url: 'https://r/onlist',
      title: 'agent runtime',
    },
    {
      platform: 'rss',
      id: 'junk',
      url: 'https://x/junk',
      title: 'grill deals',
    },
  ];
  const { source } = spySource([items]);
  const ctx = ctxFor(outDir, cfg);
  const cand = await emitCandidates(ctx, { sources: [source] });
  const jpath = writeJudgments(outDir, cand.runId, [
    { id: 'reddit:onlist', relevant: true, score: 0.9, topics: ['agentic-ai'] },
    { id: 'rss:junk', relevant: false, score: 0.05 },
  ]);
  const res = await runFullDigest(ctx, { judgmentsPath: jpath });
  const digest = fs.readFileSync(res.digestPath, 'utf8');
  assert.ok(
    !digest.includes('https://x/junk'),
    'irrelevant item stays out of the reader digest'
  );
  fs.rmSync(outDir, { recursive: true, force: true });
});
