export function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function compact(value, prefix = '') {
  const numeric = number(value);
  const absolute = Math.abs(numeric);
  if (absolute >= 1_000_000_000) return `${prefix}${(numeric / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${prefix}${(numeric / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${prefix}${(numeric / 1_000).toFixed(1)}K`;
  return `${prefix}${Math.round(numeric)}`;
}
