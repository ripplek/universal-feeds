import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllSources, SOURCES } from '../src/fetch_sources.js';

test('fetchAllSources aggregates enabled sources in order', async () => {
  const sources = [
    { id: 'a', enabled: () => true, fetch: () => [{ id: 1 }, { id: 2 }] },
    { id: 'b', enabled: () => false, fetch: () => [{ id: 3 }] },
    { id: 'c', enabled: () => true, fetch: async () => [{ id: 4 }] },
  ];
  const { items, perSource } = await fetchAllSources({}, {}, sources);
  assert.deepEqual(
    items.map((x) => x.id),
    [1, 2, 4]
  );
  assert.deepEqual(
    perSource.map((p) => [p.source, p.fetched]),
    [
      ['a', 2],
      ['c', 1],
    ]
  );
});

test('a throwing source is isolated and captured as a structured error', async () => {
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
  const { items, perSource } = await fetchAllSources({}, {}, sources);
  assert.deepEqual(
    items.map((x) => x.id),
    [9]
  );
  const boom = perSource.find((p) => p.source === 'boom');
  assert.equal(boom.fetched, 0);
  assert.match(boom.error, /down/);
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
  const { items } = await fetchAllSources({}, {}, sources);
  assert.deepEqual(
    items.map((x) => x.id),
    [2]
  );
});

test('non-array fetch result yields a zero-count perSource entry', async () => {
  const sources = [
    { id: 'weird', enabled: () => true, fetch: () => null },
    { id: 'ok', enabled: () => true, fetch: () => [{ id: 1 }] },
  ];
  const { items, perSource } = await fetchAllSources({}, {}, sources);
  assert.deepEqual(
    items.map((x) => x.id),
    [1]
  );
  const weird = perSource.find((p) => p.source === 'weird');
  assert.equal(weird.fetched, 0);
});

test('a source may return {items, perSource} for per-channel detail', async () => {
  const sources = [
    {
      id: 'multi',
      enabled: () => true,
      fetch: () => ({
        items: [{ id: 1 }],
        perSource: [
          { source: 'multi', platform: 'ch-a', channel: 'ch-a', fetched: 1 },
          {
            source: 'multi',
            platform: 'ch-b',
            channel: 'ch-b',
            fetched: 0,
            outcome: 'unavailable',
          },
        ],
      }),
    },
  ];
  const { items, perSource } = await fetchAllSources({}, {}, sources);
  assert.equal(items.length, 1);
  assert.equal(perSource.length, 2);
  assert.equal(perSource[1].outcome, 'unavailable');
});

test('SOURCES registry has the expected ids in dedup order', () => {
  assert.deepEqual(
    SOURCES.map((s) => s.id),
    ['x', 'rss', 'v2ex', 'reach']
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
