import assert from 'node:assert/strict';
import test from 'node:test';

import { aggregateFleet } from '../src/aggregate.js';

function result(host, agent, inputTokens, totalCost) {
  return {
    durationMs: 10,
    host: { name: host, target: host === 'localhost' ? undefined : host, type: host === 'localhost' ? 'local' : 'ssh' },
    report: {
      daily: [
        {
          agent: 'all',
          agents: [{ agent, inputTokens, outputTokens: 2, totalTokens: inputTokens + 2, totalCost }],
          inputTokens,
          outputTokens: 2,
          period: '2026-07-15',
          totalCost,
          totalTokens: inputTokens + 2,
        },
      ],
    },
    status: 'ok',
  };
}

test('aggregates daily and agent totals across hosts', () => {
  const fleet = aggregateFleet(
    [result('localhost', 'codex', 10, 1.25), result('rtzr', 'claude', 20, 2.5)],
    { ccusageVersion: '20.0.17', timezone: 'Asia/Seoul' },
  );
  assert.equal(fleet.daily.length, 1);
  assert.equal(fleet.daily[0].inputTokens, 30);
  assert.equal(fleet.daily[0].outputTokens, 4);
  assert.equal(fleet.daily[0].totalCost, 3.75);
  assert.deepEqual(fleet.daily[0].agents.map((item) => item.agent), ['claude', 'codex']);
  assert.equal(fleet.byHost.length, 2);
});
