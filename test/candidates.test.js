import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateKey,
  buildCandidates,
  serializeCandidates,
  buildJudgingTask,
} from '../src/candidates.js';

test('candidateKey is platform-qualified', () => {
  assert.equal(candidateKey({ platform: 'reddit', id: '1' }), 'reddit:1');
  assert.equal(
    candidateKey({ platform: 'hackernews', id: '1' }),
    'hackernews:1'
  );
});

test('buildCandidates keeps compact fields and qualified id', () => {
  const items = [
    {
      platform: 'reddit',
      id: 'abc',
      url: 'https://r/1',
      title: 'T',
      text: 'body',
    },
  ];
  const [c] = buildCandidates(items);
  assert.equal(c.id, 'reddit:abc');
  assert.equal(c.platform, 'reddit');
  assert.equal(c.url, 'https://r/1');
  assert.equal(c.title, 'T');
  assert.equal(c.text, 'body');
});

test('buildCandidates truncates long text with ellipsis', () => {
  const long = 'x'.repeat(600);
  const [c] = buildCandidates(
    [{ platform: 'p', id: '1', url: 'u://1', text: long }],
    { maxTextLen: 100 }
  );
  assert.equal(c.text.length, 101); // 100 + ellipsis char
  assert.ok(c.text.endsWith('…'));
});

test('buildCandidates omits empty title/text', () => {
  const [c] = buildCandidates([
    { platform: 'p', id: '1', url: 'u://1', text: '   ' },
  ]);
  assert.equal('title' in c, false);
  assert.equal('text' in c, false);
});

test('serializeCandidates emits JSONL with trailing newline', () => {
  const out = serializeCandidates([{ id: 'a' }, { id: 'b' }]);
  assert.equal(out, '{"id":"a"}\n{"id":"b"}\n');
  assert.equal(serializeCandidates([]), '');
});

test('buildJudgingTask is self-contained: profile, topics whitelist, schema, io paths', () => {
  const cfg = {
    filter: {
      profile: 'I care about agentic AI.',
      model: 'claude-haiku-4-5',
      min_relevance: 0.5,
    },
    output: { require_topic_match: true },
    topics: [{ name: 'agentic-ai' }, { name: 'llm-releases' }, { badEntry: 1 }],
  };
  const task = buildJudgingTask({
    cfg,
    date: '2026-07-01',
    count: 42,
    candidatesPath: 'out/candidates-2026-07-01.jsonl',
  });
  assert.equal(task.profile, 'I care about agentic AI.');
  assert.equal(task.model, 'claude-haiku-4-5');
  assert.equal(task.min_relevance, 0.5);
  assert.equal(task.require_topic_match, true);
  assert.deepEqual(task.topics, ['agentic-ai', 'llm-releases']);
  assert.equal(task.count, 42);
  assert.equal(task.candidatesPath, 'out/candidates-2026-07-01.jsonl');
  assert.equal(task.output.path, 'out/judgments-2026-07-01.jsonl');
  // Schema must describe the judgment object the agent has to emit.
  assert.equal(task.judgment_schema.type, 'object');
  assert.ok(task.judgment_schema.properties.id);
  assert.ok(task.judgment_schema.properties.score);
  assert.ok(
    typeof task.instructions === 'string' && task.instructions.length > 0
  );
});

test('buildJudgingTask tolerates missing filter/topics', () => {
  const task = buildJudgingTask({
    cfg: {},
    date: '2026-07-01',
    count: 0,
    candidatesPath: 'out/c.jsonl',
  });
  assert.deepEqual(task.topics, []);
  assert.equal(typeof task.profile, 'string');
  assert.equal(task.min_relevance, 0.5);
});
