export function rsshubUrl(cfg, route) {
  const base = cfg?.rsshub?.base_url || 'https://rsshub.app';
  const b = base.replace(/\/+$/, '');
  const r = String(route || '').replace(/^\/+/, '');
  return `${b}/${r}`;
}
