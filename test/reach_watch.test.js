import test from 'node:test';
import assert from 'node:assert/strict';
import { watchReport } from '../src/reach/watch.js';

const allOk = {
  twitter: { status: 'ok' },
  reddit: { status: 'ok' },
};

test('all ready + engine connected → ok true', () => {
  const { lines, ok } = watchReport({
    results: allOk,
    opencli: {
      installed: true,
      broken: false,
      version: '1.8.5',
      extensionConnected: true,
    },
  });
  assert.equal(ok, true);
  assert.match(lines[0], /2\/2 channels ready/);
  assert.ok(
    lines.some((l) => /opencli: v1\.8\.5 \(extension connected\)/.test(l))
  );
});

test('lists non-ok channels', () => {
  const { lines, ok } = watchReport({
    results: { twitter: { status: 'ok' }, linkedin: { status: 'off' } },
    opencli: { installed: true, version: '1' },
  });
  assert.equal(ok, true); // one ready is enough for engine-ok
  assert.ok(lines.some((l) => /linkedin: off/.test(l)));
});

test('opencli missing → ok false', () => {
  const { ok, lines } = watchReport({
    results: allOk,
    opencli: { installed: false },
  });
  assert.equal(ok, false);
  assert.ok(lines.some((l) => /NOT INSTALLED/.test(l)));
});

test('opencli broken → ok false', () => {
  const { ok, lines } = watchReport({
    results: allOk,
    opencli: { installed: true, broken: true },
  });
  assert.equal(ok, false);
  assert.ok(lines.some((l) => /BROKEN/.test(l)));
});

test('zero channels ready → ok false', () => {
  const { ok } = watchReport({
    results: { twitter: { status: 'off' } },
    opencli: { installed: true, version: '1' },
  });
  assert.equal(ok, false);
});

test('update available line shown only on version drift', () => {
  const withUpdate = watchReport({
    results: allOk,
    opencli: { installed: true, version: '1.8.5' },
    update: { current: '1.8.5', latest: '1.9.0' },
  });
  assert.ok(withUpdate.lines.some((l) => /1\.8\.5 → 1\.9\.0/.test(l)));

  const sameVer = watchReport({
    results: allOk,
    opencli: { installed: true, version: '1.8.5' },
    update: { current: '1.8.5', latest: '1.8.5' },
  });
  assert.equal(
    sameVer.lines.some((l) => /→/.test(l)),
    false
  );
});
