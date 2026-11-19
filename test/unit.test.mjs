/**
 * Unit tests for the adapter's decision surface — no harness, no display, no
 * agent-desktop required. Run with `node --test test/unit.test.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MISSING_BINARY_HINT,
  buildMcpConfig,
  describeResolution,
  normalizeConfig,
  resolveLauncher,
} from '../lib/index.js';

test('normalizeConfig applies the documented defaults', () => {
  assert.deepEqual(normalizeConfig({}), {
    serverName: 'desktop',
    toolCallTimeoutMs: 120_000,
    extraArgs: [],
    env: {},
    failOnStartupError: false,
    command: undefined,
  });
});

test('normalizeConfig keeps explicit overrides', () => {
  const config = normalizeConfig({
    serverName: 'windows_box',
    toolCallTimeoutMs: 1000,
    extraArgs: ['--headed', 7],
    env: { FOO: 1 },
    failOnStartupError: true,
    command: '/opt/agent-desktop',
  });
  assert.equal(config.serverName, 'windows_box');
  assert.equal(config.toolCallTimeoutMs, 1000);
  assert.deepEqual(config.extraArgs, ['--headed', '7']);
  assert.deepEqual(config.env, { FOO: '1' });
  assert.equal(config.failOnStartupError, true);
  assert.equal(config.command, '/opt/agent-desktop');
});

test('normalizeConfig rejects a namespace the bridge would refuse', () => {
  assert.throws(() => normalizeConfig({ serverName: 'has space' }), /serverName must match/);
  assert.throws(() => normalizeConfig({ serverName: 'x'.repeat(33) }), /serverName must match/);
  assert.throws(() => normalizeConfig({ serverName: '' }), /serverName must match/);
  assert.throws(() => normalizeConfig({ serverName: 5 }), /serverName must match/);
});

test('normalizeConfig rejects unusable field types', () => {
  assert.throws(() => normalizeConfig({ toolCallTimeoutMs: 0 }), /toolCallTimeoutMs/);
  assert.throws(() => normalizeConfig({ toolCallTimeoutMs: 1.5 }), /toolCallTimeoutMs/);
  assert.throws(() => normalizeConfig({ extraArgs: 'mcp' }), /extraArgs/);
  assert.throws(() => normalizeConfig({ env: ['A=1'] }), /env must be a mapping/);
  assert.throws(() => normalizeConfig(null), /config must be a mapping/);
});

test('buildMcpConfig spawns node with the launcher, never a shell shim', () => {
  const config = buildMcpConfig({
    serverName: 'desktop',
    launcher: 'C:\\some where\\agent-desktop\\bin\\agent-desktop',
    toolCallTimeoutMs: 42,
    extraArgs: ['--headed'],
    env: { AGENT_DESKTOP_MACOS_HELPER_PATH: '/tmp/helper' },
    failOnStartupError: true,
  });
  assert.equal(config.transport, 'stdio');
  assert.equal(config.command, process.execPath);
  assert.deepEqual(config.args, ['C:\\some where\\agent-desktop\\bin\\agent-desktop', 'mcp', '--headed']);
  assert.equal(config.toolCallTimeoutMs, 42);
  assert.deepEqual(config.env, { AGENT_DESKTOP_MACOS_HELPER_PATH: '/tmp/helper' });
  assert.equal(config.failOnStartupError, true);
  assert.equal(config.cwd, '');
  assert.equal(config.maxInstructionBytes, 32_768);
  assert.deepEqual(config.reconnect, { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 });
});

test('resolveLauncher honours an explicit absolute command first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ad-'));
  const fake = join(dir, 'agent-desktop');
  writeFileSync(fake, '#!/bin/sh\n');
  try {
    assert.equal(resolveLauncher({ command: fake }), fake);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveLauncher honours AGENT_DESKTOP_BIN over discovery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ad-'));
  const fake = join(dir, 'agent-desktop');
  writeFileSync(fake, '#!/bin/sh\n');
  const previous = process.env.AGENT_DESKTOP_BIN;
  process.env.AGENT_DESKTOP_BIN = fake;
  try {
    assert.equal(resolveLauncher({}), fake);
  } finally {
    if (previous === undefined) delete process.env.AGENT_DESKTOP_BIN;
    else process.env.AGENT_DESKTOP_BIN = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a bogus command never becomes a bogus launcher', () => {
  // Either discovery found a real install or nothing was found; the bogus path is never returned.
  const found = resolveLauncher({ command: join(tmpdir(), 'definitely-not-here', 'agent-desktop') });
  assert.ok(found === undefined || !found.includes('definitely-not-here'));
});

test('the missing-binary hint is actionable', () => {
  assert.match(MISSING_BINARY_HINT, /npm i -g agent-desktop/);
  assert.match(MISSING_BINARY_HINT, /AGENT_DESKTOP_BIN/);
  assert.match(MISSING_BINARY_HINT, /dsh-agent-desktop doctor/);
});

test('describeResolution reports the probe state', () => {
  const report = describeResolution();
  assert.equal(typeof report.ok, 'boolean');
  assert.equal(typeof report.platform, 'string');
  assert.equal(report.node, process.execPath);
  assert.ok(report.launcher === null || typeof report.launcher === 'string');
  assert.equal(report.ok, report.launcher !== null);
  assert.equal(report.ok, report.hint === null);
});