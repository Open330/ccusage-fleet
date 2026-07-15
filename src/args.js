const VALUE_OPTIONS = new Map([
  ['--hosts', 'hosts'],
  ['--host', 'host'],
  ['--config', 'config'],
  ['--since', 'since'],
  ['--until', 'until'],
  ['--timezone', 'timezone'],
  ['--timeout', 'timeoutMs'],
  ['--concurrency', 'concurrency'],
  ['--ssh-connect-timeout', 'sshConnectTimeoutSeconds'],
  ['--ccusage-version', 'ccusageVersion'],
  ['--group-by', 'groupBy'],
]);

const BOOLEAN_OPTIONS = new Map([
  ['--json', ['json', true]],
  ['--by-host', ['byHost', true]],
  ['--no-by-host', ['byHost', false]],
  ['--strict', ['strict', true]],
  ['--offline', ['offline', true]],
  ['--online', ['offline', false]],
  ['--no-cost', ['noCost', true]],
  ['--debug', ['debug', true]],
  ['--dry-run', ['dryRun', true]],
  ['--help', ['help', true]],
  ['-h', ['help', true]],
  ['--version', ['version', true]],
  ['-v', ['version', true]],
]);

function readOptionValue(argv, index, inlineValue) {
  if (inlineValue != null) {
    if (inlineValue === '') {
      throw new Error(`Missing value for ${argv[index].split('=')[0]}`);
    }
    return { nextIndex: index, value: inlineValue };
  }
  const value = argv[index + 1];
  if (value == null || value.startsWith('-')) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return { nextIndex: index + 1, value };
}

export function parseArgs(argv) {
  const options = { extraHosts: [] };
  let command;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('-')) {
      if (command != null) {
        throw new Error(`Unexpected argument '${argument}'`);
      }
      if (!['daily', 'weekly', 'monthly'].includes(argument)) {
        throw new Error(`Unsupported report '${argument}'. Choose daily, weekly, or monthly.`);
      }
      command = argument;
      continue;
    }

    const [name, inlineValue] = argument.split(/=(.*)/s, 2);
    if (BOOLEAN_OPTIONS.has(name)) {
      if (inlineValue != null) {
        throw new Error(`${name} does not accept a value`);
      }
      const [key, value] = BOOLEAN_OPTIONS.get(name);
      options[key] = value;
      continue;
    }

    const key = VALUE_OPTIONS.get(name);
    if (key == null) {
      throw new Error(`Unknown option '${name}'`);
    }
    const parsed = readOptionValue(argv, index, inlineValue);
    index = parsed.nextIndex;
    if (key === 'host') {
      options.extraHosts.push(parsed.value);
    } else {
      options[key] = parsed.value;
    }
  }

  return { command: command ?? 'daily', options };
}

export function helpText() {
  return `ccusage-fleet - aggregate ccusage across local and SSH hosts

USAGE
  ccusage-fleet [daily|weekly|monthly] [options]

HOSTS
  --hosts <list>               Comma-separated hosts; local or localhost means this machine
  --host <host>                Add one host (repeatable)
  --config <path>              Configuration file path

REPORT
  --since <YYYY-MM-DD>         Include usage on or after this date
  --until <YYYY-MM-DD>         Include usage on or before this date
  --timezone <IANA>            Use one timezone on every host
  --json                       Emit machine-readable fleet JSON
  --group-by <mode>            Group detail rows by agent, device, or none (default: agent)
  --by-host / --no-by-host     Compatibility aliases for --group-by device/none
  --no-cost                    Hide costs
  --offline / --online         Use bundled or online ccusage pricing (default: offline)

EXECUTION
  --timeout <ms>               Per-host timeout (default: 120000)
  --concurrency <n>            Parallel hosts (default: 4)
  --ssh-connect-timeout <sec>  SSH connection timeout (default: 10)
  --ccusage-version <version>  ccusage version used remotely (default: bundled version)
  --strict                     Fail if any host fails
  --dry-run                    Print commands without running them
  --debug                      Print host diagnostics to stderr
  -h, --help                   Show help
  -v, --version                Show version

EXAMPLES
  npx ccusage-fleet daily --hosts localhost,rtzr,jiun-mbp,jiun-mini
  npx ccusage-fleet weekly --hosts localhost,server --group-by agent
  npx ccusage-fleet monthly --hosts localhost,server --group-by device
  CCUSAGE_FLEET_HOSTS=localhost,server npx ccusage-fleet daily --json
`;
}
