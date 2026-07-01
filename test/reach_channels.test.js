import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canHandle,
  orderedBackends,
  checkChannel,
} from '../src/reach/channels/base.js';
import { getAllChannels, getChannel } from '../src/reach/channels/index.js';

const twitter = getChannel('twitter');

test('canHandle matches host and subdomains', () => {
  assert.equal(canHandle(twitter, 'https://x.com/a/status/1'), true);
  assert.equal(canHandle(twitter, 'https://mobile.twitter.com/a'), true);
  assert.equal(canHandle(twitter, 'https://example.com/x.com'), false);
  assert.equal(canHandle(twitter, 'not a url'), false);
});

test('every channel has required fields', () => {
  for (const c of getAllChannels()) {
    assert.ok(c.name && c.platform && c.description, `${c.name} fields`);
    assert.ok(
      Array.isArray(c.backends) && c.backends.length,
      `${c.name} backends`
    );
    assert.ok(
      c.commands && Object.keys(c.commands).length,
      `${c.name} commands`
    );
  }
});

test('orderedBackends honors <name>_backend override', () => {
  const ch = { name: 'demo', backends: ['A', 'OpenCLI', 'C'] };
  const cfg = { get: (k) => (k === 'demo_backend' ? 'OpenCLI' : null) };
  assert.deepEqual(orderedBackends(ch, cfg), ['OpenCLI', 'A', 'C']);
});

test('orderedBackends ignores unknown override', () => {
  const ch = { name: 'demo', backends: ['A', 'B'] };
  const cfg = { get: () => 'ZZZ' };
  assert.deepEqual(orderedBackends(ch, cfg), ['A', 'B']);
});

test('checkChannel: OpenCLI ready → ok with active backend', () => {
  const r = checkChannel(twitter, null, {
    statusOf: () => ({
      installed: true,
      ready: true,
      extensionConnected: true,
      version: '1',
    }),
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.activeBackend, 'OpenCLI');
});

test('checkChannel: OpenCLI installed but not ready → warn', () => {
  const r = checkChannel(twitter, null, {
    statusOf: () => ({ installed: true, ready: false, hint: 'need extension' }),
  });
  assert.equal(r.status, 'warn');
  assert.match(r.message, /extension/);
});

test('checkChannel: OpenCLI missing → off, no active backend', () => {
  const r = checkChannel(twitter, null, {
    statusOf: () => ({ installed: false, ready: false }),
  });
  assert.equal(r.status, 'off');
  assert.equal(r.activeBackend, null);
});

test('checkChannel: OpenCLI broken → error', () => {
  const r = checkChannel(twitter, null, {
    statusOf: () => ({
      installed: true,
      broken: true,
      ready: false,
      hint: 'broken',
    }),
  });
  assert.equal(r.status, 'error');
});
