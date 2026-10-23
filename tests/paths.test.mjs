import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, symlink, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { executable, javaRuntime } from '../server/src/paths.mjs';
import { run } from '../server/src/process.mjs';

test('JAVA_HOME comes from the running JVM even when its launcher is outside the JDK', { timeout: 60_000 }, async t => {
  let java;
  try { java = await executable('java'); await run(java, ['-version']); }
  catch { t.skip('Java unavailable; CI installs a JDK'); return; }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'android java home '));
  try {
    let launcher = java;
    // Windows symlink creation needs privileges; its ordinary JVM path still
    // exercises the same property query and JAVA_HOME handoff below.
    if (process.platform !== 'win32') {
      launcher = path.join(directory, 'java'); await symlink(java, launcher);
    }
    const runtime = await javaRuntime(launcher);
    await access(path.join(runtime.home, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac'));
    const probe = path.join(directory, 'HomeProbe.java');
    await writeFile(probe, 'class HomeProbe { public static void main(String[] args) { System.out.print(System.getenv("JAVA_HOME") + "\\n" + System.getProperty("java.home")); } }');
    const result = await run(runtime.file, [probe], { env: { JAVA_HOME: runtime.home }, timeout: 45_000 });
    assert.equal(result.stdout, `${runtime.home}\n${runtime.home}`);
    if (process.platform !== 'win32') assert.notEqual(runtime.home, path.dirname(path.dirname(launcher)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
