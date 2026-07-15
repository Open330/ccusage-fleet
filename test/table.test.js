import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFleetTable } from '../src/table.js';

const agent = {
  agent: 'claude',
  cacheCreationTokens: 3000,
  cacheReadTokens: 4000,
  inputTokens: 1000,
  modelsUsed: ['claude-opus-4-8'],
  outputTokens: 2000,
  totalCost: 12.34,
  totalTokens: 10000,
};
const daily = {
  ...agent,
  agent: 'all',
  agents: [agent],
  period: '2026-07-15',
};
const fleet = {
  byHost: [{ daily: [daily], host: 'rtzr', totals: daily }],
  command: 'daily',
  daily: [daily],
  hosts: [{ name: 'rtzr', status: 'ok' }],
  timezone: 'Asia/Seoul',
  totals: daily,
};

test('renders ccusage-style agent table with models and totals', () => {
  const output = renderFleetTable(fleet, { groupBy: 'agent', noCost: false }, 180);
  assert.match(output, /Grouped by Agent/);
  assert.match(output, /┌─/);
  assert.match(output, /│ Date/);
  assert.match(output, /- Claude/);
  assert.match(output, /- opus-4-8/);
  assert.match(output, /10,000/);
  assert.match(output, /\$12\.34/);
  assert.match(output, /Total/);
});

test('renders device detail rows', () => {
  const output = renderFleetTable(fleet, { groupBy: 'device', noCost: true }, 180);
  assert.match(output, /Grouped by Device/);
  assert.match(output, /│ Device/);
  assert.match(output, /- rtzr/);
});

test('renders totals only', () => {
  const output = renderFleetTable(fleet, { groupBy: 'none', noCost: false }, 180);
  assert.match(output, /Totals only/);
  assert.doesNotMatch(output, /- Claude/);
});

test('renders weekly and monthly period headers', () => {
  for (const [command, header] of [['weekly', 'Week'], ['monthly', 'Month']]) {
    const report = {
      ...fleet,
      byHost: [{ [command]: [daily], host: 'rtzr', totals: daily }],
      command,
      [command]: [daily],
    };
    const output = renderFleetTable(report, { groupBy: 'agent', noCost: false }, 180);
    assert.match(output, new RegExp(`Fleet ${command.charAt(0).toUpperCase()}${command.slice(1)}`));
    assert.match(output, new RegExp(`│ ${header}`));
  }
});
