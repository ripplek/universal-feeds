function h(cfg, en, zh) {
  return cfg?.output?.language === 'zh' ? zh : en;
}

function fmtItem(item) {
  const title = item.title?.trim();
  const text = item.text?.trim();
  const head = title || (text ? text.slice(0, 140) : '(no text)');
  const author = item.author?.handle || item.author?.name;
  const score = typeof item.score === 'number' ? item.score.toFixed(2) : '';
  const tags = (item.tags || []).length ? ` [${(item.tags || []).join(', ')}]` : '';
  return `- ${head}${author ? ` — ${author}` : ''}${tags} (score ${score})\n  ${item.url}`;
}

function topicLabel(cfg, name) {
  const mapEn = {
    openclaw: 'OpenClaw / Clawdbot',
    'ai-model-releases': 'AI model releases'
  };
  const mapZh = {
    openclaw: 'OpenClaw / Clawdbot 动态',
    'ai-model-releases': 'AI 模型发布/更新'
  };
  const m = cfg?.output?.language === 'zh' ? mapZh : mapEn;
  return m[name] || name;
}

export function renderDigestMarkdown(items, { cfg, date, fetchedAt }) {
  const title = h(cfg, `Daily Digest — ${date}`, `每日简报 — ${date}`);
  const subtitle = h(cfg, `Fetched at: ${fetchedAt}`, `抓取时间：${fetchedAt}`);

  const sectionTopics = h(cfg, 'By Topic', '按主题');
  const sectionAll = h(cfg, 'All Items', '全部条目');

  let md = `# ${title}\n\n${subtitle}\n\n`;

  // Topic groups (MVP: based on tags)
  const topics = Array.isArray(cfg?.topics) ? cfg.topics : [];
  if (topics.length) {
    md += `## ${sectionTopics}\n\n`;
    for (const t of topics) {
      const name = t.name;
      if (!name) continue;
      const grouped = items.filter((x) => (x.tags || []).includes(name));
      if (!grouped.length) continue;
      md += `### ${topicLabel(cfg, name)}\n\n`;
      md += grouped.map(fmtItem).join('\n') + '\n\n';
    }
  }

  md += `## ${sectionAll}\n\n`;
  if (!items.length) {
    md += h(cfg, '_No items._\n', '_暂无内容。_\n');
  } else {
    md += items.map(fmtItem).join('\n') + '\n';
  }

  return md;
}
