import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCommand } from '../src/reach/probe.js';

test('classifies missing command', () => {
  const r = probeCommand({ cmd: 'nope', run: () => ({ notFound: true }) });
  assert.equal(r.status, 'missing');
});

test('classifies broken (exec failed)', () => {
  const r = probeCommand({
    cmd: 'x',
    pkg: 'pkg-x',
    run: () => ({ execFailed: true }),
  });
  assert.equal(r.status, 'broken');
  assert.match(r.hint, /pkg-x/);
});

test('classifies broken via 127 exit code', () => {
  const r = probeCommand({
    cmd: 'x',
    run: () => ({ code: 127, stdout: '', stderr: '' }),
  });
  assert.equal(r.status, 'broken');
});

test('classifies timeout', () => {
  const r = probeCommand({ cmd: 'x', run: () => ({ timedOut: true }) });
  assert.equal(r.status, 'timeout');
});

test('classifies ok and trims output', () => {
  const r = probeCommand({
    cmd: 'x',
    run: () => ({ code: 0, stdout: '  hi\n', stderr: '' }),
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.output, 'hi');
});

test('classifies non-zero exit as error with output', () => {
  const r = probeCommand({
    cmd: 'x',
    run: () => ({ code: 1, stdout: 'boom', stderr: '' }),
  });
  assert.equal(r.status, 'error');
  assert.equal(r.output, 'boom');
});

test('retries transient error then succeeds', () => {
  let n = 0;
  const run = () =>
    n++ === 0
      ? { code: 1, stdout: '', stderr: '' }
      : { code: 0, stdout: 'ok', stderr: '' };
  const r = probeCommand({ cmd: 'x', retries: 1, run });
  assert.equal(r.status, 'ok');
  assert.equal(n, 2);
});

test('does not retry missing', () => {
  let n = 0;
  const run = () => {
    n++;
    return { notFound: true };
  };
  probeCommand({ cmd: 'x', retries: 3, run });
  assert.equal(n, 1);
});
