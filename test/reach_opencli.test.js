import test from 'node:test';
import assert from 'node:assert/strict';
import {
  opencliStatus,
  coerceRows,
  runOpenCli,
} from '../src/reach/backends/opencli.js';

function fakeProbe(map) {
  return ({ args }) => map[args.join(' ')] || { status: 'missing' };
}

test('opencliStatus: missing when opencli not installed', () => {
  const st = opencliStatus({ probe: fakeProbe({}) });
  assert.equal(st.installed, false);
  assert.equal(st.ready, false);
});

test('opencliStatus: broken install', () => {
  const st = opencliStatus({
    probe: fakeProbe({ '--version': { status: 'broken', output: '' } }),
  });
  assert.equal(st.broken, true);
  assert.equal(st.ready, false);
});

test('opencliStatus: connected extension → ready', () => {
  const st = opencliStatus({
    probe: fakeProbe({
      '--version': { status: 'ok', output: 'v1.8.5' },
      'daemon status': {
        status: 'ok',
        output: 'Daemon: running (PID 1)\nExtension: connected',
      },
    }),
    extOnDisk: () => false,
  });
  assert.equal(st.extensionConnected, true);
  assert.equal(st.ready, true);
  assert.equal(st.version, '1.8.5');
});

test('opencliStatus: extension asleep but on disk → ready', () => {
  const st = opencliStatus({
    probe: fakeProbe({
      '--version': { status: 'ok', output: 'v1.8.5' },
      'daemon status': {
        status: 'ok',
        output: 'Daemon: running\nExtension: disconnected',
      },
    }),
    extOnDisk: () => true,
  });
  assert.equal(st.extensionConnected, false);
  assert.equal(st.extensionInstalled, true);
  assert.equal(st.ready, true);
});

test('opencliStatus: extension never installed → not ready + hint', () => {
  const st = opencliStatus({
    probe: fakeProbe({
      '--version': { status: 'ok', output: 'v1.8.5' },
      'daemon status': {
        status: 'ok',
        output: 'Daemon: running\nExtension: disconnected',
      },
    }),
    extOnDisk: () => false,
  });
  assert.equal(st.ready, false);
  assert.match(st.hint, /extension is missing/i);
});

test('coerceRows handles array, wrapped, and junk', () => {
  assert.deepEqual(coerceRows([{ a: 1 }]), [{ a: 1 }]);
  assert.deepEqual(coerceRows({ items: [{ a: 1 }] }), [{ a: 1 }]);
  assert.deepEqual(coerceRows({ data: [{ b: 2 }] }), [{ b: 2 }]);
  assert.deepEqual(coerceRows({ nope: 1 }), []);
  assert.deepEqual(coerceRows(null), []);
});

test('runOpenCli builds argv: platform cmd query --limit -f yaml', async () => {
  let seen = null;
  const exec = async (args) => {
    seen = args;
    return { stdout: '[]', stderr: '' };
  };
  await runOpenCli({
    platform: 'twitter',
    cmd: 'search',
    query: 'ai',
    limit: 20,
    exec,
  });
  assert.deepEqual(seen, [
    'twitter',
    'search',
    'ai',
    '--limit',
    '20',
    '-f',
    'yaml',
  ]);
});

test('runOpenCli omits query/limit when absent', async () => {
  let seen = null;
  const exec = async (args) => {
    seen = args;
    return { stdout: '[]', stderr: '' };
  };
  await runOpenCli({ platform: 'reddit', cmd: 'home', exec });
  assert.deepEqual(seen, ['reddit', 'home', '-f', 'yaml']);
});

test('runOpenCli parses YAML rows', async () => {
  const yaml =
    '- title: A\n  url: https://a/1\n- title: B\n  url: https://a/2\n';
  const exec = async () => ({ stdout: yaml, stderr: '' });
  const rows = await runOpenCli({ platform: 'reddit', cmd: 'home', exec });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'A');
});

test('runOpenCli throws on non-YAML output', async () => {
  const exec = async () => ({ stdout: ':\n:::not yaml:::\n  - [', stderr: '' });
  await assert.rejects(
    () => runOpenCli({ platform: 'x', cmd: 'search', query: 'q', exec }),
    /not YAML|not a/i
  );
});
