import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../src/args.js';
import { normalizeHost, resolveSettings, validateSshTarget } from '../src/config.js';

const defaults = { ccusageVersion: '20.0.17', timezone: 'UTC' };

test('parses host and report options', () => {
  const parsed = parseArgs(['daily', '--hosts', 'localhost,rtzr', '--since=2026-07-01', '--json']);
  const settings = resolveSettings(parsed.options, {}, defaults);
  assert.equal(settings.hosts.length, 2);
  assert.equal(settings.hosts[0].type, 'local');
  assert.equal(settings.hosts[1].target, 'rtzr');
  assert.equal(settings.since, '2026-07-01');
  assert.equal(settings.json, true);
});

test('supports named SSH config targets', () => {
  assert.deepEqual(normalizeHost({ name: 'work', type: 'ssh', target: 'user@server.example' }), {
    name: 'work',
    target: 'user@server.example',
    type: 'ssh',
  });
});

test('defaults to agent grouping and supports device grouping', () => {
  const defaultsToAgent = resolveSettings(parseArgs([]).options, {}, defaults);
  assert.equal(defaultsToAgent.groupBy, 'agent');

  const device = resolveSettings(parseArgs(['--group-by', 'device']).options, {}, defaults);
  assert.equal(device.groupBy, 'device');

  const compatible = resolveSettings(parseArgs(['--by-host']).options, {}, defaults);
  assert.equal(compatible.groupBy, 'device');

  const cliCompatibilityWins = resolveSettings(
    parseArgs(['--by-host']).options,
    { groupBy: 'agent' },
    defaults,
  );
  assert.equal(cliCompatibilityWins.groupBy, 'device');
});

test('rejects an unknown grouping', () => {
  assert.throws(
    () => resolveSettings(parseArgs(['--group-by', 'project']).options, {}, defaults),
    /group-by must be agent, device, or none/,
  );
});

test('configures token and cost graphs', () => {
  const tokens = resolveSettings(parseArgs(['--graph']).options, {}, defaults);
  assert.equal(tokens.graph, true);
  assert.equal(tokens.graphMetric, 'tokens');

  const cost = resolveSettings(parseArgs(['--graph', '--graph-metric', 'cost']).options, {}, defaults);
  assert.equal(cost.graphMetric, 'cost');

  const outputTokens = resolveSettings(parseArgs(['--graph', '--graph-metric', 'output']).options, {}, defaults);
  assert.equal(outputTokens.graphMetric, 'output');

  assert.throws(
    () => resolveSettings(parseArgs(['--graph-metric', 'cost', '--no-cost']).options, {}, defaults),
    /cannot be combined with --no-cost/,
  );
  assert.throws(
    () => resolveSettings(parseArgs(['--graph-metric', 'reads']).options, {}, defaults),
    /graph-metric must be tokens, output, or cost/,
  );
});

test('fetches pricing online by default so new models are not counted as $0', () => {
  assert.equal(resolveSettings(parseArgs([]).options, {}, defaults).offline, false);
  assert.equal(resolveSettings(parseArgs(['--offline']).options, {}, defaults).offline, true);
  assert.equal(resolveSettings(parseArgs([]).options, { offline: true }, defaults).offline, true);
  assert.equal(resolveSettings(parseArgs(['--online']).options, { offline: true }, defaults).offline, false);
});

test('rejects SSH option and shell injection', () => {
  assert.throws(() => validateSshTarget('-oProxyCommand=bad'), /Invalid SSH target/);
  assert.throws(() => validateSshTarget('host;touch /tmp/pwned'), /Invalid SSH target/);
});
