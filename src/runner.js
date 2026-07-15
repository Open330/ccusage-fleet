import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function buildCcusageArgs(settings) {
  const args = [settings.command, '--json', '--by-agent', '--no-color', '--timezone', settings.timezone];
  if (settings.since) {
    args.push('--since', settings.since);
  }
  if (settings.until) {
    args.push('--until', settings.until);
  }
  if (settings.offline) {
    args.push('--offline');
  }
  if (settings.noCost) {
    args.push('--no-cost');
  }
  return args;
}

export function buildHostCommand(host, settings) {
  const ccusageArgs = buildCcusageArgs(settings);
  if (host.type === 'local') {
    const cliPath = require.resolve('ccusage/src/cli.js');
    return {
      args: [cliPath, ...ccusageArgs],
      command: process.execPath,
      display: `ccusage ${ccusageArgs.join(' ')}`,
    };
  }

  const remoteTokens = ['npx', '--yes', `ccusage@${settings.ccusageVersion}`, ...ccusageArgs];
  const ccusageCommand = remoteTokens.map(shellQuote).join(' ');
  // OpenSSH runs a non-login shell, while Node version managers commonly add
  // npx only from the user's interactive shell profile. Prefer the clean PATH,
  // then fall back to the configured login shell when npx is not visible.
  const remoteCommand = [
    `if command -v npx >/dev/null 2>&1; then exec ${ccusageCommand};`,
    `else exec "\${SHELL:-/bin/sh}" -lic ${shellQuote(ccusageCommand)}; fi`,
  ].join(' ');
  const args = [
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${settings.sshConnectTimeoutSeconds}`,
    host.target,
    remoteCommand,
  ];
  return {
    args,
    command: 'ssh',
    display: `ssh ${host.target} ${remoteCommand}`,
  };
}

export function spawnCapture(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      env: { ...process.env, NO_COLOR: '1' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const append = (chunks, chunk, currentBytes, streamName) => {
      const nextBytes = currentBytes + chunk.length;
      if (nextBytes > MAX_OUTPUT_BYTES) {
        child.kill('SIGTERM');
        finish(() => reject(new Error(`${streamName} exceeded 64 MiB`)));
        return currentBytes;
      }
      chunks.push(chunk);
      return nextBytes;
    };

    child.stdout.on('data', (chunk) => {
      stdoutBytes = append(stdout, chunk, stdoutBytes, 'stdout');
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes = append(stderr, chunk, stderrBytes, 'stderr');
    });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code, signal) =>
      finish(() =>
        resolve({
          code: code ?? 1,
          durationMs: Date.now() - startedAt,
          signal,
          stderr: Buffer.concat(stderr).toString('utf8'),
          stdout: Buffer.concat(stdout).toString('utf8'),
        }),
      ),
    );

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
      finish(() => reject(new Error(`Timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    timer.unref();
  });
}

function parseReport(stdout, command) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('ccusage returned no JSON');
  }
  try {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    const json = firstBrace >= 0 && lastBrace >= firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
    const report = JSON.parse(json);
    if (!Array.isArray(report[command])) {
      throw new Error(`missing ${command} array`);
    }
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ccusage JSON: ${message}`);
  }
}

export async function runHost(host, settings, spawnFn = spawnCapture) {
  const invocation = buildHostCommand(host, settings);
  if (settings.dryRun) {
    return { durationMs: 0, host, invocation, report: { daily: [], totals: {} }, status: 'dry-run' };
  }
  try {
    const result = await spawnFn(invocation.command, invocation.args, settings.timeoutMs);
    if (result.code !== 0) {
      const detail = result.stderr.trim() || `exit code ${result.code}`;
      throw new Error(detail);
    }
    return {
      durationMs: result.durationMs,
      host,
      invocation,
      report: parseReport(result.stdout, settings.command),
      status: 'ok',
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    return {
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
      host,
      invocation,
      status: 'error',
    };
  }
}

export async function mapConcurrent(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
