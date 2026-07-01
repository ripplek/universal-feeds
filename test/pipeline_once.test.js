import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runFullDigestOnce } from '../src/pipeline.js';

function tmpOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'uf-once-'));
}

// Injected source: counts how many times the pipeline fetches.
function spySource(items) {
  const state = { count: 0 };
  const source = {
    id: 'test',
    enabled: () => true,
    fetch: () => {
      state.count++;
      return items.map((it) => ({ ...it }));
    },
  };
  return { source, state };
}

const ITEMS = [
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

test('runFullDigestOnce fetches sources once and returns the base candidate ids', async () => {
  const { source, state } = spySource(ITEMS);
  const outDir = tmpOut();
  const res = await runFullDigestOnce({
    cfg: { output: {}, filter: {} },
    date: 't',
    outDir,
    sources: [source],
  });

  assert.equal(state.count, 1, 'sources fetched exactly once');
  assert.deepEqual([...res.candidateIds].sort(), ['hackernews:2', 'reddit:1']);
  assert.ok(fs.existsSync(res.itemsPath));
  assert.ok(fs.existsSync(res.digestPath));
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('runFullDigestOnce: rendered ids are a subset of the validated candidate ids (no drift)', async () => {
  const { source, state } = spySource(ITEMS);
  const outDir = tmpOut();
  // Judge one relevant, one not — the strict gate keeps only reddit:1.
  const jpath = path.join(outDir, 'j.jsonl');
  fs.writeFileSync(
    jpath,
    JSON.stringify({ id: 'reddit:1', relevant: true, score: 0.9 }) +
      '\n' +
      JSON.stringify({ id: 'hackernews:2', relevant: false, score: 0.1 }) +
      '\n'
  );
  const cfg = {
    output: { require_topic_match: true },
    filter: { mode: 'llm', min_relevance: 0.5 },
  };

  const res = await runFullDigestOnce({
    cfg,
    date: 't',
    outDir,
    judgmentsPath: jpath,
    sources: [source],
  });

  assert.equal(state.count, 1, 'still a single fetch');
  const rendered = fs
    .readFileSync(res.itemsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const it = JSON.parse(l);
      return `${it.platform}:${it.id}`;
    });

  // The gate kept only the relevant item...
  assert.deepEqual(rendered, ['reddit:1']);
  // ...and validation saw the full base pool the render was derived from, so
  // every rendered id is one the validator checked — no validate/render drift.
  assert.deepEqual([...res.candidateIds].sort(), ['hackernews:2', 'reddit:1']);
  assert.ok(rendered.every((id) => res.candidateIds.includes(id)));
  fs.rmSync(outDir, { recursive: true, force: true });
});
