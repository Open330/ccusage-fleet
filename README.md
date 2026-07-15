# ccusage-fleet

Run [ccusage](https://github.com/ccusage/ccusage) on local and SSH-connected machines, then aggregate the usage reports into one daily view.

```bash
npx ccusage-fleet daily --hosts localhost,rtzr,jiun-mbp,jiun-mini
```

ccusage-fleet executes ccusage independently on every host and transfers only aggregated JSON over SSH. Claude, Codex, OpenCode, and the other agents supported by ccusage are detected on each machine without copying raw conversation transcripts.

## Requirements

- Node.js 20 or newer on the machine running ccusage-fleet
- Node.js and `npx` on SSH hosts (login-shell version managers such as nvm and fnm are supported)
- Key-based SSH access configured through `~/.ssh/config`

SSH runs with `BatchMode=yes`, so ccusage-fleet never opens an interactive password prompt.

## Usage

```bash
# Local machine and three SSH aliases
npx ccusage-fleet daily --hosts localhost,rtzr,jiun-mbp,jiun-mini

# Machine-readable output
npx ccusage-fleet daily --hosts localhost,rtzr --json

# One consistent date range and timezone on every device
npx ccusage-fleet daily \
  --hosts localhost,rtzr \
  --since 2026-07-01 \
  --until 2026-07-15 \
  --timezone Asia/Seoul

# Environment variable
CCUSAGE_FLEET_HOSTS=localhost,rtzr npx ccusage-fleet daily
```

Run `npx ccusage-fleet --help` for all options.

## Configuration

Create `ccusage-fleet.config.json`, `.ccusage-fleet.json`, or `~/.config/ccusage-fleet/config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/open330/ccusage-fleet/main/ccusage-fleet.schema.json",
  "hosts": [
    { "name": "localhost", "type": "local" },
    { "name": "rtzr", "type": "ssh", "target": "rtzr" },
    { "name": "jiun-mbp", "type": "ssh", "target": "jiun-mbp" },
    { "name": "jiun-mini", "type": "ssh", "target": "jiun-mini" }
  ],
  "timezone": "Asia/Seoul",
  "concurrency": 4,
  "timeoutMs": 120000
}
```

Named entries let the displayed device name differ from its SSH target:

```json
{ "name": "workstation", "type": "ssh", "target": "user@server.example" }
```

Command-line hosts override configured hosts. Repeated `--host` options are also supported.

## Failure handling

By default, reachable hosts are reported even when another host fails. Add `--strict` to return a non-zero exit status if any host fails. `--timeout` is applied per host.

## Privacy and correctness

Raw agent logs stay on their original machines; only ccusage's aggregated JSON is transferred. This protects prompt and response content and keeps network traffic small.

Because aggregation happens after each machine has produced a summary, identical transcripts copied between machines cannot be deduplicated across hosts. Do not sync the same agent log directory to multiple fleet members unless you intentionally want both copies counted.

## Development

```bash
npm install
npm run check
npm test
```

## License

MIT
