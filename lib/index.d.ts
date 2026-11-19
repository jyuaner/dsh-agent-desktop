/** Public surface of the dsh-agent-desktop plugin. */

/** Plugin label shown by the loader. */
export declare const name: 'agent-desktop';

/** The tool registry is required; the MCP bridge registers every remote tool on it. */
export declare const inject: readonly ['tools'];

/** Copy-paste fix logged when the desktop engine cannot be found. */
export declare const MISSING_BINARY_HINT: string;

/** Optional plugin config accepted by the bundle entry. */
export interface AgentDesktopConfig {
  /** MCP server namespace; tools appear as `mcp__<serverName>__<tool>`. Defaults to `desktop`. */
  serverName?: string;
  /** Absolute path to an `agent-desktop` executable or launcher; overrides discovery. */
  command?: string;
  /** Extra CLI arguments appended after `mcp`. */
  extraArgs?: string[];
  /** Per-call timeout for MCP tool calls in milliseconds. Defaults to 120000. */
  toolCallTimeoutMs?: number;
  /** Extra environment for the spawned launcher, merged over the harness's scrubbed env. */
  env?: Record<string, string>;
  /** Throw instead of warning when the engine is missing. Defaults to false. */
  failOnStartupError?: boolean;
}

/** Settings after validation and defaulting. */
export interface NormalizedAgentDesktopConfig {
  serverName: string;
  toolCallTimeoutMs: number;
  extraArgs: string[];
  env: Record<string, string>;
  failOnStartupError: boolean;
  command: string | undefined;
}

/** Validate the profile-patch config, applying documented defaults. */
export declare function normalizeConfig(config?: AgentDesktopConfig): NormalizedAgentDesktopConfig;

/** Locate agent-desktop's launcher for this platform, or `undefined` when absent. */
export declare function resolveLauncher(config?: Pick<AgentDesktopConfig, 'command'>): string | undefined;

/** Build the stdio MCP client config the adapter delegates to the harness bridge. */
export declare function buildMcpConfig(options: {
  serverName: string;
  launcher: string;
  toolCallTimeoutMs: number;
  extraArgs?: string[];
  env?: Record<string, string>;
  failOnStartupError?: boolean;
}): Record<string, unknown>;

/** Cordis plugin entry: registers the MCP client for agent-desktop. */
export declare function apply(ctx: unknown, config?: AgentDesktopConfig): Promise<void>;

/** Diagnostics used by `dsh-agent-desktop doctor`. */
export declare function describeResolution(): {
  ok: boolean;
  launcher: string | null;
  platform: string;
  node: string;
  env: { AGENT_DESKTOP_BIN: string | null; AGENT_DESKTOP_LAUNCHER: string | null };
  hint: string | null;
};