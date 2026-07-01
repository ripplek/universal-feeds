// Reach-layer credential/config store.
//
// Ported from Agent-Reach (github.com/Panniantong/Agent-Reach, MIT).
// Stored at ~/.universal-feeds/config.yaml with 0o600 permissions. This is
// SEPARATE from the digest's feeds.yaml — it holds machine-local settings such
// as per-channel backend overrides and (optionally) API keys, never checked in.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const SENSITIVE_MARKERS = [
  'key',
  'token',
  'password',
  'proxy',
  'cookie',
  'secret',
  'session',
  'sessdata',
  'csrf',
  'auth',
  'cred',
  'ct0',
];

export function defaultConfigPath() {
  return path.join(os.homedir(), '.universal-feeds', 'config.yaml');
}

export class ReachConfig {
  constructor(configPath = defaultConfigPath()) {
    this.configPath = configPath;
    this.data = {};
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      this.data = YAML.parse(raw) || {};
    } catch {
      this.data = {};
    }
    return this;
  }

  save() {
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Create with 0o600 from the start to avoid a world-readable race window.
    const fd = fs.openSync(this.configPath, 'w', 0o600);
    try {
      fs.writeSync(fd, YAML.stringify(this.data));
    } finally {
      fs.closeSync(fd);
    }
    // Enforce perms even if the file pre-existed with a looser mode.
    try {
      fs.chmodSync(this.configPath, 0o600);
    } catch {
      /* windows */
    }
  }

  // File value first, then env var (UPPER_SNAKE of the key), then default.
  get(key, fallback = undefined) {
    if (key in this.data) return this.data[key];
    const env = process.env[key.toUpperCase()];
    if (env) return env;
    return fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return this;
  }

  delete(key) {
    delete this.data[key];
    this.save();
    return this;
  }

  // Config as a dict with sensitive values masked — safe for `doctor` output.
  toMaskedDict() {
    const out = {};
    for (const [k, v] of Object.entries(this.data)) {
      const sensitive = SENSITIVE_MARKERS.some((m) =>
        k.toLowerCase().includes(m)
      );
      out[k] = sensitive ? (v ? `${String(v).slice(0, 8)}...` : null) : v;
    }
    return out;
  }
}
