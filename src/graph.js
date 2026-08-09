import { compact, number } from './format.js';

const METRICS = new Map([
  ['cost', { key: 'totalCost', prefix: '$', title: 'Cost' }],
  ['output', { key: 'outputTokens', prefix: '', title: 'Output tokens' }],
  ['tokens', { key: 'totalTokens', prefix: '', title: 'Total tokens' }],
]);

function bar(value, peak, width) {
  if (value <= 0 || peak <= 0) return ' '.repeat(width);
  const scaled = Math.min(width, (value / peak) * width);
  let full = Math.floor(scaled);
  const fraction = scaled - full;
  const partials = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  const partialIndex = Math.round(fraction * 8);
  if (partialIndex === 8) {
    full += 1;
  }
  const partial = full < width ? partials[partialIndex] ?? '' : '';
  const used = Math.min(width, full + (partial ? 1 : 0));
  return `${'█'.repeat(Math.min(full, width))}${partial}${'░'.repeat(width - used)}`;
}

function pad(value, width, right = false) {
  const text = String(value);
  return right ? text.padStart(width) : text.padEnd(width);
}

function border(left, middle, right, widths, fill = '─') {
  return `${left}${widths.map((width) => fill.repeat(width + 2)).join(middle)}${right}`;
}

export function renderFleetGraph(fleet, settings, terminalWidth = process.stdout.columns ?? 120) {
  const rows = fleet[fleet.command];
  const bucketName = fleet.command === 'weekly' ? 'week' : fleet.command === 'monthly' ? 'month' : 'day';
  const metric = METRICS.get(settings.graphMetric) ?? METRICS.get('tokens');
  const values = rows.map((row) => number(row[metric.key]));
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(0, ...values);
  const metricValue = (value) => compact(value, metric.prefix);
  const title = `${metric.title} over time · ${bucketName} buckets · total ${metricValue(total)} · peak ${metricValue(peak)}`;

  const widths = [10, 10, 10, Math.max(16, Math.min(60, terminalWidth - 46))];
  const output = [title, border('╭', '┬', '╮', widths)];
  const headers = ['BUCKET', settings.graphMetric === 'output' ? 'OUTPUT' : 'TOKENS', 'COST', 'DISTRIBUTION'];
  output.push(`│ ${headers.map((header, index) => pad(header, widths[index])).join(' ┆ ')} │`);
  output.push(border('╞', '╪', '╡', widths, '═'));
  for (const row of rows) {
    const cells = [
      pad(row.period, widths[0]),
      pad(compact(settings.graphMetric === 'output' ? row.outputTokens : row.totalTokens), widths[1], true),
      pad(settings.noCost ? '—' : compact(row.totalCost, '$'), widths[2], true),
      bar(number(row[metric.key]), peak, widths[3]),
    ];
    output.push(`│ ${cells.join(' ┆ ')} │`);
  }
  output.push(border('╰', '┴', '╯', widths));
  return output.join('\n');
}
