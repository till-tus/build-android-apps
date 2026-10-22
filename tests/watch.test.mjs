import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { watchProject } from '../server/src/project.mjs';
import { delay } from '../server/src/process.mjs';

test('watch keeps unchanged APK state, watches resources/catalogs, and skips superseded builds', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'android-watch-')), controller = new AbortController();
  const apk = path.join(root, 'app/build/outputs/apk/debug/app-debug.apk'), resource = path.join(root, 'app/src/main/res/raw/sample.bin'), catalog = path.join(root, 'libs.versions.toml');
  await mkdir(path.dirname(apk), { recursive: true }); await mkdir(path.dirname(resource), { recursive: true });
  await writeFile(resource, 'initial'); await writeFile(catalog, '# first');
  let builds = 0, installs = 0, launches = 0, log = '';
  const build = async () => {
    builds++;
    if (builds === 3) { await writeFile(catalog, '# changed during build'); await delay(150); }
    await writeFile(apk, await readFile(resource)); return { apks: [apk] };
  };
  const android = { device: async () => 'selected', install: async () => { installs++; }, launch: async () => { launches++; } };
  const watching = watchProject(android, { project: root, serial: 'selected', app: 'dev.test.app', debounceMs: 75 }, { signal: controller.signal, onOutput: s => { log += s; }, build });
  let failed; watching.catch(e => { failed = e; });
  const until = async condition => { const start = Date.now(); while (!condition()) { if (failed) throw failed; if (Date.now() - start > 5000) throw new Error(`Watch timed out: ${log}`); await delay(20); } };
  try {
    await until(() => installs === 1); await writeFile(catalog, '# catalog edit');
    await until(() => log.includes('APK unchanged')); assert.equal(installs, 1); assert.equal(launches, 1);
    await writeFile(resource, 'changed resource');
    await until(() => installs === 2); assert.ok(builds >= 4); assert.equal(launches, 2); assert.match(log, /before installing stale output/);
  } finally { controller.abort(); await watching; await rm(root, { recursive: true, force: true }); }
});
