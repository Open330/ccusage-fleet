import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFleetGraph } from '../src/graph.js';

const fleet = {
  command: 'daily',
  daily: [
    { period: '2026-07-14', totalCost: 25, totalTokens: 500 },
    { period: '2026-07-15', totalCost: 50, totalTokens: 1000 },
  ],
};

test('renders a proportional day-bucket token graph', () => {
  const output = renderFleetGraph(fleet, { graphMetric: 'tokens', noCost: false }, 100);
  assert.match(output, /Total tokens over time · day buckets · total 1\.5K · peak 1\.0K/);
  assert.match(output, /2026-07-14/);
  assert.match(output, /████/);
  assert.match(output, /░/);
  assert.match(output, /╭─/);
});

test('supports cost-scaled graphs', () => {
  const output = renderFleetGraph(fleet, { graphMetric: 'cost', noCost: false }, 100);
  assert.match(output, /Cost over time/);
  assert.match(output, /total \$75/);
});

test('uses the active report bucket label', () => {
  for (const [command, bucket] of [['weekly', 'week'], ['monthly', 'month']]) {
    const report = { command, [command]: fleet.daily };
    const output = renderFleetGraph(report, { graphMetric: 'tokens', noCost: false }, 100);
    assert.match(output, new RegExp(`${bucket} buckets`));
  }
});
