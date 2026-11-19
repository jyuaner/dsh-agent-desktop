#!/usr/bin/env node
/**
 * dsh-agent-desktop CLI.
 *
 *   dsh-agent-desktop doctor   probe discovery, then ask agent-desktop for its own status
 *   dsh-agent-desktop setup    install agent-desktop globally (npm i -g) and re-probe
 *   dsh-agent-desktop version  print this package's version
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { describeResolution, resolveLauncher } from '../lib/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Run agent-desktop through its launcher with inherited stdio.
 * @param launcher - resolved launcher path.
 * @param args - CLI arguments, e.g. ['status'].
 * @returns exit code, or null when the child could not start.
 */
function runLauncher(launcher, args) {
  const result = spawnSync(process.execPath, [launcher, ...args], { stdio: 'inherit' });
  return result.status ?? null;
}

function doctor() {
  const report = describeResolution();
  console.log(JSON.stringify(report, null, 2));
  if (!report.launcher) {
    process.exitCode = 1;
    return;
  }
  console.log('\n--- agent-desktop status ---');
  const code = runLauncher(report.launcher, ['status']);
  if (code !== 0) process.exitCode = 1;
}

function setup() {
  const existing = resolveLauncher();
  if (existing) {
    console.log(`agent-desktop already available: ${existing}`);
    doctor();
    return;
  }
  console.log('Installing agent-desktop globally (npm i -g agent-desktop)…');
  const child = spawn('npm', ['i', '-g', 'agent-desktop', '--no-audit', '--no-fund'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error('npm install failed; install it manually and set AGENT_DESKTOP_BIN.');
      process.exitCode = code ?? 1;
      return;
    }
    doctor();
  });
}

const command = process.argv[2] ?? 'doctor';
switch (command) {
  case 'doctor':
    doctor();
    break;
  case 'setup':
    setup();
    break;
  case 'version':
  case '--version':
  case '-v':
    console.log(pkg.version);
    break;
  default:
    console.error('usage: dsh-agent-desktop <doctor|setup|version>');
    process.exitCode = 2;
}