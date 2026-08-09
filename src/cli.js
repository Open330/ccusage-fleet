import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { aggregateFleet } from './aggregate.js';
import { helpText, parseArgs } from './args.js';
import { discoverConfigPath, loadConfig, resolveSettings } from './config.js';
import { mapConcurrent, runHost } from './runner.js';
import { renderFleetTable } from './table.js';
import { renderFleetGraph } from './graph.js';
import { fleetNotes, renderNotes } from './insights.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8'));
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function debug(settings, message) {
  if (settings.debug) {
    process.stderr.write(`[ccusage-fleet] ${message}\n`);
  }
}

export async function runCli(argv, dependencies = {}) {
  const { command, options } = parseArgs(argv);
  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${packageJson.version}\n`);
    return 0;
  }
  const configPath = discoverConfigPath(options.config);
  const config = loadConfig(configPath);
  const settings = { ...resolveSettings(options, config, {
    ccusageVersion: packageJson.dependencies.ccusage,
    timezone: DEFAULT_TIMEZONE,
  }), command };
  debug(settings, `timezone=${settings.timezone} hosts=${settings.hosts.map((host) => host.name).join(',')}`);
  if (configPath) debug(settings, `config=${configPath}`);

  const hostRunner = dependencies.runHost ?? runHost;
  const results = await mapConcurrent(settings.hosts, settings.concurrency, async (host) => {
    const result = await hostRunner(host, settings);
    debug(settings, `${host.name}: ${result.status} (${result.durationMs}ms)`);
    if (result.status === 'error') {
      process.stderr.write(`[ccusage-fleet] ${host.name}: ${result.error}\n`);
    }
    if (settings.dryRun) {
      process.stdout.write(`${host.name}: ${result.invocation.display}\n`);
    }
    return result;
  });

  if (settings.dryRun) {
    return 0;
  }
  const successful = results.filter((result) => result.status === 'ok');
  if (successful.length === 0) {
    throw new Error('All hosts failed');
  }

  const fleet = aggregateFleet(results, settings);
  const notes = fleetNotes(fleet, settings);
  if (settings.json) {
    process.stdout.write(`${JSON.stringify({ ...fleet, notes }, null, 2)}\n`);
  } else {
    const sections = [renderFleetTable(fleet, settings)];
    if (notes.length > 0) {
      sections.push(renderNotes(notes));
    }
    if (settings.graph) {
      sections.push(renderFleetGraph(fleet, settings));
    }
    process.stdout.write(`${sections.join('\n\n')}\n`);
  }
  return settings.strict && successful.length !== results.length ? 1 : 0;
}
