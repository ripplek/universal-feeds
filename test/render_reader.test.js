import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReaderDigest } from '../src/render.js';

const baseCfg = {
  output: { language: 'en', max_per_topic: 10 },
  topics: [{ name: 't1' }, { name: 't2' }],
  entities: [],
};

test('reader view strips internal metadata and decodes entities', () => {
  const items = [
    {
      platform: 'rss',
      url: 'u1',
      title: 'Anthropic&#8217;s model',
      tags: ['t1', 'ai'],
      score: 1.17,
      debug: { tagHits: { t1: ['context window'] } },
      publishedAt: '2026-07-01T00:00:00Z',
    },
  ];
  const md = renderReaderDigest(items, {
    cfg: baseCfg,
    date: '2026-07-01',
    fetchedAt: '2026-07-01T08:24:27.079Z',
  });
  assert.ok(md.includes('Anthropic’s model'), 'entity decoded in title');
  assert.ok(!md.includes('&#8217;'));
  assert.ok(!/\(score/i.test(md), 'no score');
  assert.ok(!md.includes('(hits:'), 'no keyword hits');
  assert.ok(!md.includes('[t1'), 'no tag list');
  assert.ok(!md.includes('[rss]'), 'no platform code prefix');
});

test('reader body excludes items that matched no topic (noise gate)', () => {
  const items = [
    { platform: 'rss', url: 'u1', title: 'matched', tags: ['t1'], score: 1 },
    {
      platform: 'bilibili',
      url: 'u2',
      title: 'noise clip',
      tags: ['fun'],
      score: 0.35,
    },
  ];
  const md = renderReaderDigest(items, {
    cfg: baseCfg,
    date: 'd',
    fetchedAt: 'x',
  });
  assert.ok(md.includes('matched'));
  assert.ok(!md.includes('noise clip'));
  assert.ok(!md.includes('u2'));
});

test('multi-topic item appears once, under first topic in config order', () => {
  const items = [
    { platform: 'rss', url: 'u1', title: 'both', tags: ['t2', 't1'], score: 1 },
  ];
  const md = renderReaderDigest(items, {
    cfg: baseCfg,
    date: 'd',
    fetchedAt: 'x',
  });
  assert.equal((md.match(/u1/g) || []).length, 1, 'rendered exactly once');
  const idxT1 = md.indexOf('## t1');
  const idxT2 = md.indexOf('## t2');
  const idxItem = md.indexOf('u1');
  assert.ok(idxT1 !== -1 && idxT1 < idxItem, 'under t1 section');
  assert.ok(idxT2 === -1 || idxItem < idxT2, 'not under t2');
});

test('recommended section rendered, deduped by url, respects enabled flag', () => {
  const items = [
    { platform: 'rss', url: 'u1', title: 'body item', tags: ['t1'], score: 1 },
  ];
  const recommended = [
    { platform: 'rss', url: 'u1', title: 'body dup', tags: ['t1'], score: 1 },
    { platform: 'reddit', url: 'u9', title: 'rec item', tags: [], score: 5 },
  ];
  const md = renderReaderDigest(items, {
    cfg: baseCfg,
    date: 'd',
    fetchedAt: 'x',
    recommended,
  });
  assert.ok(md.includes('rec item'), 'fresh recommended item shown');
  assert.equal(
    (md.match(/u1/g) || []).length,
    1,
    'body url not repeated in rec'
  );
  assert.ok(!md.includes('body dup'));

  const cfg2 = { ...baseCfg, recommended: { enabled: false } };
  const md2 = renderReaderDigest(items, {
    cfg: cfg2,
    date: 'd',
    fetchedAt: 'x',
    recommended,
  });
  assert.ok(!md2.includes('rec item'), 'recommended suppressed when disabled');
});

test('no coverage/highlights/platform sections; empty input is safe', () => {
  const md = renderReaderDigest([], {
    cfg: baseCfg,
    date: 'd',
    fetchedAt: 'x',
  });
  assert.equal(typeof md, 'string');
  assert.ok(!md.includes('Topic coverage'));
  assert.ok(!md.includes('Topic highlights'));
  assert.ok(!md.includes('By Topic'));
  assert.ok(!md.includes('by platform'));
});

test('publishedAt shown when present, no fabricated time when missing', () => {
  const items = [
    {
      platform: 'rss',
      url: 'u1',
      title: 'dated',
      tags: ['t1'],
      score: 1,
      publishedAt: '2026-06-30T09:00:00Z',
    },
    { platform: 'rss', url: 'u2', title: 'undated', tags: ['t1'], score: 1 },
  ];
  const md = renderReaderDigest(items, {
    cfg: baseCfg,
    date: 'd',
    fetchedAt: 'x',
  });
  assert.ok(md.includes('2026-06-30'), 'known date rendered');
});

test('entity-only item grouped under entities fallback, not excluded', () => {
  const cfg = {
    output: { language: 'en' },
    topics: [{ name: 't1' }],
    entities: [{ name: 'Acme' }],
  };
  const items = [
    {
      platform: 'rss',
      url: 'u1',
      title: 'about acme',
      tags: ['entity:Acme', 'entities-news'],
      score: 1,
    },
  ];
  const md = renderReaderDigest(items, { cfg, date: 'd', fetchedAt: 'x' });
  assert.ok(md.includes('about acme'));
  assert.ok(md.includes('u1'));
});

test('reader view strips internal source annotations from titles', () => {
  const items = [
    {
      platform: 'rss',
      url: 'u1',
      title: '机器之心（公众号合集，__biz+album）',
      tags: ['t1'],
      score: 1,
    },
  ];
  const md = renderReaderDigest(items, {
    cfg: baseCfg,
    date: 'd',
    fetchedAt: 'x',
  });
  assert.ok(md.includes('机器之心'));
  assert.ok(!md.includes('__biz'), 'internal annotation stripped');
});

test('reader view prefers titleTranslated over original title', () => {
  const items = [
    {
      platform: '36kr',
      url: 'u1',
      title: '刚刚，Fable 5 全球解禁',
      titleTranslated: 'Fable 5 unlocked globally',
      tags: ['t1'],
      score: 1,
      publishedAt: '2026-07-01T00:00:00Z',
    },
  ];
  const md = renderReaderDigest(items, {
    cfg: baseCfg,
    date: '2026-07-01',
    fetchedAt: '2026-07-01T08:24:27.079Z',
  });
  assert.ok(md.includes('Fable 5 unlocked globally'), 'uses translated title');
  assert.ok(!md.includes('全球解禁'), 'original title not rendered');
});
