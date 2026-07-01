import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllSources, SOURCES } from '../src/fetch_sources.js';

test('fetchAllSources aggregates enabled sources in order', async () => {
  const sources = [
    { id: 'a', enabled: () => true, fetch: () => [{ id: 1 }, { id: 2 }] },
    { id: 'b', enabled: () => false, fetch: () => [{ id: 3 }] },
    { id: 'c', enabled: () => true, fetch: async () => [{ id: 4 }] },
  ];
  const out = await fetchAllSources({}, {}, sources);
  assert.deepEqual(
    out.map((x) => x.id),
    [1, 2, 4]
  );
});

test('a throwing source is isolated (best-effort) — others still contribute', async () => {
  const sources = [
    {
      id: 'boom',
      enabled: () => true,
      fetch: () => {
        throw new Error('down');
      },
    },
    { id: 'ok', enabled: () => true, fetch: () => [{ id: 9 }] },
  ];
  const out = await fetchAllSources({}, {}, sources);
  assert.deepEqual(
    out.map((x) => x.id),
    [9]
  );
});

test('a throwing enabled() predicate does not abort the run', async () => {
  const sources = [
    {
      id: 'bad',
      enabled: () => {
        throw new Error('cfg');
      },
      fetch: () => [{ id: 1 }],
    },
    { id: 'ok', enabled: () => true, fetch: () => [{ id: 2 }] },
  ];
  const out = await fetchAllSources({}, {}, sources);
  assert.deepEqual(
    out.map((x) => x.id),
    [2]
  );
});

test('non-array fetch result is ignored', async () => {
  const sources = [
    { id: 'weird', enabled: () => true, fetch: () => null },
    { id: 'ok', enabled: () => true, fetch: () => [{ id: 1 }] },
  ];
  const out = await fetchAllSources({}, {}, sources);
  assert.deepEqual(
    out.map((x) => x.id),
    [1]
  );
});

test('SOURCES registry has the expected ids in dedup order', () => {
  assert.deepEqual(
    SOURCES.map((s) => s.id),
    ['x', 'rss', 'wechat', 'v2ex', 'youtube', 'reach']
  );
});

test('SOURCES enabled predicates gate on config', () => {
  const byId = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
  assert.ok(!byId.x.enabled({}));
  assert.ok(
    byId.x.enabled({
      platforms: { x: { enabled: true, sources: ['following'] } },
    })
  );
  assert.ok(
    !byId.rss.enabled({
      platforms: { rss: { enabled: true, sources: ['other'] } },
    })
  );
  assert.ok(
    byId.rss.enabled({
      platforms: { rss: { enabled: true, sources: ['trending'] } },
    })
  );
  assert.ok(!byId.reach.enabled({ platforms: {} }));
});
