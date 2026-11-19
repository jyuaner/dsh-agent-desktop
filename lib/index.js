/**
 * dsh-agent-desktop — DeepSeek Harness adapter for `agent-desktop`.
 *
 * `agent-desktop` (https://github.com/vercel-labs/agent-desktop) is a standalone
 * Rust CLI that observes and operates native desktop apps through their
 * accessibility trees, and it ships an MCP server (`agent-desktop mcp`) with 75
 * tools. The harness can already reach it by hand-writing an
 * `@deepseek-ai/dsh-mcp-client` entry into a profile patch — this plugin removes
 * that step: install it as a bundle and it resolves the agent-desktop launcher
 * itself, then registers one MCP client under the `desktop` namespace.
 *
 * Why a JS adapter instead of a static patch entry only: the MCP client spawns
 * `command` with `CreateProcess`/`execve`, which cannot execute npm's Windows
 * `.cmd` shim, and the launcher lives under a package path that differs per
 * platform, installer, and prefix (and may contain non-ASCII characters). The
 * adapter resolves the platform-correct launcher at load time and always spawns
 * it through `process.execPath`, which exists everywhere the harness runs.
 *
 * @module dsh-agent-desktop
 */
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, isAbsolute, join, sep } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

/** Plugin label shown by the loader. */
export const name = 'agent-desktop';

/** The tool registry is required; the MCP bridge registers every remote tool on it. */
export const inject = ['tools'];

/** Namespace prefix the model sees: `mcp__desktop__<tool>`. */
const DEFAULT_SERVER_NAME = 'desktop';

/** agent-desktop's snapshot/action calls can be slow on big UI trees. */
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 120_000;

/** Upstream default for server instructions; kept explicit because we bypass schema resolution. */
const DEFAULT_MAX_INSTRUCTION_BYTES = 32_768;

/** File name of agent-desktop's own JS launcher inside its package. */
const LAUNCHER_RELATIVE = join('bin', 'agent-desktop');

/**
 * Native packages whose layout mirrors agent-desktop's own `lib/platform.js` table.
 * Used only as a fallback when the JS launcher file is absent.
 */
const NATIVE_BINARY_BY_PLATFORM = {
  'win32-x64': 'agent-desktop-win32-x64.exe',
  'win32-arm64': 'agent-desktop-win32-arm64.exe',
  'darwin-x64': 'agent-desktop-darwin-x64',
  'darwin-arm64': 'agent-desktop-darwin-arm64',
  'linux-x64': 'agent-desktop-linux-x64',
  'linux-arm64': 'agent-desktop-linux-arm64',
};

/**
 * Global install prefixes npm and pnpm use, most specific first.
 * A global install has no `agent-desktop` in any `node_modules` this plugin can
 * see, so the probes below are what make `npm i -g agent-desktop` enough.
 * @returns candidate prefix directories.
 */
function globalPrefixes() {
  const prefixes = new Set();
  if (process.env.npm_config_prefix) prefixes.add(process.env.npm_config_prefix);
  if (process.env.NPM_CONFIG_PREFIX) prefixes.add(process.env.NPM_CONFIG_PREFIX);
  if (process.env.PNPM_HOME) prefixes.add(dirname(process.env.PNPM_HOME));
  if (process.platform === 'win32' && process.env.APPDATA) prefixes.add(join(process.env.APPDATA, 'npm'));
  if (process.platform !== 'win32') {
    prefixes.add('/usr/local');
    prefixes.add('/usr');
    prefixes.add(join(homedir(), '.local'));
    prefixes.add(join(homedir(), '.npm-global'));
  }
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (!entry) continue;
    prefixes.add(entry);
    // <prefix>/bin -> <prefix>, and <prefix>/node_modules/.bin -> <prefix>
    prefixes.add(dirname(entry));
    if (entry.endsWith(`${sep}node_modules${sep}.bin`) || entry.endsWith('/node_modules/.bin')) {
      prefixes.add(dirname(dirname(entry)));
    }
  }
  return [...prefixes];
}

/**
 * Turn a package directory into the launcher path this platform should run.
 * @param packageDir - directory containing agent-desktop's package.json.
 * @returns launcher path when one exists.
 */
function launcherInPackage(packageDir) {
  const launcher = join(packageDir, LAUNCHER_RELATIVE);
  if (existsSync(launcher)) return launcher;
  const native = NATIVE_BINARY_BY_PLATFORM[`${process.platform}-${process.arch}`];
  if (native) {
    const nativePath = join(packageDir, 'bin', native);
    if (existsSync(nativePath)) return nativePath;
  }
  return undefined;
}

/**
 * Locate agent-desktop's entry point.
 *
 * Order: explicit config, environment override, the package resolvable from this
 * plugin, then every global prefix (npm/pnpm/path-derived) that carries the package.
 * @param config - plugin config; `command` wins over every probe.
 * @returns absolute path to a launcher/executable when found, otherwise `undefined`.
 */
export function resolveLauncher(config = {}) {
  if (typeof config.command === 'string' && config.command.length > 0) {
    if (isAbsolute(config.command) && existsSync(config.command)) return config.command;
    const onPath = resolveOnPath(config.command);
    if (onPath) return onPath;
  }
  for (const key of ['AGENT_DESKTOP_LAUNCHER', 'AGENT_DESKTOP_BIN']) {
    const override = process.env[key];
    if (override && existsSync(override)) return override;
  }
  try {
    const packageJson = createRequire(import.meta.url).resolve('agent-desktop/package.json');
    const found = launcherInPackage(dirname(packageJson));
    if (found) return found;
  } catch {
    // not installed as a resolvable dependency — fall through to global probes
  }
  for (const prefix of globalPrefixes()) {
    for (const packageDir of [
      join(prefix, 'node_modules', 'agent-desktop'),
      join(prefix, 'lib', 'node_modules', 'agent-desktop'),
    ]) {
      try {
        if (!statSync(packageDir).isDirectory()) continue;
      } catch {
        continue;
      }
      const found = launcherInPackage(packageDir);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Resolve a bare command name (e.g. `agent-desktop`) to the launcher inside the
 * package that owns it, so the result is always an executable we can spawn.
 * @param command - absolute or bare command from configuration.
 * @returns launcher path when found.
 */
function resolveOnPath(command) {
  if (isAbsolute(command)) return existsSync(command) ? command : undefined;
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (!entry) continue;
    const direct = join(entry, command);
    if (existsSync(direct)) return direct;
    const packageDir = join(entry, 'node_modules', 'agent-desktop');
    const found = launcherInPackage(packageDir);
    if (found) return found;
  }
  return undefined;
}

/**
 * Load the harness-provided MCP client bridge.
 *
 * The package is internal to a dsh installation (it is not published to npm), so
 * resolution is attempted from this plugin, then from the running harness entry.
 * @returns the module namespace of `@deepseek-ai/dsh-mcp-client`.
 */
async function loadMcpClient() {
  try {
    return await import('@deepseek-ai/dsh-mcp-client');
  } catch (first) {
    const anchors = [process.argv[1], join(process.cwd(), 'index.js')].filter(Boolean);
    const failures = [`bare import: ${first?.message ?? first}`];
    for (const anchor of anchors) {
      try {
        const resolved = createRequire(anchor).resolve('@deepseek-ai/dsh-mcp-client');
        return await import(pathToFileURL(resolved).href);
      } catch (error) {
        failures.push(`${anchor}: ${error?.message ?? error}`);
      }
    }
    throw new Error(
      'dsh-agent-desktop: cannot resolve @deepseek-ai/dsh-mcp-client. '
      + 'This package is shipped with every dsh profile; install the plugin into a dsh profile '
      + `("dsh plugin --profile web add <this package>") instead of a bare project. Tried: ${failures.join(' | ')}`,
    );
  }
}

/**
 * Build the stdio config the MCP client bridge understands.
 * Every field is spelled out because schema defaults are applied by the loader,
 * which does not run for a programmatic `apply()` call.
 * @param options - resolved plugin settings.
 * @returns a complete stdio MCP client config.
 */
export function buildMcpConfig(options) {
  return {
    transport: 'stdio',
    serverName: options.serverName,
    command: process.execPath,
    args: [options.launcher, 'mcp', ...(options.extraArgs ?? [])],
    env: {},
    cwd: '',
    toolCallTimeoutMs: options.toolCallTimeoutMs,
    failOnStartupError: false,
    maxInstructionBytes: DEFAULT_MAX_INSTRUCTION_BYTES,
    reconnect: {
      enabled: true,
      initialDelayMs: 500,
      maxDelayMs: 30_000,
      maxAttempts: 10,
    },
  };
}

/** Copy-paste fix shown when agent-desktop cannot be found. */
export const MISSING_BINARY_HINT = [
  'dsh-agent-desktop: agent-desktop was not found, so no mcp__desktop__* tools are registered.',
  'Install it once, then restart the harness:',
  '  npm i -g agent-desktop        # or: pnpm add -g agent-desktop',
  'Already installed somewhere custom? Point the plugin at it:',
  '  export AGENT_DESKTOP_BIN=/absolute/path/to/agent-desktop/bin/agent-desktop',
  '  # Windows: setx AGENT_DESKTOP_BIN "C:\\path\\node_modules\\agent-desktop\\bin\\agent-desktop"',
  'Check the probe result with: npx dsh-agent-desktop doctor',
].join('\n');

/**
 * Mount agent-desktop as `mcp__desktop__*` tools.
 *
 * A missing binary logs {@link MISSING_BINARY_HINT} and skips registration so the
 * harness still boots; set `failOnStartupError: true` to hard-fail instead.
 * @param ctx - plugin context (requires the `tools` service).
 * @param config - optional overrides: `serverName`, `command`, `extraArgs`,
 * `toolCallTimeoutMs`, `failOnStartupError`.
 */
export async function apply(ctx, config = {}) {
  const launcher = resolveLauncher(config);
  if (!launcher) {
    if (config.failOnStartupError === true) throw new Error(MISSING_BINARY_HINT);
    const warn = typeof ctx?.logger?.warn === 'function'
      ? ctx.logger.warn.bind(ctx.logger)
      : (...args) => console.warn(...args);
    warn(MISSING_BINARY_HINT);
    return;
  }

  const serverName = typeof config.serverName === 'string' && config.serverName.length > 0
    ? config.serverName
    : DEFAULT_SERVER_NAME;
  const toolCallTimeoutMs = Number.isFinite(config.toolCallTimeoutMs) && config.toolCallTimeoutMs > 0
    ? config.toolCallTimeoutMs
    : DEFAULT_TOOL_CALL_TIMEOUT_MS;
  const extraArgs = Array.isArray(config.extraArgs) ? config.extraArgs.map(String) : [];

  const mcpClient = await loadMcpClient();
  const raw = buildMcpConfig({ serverName, launcher, toolCallTimeoutMs, extraArgs });
  let resolved = raw;
  if (typeof mcpClient.Config === 'function') {
    try {
      resolved = mcpClient.Config(raw);
    } catch {
      resolved = raw;
    }
  }
  await mcpClient.apply(ctx, resolved);
}

/** Diagnostics used by the `doctor` command. */
export function describeResolution() {
  const launcher = resolveLauncher();
  return {
    ok: Boolean(launcher),
    launcher: launcher ?? null,
    platform: `${process.platform}-${process.arch}`,
    node: process.execPath,
    env: {
      AGENT_DESKTOP_BIN: process.env.AGENT_DESKTOP_BIN ?? null,
      AGENT_DESKTOP_LAUNCHER: process.env.AGENT_DESKTOP_LAUNCHER ?? null,
    },
    hint: launcher ? null : MISSING_BINARY_HINT,
  };
}