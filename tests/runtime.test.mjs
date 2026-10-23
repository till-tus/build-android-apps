import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { nodeRange, nodeRuntimeStatus, assertNodeRuntime } from '../server/src/runtime.mjs';

test('runtime policy admits patched supported LTS lines and rejects vulnerable/EOL/prerelease versions', async () => {
  for (const version of ['v22.23.4', '22.23.5', 'v22.24.0', 'v24.22.1', 'v24.22.2', 'v24.23.0']) assert.equal(nodeRuntimeStatus(version).supported, true, version);
  for (const version of ['v20.20.0', 'v22.23.3', 'v22.22.99', 'v23.11.0', 'v24.18.0', 'v24.22.0', 'v25.6.1', 'v26.12.1', 'v24.22.1-rc.1', 'garbage']) {
    assert.equal(nodeRuntimeStatus(version).supported, false, version);
    assert.throws(() => assertNodeRuntime(version), /Install the latest patched Node 24/);
  }
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(pkg.engines.node, nodeRange); assert.equal(lock.packages[''].engines.node, nodeRange);
  assert.equal(nodeRuntimeStatus('v25.6.1').reason, 'end-of-life');
  assert.equal(nodeRuntimeStatus('v24.22.0').reason, 'outdated-security-patch');
});

test('bundled startup rejects an unsupported host while help and doctor diagnostics remain available', () => {
  // Override only the fixture process's version; production reads the real host.
  const run = command => spawnSync(process.execPath, ['--input-type=module', '-e',
    `Object.defineProperty(process, 'version', { value: 'v25.6.1' }); for (const name of ['ADB','EMULATOR','JAVA','SDKMANAGER','AVDMANAGER']) process.env['ANDROID_PLUGIN_'+name] = '__android_plugin_missing_tool__'; process.argv = ['node', 'cli.mjs', ${JSON.stringify(command)}]; await import('./server/dist/cli.mjs');`], { encoding: 'utf8', timeout: 10_000 });
  const mcp = run('mcp'); assert.equal(mcp.status, 1); assert.match(mcp.stderr, /security-outdated Node.js v25.6.1/); assert.equal(mcp.stdout, '');
  const help = run('help'); assert.equal(help.status, 0); assert.match(help.stdout, /24\.22\.1/);
  const doctor = run('doctor'); assert.equal(doctor.status, 0);
  const report = JSON.parse(JSON.parse(doctor.stdout).content[0].text);
  assert.equal(report.runtime.supported, false); assert.equal(report.runtime.reason, 'end-of-life'); assert.ok(report.nodeExecutable); assert.match(report.issues[0], /security-outdated Node.js v25.6.1/);
});
