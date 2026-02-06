import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchXFollowing } from '../src/sources/x_bird.js';

test('fetchXFollowing passes --timeout to bird when timeoutMs is set', async () => {
  const seen = [];
  const execBird = async (args) => {
    seen.push(args);
    return { stdout: '[]', stderr: '' };
  };

  await fetchXFollowing({ limit: 5, mode: 'following', fetchedAt: 'x', timeoutMs: 60000, execBird });
  assert.equal(seen.length, 1);
  const args = seen[0];
  const i = args.indexOf('--timeout');
  assert.ok(i >= 0);
  assert.equal(args[i + 1], '60000');
});

test('fetchXFollowing does not pass --timeout when timeoutMs is 0', async () => {
  const seen = [];
  const execBird = async (args) => {
    seen.push(args);
    return { stdout: '[]', stderr: '' };
  };

  await fetchXFollowing({ limit: 5, mode: 'following', fetchedAt: 'x', timeoutMs: 0, execBird });
  const args = seen[0];
  assert.equal(args.includes('--timeout'), false);
});
