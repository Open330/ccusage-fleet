import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCcusageArgs, buildHostCommand, shellQuote } from '../src/runner.js';

const settings = {
  ccusageVersion: '20.0.17',
  command: 'daily',
  noCost: false,
  offline: true,
  sshConnectTimeoutSeconds: 10,
  timezone: 'Asia/Seoul',
};

test('builds a consistent remote command', () => {
  const command = buildHostCommand({ name: 'rtzr', target: 'rtzr', type: 'ssh' }, settings);
  assert.equal(command.command, 'ssh');
  assert.ok(command.args.includes('BatchMode=yes'));
  assert.match(command.args.at(-1), /ccusage@20\.0\.17/);
  assert.match(command.args.at(-1), /Asia\/Seoul/);
  assert.match(command.args.at(-1), /command -v npx/);
  assert.match(command.args.at(-1), /SHELL/);
});

test('forwards supported ccusage flags', () => {
  const args = buildCcusageArgs({ ...settings, noCost: true, since: '2026-07-01', until: '2026-07-15' });
  assert.deepEqual(args.slice(0, 4), ['daily', '--json', '--by-agent', '--no-color']);
  assert.ok(args.includes('--offline'));
  assert.ok(args.includes('--no-cost'));
});

test('forwards weekly and monthly report commands', () => {
  assert.equal(buildCcusageArgs({ ...settings, command: 'weekly' })[0], 'weekly');
  assert.equal(buildCcusageArgs({ ...settings, command: 'monthly' })[0], 'monthly');
});

test('quotes remote shell arguments', () => {
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});
