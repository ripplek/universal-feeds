import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, dispatch } from '../src/mcp/tools.js';

test('TOOLS exposes the four documented tools with JSON-schema inputs', () => {
  const names = TOOLS.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'apply_judgments',
    'emit_candidates',
    'reach_fetch',
    'run_digest',
  ]);
  for (const t of TOOLS) {
    assert.equal(typeof t.description, 'string');
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(typeof t.handler, 'function');
  }
});

test('reach_fetch descriptor requires platform', () => {
  const t = TOOLS.find((x) => x.name === 'reach_fetch');
  assert.deepEqual(t.inputSchema.required, ['platform']);
});

test('dispatch rejects an unknown tool', async () => {
  await assert.rejects(() => dispatch('nope', {}), /Unknown tool/);
});

test('reach_fetch handler validates platform before any I/O', async () => {
  await assert.rejects(
    () => dispatch('reach_fetch', {}),
    /requires `platform`/
  );
});

test('apply_judgments handler requires judgments before rendering', async () => {
  // No judgments/judgmentsPath → hard error, no digest attempted.
  await assert.rejects(
    () =>
      dispatch('apply_judgments', {
        config: 'config/feeds.ci.yaml',
        date: '2026-01-01',
      }),
    /requires `judgments`/
  );
});
