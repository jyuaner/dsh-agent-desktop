/** Public surface of the dsh-agent-desktop plugin. */
export declare const name: 'agent-desktop';
export declare const inject: readonly ['tools'];

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
}

/** Locate agent-desktop's launcher for this platform, or `undefined` when absent. */
export declare function resolveLauncher(config?: AgentDesktopConfig): string | undefined;

/** Build the stdio MCP client config the adapter delegates to the harness bridge. */
export declare function buildMcpConfig(options: {
  serverName: string;
  launcher: string;
  toolCallTimeoutMs: number;
  extraArgs: string[];
}): Record<string, unknown>;

/** Cordis plugin entry: registers the MCP client for agent-desktop. */
export declare function apply(ctx: unknown, config?: AgentDesktopConfig): Promise<void>;