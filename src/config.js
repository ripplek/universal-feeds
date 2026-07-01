import fs from 'node:fs';
import YAML from 'yaml';

export function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const cfg = YAML.parse(raw);
  if (!cfg.output) cfg.output = {};
  if (!cfg.output.language) cfg.output.language = 'en';
  if (!cfg.output.max_items) cfg.output.max_items = 30;
  if (!cfg.output.recency_hours) cfg.output.recency_hours = 24;
  if (!cfg.platforms) cfg.platforms = {};

  // AI relevance filtering (see docs/FILTERING.md). Defaults keep the legacy
  // keyword gate so zero-config / CI / offline runs are unaffected.
  if (!cfg.filter) cfg.filter = {};
  if (!cfg.filter.mode) cfg.filter.mode = 'keyword'; // keyword | llm | hybrid
  if (typeof cfg.filter.min_relevance !== 'number')
    cfg.filter.min_relevance = 0.5;
  if (typeof cfg.filter.max_text_len !== 'number')
    cfg.filter.max_text_len = 500;
  if (!cfg.filter.model) cfg.filter.model = 'claude-haiku-4-5';

  return cfg;
}
