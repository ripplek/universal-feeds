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
  return cfg;
}
