import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { run, remoteQuote, delay } from './process.mjs';
import { executable, sdkRoot, sdkCommand, exists } from './paths.mjs';
import { parseHierarchy } from './hierarchy.mjs';

export const packageName = value => {
  if (!/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(value)) throw new Error('Expected an Android package name, such as com.example.app');
  return value;
};
export const serialName = value => {
  if (!/^[\w.:-]{1,160}$/.test(value)) throw new Error('Invalid device serial'); return value;
};
export function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}`); return value;
}
const safeName = value => { if (!/^[A-Za-z][\w.-]{0,79}$/.test(value)) throw new Error('Invalid AVD name'); return value; };

export class Android {
  constructor() { this.cache = new Map(); this.dumps = new Map(); }
  async adb(serial, args, options) { return run(await executable('adb'), [...(serial ? ['-s', serialName(serial)] : []), ...args], options); }
  async shell(serial, args, options) { return this.adb(serial, ['shell', args.map(remoteQuote).join(' ')], options); }
  async devices() {
    const { stdout } = await this.adb(null, ['devices', '-l']);
    return stdout.split(/\r?\n/).slice(1).filter(line => line.trim() && !line.startsWith('*')).map(line => {
      const [serial, state, ...fields] = line.trim().split(/\s+/);
      return { serial, state, ...Object.fromEntries(fields.filter(v => v.includes(':')).map(v => { const i = v.indexOf(':'); return [v.slice(0, i), v.slice(i + 1)]; })) };
    });
  }
  async device(serial) {
    const devices = await this.devices();
    if (serial) {
      const found = devices.find(d => d.serial === serialName(serial));
      if (!found || found.state !== 'device') throw new Error(`Device ${serial} is ${found?.state || 'not connected'}. Check adb devices and authorize USB debugging.`);
      return found.serial;
    }
    const ready = devices.filter(d => d.state === 'device');
    if (ready.length !== 1) throw new Error(ready.length ? 'Multiple devices are connected; specify serial explicitly.' : 'No Android device is ready. Start an AVD or connect an authorized device.');
    return ready[0].serial;
  }
  async doctor() {
    const checks = { platform: process.platform, arch: process.arch, node: process.version, sdk: null, tools: {}, devices: [], avds: [], issues: [] };
    try { checks.sdk = await sdkRoot(); } catch (e) { checks.issues.push(e.message); }
    for (const name of ['adb', 'emulator', 'java', 'sdkmanager', 'avdmanager']) {
      try { checks.tools[name] = await executable(name); } catch (e) { checks.issues.push(e.message); }
    }
    if (checks.tools.java) { try { checks.java = (await run(checks.tools.java, ['-version'])).stderr; } catch (e) { checks.issues.push(e.message); } }
    if (checks.tools.adb) { try { checks.devices = await this.devices(); } catch (e) { checks.issues.push(e.message); } }
    if (checks.tools.emulator) { try { checks.avds = await this.avds(); checks.acceleration = await run(checks.tools.emulator, ['-accel-check']); } catch (e) { checks.issues.push(e.message); } }
    checks.setup = 'https://developer.android.com/studio/install'; return checks;
  }
  async avds() { return (await run(await executable('emulator'), ['-list-avds'])).stdout.trim().split(/\r?\n/).filter(Boolean); }
  async startEmulator({ avd, headless = true, timeout = 180_000, signal } = {}) {
    safeName(avd); if (!(await this.avds()).includes(avd)) throw new Error(`AVD ${avd} does not exist. Use emulator_create or Android Studio Device Manager.`);
    for (const d of await this.devices()) if (d.state === 'device' && d.serial.startsWith('emulator-')) {
      const name = (await this.adb(d.serial, ['emu', 'avd', 'name'])).stdout.split(/\r?\n/)[0];
      if (name === avd) return { serial: d.serial, avd, reused: true };
    }
    const port = await emulatorPort(); const serial = `emulator-${port}`;
    const logPath = path.join(os.tmpdir(), `build-android-emulator-${port}.log`);
    const { open } = await import('node:fs/promises'); const log = await open(logPath, 'a');
    const child = spawn(await executable('emulator'), ['-avd', avd, '-port', String(port), '-accel', 'on', '-no-boot-anim', '-no-snapshot-save', ...(headless ? ['-no-window'] : [])],
      { detached: true, stdio: ['ignore', log.fd, log.fd], windowsHide: true, shell: false });
    let startupError; child.on('error', e => { startupError = e; }); child.unref(); await log.close();
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (startupError) throw startupError;
      if (signal?.aborted) { await this.adb(serial, ['emu', 'kill']).catch(() => {}); throw new Error('Emulator startup canceled'); }
      if (child.exitCode !== null) throw new Error(`Emulator exited during startup. See ${logPath}`);
      try {
        if ((await this.shell(serial, ['getprop', 'sys.boot_completed'], { timeout: 5000 })).stdout.trim() === '1') return { serial, avd, logPath, reused: false };
      } catch { /* adbd not ready */ }
      await delay(1200);
    }
    throw new Error(`Emulator ${serial} did not finish booting. It may still be starting; inspect ${logPath}.`);
  }
  async stopEmulator(serial) {
    if (!/^emulator-\d+$/.test(serial)) throw new Error('Only emulator serials can be stopped.');
    return this.adb(serial, ['emu', 'kill']);
  }
  async sdk({ packages = [], acceptLicenses = false, list = false, signal, onOutput } = {}) {
    for (const pkg of packages) if (!/^[a-zA-Z0-9_.;-]+$/.test(pkg) || pkg.startsWith('-')) throw new Error('Invalid SDK package identifier');
    const cmd = await sdkCommand('sdkmanager');
    const args = cmd.native ? (list ? ['list', '--all'] : ['install', ...packages.map(pkg => pkg.replaceAll(';', '/'))]) : list ? ['--list'] : packages;
    return run(cmd.file, [...cmd.args, ...args], { timeout: 20 * 60_000, input: acceptLicenses ? 'y\n'.repeat(100) : 'n\n'.repeat(100), signal, onOutput });
  }
  async createEmulator({ name, systemImage, device = 'pixel_6', signal, onOutput }) {
    safeName(name);
    if (!/^system-images;android-\d+(?:\.\d+)?;[\w.-]+;(arm64-v8a|x86_64)$/.test(systemImage)) throw new Error('Expected a system-images;android-N;tag;ABI package');
    if (!/^[\w.-]+$/.test(device)) throw new Error('Invalid hardware profile');
    if ((await this.avds()).includes(name)) throw new Error('An AVD with that name already exists; it will not be overwritten.');
    const cmd = await sdkCommand('avdmanager');
    return run(cmd.file, [...cmd.args, 'create', 'avd', '--name', name, '--package', systemImage, '--device', device], { input: 'no\n', timeout: 60_000, signal, onOutput });
  }
  async screenshot(serial) {
    serial = await this.device(serial);
    const result = (await this.adb(serial, ['exec-out', 'screencap', '-p'], { binary: true })).stdout;
    if (!result.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Device did not return a PNG screenshot');
    return result;
  }
  async inspect(serial, { fresh = false } = {}) {
    serial = await this.device(serial);
    if (!fresh && Date.now() - (this.cache.get(serial)?.capturedAt || 0) < 2500) return this.cache.get(serial);
    if (this.dumps.has(serial)) return this.dumps.get(serial);
    const operation = (async () => {
      const remote = `/data/local/tmp/codex-ui-${randomUUID()}.xml`;
      try {
        await this.shell(serial, ['uiautomator', 'dump', '--compressed', remote], { timeout: 15_000 });
        const xml = (await this.shell(serial, ['cat', remote])).stdout;
        const tree = { ...parseHierarchy(xml), serial }; this.cache.set(serial, tree); return tree;
      } finally { await this.shell(serial, ['rm', '-f', remote]).catch(() => {}); }
    })();
    this.dumps.set(serial, operation);
    try { return await operation; } finally { this.dumps.delete(serial); }
  }
  async input(serial, action) {
    serial = await this.device(serial); let args;
    const coord = n => String(integer(n, 0, 32_768, 'Coordinate'));
    if (action.type === 'tap') args = ['input', 'tap', coord(action.x), coord(action.y)];
    else if (action.type === 'swipe') args = ['input', 'swipe', coord(action.x), coord(action.y), coord(action.endX), coord(action.endY), String(integer(action.duration ?? 300, 50, 5000, 'Duration'))];
    else if (action.type === 'key') {
      const aliases = { BACK: 4, HOME: 3, RECENTS: 187, ENTER: 66, BACKSPACE: 67, DELETE: 112, TAB: 61, ESCAPE: 111, LEFT: 21, RIGHT: 22, UP: 19, DOWN: 20, POWER: 26, VOLUME_UP: 24, VOLUME_DOWN: 25 };
      const key = aliases[action.key]; if (!key) throw new Error('Unsupported Android key'); args = ['input', 'keyevent', String(key)];
    } else if (action.type === 'text') {
      if (typeof action.text !== 'string' || action.text.length > 2000 || /[^\x20-\x7e]/.test(action.text)) throw new Error('ADB text input supports printable ASCII only. Use the device keyboard for Unicode.');
      if (action.text.includes('%s')) throw new Error('Literal %s cannot be represented by Android input text; use the device keyboard.');
      args = ['input', 'text', action.text.replaceAll(' ', '%s')];
    } else throw new Error('Unsupported input action');
    const result = await this.shell(serial, args); this.cache.delete(serial); return result;
  }
  async install(serial, apks) {
    serial = await this.device(serial);
    if (!apks?.length) throw new Error('At least one APK is required');
    for (const apk of apks) if (!apk.endsWith('.apk') || !(await exists(apk))) throw new Error(`APK not found: ${apk}`);
    return this.adb(serial, [apks.length > 1 ? 'install-multiple' : 'install', '-r', ...apks.map(a => path.resolve(a))], { timeout: 120_000 });
  }
  async launch(serial, app, activity) {
    serial = await this.device(serial); packageName(app);
    if (activity && !/^[\w.$/]+$/.test(activity)) throw new Error('Invalid activity');
    let component = activity?.includes('/') ? activity : activity ? `${app}/${activity}` : undefined;
    if (!component) {
      component = (await this.shell(serial, ['cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', app])).stdout.trim().split(/\r?\n/).find(v => v.includes('/') && !v.includes(' '));
    }
    if (!component) throw new Error(`No launcher activity found for ${app}; supply activity explicitly.`);
    const result = await this.shell(serial, ['am', 'start', '-W', '-n', component]);
    if (/Error:|Exception|does not exist/.test(result.stdout)) throw new Error(result.stdout);
    this.cache.delete(serial); return { component, ...result };
  }
  async logcat(serial, { app, lines = 300, level = 'V' } = {}) {
    serial = await this.device(serial); integer(lines, 1, 5000, 'Lines');
    if (!/^[VDIWEF]$/.test(level)) throw new Error('Invalid log level');
    const args = ['logcat', '-d', '-t', String(lines), '-v', 'threadtime'];
    if (app) {
      packageName(app); const pid = (await this.shell(serial, ['pidof', app])).stdout.trim().split(' ')[0];
      if (!/^\d+$/.test(pid)) throw new Error('App is not running'); args.push('--pid', pid);
    }
    args.push(`*:${level}`); return this.adb(serial, args, { maxBytes: 4_000_000 });
  }
  async memory(serial, app) { return this.shell(await this.device(serial), ['dumpsys', 'meminfo', packageName(app)]); }
  async frames(serial, app, reset = false) { return this.shell(await this.device(serial), ['dumpsys', 'gfxinfo', packageName(app), reset ? 'reset' : 'framestats']); }
  async capture(serial, { kind = 'trace', seconds = 10, output, app, signal }) {
    serial = await this.device(serial); integer(seconds, 1, kind === 'video' ? 180 : 60, 'Seconds');
    // traced's SELinux domain cannot write shell_data_file under /data/local/tmp.
    const remote = `${kind === 'trace' ? '/data/misc/perfetto-traces' : '/data/local/tmp'}/codex-${randomUUID()}.${kind === 'video' ? 'mp4' : kind === 'heap' ? 'hprof' : 'perfetto-trace'}`;
    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
    try {
      if (kind === 'video') await this.shell(serial, ['screenrecord', '--time-limit', String(seconds), remote], { timeout: (seconds + 15) * 1000, signal });
      else if (kind === 'heap') {
        const result = await this.shell(serial, ['am', 'dumpheap', packageName(app), remote], { signal });
        if (/failed|not debuggable|unknown process|error/i.test(result.stdout + result.stderr)) throw new Error(result.stdout + result.stderr);
        let previous = -1, ready = false;
        for (let i = 0; i < 60; i++) {
          if (signal?.aborted) throw new Error('Heap capture canceled');
          const size = Number((await this.shell(serial, ['stat', '-c', '%s', remote]).catch(() => ({ stdout: '0' }))).stdout.trim());
          if (size > 0 && size === previous) { ready = true; break; } previous = size; await delay(500);
        }
        if (!ready) throw new Error('Heap dump did not finish within 30 seconds');
      } else if (kind === 'trace') await this.shell(serial, ['perfetto', '-o', remote, '-t', `${seconds}s`, 'sched', 'freq', 'idle', 'am', 'wm', 'gfx', 'view', 'binder_driver'], { timeout: (seconds + 20) * 1000, signal });
      else throw new Error('Invalid capture kind');
      await this.adb(serial, ['pull', remote, path.resolve(output)], { timeout: 120_000, signal });
      return { output: path.resolve(output), kind, serial };
    } finally { await this.shell(serial, ['rm', '-f', remote]).catch(() => {}); }
  }
}

async function emulatorPort() {
  const free = port => new Promise(resolve => { const server = net.createServer(); server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => server.close(() => resolve(true))); });
  for (let port = 5554; port <= 5680; port += 2) if (await free(port) && await free(port + 1)) return port;
  throw new Error('No emulator console port is available');
}

export async function describeProject(project) {
  const root = path.resolve(project); const modules = [], apks = []; let count = 0;
  async function walk(dir, depth = 0) {
    if (depth > 12 || count > 25_000) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (++count > 25_000 || entry.isSymbolicLink() || ['.git', '.gradle', 'node_modules', '.idea', '.kotlin'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(file, depth + 1); continue; }
      if (/^build\.gradle(?:\.kts)?$/.test(entry.name)) modules.push(path.relative(root, dir) || '.');
      if (entry.name.endsWith('.apk')) apks.push(file);
    }
  }
  await walk(root); return { root, modules, apks, wrapper: await exists(path.join(root, 'gradle/wrapper/gradle-wrapper.jar')) };
}

export async function buildProject(project, tasks = ['assembleDebug'], { signal, onOutput } = {}) {
  const root = path.resolve(project);
  if (!tasks.length || tasks.some(t => !/^:?[\w:-]+$/.test(t) || t.startsWith('-'))) throw new Error('Gradle tasks must be task names, such as :app:assembleDebug');
  const jar = path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.jar');
  if (!(await exists(jar))) throw new Error('Gradle wrapper JAR missing. Generate a wrapper or create a project first.');
  const java = await executable('java'); let sdk; try { sdk = await sdkRoot(); } catch { /* local.properties may configure SDK */ }
  const result = await run(java, ['-classpath', jar, 'org.gradle.wrapper.GradleWrapperMain', '--console=plain', ...tasks], {
    cwd: root, env: { JAVA_HOME: path.dirname(path.dirname(java)), ...(sdk ? { ANDROID_HOME: sdk } : {}) }, signal, onOutput, timeout: 20 * 60_000, maxBytes: 32_000_000
  });
  return { ...result, ...(await describeProject(root)) };
}
