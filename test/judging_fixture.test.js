import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseJudgments, validateJudgments } from '../src/judgments.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'examples', 'judging');

// The shipped fixture must round-trip: an agent that copies its shape produces
// judgments the digest accepts. If this breaks, the docs/example are stale.
test('examples/judging fixture validates cleanly with full coverage', () => {
  const candidateIds = fs
    .readFileSync(path.join(dir, 'candidates-sample.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);

  const judgments = parseJudgments(
    fs.readFileSync(path.join(dir, 'judgments-sample.jsonl'), 'utf8')
  );

  const report = validateJudgments(judgments, {
    candidateIds,
    minRelevance: 0.5,
  });

  assert.equal(report.ok, true, JSON.stringify(report.warnings));
  assert.equal(report.counts.unjudged, 0);
  assert.equal(report.counts.valid, candidateIds.length);
});
