function compactNumber(value) {
  const number = Number(value) || 0;
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(Math.round(number));
}

function cost(value, noCost) {
  return noCost ? '—' : `$${(Number(value) || 0).toFixed(2)}`;
}

function agents(row) {
  const values = (row.agents ?? []).map((item) => item.agent).filter(Boolean);
  return values.length > 0 ? values.join(',') : row.agent === 'all' ? '—' : row.agent;
}

function pad(value, width, right = false) {
  const text = String(value);
  return right ? text.padStart(width) : text.padEnd(width);
}

function renderRows(rows) {
  const headers = ['Date', 'Host', 'Agents', 'Input', 'Output', 'Cache Create', 'Cache Read', 'Tokens', 'Cost'];
  const widths = [10, 14, 18, 9, 9, 12, 11, 9, 10];
  const lines = [];
  lines.push(headers.map((value, index) => pad(value, widths[index], index >= 3)).join('  '));
  lines.push(widths.map((width) => '─'.repeat(width)).join('──'));
  for (const { host, row } of rows) {
    const values = [
      row.period,
      host,
      agents(row),
      compactNumber(row.inputTokens),
      compactNumber(row.outputTokens),
      compactNumber(row.cacheCreationTokens),
      compactNumber(row.cacheReadTokens),
      compactNumber(row.totalTokens),
      row.formattedCost,
    ];
    lines.push(values.map((value, index) => pad(value, widths[index], index >= 3)).join('  '));
  }
  return lines.join('\n');
}

export function renderFleetTable(fleet, settings) {
  const hostMap = new Map(fleet.byHost.map((entry) => [entry.host, entry.daily]));
  const rows = [];
  for (const aggregate of fleet.daily) {
    rows.push({ host: 'ALL', row: { ...aggregate, formattedCost: cost(aggregate.totalCost, settings.noCost) } });
    if (settings.byHost) {
      for (const host of settings.hosts) {
        const hostRow = (hostMap.get(host.name) ?? []).find((row) => row.period === aggregate.period);
        if (hostRow) {
          rows.push({
            host: host.name,
            row: { ...hostRow, formattedCost: cost(hostRow.totalCost, settings.noCost) },
          });
        }
      }
    }
  }

  const ok = fleet.hosts.filter((host) => host.status === 'ok').length;
  const failed = fleet.hosts.filter((host) => host.status === 'error').length;
  const title = `ccusage Fleet Daily · ${ok}/${fleet.hosts.length} hosts · ${fleet.timezone}`;
  const output = [title, '', rows.length > 0 ? renderRows(rows) : 'No usage data found.'];
  if (failed > 0) {
    output.push('', `${failed} host(s) failed; see stderr or use --json for details.`);
  }
  return output.join('\n');
}
