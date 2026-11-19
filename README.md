# dsh-agent-desktop

[![CI](https://github.com/jyuaner/dsh-agent-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/jyuaner/dsh-agent-desktop/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh bundle](https://img.shields.io/badge/dsh-plugin%20bundle-0.1.1-6f42c1)](https://github.com/jyuaner/dsh-agent-desktop)

A **DeepSeek Harness (`dsh`) plugin bundle** that mounts [agent-desktop](https://github.com/vercel-labs/agent-desktop) — reliable computer use for AI agents, driven by native accessibility trees — as native harness tools.

Install it into a profile and the model gets all **75 tools** under the `mcp__desktop__*` namespace: `desktop_snapshot`, `desktop_click`, `desktop_type`, `desktop_screenshot`, `desktop_launch`, `desktop_list_windows`, `desktop_clipboard_get`, `desktop_wait`, `desktop_batch`, and the rest.

## Install

```bash
# 1. the desktop engine (one binary, no build tools needed)
npm i -g agent-desktop

# 2. the harness plugin — registered as a bundle, patch applied automatically
dsh plugin --profile web add github:jyuaner/dsh-agent-desktop

# 3. restart the profile
dsh web
```

Verify the wiring without booting anything:

```bash
npx dsh-agent-desktop doctor
# {
#   "ok": true,
#   "launcher": "C:\\Users\\you\\AppData\\Roaming\\npm\\node_modules\\agent-desktop\\bin\\agent-desktop",
#   "platform": "win32-x64",
#   ...
# }
# --- agent-desktop status ---
# {"version":"2.6","ok":true,"command":"status","data":{"permissions":{"accessibility":{"state":"granted"}}, …}}
```

Then ask the model to call `mcp__desktop__desktop_status` — the tools register before the first turn.

No `agent-desktop` yet? `npx dsh-agent-desktop setup` installs it and re-probes.

### Why `agent-desktop` is *not* an npm dependency of this plugin

It deliberately stays a runtime dependency it *discovers*, not one it *installs*. `agent-desktop` has a `postinstall` that links its native binary; pnpm 11 blocks unapproved dependency build scripts and exits non-zero (`ERR_PNPM_IGNORED_BUILDS`). If this package listed `agent-desktop` as a dependency, `dsh plugin add` would fail halfway with the profile only partially updated. The engine is therefore installed once by you, and the adapter resolves it.

## Configuration

Defaults are enough. To change them, override the entry in your own profile patch (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`):

```yaml
- id: agent-desktop
  config:
    serverName: desktop        # tools become mcp__<serverName>__*
    toolCallTimeoutMs: 120000  # agent-desktop snapshot/action calls can be slow
    command: /usr/local/bin/agent-desktop   # skip discovery entirely
    extraArgs: ["--headed"]    # appended after `mcp`
    env: {}                    # extra env for the launcher
```

| Field | Default | Meaning |
|---|---|---|
| `serverName` | `desktop` | MCP namespace (`mcp__desktop__*`); must match `[A-Za-z0-9_-]{1,32}` and be unique per profile |
| `command` | discovered | Absolute path to an `agent-desktop` executable or its `bin/agent-desktop` launcher |
| `extraArgs` | `[]` | Extra CLI arguments after `mcp` (e.g. `--headed` for physical input) |
| `toolCallTimeoutMs` | `120000` | Per-call timeout for MCP tool calls |
| `env` | `{}` | Extra environment for the launched engine, merged over the harness's scrubbed env |
| `failOnStartupError` | `false` | Throw instead of warning when the engine is missing or the namespace is taken |

Every field is validated in the adapter, so a typo fails with one sentence instead of a bridge stack trace.

Discovery order: `config.command` → `AGENT_DESKTOP_BIN` / `AGENT_DESKTOP_LAUNCHER` → the package resolvable from this plugin → every global prefix npm/pnpm/Volta/Scoop/asdf/Homebrew/`PATH` implies (`%APPDATA%\npm`, `%LOCALAPPDATA%\pnpm`, `/usr/local`, `/opt/homebrew`, `~/.local`, `<prefix>/node_modules`, `<prefix>/lib/node_modules`, …).

If nothing is found, the plugin logs an actionable hint and **skips registration** so the harness still boots — a missing desktop engine should never take the whole session down.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Harness boots, no `mcp__desktop__*` tools | engine not found (the plugin warned at boot) | `npm i -g agent-desktop`, or set `AGENT_DESKTOP_BIN`, then reload |
| `serverName "desktop" is already in use` | a hand-written `dsh-mcp-client` entry uses the same namespace | delete that entry, or set `config.serverName` on one of them |
| `ERR_PNPM_IGNORED_BUILDS` during install | you added `agent-desktop` as a dependency yourself | drop the hard dependency; the adapter only needs the engine installed |
| Tools appear, calls fail with `desktop_status` unavailable | engine binary is for another platform/arch | `npx dsh-agent-desktop doctor` shows the resolved path and its `status` output |
| `desktop_screenshot` returns nothing on macOS | missing Screen Recording grant | System Settings → Privacy & Security → Screen Recording → your terminal/`dsh` |
| Physical input ignored | default delivery is semantic, not synthetic | add `extraArgs: ["--headed"]` |

## Update

```bash
dsh plugin --profile web add github:jyuaner/dsh-agent-desktop#v0.1.1
```

Pinning a tag makes updates explicit; plain `github:jyuaner/dsh-agent-desktop` follows `main`. Restart the profile afterwards. See [CHANGELOG.md](CHANGELOG.md).

## How it works

```
profiles/<name>/package.json   dsh.profile.bundles += dsh-agent-desktop
        │
        └─ cordis.patch.yml    - insert: [{ id: agent-desktop, name: dsh-agent-desktop }]
                 │
                 └─ lib/index.js
                      normalizeConfig()   → validated serverName/timeout/args/env
                      resolveLauncher()   → …/node_modules/agent-desktop/bin/agent-desktop
                      buildMcpConfig()    → { transport: stdio, command: process.execPath,
                                             args: [launcher, "mcp"], … }
                      @deepseek-ai/dsh-mcp-client.apply(ctx, config)
                                            └─ tools/call → mcp__desktop__*
```

Three details this adapter exists for:

| Problem | What this plugin does |
|---|---|
| A static patch must hard-code `command`, but the launcher path differs per OS, arch, installer and prefix — and on Windows often contains non-ASCII characters | Resolves the launcher at load time from its own package, then global prefixes; `AGENT_DESKTOP_BIN` overrides everything |
| The MCP bridge spawns `command` with `CreateProcess`/`execve`, which cannot execute npm's Windows `.cmd` shim, and a bare `agent-desktop` only resolves through a shell | Spawns `process.execPath` + `bin/agent-desktop` — always a real executable, on every platform, and agent-desktop's macOS helper wiring stays intact |
| Installing a plugin appends it to `dsh.profile.bundles`, so it needs its own patch layer | Ships `cordis.patch.yml` and delegates to the harness-provided `@deepseek-ai/dsh-mcp-client` — one MCP bridge, not a fork of it |

The adapter exports `name`, `inject: ['tools']`, `apply(ctx, config)` and holds no state of its own, so unloading the plugin disposes the MCP connection through the bridge's normal lifecycle.

## Tests

```bash
node --test test/unit.test.mjs   # defaults, validation, spawn shape, discovery precedence
node test/smoke.mjs              # real MCP initialize → tools/list, no harness needed
```

The smoke test spawns exactly the config `buildMcpConfig()` produces:

```
{ "protocolVersion": "2025-06-18",
  "server": { "name": "agent-desktop", "version": "1.3.1" },
  "toolCount": 75, "missing": [] }
OK
```

GitHub Actions runs the unit suite on Windows, macOS and Linux, then attempts the handshake on each.

## Uninstall

```bash
dsh plugin --profile web remove dsh-agent-desktop
```

Remove any `id: agent-desktop` override from your patch. The `dsh.profile.bundles` entry goes away with the package. The engine itself is untouched: `npm rm -g agent-desktop`.

## License

MIT. `agent-desktop` is Apache-2.0, © Vercel Labs; this adapter is an independent, unaffiliated integration. DeepSeek Harness is a separate product.