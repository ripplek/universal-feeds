function h(cfg, en, zh) {
  return cfg?.output?.language === 'zh' ? zh : en;
}

function fmtItem(item, cfg) {
  const title = item.title?.trim();
  const text = item.text?.trim();
  const head = title || (text ? text.slice(0, 140) : '(no text)');
  const author = item.author?.handle || item.author?.name;
  const score = typeof item.score === 'number' ? item.score.toFixed(2) : '';
  const tags = (item.tags || []).length ? ` [${(item.tags || []).join(', ')}]` : '';
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
      hit = cfg?.output?.language === 'zh'
        ? `（命中: ${unique.join(' / ')}）`
        : ` (hits: ${unique.join(' / ')})`;
    }
  }

  return `- [${plat}] ${head}${author ? ` — ${author}` : ''}${tags} (score ${score})${hit}\n  ${item.url}`;
}

function topicLabel(cfg, name) {
  const mapEn = {
    'wechat-following': 'WeChat (following)',
    openclaw: 'OpenClaw / Clawdbot',
    'ai-model-releases-official': 'AI model releases (official)',
    'ai-model-releases-community': 'AI model releases (community)',
    'agentic-ai': 'Agentic AI / workflows'
  };
  const mapZh = {
    'wechat-following': '微信公众号（关注）',
    openclaw: 'OpenClaw / Clawdbot 动态',
    'ai-model-releases-official': 'AI 模型发布/更新（官方）',
    'ai-model-releases-community': 'AI 模型发布/更新（社区）',
    'agentic-ai': 'Agentic AI / 工作流'
  };
  const m = cfg?.output?.language === 'zh' ? mapZh : mapEn;
  return m[name] || name;
}

export function renderDigestMarkdown(items, { cfg, date, fetchedAt }) {
  const title = h(cfg, `Daily Digest — ${date}`, `每日简报 — ${date}`);
  const subtitle = h(cfg, `Fetched at: ${fetchedAt}`, `抓取时间：${fetchedAt}`);

  const sectionTopics = h(cfg, 'By Topic', '按主题');
  const sectionCoverage = h(cfg, 'Topic coverage', '主题覆盖');
  const sectionHighlights = h(cfg, 'Topic highlights', '主题要点');
  const requireTopic = cfg?.output?.require_topic_match === true;
  const sectionAll = requireTopic
    ? h(cfg, 'All matched items (topic-only view)', '全部命中条目（仅主题视图）')
    : h(cfg, 'All Items (by platform)', '全部条目（按平台）');

  let md = `# ${title}\n\n${subtitle}\n\n`;

  // Topic groups (MVP: based on tags)
  const topics = Array.isArray(cfg?.topics) ? cfg.topics : [];
  const perTopic = cfg?.output?.max_per_topic || 8;
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

    // Highlights (cheap extractive bullets)
    md += `## ${sectionHighlights}\n\n`;
    for (const [name, groupedAll] of groupedByTopic.entries()) {
      const top = groupedAll.slice(0, 2);
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
      const grouped = items.filter((x) => (x.tags || []).includes(name)).slice(0, perTopic);
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
    return md;
  }

  const platforms = [
    ['x', h(cfg, 'X (Following)', 'X（关注）')],
    ['rss', h(cfg, 'Media (RSS)', '媒体（RSS）')],
    ['v2ex', 'V2EX'],
    ['youtube', 'YouTube']
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
