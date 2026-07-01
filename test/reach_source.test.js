import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchViaReach } from '../src/sources/reach.js';

const ready = () => ({
  installed: true,
  ready: true,
  extensionConnected: true,
  version: '1',
});
const notReady = () => ({ installed: false, ready: false });

test('search mode fetches and normalizes to FeedItem[]', async () => {
  let seen = null;
  const yaml =
    '- id: "1"\n  author: bob\n  text: hi\n  url: https://x.com/bob/status/1\n  likes: 5\n';
  const exec = async (args) => {
    seen = args;
    return { stdout: yaml, stderr: '' };
  };
  const items = await fetchViaReach({
    platform: 'twitter',
    query: 'ai',
    mode: 'search',
    exec,
    statusOf: ready,
    fetchedAt: 't',
  });
  assert.deepEqual(seen, ['twitter', 'search', 'ai', '-f', 'yaml']);
  assert.equal(items.length, 1);
  assert.equal(items[0].platform, 'x');
  assert.equal(items[0].sourceType, 'search');
  assert.equal(items[0].source.name, 'reach:twitter');
});

test('feed mode uses the feed command with no query', async () => {
  let seen = null;
  const exec = async (args) => {
    seen = args;
    return { stdout: '[]', stderr: '' };
  };
  await fetchViaReach({
    platform: 'reddit',
    mode: 'feed',
    exec,
    statusOf: ready,
  });
  assert.deepEqual(seen, ['reddit', 'home', '-f', 'yaml']);
});

test('auto mode: query present → search, absent → feed', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    return { stdout: '[]', stderr: '' };
  };
  await fetchViaReach({
    platform: 'bilibili',
    query: 'llm',
    exec,
    statusOf: ready,
  });
  await fetchViaReach({ platform: 'bilibili', exec, statusOf: ready });
  assert.equal(calls[0][1], 'search');
  assert.equal(calls[1][1], 'dynamic');
});

test('unavailable backend → [] (best-effort), no throw', async () => {
  const exec = async () => {
    throw new Error('should not run');
  };
  const items = await fetchViaReach({
    platform: 'twitter',
    query: 'ai',
    exec,
    statusOf: notReady,
  });
  assert.deepEqual(items, []);
});

test('search mode without query → [] and does not exec', async () => {
  let ran = false;
  const exec = async () => {
    ran = true;
    return { stdout: '[]', stderr: '' };
  };
  const items = await fetchViaReach({
    platform: 'twitter',
    mode: 'search',
    exec,
    statusOf: ready,
  });
  assert.deepEqual(items, []);
  assert.equal(ran, false);
});

test('unknown platform throws', async () => {
  await assert.rejects(
    () => fetchViaReach({ platform: 'nope', statusOf: ready }),
    /unknown platform/
  );
});
