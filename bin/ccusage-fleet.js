#!/usr/bin/env node

import { runCli } from '../src/cli.js';

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ccusage-fleet: ${message}\n`);
  process.exitCode = 1;
}
