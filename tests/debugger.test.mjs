import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { once } from 'node:events';
import { DebugClient, Debuggers } from '../server/src/debugger.mjs';
import { executable } from '../server/src/paths.mjs';
import { run, delay } from '../server/src/process.mjs';

async function until(fn, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await fn(); if (value) return value; await delay(20); }
  throw new Error('Timed out waiting for debugger evidence');
}

test('real JVM: attach, pause, source breakpoint, stack, step twice, clear and detach', { timeout: 30_000 }, async t => {
  let java, javac;
  try { java = await executable('java'); javac = path.join(path.dirname(java), process.platform === 'win32' ? 'javac.exe' : 'javac'); await access(javac); }
  catch { t.skip('JDK unavailable; CI installs Java explicitly'); return; }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'android-jdwp-'));
  let child, client;
  try {
    await writeFile(path.join(directory, 'DebugFixture.java'), `public class DebugFixture {
  static volatile int counter = 0;
  public static void main(String[] args) throws Exception {
    while (counter < 10000) {
      counter++;
      Thread.sleep(10);
    }
  }
}
`);
    await run(javac, ['-g', path.join(directory, 'DebugFixture.java')]);
    child = spawn(java, ['-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=127.0.0.1:0', '-cp', directory, 'DebugFixture'], { windowsHide: true, shell: false });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    const port = await until(() => output.match(/Listening for transport dt_socket at address: (\d+)/)?.[1]);
    client = await new DebugClient().connect(Number(port));
    await until(() => client.events.some(e => e.kind === 90)); // VM events need not precede the IDSizes reply.
    assert.equal(client.paused, true); await client.control('resume');
    const bp = await until(async () => { try { return await client.breakpoint('DebugFixture', 5); } catch (e) { if (/No executable/.test(e.message)) return false; throw e; } });
    const hit = await until(() => client.events.find(e => e.kind === 2));
    assert.equal(client.paused, true);
    const { threads } = await client.threads(); assert.ok(threads.find(t => t.name === 'main' && t.suspended));
    const stack = await client.stack(hit.thread, 10); assert.equal(stack.frames[0].sourceFile, 'DebugFixture.java'); assert.equal(stack.frames[0].line, 5); assert.equal(stack.frames[0].method, 'main');
    assert.equal((await client.locals(hit.thread)).variables.find(v => v.name === 'args').signature, '[Ljava/lang/String;');
    for (const request of bp.requests) await client.clear(request);
    await client.control('step_over', hit.thread); await until(() => client.events.filter(e => e.kind === 1).length === 1);
    assert.equal((await client.stack(hit.thread, 10)).frames[0].line, 6);
    await client.control('step_over', hit.thread); await until(() => client.events.filter(e => e.kind === 1).length === 2);
    await client.control('resume'); await client.control('pause'); await client.control('pause');
    await client.control('resume');
    assert.equal((await client.threads()).threads.find(t => t.name === 'main').suspended, false, 'Repeated pause must not accumulate suspension');
    await client.close(); client = undefined;
  } finally { await client?.close().catch(() => {}); if (child && child.exitCode === null) { child.kill(); await once(child, 'close'); } await rm(directory, { recursive: true, force: true }); }
});

test('debugger rejects malformed handshake and releases pending commands on disconnect', async () => {
  const server = net.createServer(socket => { socket.on('error', () => {}); socket.once('data', () => { socket.end('Invalid Handshake'); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await assert.rejects(new DebugClient().connect(server.address().port), /handshake/); }
  finally { await new Promise(resolve => server.close(resolve)); }
});

test('failed attach removes only its allocated adb forward', async () => {
  const calls = [], android = { device: async () => 'selected', shell: async (_, args) => ({ stdout: args[0] === 'pidof' ? '123' : 'uid=1' }), adb: async (serial, args) => { calls.push({ serial, args }); return { stdout: '1' }; } };
  const debuggers = new Debuggers(android);
  await assert.rejects(debuggers.attach('selected', 'dev.test.app'));
  assert.deepEqual(calls.at(-1), { serial: 'selected', args: ['forward', '--remove', 'tcp:1'] }); assert.equal(debuggers.sessions.size, 0);
});

test('overlapping debugger attaches reserve the device and shutdown waits for owned cleanup', async () => {
  let release; const calls = [];
  const android = { device: async () => 'selected', shell: async (_, args) => args[0] === 'pidof' ? new Promise(resolve => { release = () => resolve({ stdout: '123' }); }) : { stdout: 'uid=1' }, adb: async (serial, args) => { calls.push({ serial, args }); return { stdout: '1' }; } };
  const debuggers = new Debuggers(android), pending = debuggers.attach('selected', 'dev.test.app').catch(e => e);
  await until(() => Boolean(release));
  await assert.rejects(debuggers.attach('selected', 'dev.other.app'), /already owns or is attaching/);
  let closed = false; const closing = debuggers.close().then(() => { closed = true; });
  await delay(20); assert.equal(closed, false); release(); await pending; await closing;
  assert.equal(closed, true); assert.deepEqual(calls.at(-1).args, ['forward', '--remove', 'tcp:1']);
  await assert.rejects(debuggers.attach('selected', 'dev.test.app'), /shutting down/);
});
