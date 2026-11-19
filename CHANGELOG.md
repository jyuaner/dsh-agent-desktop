# Changelog

## 0.1.1 — 2026-11-19

Hardening after the first live install.

- **Config validation with one-sentence errors.** `serverName` must match the bridge's
  `[A-Za-z0-9_-]{1,32}`, `toolCallTimeoutMs` must be a positive integer inside the timer
  ceiling, `extraArgs` must be an array, `env` must be a string map. Previously these
  surfaced as stack traces from inside the MCP bridge.
- **Duplicate-namespace explanation.** A hand-written `dsh-mcp-client` patch entry using
  `serverName: desktop` used to fail with the bridge's one-liner; the adapter now names the
  duplicate and the two ways out.
- **`failOnStartupError` and `env` are honoured.** Both are documented config fields now
  instead of hard-coded values.
- **Wider discovery.** pnpm (`PNPM_HOME`, `%LOCALAPPDATA%\pnpm`), Volta, Scoop, asdf and
  Homebrew prefixes are probed, so a global install outside `%APPDATA%\npm` is found.
- **Tests and CI.** `node --test test/unit.test.mjs` covers defaults, validation, spawn
  shape and discovery precedence; GitHub Actions runs it on Windows, macOS and Linux and
  attempts the real MCP handshake on each.

## 0.1.0 — 2026-11-19

First release.

- Bundle patch layer (`cordis.patch.yml`) so `dsh plugin --profile <name> add …` appends the
  plugin to `dsh.profile.bundles` and the entry composes into the profile tree.
- Adapter delegates to the harness-provided `@deepseek-ai/dsh-mcp-client`; no forked bridge.
- Launcher discovery across config, `AGENT_DESKTOP_BIN`, the plugin's own dependency and
  npm/pnpm global prefixes; spawns `process.execPath` + `bin/agent-desktop` so the Windows
  `.cmd` shim and non-ASCII install paths never matter.
- `dsh-agent-desktop doctor|setup|version` CLI.
- Dependency-free MCP handshake smoke test (75 tools, protocol 2025-06-18).