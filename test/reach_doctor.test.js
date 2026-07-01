import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAll, formatReport } from '../src/reach/doctor.js';

test('checkAll returns an entry per channel', () => {
  const results = checkAll(null, {
    statusOf: () => ({ installed: false, ready: false }),
  });
  assert.ok(results.twitter && results.reddit && results.xiaohongshu);
  assert.equal(results.twitter.status, 'off');
});

test('checkAll survives a throwing check (degrades to error)', () => {
  const results = checkAll(null, {
    statusOf: () => {
      throw new Error('boom');
    },
  });
  assert.equal(results.twitter.status, 'error');
  assert.match(results.twitter.message, /boom/);
});

test('formatReport renders legend and ready count', () => {
  const results = checkAll(null, {
    statusOf: () => ({
      installed: true,
      ready: true,
      extensionConnected: true,
      version: '1',
    }),
  });
  const report = formatReport(results);
  assert.match(report, /reach status/);
  assert.match(report, /channels ready/);
  assert.match(report, /✅ twitter/);
});
