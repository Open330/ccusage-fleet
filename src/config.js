import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const HOST_PATTERN = /^(?:[A-Za-z0-9_][A-Za-z0-9._-]*@)?[A-Za-z0-9_][A-Za-z0-9._-]*$/;

function integer(value, name, fallback, minimum, maximum) {
  if (value == null) {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function validateSshTarget(target) {
  if (!HOST_PATTERN.test(target)) {
    throw new Error(`Invalid SSH target '${target}'`);
  }
  return target;
}

export function normalizeHost(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'local' || trimmed === 'localhost') {
      return { name: 'localhost', type: 'local' };
    }
    validateSshTarget(trimmed);
    return { name: trimmed, target: trimmed, type: 'ssh' };
  }

  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Each host must be a string or an object');
  }
  const type = value.type ?? (value.target === 'local' ? 'local' : 'ssh');
  const name = String(value.name ?? value.target ?? '').trim();
  if (!name || !/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error(`Invalid host name '${name}'`);
  }
  if (type === 'local') {
    return { name, type };
  }
  if (type !== 'ssh') {
    throw new Error(`Invalid host type '${type}' for '${name}'`);
  }
  const target = validateSshTarget(String(value.target ?? name));
  return { name, target, type };
}

function parseHostList(value) {
  if (value == null) {
    return [];
  }
  const values = Array.isArray(value) ? value : String(value).split(',');
  return values.filter((item) => typeof item !== 'string' || item.trim() !== '').map(normalizeHost);
}

function assertUniqueHosts(hosts) {
  const names = new Set();
  for (const host of hosts) {
    if (names.has(host.name)) {
      throw new Error(`Duplicate host name '${host.name}'`);
    }
    names.add(host.name);
  }
}

export function discoverConfigPath(explicitPath, cwd = process.cwd()) {
  if (explicitPath != null) {
    const path = resolve(cwd, explicitPath);
    if (!existsSync(path)) {
      throw new Error(`Configuration file not found: ${path}`);
    }
    return path;
  }
  const candidates = [
    resolve(cwd, 'ccusage-fleet.config.json'),
    resolve(cwd, '.ccusage-fleet.json'),
    resolve(homedir(), '.config', 'ccusage-fleet', 'config.json'),
  ];
  return candidates.find(existsSync);
}

export function loadConfig(path) {
  if (path == null) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('top-level value must be an object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid configuration ${path}: ${message}`);
  }
}

export function resolveSettings(parsedOptions, config, defaults) {
  const cliHosts = parsedOptions.hosts == null ? [] : parseHostList(parsedOptions.hosts);
  const extraHosts = parseHostList(parsedOptions.extraHosts);
  const envHosts = process.env.CCUSAGE_FLEET_HOSTS;
  let hosts;
  if (cliHosts.length > 0 || extraHosts.length > 0) {
    hosts = [...cliHosts, ...extraHosts];
  } else if (envHosts) {
    hosts = parseHostList(envHosts);
  } else {
    hosts = parseHostList(config.hosts);
  }
  if (hosts.length === 0) {
    hosts = [normalizeHost('localhost')];
  }
  assertUniqueHosts(hosts);

  const timezone = parsedOptions.timezone ?? config.timezone ?? defaults.timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new Error(`Invalid timezone '${timezone}'`);
  }

  const cliCompatibilityGroup = parsedOptions.byHost === true
    ? 'device'
    : parsedOptions.byHost === false
      ? 'none'
      : undefined;
  const configCompatibilityGroup = config.byHost === true
    ? 'device'
    : config.byHost === false
      ? 'none'
      : undefined;
  const groupBy = parsedOptions.groupBy
    ?? cliCompatibilityGroup
    ?? process.env.CCUSAGE_FLEET_GROUP_BY
    ?? config.groupBy
    ?? configCompatibilityGroup
    ?? 'agent';
  if (!['agent', 'device', 'none'].includes(groupBy)) {
    throw new Error(`group-by must be agent, device, or none (received '${groupBy}')`);
  }
  const graphMetric = parsedOptions.graphMetric ?? config.graphMetric ?? 'tokens';
  if (!['tokens', 'cost'].includes(graphMetric)) {
    throw new Error(`graph-metric must be tokens or cost (received '${graphMetric}')`);
  }
  const noCost = parsedOptions.noCost ?? config.noCost ?? false;
  if (graphMetric === 'cost' && noCost) {
    throw new Error('graph-metric cost cannot be combined with --no-cost');
  }

  return {
    ccusageVersion: parsedOptions.ccusageVersion ?? config.ccusageVersion ?? defaults.ccusageVersion,
    concurrency: integer(parsedOptions.concurrency ?? config.concurrency, 'concurrency', 4, 1, 32),
    debug: parsedOptions.debug ?? false,
    dryRun: parsedOptions.dryRun ?? false,
    groupBy,
    graph: parsedOptions.graph ?? config.graph ?? false,
    graphMetric,
    hosts,
    json: parsedOptions.json ?? false,
    noCost,
    offline: parsedOptions.offline ?? config.offline ?? true,
    since: parsedOptions.since,
    sshConnectTimeoutSeconds: integer(
      parsedOptions.sshConnectTimeoutSeconds ?? config.sshConnectTimeoutSeconds,
      'ssh-connect-timeout',
      10,
      1,
      300,
    ),
    strict: parsedOptions.strict ?? config.strict ?? false,
    timeoutMs: integer(parsedOptions.timeoutMs ?? config.timeoutMs, 'timeout', 120000, 1000, 3600000),
    timezone,
    until: parsedOptions.until,
  };
}
