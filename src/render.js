import { decodeEntities } from './text.js';
import { candidateKey } from './candidates.js';
import { capDiversity } from './recommend.js';

function h(cfg, en, zh) {
  return cfg?.output?.language === 'zh' ? zh : en;
}

function fmtItem(item, cfg) {
  const title = item.title?.trim();
  const text = item.text?.trim();
  const head = title || (text ? text.slice(0, 140) : '(no text)');
  const author = item.author?.handle || item.author?.name;
  const score = typeof item.score === 'number' ? item.score.toFixed(2) : '';
  const tags = (item.tags || []).length
    ? ` [${(item.tags || []).join(', ')}]`
    : '';
  const plat = item.platform ? `${item.platform}` : '';

  let hit = '';
  const hits = item?.debug?.tagHits;
  if (hits && typeof hits === 'object') {
    const flat = [];
    for (const k of Object.keys(hits)) {
      const arr = hits[k];
      if (Array.isArray(arr)) for (const w of arr) flat.push(w);
    }
    const unique = [...new Set(flat)].slice(0, 3);
    if (unique.length) {
      hit =
        cfg?.output?.language === 'zh'
          ? `（命中: ${unique.join(' / ')}）`
          : ` (hits: ${unique.join(' / ')})`;
    }
  }

  const link = item?.debug?.unfurl?.finalUrl;
  const extra = link && link !== item.url ? `\n  Link: ${link}` : '';
  return `- [${plat}] ${head}${author ? ` — ${author}` : ''}${tags} (score ${score})${hit}\n  ${item.url}${extra}`;
}

function topicLabel(cfg, name) {
  const mapEn = {
    openclaw: 'OpenClaw / Clawdbot',
    'ai-model-releases': 'AI model releases',
    'ai-model-releases-official': 'AI model releases (official)',
    'ai-model-releases-community': 'AI model releases (community)',
    'agentic-ai': 'Agentic AI / workflows',
    'entities-news': 'Entities / companies',
  };
  const mapZh = {
    openclaw: 'OpenClaw / Clawdbot 动态',
    'ai-model-releases': 'AI 模型发布/更新',
    'ai-model-releases-official': 'AI 模型发布/更新（官方）',
    'ai-model-releases-community': 'AI 模型发布/更新（社区）',
    'agentic-ai': 'Agentic AI / 工作流',
    'entities-news': '实体 / 公司',
  };
  const m = cfg?.output?.language === 'zh' ? mapZh : mapEn;
  return m[name] || name;
}

function capPerSource(items, { maxPerSource = 0 } = {}) {
  const n = Number.isFinite(maxPerSource) ? maxPerSource : 0;
  if (!n || n <= 0) return items;

  const counts = new Map();
  const out = [];
  for (const it of items) {
    const key =
      it?.source?.name ||
      it?.source?.pack ||
      it?.author?.handle ||
      it?.author?.name ||
      it?.platform ||
      'unknown';
    const c = counts.get(key) || 0;
    if (c >= n) continue;
    counts.set(key, c + 1);
    out.push(it);
  }
  return out;
}

// Human-readable platform label for the reader view (the inspection view keeps
// its own platform list, which also drives grouping order).
function platformLabel(cfg, platform) {
  const map = {
    x: h(cfg, 'X', 'X'),
    rss: h(cfg, 'RSS', 'RSS'),
    v2ex: 'V2EX',
    youtube: 'YouTube',
    reddit: 'Reddit',
    hackernews: 'Hacker News',
    bilibili: 'Bilibili',
    weibo: h(cfg, 'Weibo', '微博'),
    xiaohongshu: h(cfg, 'Xiaohongshu', '小红书'),
    tiktok: 'TikTok',
    instagram: 'Instagram',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    xueqiu: h(cfg, 'Xueqiu', '雪球'),
    producthunt: 'Product Hunt',
    '36kr': h(cfg, '36Kr', '36氪'),
    juejin: h(cfg, 'Juejin', '掘金'),
    substack: 'Substack',
    github: 'GitHub',
    arxiv: 'arXiv',
    lobsters: 'Lobsters',
    devto: 'DEV',
    lesswrong: 'LessWrong',
    stackoverflow: 'Stack Overflow',
    aibase: 'AIbase',
    openreview: 'OpenReview',
    toutiao: h(cfg, 'Toutiao', '今日头条'),
    zhihu: h(cfg, 'Zhihu', '知乎'),
    medium: 'Medium',
    jike: h(cfg, 'Jike', '即刻'),
    'linux-do': 'LINUX DO',
    'google-scholar': 'Google Scholar',
    dblp: 'dblp',
    pubmed: 'PubMed',
    bbc: 'BBC',
    bloomberg: 'Bloomberg',
  };
  return map[platform] || platform || '';
}

// Absolute publish date (YYYY-MM-DD) for the reader view, or '' when unknown —
// never fabricate a time for undated items.
function readerDate(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}

function readerTime(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return iso || '';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

// Decode HTML entities and drop internal source annotations like
// `（公众号合集，__biz+album）` that leak in through some feed titles.
function readerText(s) {
  const decoded = decodeEntities((s || '').trim());
  return decoded
    .replace(/[（(][^（）()]*(?:__biz|公众号合集)[^（）()]*[）)]/g, '')
    .trim();
}

function fmtReaderItem(item, cfg) {
  // Prefer the judge's translated title (output.translate) so the reader digest
  // is single-language; fall back to the original when absent.
  const title = readerText(item.titleTranslated || item.title);
  const text = readerText(item.text);
  const head = title || (text ? text.slice(0, 140) : '(no title)');
  const author = item.author?.handle || item.author?.name;
  const meta = [platformLabel(cfg, item.platform), readerDate(item.publishedAt)]
    .filter(Boolean)
    .join(', ');
  const link = displayUrl(item);
  return `- ${head}${author ? ` — ${readerText(author)}` : ''}${meta ? ` (${meta})` : ''}\n  ${link}`;
}

// The URL a reader actually sees (unfurled when available). Dedup must key on
// THIS, not the raw item.url — two items with different raw urls can unfurl to
// the same article and would otherwise both render.
function displayUrl(item) {
  return item?.debug?.unfurl?.finalUrl || item.url || '';
}

// Select the reader view's topic sections and report exactly what got
// rendered (ids + urls), so the recommended residual can be computed against
// the real main list — business selection lives here, not in the Markdown
// emitter below.
export function selectReaderSections(items, cfg) {
  const topics = Array.isArray(cfg?.topics) ? cfg.topics : [];
  const topicNames = topics.map((t) => t.name).filter(Boolean);
  const perTopic = cfg?.output?.max_per_topic || 8;
  const ENT_TOPIC = 'entities-news';

  // Assign each item to a single primary topic (first configured topic it hits,
  // in declaration order). Items with no topic but an entity match fall to the
  // entities group; items with neither are noise and never reach the reader.
  const groups = new Map();
  for (const n of topicNames) groups.set(n, []);
  const entityItems = [];
  // Judge-approved items that match no configured topic/entity. Kept (not
  // dropped) so a relevant item the agent tagged with an off-list topic still
  // reaches the reader — see assemble.js `readerRelevant`.
  const otherRelevant = [];
  for (const it of Array.isArray(items) ? items : []) {
    const tags = it.tags || [];
    const primary = topicNames.find((n) => tags.includes(n));
    if (primary) {
      groups.get(primary).push(it);
      continue;
    }
    const hasEntity =
      tags.includes(ENT_TOPIC) ||
      tags.some((t) => typeof t === 'string' && t.startsWith('entity:'));
    if (hasEntity) {
      entityItems.push(it);
      continue;
    }
    if (it?.debug?.readerRelevant === true) otherRelevant.push(it);
  }

  const sections = [];
  for (const n of topicNames) {
    const g = groups.get(n).slice(0, perTopic);
    if (g.length) sections.push({ label: topicLabel(cfg, n), items: g });
  }
  if (entityItems.length) {
    sections.push({
      label: topicLabel(cfg, ENT_TOPIC),
      items: entityItems.slice(0, perTopic),
    });
  }
  if (otherRelevant.length) {
    sections.push({
      label: h(cfg, 'Other relevant', '其他相关'),
      items: otherRelevant.slice(0, perTopic),
    });
  }

  const renderedIds = new Set();
  const renderedUrls = new Set();
  for (const s of sections) {
    for (const it of s.items) {
      renderedIds.add(candidateKey(it));
      const u = displayUrl(it);
      if (u) renderedUrls.add(u);
    }
  }
  return { sections, renderedIds, renderedUrls };
}

// Reader-facing digest: clean, deduplicated, organized by topic. Distinct from
// renderDigestMarkdown (the inspection view) — no scores, tag lists, keyword
// hits, coverage counts, or platform dump. Same pure (items, cfg) → Markdown
// contract, so it's exercised the same way as the inspection renderer.
// `recommendedJudged`: recommended is the uncapped judged-passing pool — take
// the residual (dual-key: id AND url) and apply the section's own caps here.
// `healthLine`: precomputed source-health summary rendered under the header.
export function renderReaderDigest(
  items,
  {
    cfg,
    date,
    fetchedAt,
    recommended = [],
    recommendedJudged = false,
    healthLine = '',
  }
) {
  const title = h(cfg, `Daily Digest — ${date}`, `每日简报 — ${date}`);
  const genLabel = h(cfg, 'Generated', '生成时间');
  let md = `# ${title}\n\n${genLabel}: ${readerTime(fetchedAt)}\n\n`;
  if (healthLine) md += `> ${healthLine}\n\n`;

  const { sections, renderedIds, renderedUrls } = selectReaderSections(
    items,
    cfg
  );

  for (const s of sections) {
    md += `## ${s.label}\n\n`;
    for (const it of s.items) {
      md += fmtReaderItem(it, cfg) + '\n';
    }
    md += `\n`;
  }
  if (!sections.length) {
    md += h(cfg, '_No items today._\n\n', '_今日暂无内容。_\n\n');
  }

  const recEnabled = cfg?.recommended?.enabled !== false;
  if (recEnabled && Array.isArray(recommended) && recommended.length) {
    let rec = recommended.filter((it) => {
      const u = displayUrl(it);
      return u && !renderedUrls.has(u) && !renderedIds.has(candidateKey(it));
    });
    if (recommendedJudged) {
      const rcfg = cfg?.recommended || {};
      rec = capDiversity(rec, {
        maxPerSource: rcfg.max_per_source ?? 2,
        maxPerDomain: rcfg.max_per_domain ?? 3,
      }).slice(0, rcfg.max_items ?? 10);
    }
    if (rec.length) {
      // An explicitly unfiltered pool is labeled as such — the reader must
      // never mistake an engagement-only list for AI-judged content.
      const label =
        cfg?.recommended?.unfiltered === true
          ? h(cfg, 'Unfiltered Trending (24h)', '未过滤热榜（24h）')
          : h(cfg, 'Recommended (24h)', '推荐（24h）');
      md += `## ${label}\n\n`;
      md += rec.map((it) => fmtReaderItem(it, cfg)).join('\n') + '\n';
    }
  }

  return md;
}

export function renderDigestMarkdown(
  items,
  { cfg, date, fetchedAt, recommended = [] }
) {
  const title = h(cfg, `Daily Digest — ${date}`, `每日简报 — ${date}`);
  const subtitle = h(cfg, `Fetched at: ${fetchedAt}`, `抓取时间：${fetchedAt}`);

  const sectionTopics = h(cfg, 'By Topic', '按主题');
  const sectionCoverage = h(cfg, 'Topic coverage', '主题覆盖');
  const sectionEntityCoverage = h(cfg, 'Entities coverage', '实体覆盖');
  const sectionHighlights = h(cfg, 'Topic highlights', '主题要点');
  const requireTopic = cfg?.output?.require_topic_match === true;
  const sectionAll = requireTopic
    ? h(
        cfg,
        'All matched items (topic-only view)',
        '全部命中条目（仅主题视图）'
      )
    : h(cfg, 'All Items (by platform)', '全部条目（按平台）');

  let md = `# ${title}\n\n${subtitle}\n\n`;

  // Topic groups (MVP: based on tags)
  const topics = Array.isArray(cfg?.topics) ? cfg.topics : [];
  const perTopic = cfg?.output?.max_per_topic || 8;
  const maxPerSourcePerTopic = cfg?.ranking?.max_per_source_per_topic || 0;
  if (topics.length) {
    // Coverage section
    md += `## ${sectionCoverage}\n\n`;
    const groupedByTopic = new Map();
    for (const t of topics) {
      const name = t.name;
      if (!name) continue;
      const groupedAll = items.filter((x) => (x.tags || []).includes(name));
      if (!groupedAll.length) continue;
      groupedByTopic.set(name, groupedAll);

      const byPlatform = groupedAll.reduce((acc, it) => {
        acc[it.platform] = (acc[it.platform] || 0) + 1;
        return acc;
      }, {});
      const parts = Object.entries(byPlatform)
        .sort((a, b) => b[1] - a[1])
        .map(([p, n]) => `${p}:${n}`)
        .join(', ');
      md += `- ${topicLabel(cfg, name)}: ${groupedAll.length} (${parts})\n`;
    }
    md += `\n`;

    // Entities coverage
    const entities = Array.isArray(cfg?.entities) ? cfg.entities : [];
    if (entities.length) {
      const lines = [];
      for (const e of entities) {
        const en = e?.name;
        if (!en) continue;
        const tag = `entity:${en}`;
        const hits = items.filter((x) => (x.tags || []).includes(tag));
        if (!hits.length) continue;
        const byPlatform = hits.reduce((acc, it) => {
          acc[it.platform] = (acc[it.platform] || 0) + 1;
          return acc;
        }, {});
        const parts = Object.entries(byPlatform)
          .sort((a, b) => b[1] - a[1])
          .map(([p, n]) => `${p}:${n}`)
          .join(', ');
        lines.push(`- ${en}: ${hits.length} (${parts})`);
      }

      if (lines.length) {
        md += `## ${sectionEntityCoverage}\n\n`;
        md += lines.join('\n') + '\n\n';
      }
    }

    // Highlights (cheap extractive bullets)
    md += `## ${sectionHighlights}\n\n`;
    for (const [name, groupedAll] of groupedByTopic.entries()) {
      const top = capPerSource(groupedAll, {
        maxPerSource: maxPerSourcePerTopic,
      }).slice(0, 2);
      if (!top.length) continue;
      md += `- ${topicLabel(cfg, name)}\n`;
      for (const it of top) {
        const title = it.title?.trim();
        const text = it.text?.trim();
        const head = title || (text ? text.slice(0, 90) : '');
        md += `  - [${it.platform}] ${head}\n`;
      }
    }
    md += `\n`;

    md += `## ${sectionTopics}\n\n`;
    for (const t of topics) {
      const name = t.name;
      if (!name) continue;
      const grouped = capPerSource(
        items.filter((x) => (x.tags || []).includes(name)),
        { maxPerSource: maxPerSourcePerTopic }
      ).slice(0, perTopic);
      if (!grouped.length) continue;
      md += `### ${topicLabel(cfg, name)}\n\n`;
      md += grouped.map((it) => fmtItem(it, cfg)).join('\n') + '\n\n';
    }
  }

  md += `## ${sectionAll}\n\n`;
  if (!items.length) {
    md += h(cfg, '_No items._\n', '_暂无内容。_\n');
    return md;
  }

  if (requireTopic) {
    // In topic-only view, avoid duplicating platform blocks.
    md += h(
      cfg,
      '_Note: Only items matching configured topics are included. See **By Topic** above._\n',
      '_说明：仅包含命中已配置主题的条目，详见上方 **按主题**。_\n'
    );

    const recEnabled = cfg?.recommended?.enabled !== false;
    if (recEnabled && Array.isArray(recommended) && recommended.length) {
      md += `\n\n## ${h(cfg, 'Recommended (24h, profile-based)', '推荐（24h，基于画像）')}\n\n`;
      md += recommended.map((it) => fmtItem(it, cfg)).join('\n') + '\n';
    }

    return md;
  }

  const platforms = [
    ['x', h(cfg, 'X (Following)', 'X（关注）')],
    ['rss', h(cfg, 'Media (RSS)', '媒体（RSS）')],
    ['v2ex', 'V2EX'],
    ['youtube', 'YouTube'],
    // Reach-layer platforms (OpenCLI browser bridge).
    ['reddit', 'Reddit'],
    ['hackernews', 'Hacker News'],
    ['bilibili', 'Bilibili'],
    ['weibo', h(cfg, 'Weibo', '微博')],
    ['xiaohongshu', h(cfg, 'Xiaohongshu', '小红书')],
    ['tiktok', 'TikTok'],
    ['instagram', 'Instagram'],
    ['facebook', 'Facebook'],
    ['linkedin', 'LinkedIn'],
    ['xueqiu', h(cfg, 'Xueqiu', '雪球')],
    ['producthunt', 'Product Hunt'],
    ['36kr', h(cfg, '36Kr', '36氪')],
    ['juejin', h(cfg, 'Juejin', '掘金')],
    ['substack', 'Substack'],
    ['github', 'GitHub'],
    ['arxiv', 'arXiv'],
    ['lobsters', 'Lobsters'],
    ['devto', 'DEV'],
    ['lesswrong', 'LessWrong'],
    ['stackoverflow', 'Stack Overflow'],
    ['aibase', 'AIbase'],
    ['openreview', 'OpenReview'],
    ['toutiao', h(cfg, 'Toutiao', '今日头条')],
    ['zhihu', h(cfg, 'Zhihu', '知乎')],
    ['medium', 'Medium'],
    ['jike', h(cfg, 'Jike', '即刻')],
    ['linux-do', 'LINUX DO'],
    ['google-scholar', 'Google Scholar'],
    ['dblp', 'dblp'],
    ['pubmed', 'PubMed'],
    ['bbc', 'BBC'],
    ['bloomberg', 'Bloomberg'],
  ];

  for (const [p, label] of platforms) {
    const group = items.filter((x) => x.platform === p);
    if (!group.length) continue;
    md += `### ${label}\n\n`;
    md += group.map((it) => fmtItem(it, cfg)).join('\n') + '\n\n';
  }

  // Any other platforms
  const known = new Set(platforms.map(([p]) => p));
  const other = items.filter((x) => !known.has(x.platform));
  if (other.length) {
    md += `### ${h(cfg, 'Other', '其他')}\n\n`;
    md += other.map((it) => fmtItem(it, cfg)).join('\n') + '\n\n';
  }

  return md;
}
