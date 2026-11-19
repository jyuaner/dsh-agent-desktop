/**
 * Smoke test: prove the exact spawn config the adapter hands to the harness
 * really starts an MCP server (initialize → tools/list), without needing a dsh
 * profile. Run with `node test/smoke.mjs`.
 */
import { spawn } from 'node:child_process';
import { buildMcpConfig, resolveLauncher } from '../lib/index.js';

const launcher = resolveLauncher();
if (!launcher) {
  console.error('FAIL: agent-desktop launcher not found; run `npm install` first.');
  process.exit(1);
}

const config = buildMcpConfig({
  serverName: 'desktop',
  launcher,
  toolCallTimeoutMs: 120_000,
  extraArgs: [],
});

const child = spawn(config.command, config.args, { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '';
let stderr = '';
const pending = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

function rpc(id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 30_000);
    pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

try {
  const init = await rpc(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'dsh-agent-desktop-smoke', version: '1.0.0' },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
  const list = await rpc(2, 'tools/list', {});
  const tools = list.result?.tools ?? [];
  const names = tools.map((tool) => tool.name);
  const required = ['desktop_snapshot', 'desktop_click', 'desktop_type', 'desktop_screenshot'];
  const missing = required.filter((tool) => !names.includes(tool));
  console.log(JSON.stringify({
    launcher,
    protocolVersion: init.result?.protocolVersion,
    server: init.result?.serverInfo,
    toolCount: tools.length,
    missing,
  }, null, 2));
  if (init.error || list.error || missing.length > 0 || tools.length === 0) {
    console.error('FAIL');
    process.exitCode = 1;
  } else {
    console.log('OK');
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  if (stderr) console.error(stderr.slice(-2000));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => child.kill(), 300);
}