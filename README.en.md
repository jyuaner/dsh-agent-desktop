<div align="center">

# dsh-agent-desktop

[![GitHub stars](https://img.shields.io/github/stars/jyuaner/dsh-agent-desktop?style=flat-square&label=stars)](https://github.com/jyuaner/dsh-agent-desktop/stargazers)
[![License](https://img.shields.io/badge/license-MIT-3DA639?style=flat-square)](LICENSE)
[![DSH](https://img.shields.io/badge/dsh-bundle%200.1.1-4D6BFE?style=flat-square)](package.json)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.19-339933?style=flat-square&logo=node.js&logoColor=white)](package.json)
[![Tests](https://img.shields.io/badge/tests-10%20%2B%201%20passing-brightgreen?style=flat-square)](test/unit.test.mjs)
[![Tools](https://img.shields.io/badge/tools-75-8957E5?style=flat-square)](#what-it-registers)

**Hands for a dsh agent: 75 desktop tools in one `dsh plugin add`.**

Upstream [agent-desktop](https://github.com/vercel-labs/agent-desktop) already turns native
accessibility trees into 75 MCP tools — snapshot, click, type, screenshot. What is missing is
the dsh side: a static `dsh-mcp-client` patch has to hard-code the binary path, the bridge
cannot spawn npm's Windows `.cmd` shim, and `dsh plugin add` only wires bundles. This package
fills exactly that gap.

75 tools · one `dsh plugin add` · engine auto-discovery · no forked MCP bridge

Current **0.1.1** · any profile that ships `dsh-mcp-client` · Windows / macOS / Linux

Works with [agent-desktop](https://github.com/vercel-labs/agent-desktop) (it provides the engine and the 75 tools) · pairs well with [dsh-pilot](https://github.com/Viger1/dsh-pilot) (optional: one drives the browser, one drives the desktop)

[中文](README.md) · English

</div>

---

## The short version

```
agent-desktop        lets an AI see and drive a desktop      ← upstream: Rust binary + MCP
dsh-agent-desktop    turns it into 75 native dsh tools       ← this package
                     install once, edit no YAML
```

The model gets one extra namespace, `mcp__desktop__*`, with the same standing as built-in tools:
`desktop_snapshot` (returns the accessibility tree with `@ref`s) · `desktop_click` · `desktop_type`
· `desktop_screenshot` · `desktop_launch` · `desktop_list_windows` · `desktop_clipboard_get` ·
`desktop_wait` · `desktop_batch` … 75 in total.

A real call: `snapshot` returns a 46-element tree → `click '@sXXXX:e25'` → `snapshot` again to verify.
Delivery is semantic (accessibility actions) by default — no focus stealing, no synthetic mouse.

---

## The three things that were actually blocked

The MCP server exists upstream, so "just use it" looks like one config entry. The three blockers all live outside that entry.

### 1. `command` cannot be hard-coded

The path moves with OS, arch, installer and prefix — and on Windows the npm global prefix is often non-ASCII (`D:\软件\...` on the machine this was built on), which a YAML patch has no good way to express.

| Install | Launcher |
| --- | --- |
| npm global (Windows) | `%APPDATA%\npm\node_modules\agent-desktop\bin\agent-desktop` |
| npm global (this machine) | `D:\软件\ClaudeCode\node_modules\agent-desktop\bin\agent-desktop` |
| pnpm global | `$PNPM_HOME/...` or `%LOCALAPPDATA%\pnpm\...` |
| project-local | `<repo>/node_modules/agent-desktop/bin/...` |

### 2. The bridge cannot spawn npm's Windows shim

Even a bare `agent-desktop` fails: the MCP bridge calls `CreateProcess`/`execve` **without a shell**, so `agent-desktop.cmd` never runs. And the generated `agent-desktop.ps1` has no BOM, so PowerShell 5.1 reads the Chinese prefix as GBK and reports `CommandNotFoundException` (observed here).

### 3. `dsh plugin add` requires a bundle patch layer

`dsh plugin add` appends the package to `dsh.profile.bundles`; only a bundle carries `cordis.patch.yml`. Shipping an npm package alone is not "installable" — it needs `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` plus an `insert` entry.

Counter-intuitive extra: making `agent-desktop` a dependency is *worse*. It has a `postinstall`, pnpm 11 blocks unapproved build scripts and exits 1 with `ERR_PNPM_IGNORED_BUILDS`, so `dsh plugin add` stops halfway with the profile half-updated. This package therefore never hard-depends on it — it discovers it.

---

## Install

```bash
# 1. the desktop engine (one binary, no build tools)
npm i -g agent-desktop

# 2. the harness plugin — registered as a bundle, patch applied automatically
dsh plugin --profile web add github:jyuaner/dsh-agent-desktop

# 3. restart the profile
dsh web
```

Verify without booting anything:

```bash
npx dsh-agent-desktop doctor
# { "ok": true,
#   "launcher": "C:\\Users\\you\\AppData\\Roaming\\npm\\node_modules\\agent-desktop\\bin\\agent-desktop",
#   "platform": "win32-x64", ... }
# --- agent-desktop status ---
# {"version":"2.6","ok":true,"command":"status","data":{"permissions":{"accessibility":{"state":"granted"}}, …}}
```

Then ask the model for `mcp__desktop__desktop_status`. No engine yet? `npx dsh-agent-desktop setup` installs it and re-probes.

---

## What it registers

```
profiles/<name>/package.json   dsh.profile.bundles += dsh-agent-desktop
        │
        └─ cordis.patch.yml    - insert: [{ id: agent-desktop, name: dsh-agent-desktop }]
                 │
                 └─ lib/index.js
                      normalizeConfig()   → validated serverName / timeout / args / env
                      resolveLauncher()   → …/node_modules/agent-desktop/bin/agent-desktop
                      buildMcpConfig()    → { transport: stdio, command: process.execPath,
                                             args: [launcher, "mcp"], … }
                      @deepseek-ai/dsh-mcp-client.apply(ctx, config)
                                            └─ tools/call → mcp__desktop__*
```

- **Discovery**: `config.command` → `AGENT_DESKTOP_BIN` / `AGENT_DESKTOP_LAUNCHER` → this package's dependency → every prefix npm/pnpm/Volta/Scoop/asdf/Homebrew/`PATH` implies.
- **Always a real executable**: `process.execPath` + `bin/agent-desktop`, so the Windows `.cmd` shim and non-ASCII prefixes never matter, and agent-desktop's macOS helper wiring stays intact.
- **No forked bridge**: the connection is handed to the harness-provided `@deepseek-ai/dsh-mcp-client`.
- **A missing engine never kills the session**: the plugin logs an actionable hint and skips registration; set `failOnStartupError: true` to fail hard instead.
- **Stateless**: exports `name`, `inject: ['tools']`, `apply(ctx, config)`; unloading disposes the connection through the bridge lifecycle.

## Configuration

```yaml
- id: agent-desktop
  config:
    serverName: desktop        # tools become mcp__<serverName>__*
    toolCallTimeoutMs: 120000
    command: /usr/local/bin/agent-desktop   # skip discovery
    extraArgs: ["--headed"]    # appended after `mcp`
    env: {}                    # extra env for the engine
```

| Field | Default | Meaning |
|---|---|---|
| `serverName` | `desktop` | MCP namespace (`mcp__desktop__*`); must match `[A-Za-z0-9_-]{1,32}` and be unique per profile |
| `command` | discovered | Absolute path to an `agent-desktop` executable or its `bin/agent-desktop` launcher |
| `extraArgs` | `[]` | Extra CLI arguments after `mcp` (`--headed` for physical input) |
| `toolCallTimeoutMs` | `120000` | Per-call timeout for MCP tool calls |
| `env` | `{}` | Extra environment for the launched engine, merged over the harness's scrubbed env |
| `failOnStartupError` | `false` | Throw instead of warning when the engine is missing or the namespace is taken |

Every field is validated in the adapter, so a typo costs one sentence instead of a bridge stack trace.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Boots, but no `mcp__desktop__*` tools | engine not found (the plugin warned) | `npm i -g agent-desktop`, or set `AGENT_DESKTOP_BIN`, then reload |
| `serverName "desktop" is already in use` | a hand-written `dsh-mcp-client` entry uses the namespace | delete it, or set `config.serverName` on one |
| `ERR_PNPM_IGNORED_BUILDS` on install | you added `agent-desktop` as a dependency yourself | drop the hard dependency; the adapter only needs the engine installed |
| `desktop_status` unavailable at call time | engine binary mismatched with platform/arch | `npx dsh-agent-desktop doctor` prints the resolved path and its `status` |
| No images from `desktop_screenshot` on macOS | Screen Recording grant missing | System Settings → Privacy & Security → Screen Recording |
| Physical input ignored | semantic delivery is the default | add `extraArgs: ["--headed"]` |

## Update

```bash
dsh plugin --profile web add github:jyuaner/dsh-agent-desktop#v0.1.1
```

Pin a tag for explicit updates; the bare spec follows `main`. Restart the profile afterwards — see [CHANGELOG.md](CHANGELOG.md).

## Tests

```bash
node --test test/unit.test.mjs   # defaults, validation, spawn shape, discovery (10 cases)
node test/smoke.mjs              # real MCP initialize → tools/list, no harness needed
```

The smoke test spawns exactly what `buildMcpConfig()` produces:

```
{ "protocolVersion": "2025-06-18",
  "server": { "name": "agent-desktop", "version": "1.3.1" },
  "toolCount": 75, "missing": [] }
OK
```

GitHub Actions runs the unit suite on Windows, macOS and Linux and attempts the real handshake on each (Linux under `xvfb-run`).

## Uninstall

```bash
dsh plugin --profile web remove dsh-agent-desktop
```

Remove any `id: agent-desktop` override. The engine is untouched: `npm rm -g agent-desktop`.

## License

MIT. `agent-desktop` is Apache-2.0, © Vercel Labs; this adapter is an independent, unaffiliated integration. DeepSeek Harness is a separate product.