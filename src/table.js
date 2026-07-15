const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatNumber(value) {
  return NUMBER_FORMAT.format(Math.round(number(value)));
}

function formatCost(value, noCost) {
  return noCost ? '—' : `$${number(value).toFixed(2)}`;
}

function titleCase(value) {
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function displayModelName(value) {
  return String(value).replace(/^claude-/, '');
}

function modelLines(row) {
  const models = row.modelsUsed ?? row.modelBreakdowns?.map((item) => item.modelName) ?? [];
  return [...new Set(models)].sort().map((model) => `- ${displayModelName(model)}`);
}

function usageCells(row, noCost) {
  return {
    cacheCreate: formatNumber(row.cacheCreationTokens),
    cacheRead: formatNumber(row.cacheReadTokens),
    cost: formatCost(row.totalCost, noCost),
    input: formatNumber(row.inputTokens),
    output: formatNumber(row.outputTokens),
    total: formatNumber(row.totalTokens),
  };
}

function detailRowsForPeriod(fleet, aggregate, groupBy) {
  if (groupBy === 'agent') {
    return (aggregate.agents ?? []).map((agent) => ({
      label: titleCase(agent.agent),
      row: agent,
    }));
  }
  if (groupBy === 'device') {
    return fleet.byHost.flatMap((host) => {
      const row = host[fleet.command].find((candidate) => candidate.period === aggregate.period);
      return row == null ? [] : [{ label: host.host, row }];
    });
  }
  return [];
}

function tableRows(fleet, settings) {
  const rows = [];
  for (const aggregate of fleet[fleet.command]) {
    rows.push({
      date: aggregate.period,
      group: 'All',
      models: [],
      ...usageCells(aggregate, settings.noCost),
    });
    for (const detail of detailRowsForPeriod(fleet, aggregate, settings.groupBy)) {
      rows.push({
        date: '',
        group: `- ${detail.label}`,
        models: modelLines(detail.row),
        ...usageCells(detail.row, settings.noCost),
      });
    }
  }
  rows.push({
    date: 'Total',
    group: '',
    models: [],
    ...usageCells(fleet.totals, settings.noCost),
  });
  return rows;
}

function truncate(value, width) {
  const text = String(value);
  if (text.length <= width) return text;
  if (width <= 1) return '…';
  return `${text.slice(0, width - 1)}…`;
}

function cellLines(value) {
  if (Array.isArray(value)) return value.length > 0 ? value.map(String) : [''];
  return String(value ?? '').split('\n');
}

function chooseWidths(columns, rows, terminalWidth) {
  const overhead = columns.length * 3 + 1;
  const available = Math.max(80, terminalWidth) - overhead;
  const widths = columns.map((column) => {
    const natural = Math.max(
      column.header.length,
      ...rows.flatMap((row) => cellLines(row[column.key]).map((line) => line.length)),
    );
    return Math.min(column.max, Math.max(column.min, natural));
  });

  while (widths.reduce((sum, width) => sum + width, 0) > available) {
    let candidate = -1;
    let slack = 0;
    for (let index = 0; index < columns.length; index += 1) {
      const currentSlack = widths[index] - columns[index].min;
      if (currentSlack > slack) {
        candidate = index;
        slack = currentSlack;
      }
    }
    if (candidate === -1) break;
    widths[candidate] -= 1;
  }
  return widths;
}

function border(left, middle, right, widths) {
  return `${left}${widths.map((width) => '─'.repeat(width + 2)).join(middle)}${right}`;
}

function renderLogicalRow(row, columns, widths) {
  const values = columns.map((column) => cellLines(row[column.key]));
  const height = Math.max(...values.map((lines) => lines.length));
  const output = [];
  for (let lineIndex = 0; lineIndex < height; lineIndex += 1) {
    const cells = values.map((lines, index) => {
      const value = truncate(lines[lineIndex] ?? '', widths[index]);
      const padded = columns[index].align === 'right'
        ? value.padStart(widths[index])
        : value.padEnd(widths[index]);
      return ` ${padded} `;
    });
    output.push(`│${cells.join('│')}│`);
  }
  return output;
}

function renderTable(rows, groupBy, command, terminalWidth) {
  const groupHeader = groupBy === 'device' ? 'Device' : groupBy === 'agent' ? 'Agent' : 'Group';
  const periodHeader = command === 'weekly' ? 'Week' : command === 'monthly' ? 'Month' : 'Date';
  const columns = [
    { key: 'date', header: periodHeader, min: 10, max: 10 },
    { key: 'group', header: groupHeader, min: 9, max: 16 },
    { key: 'models', header: 'Models', min: 14, max: 30 },
    { key: 'input', header: 'Input', min: 8, max: 18, align: 'right' },
    { key: 'output', header: 'Output', min: 8, max: 16, align: 'right' },
    { key: 'cacheCreate', header: 'Cache Create', min: 12, max: 18, align: 'right' },
    { key: 'cacheRead', header: 'Cache Read', min: 10, max: 20, align: 'right' },
    { key: 'total', header: 'Total Tokens', min: 12, max: 20, align: 'right' },
    { key: 'cost', header: 'Cost', min: 9, max: 12, align: 'right' },
  ];
  const widths = chooseWidths(columns, rows, terminalWidth);
  const output = [border('┌', '┬', '┐', widths)];
  const header = Object.fromEntries(columns.map((column) => [column.key, column.header]));
  output.push(...renderLogicalRow(header, columns, widths));
  output.push(border('├', '┼', '┤', widths));
  rows.forEach((row, index) => {
    output.push(...renderLogicalRow(row, columns, widths));
    output.push(index === rows.length - 1
      ? border('└', '┴', '┘', widths)
      : border('├', '┼', '┤', widths));
  });
  return output.join('\n');
}

export function renderFleetTable(fleet, settings, terminalWidth = process.stdout.columns ?? 160) {
  const ok = fleet.hosts.filter((host) => host.status === 'ok').length;
  const failed = fleet.hosts.filter((host) => host.status === 'error').length;
  const grouping = settings.groupBy === 'none' ? 'Totals only' : `Grouped by ${titleCase(settings.groupBy)}`;
  const reportName = titleCase(fleet.command);
  const title = `ccusage Fleet ${reportName} · ${grouping} · ${ok}/${fleet.hosts.length} hosts · ${fleet.timezone}`;
  const output = [title, ''];
  output.push(fleet[fleet.command].length > 0
    ? renderTable(tableRows(fleet, settings), settings.groupBy, fleet.command, terminalWidth)
    : 'No usage data found.');
  if (failed > 0) {
    output.push('', `${failed} host(s) failed; see stderr or use --json for details.`);
  }
  return output.join('\n');
}
