import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReachConfig } from '../src/reach/config.js';

function tmpCfg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-reach-'));
  return path.join(dir, 'config.yaml');
}

test('set/get round-trips and persists to disk', () => {
  const p = tmpCfg();
  new ReachConfig(p).set('twitter_backend', 'OpenCLI');
  assert.equal(new ReachConfig(p).get('twitter_backend'), 'OpenCLI');
});

test('writes file with 0o600 permissions', () => {
  const p = tmpCfg();
  new ReachConfig(p).set('secret_token', 'abc');
  const mode = fs.statSync(p).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('env var fallback (UPPER_SNAKE) when key absent', () => {
  const p = tmpCfg();
  process.env.REACH_TEST_KEY = 'from-env';
  try {
    assert.equal(new ReachConfig(p).get('reach_test_key'), 'from-env');
  } finally {
    delete process.env.REACH_TEST_KEY;
  }
});

test('file value wins over env var', () => {
  const p = tmpCfg();
  process.env.REACH_TEST_KEY2 = 'env';
  try {
    new ReachConfig(p).set('reach_test_key2', 'file');
    assert.equal(new ReachConfig(p).get('reach_test_key2'), 'file');
  } finally {
    delete process.env.REACH_TEST_KEY2;
  }
});

test('missing file loads to empty, no throw', () => {
  const c = new ReachConfig(
    path.join(os.tmpdir(), 'uf-does-not-exist', 'x.yaml')
  );
  assert.deepEqual(c.data, {});
  assert.equal(c.get('anything', 'def'), 'def');
});

test('toMaskedDict masks sensitive keys only', () => {
  const p = tmpCfg();
  const c = new ReachConfig(p);
  c.set('twitter_auth_token', 'supersecretvalue');
  c.set('twitter_backend', 'OpenCLI');
  const masked = c.toMaskedDict();
  assert.equal(masked.twitter_auth_token, 'supersec...');
  assert.equal(masked.twitter_backend, 'OpenCLI');
});
