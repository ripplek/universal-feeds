import test from 'node:test';
import assert from 'node:assert/strict';
import { rsshubUrl } from '../src/rsshub.js';

test('rsshubUrl joins base + route', () => {
  const cfg = { rsshub: { base_url: 'https://rsshub.app/' } };
  assert.equal(rsshubUrl(cfg, '/telegram/channel/abc'), 'https://rsshub.app/telegram/channel/abc');
});
