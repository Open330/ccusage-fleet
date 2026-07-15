const TOKEN_FIELDS = [
  'inputTokens',
  'outputTokens',
  'cacheCreationTokens',
  'cacheReadTokens',
  'totalTokens',
];

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function mergeModels(target, source) {
  const models = new Set([...(target.modelsUsed ?? []), ...(source.modelsUsed ?? [])]);
  target.modelsUsed = [...models].sort();
}

function mergeModelBreakdowns(target, source) {
  const byModel = new Map((target.modelBreakdowns ?? []).map((item) => [item.modelName, item]));
  for (const item of source.modelBreakdowns ?? []) {
    const modelName = item.modelName ?? 'unknown';
    let current = byModel.get(modelName);
    if (current == null) {
      current = {
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        inputTokens: 0,
        modelName,
        outputTokens: 0,
      };
      byModel.set(modelName, current);
    }
    for (const field of TOKEN_FIELDS.filter((field) => field !== 'totalTokens')) {
      current[field] = number(current[field]) + number(item[field]);
    }
    current.cost = number(current.cost) + number(item.cost);
  }
  target.modelBreakdowns = [...byModel.values()].sort((a, b) => a.modelName.localeCompare(b.modelName));
}

function createRow(period, agent = 'all') {
  return {
    agent,
    agents: [],
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    inputTokens: 0,
    modelBreakdowns: [],
    modelsUsed: [],
    outputTokens: 0,
    period,
    totalCost: 0,
    totalTokens: 0,
  };
}

export function mergeUsage(target, source, includeAgents = true) {
  for (const field of TOKEN_FIELDS) {
    target[field] = number(target[field]) + number(source[field]);
  }
  target.totalCost = number(target.totalCost) + number(source.totalCost);
  mergeModels(target, source);
  mergeModelBreakdowns(target, source);

  if (includeAgents) {
    const byAgent = new Map((target.agents ?? []).map((item) => [item.agent, item]));
    for (const sourceAgent of source.agents ?? []) {
      const name = sourceAgent.agent ?? 'unknown';
      let current = byAgent.get(name);
      if (current == null) {
        current = createRow(target.period, name);
        current.agents = undefined;
        byAgent.set(name, current);
      }
      mergeUsage(current, sourceAgent, false);
    }
    target.agents = [...byAgent.values()].sort((a, b) => a.agent.localeCompare(b.agent));
  }
  return target;
}

function aggregateRows(reports) {
  const byPeriod = new Map();
  for (const { report } of reports) {
    for (const row of report.daily) {
      const period = String(row.period ?? row.date ?? 'unknown');
      let target = byPeriod.get(period);
      if (target == null) {
        target = createRow(period);
        byPeriod.set(period, target);
      }
      mergeUsage(target, row);
    }
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function totalsFromRows(rows) {
  const totals = createRow('total');
  for (const row of rows) {
    mergeUsage(totals, row);
  }
  delete totals.period;
  return totals;
}

export function aggregateFleet(results, settings) {
  const successful = results.filter((result) => result.status === 'ok');
  const daily = aggregateRows(successful);
  const byHost = successful.map((result) => ({
    daily: result.report.daily,
    host: result.host.name,
    totals: result.report.totals ?? totalsFromRows(result.report.daily),
  }));
  return {
    byHost,
    ccusageVersion: settings.ccusageVersion,
    command: 'daily',
    daily,
    generatedAt: new Date().toISOString(),
    hosts: results.map((result) => ({
      durationMs: result.durationMs,
      error: result.error,
      name: result.host.name,
      status: result.status,
      target: result.host.target,
      type: result.host.type,
    })),
    schemaVersion: 1,
    timezone: settings.timezone,
    totals: totalsFromRows(daily),
  };
}
