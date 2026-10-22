import path from 'node:path';
import os from 'node:os';
import { access, readdir, readFile } from 'node:fs/promises';

export async function exists(file) { try { await access(file); return true; } catch { return false; } }

export function sdkCandidates({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  return [...new Set([env.ANDROID_HOME, env.ANDROID_SDK_ROOT,
    platform === 'darwin' ? paths.join(home, 'Library', 'Android', 'sdk') : undefined,
    platform === 'win32' ? path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'Android', 'Sdk') : undefined,
    paths.join(home, 'Android', 'Sdk')].filter(Boolean))];
}

export async function sdkRoot() {
  for (const dir of sdkCandidates()) if (await exists(dir)) return dir;
  throw new Error('Android SDK not found. Install Android Studio and set ANDROID_HOME to its SDK directory. Run doctor for setup instructions.');
}

export async function sdkToolDirectories(root) {
  const base = path.join(root, 'cmdline-tools');
  const names = await readdir(base).catch(() => []);
  const entries = await Promise.all(names.map(async name => {
    const directory = path.join(base, name);
    const source = await readFile(path.join(directory, 'source.properties'), 'utf8').catch(() => '');
    const revision = /^Pkg.Revision\s*=\s*([\d.]+)/m.exec(source)?.[1] || '0';
    return { directory, revision };
  }));
  // sdkmanager may install current tools as latest-2 when an obsolete latest folder exists.
  return entries.sort((a, b) => b.revision.localeCompare(a.revision, undefined, { numeric: true })).map(e => e.directory);
}

export async function executable(name) {
  const override = process.env[`ANDROID_PLUGIN_${name.toUpperCase()}`];
  if (override) { if (await exists(override)) return override; throw new Error(`${name} override does not exist: ${override}`); }
  const suffix = process.platform === 'win32' ? (['sdkmanager', 'avdmanager'].includes(name) ? '.bat' : '.exe') : '';
  let root; try { root = await sdkRoot(); } catch { /* PATH can still provide tools. */ }
  const candidates = [];
  if (root) {
    if (name === 'adb') candidates.push(path.join(root, 'platform-tools', name + suffix));
    if (name === 'emulator') candidates.push(path.join(root, 'emulator', name + suffix));
    if (['sdkmanager', 'avdmanager'].includes(name)) {
      for (const directory of await sdkToolDirectories(root)) candidates.push(path.join(directory, 'bin', name + suffix));
    }
  }
  if (name === 'java') {
    if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java' + suffix));
    if (process.platform === 'darwin') candidates.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java');
    if (process.platform === 'win32') candidates.push(path.win32.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr', 'bin', 'java.exe'));
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) candidates.push(path.join(dir, name + suffix));
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  throw new Error(`${name} not found. Install it through Android Studio SDK Manager or set ANDROID_PLUGIN_${name.toUpperCase()}.`);
}

// Java launcher avoids cmd.exe/.bat quoting entirely, including on Windows.
export async function sdkCommand(name) {
  const script = await executable(name);
  const home = path.dirname(path.dirname(script));
  if (name === 'sdkmanager' && !(await exists(path.join(home, 'lib', 'sdkmanager-classpath.jar')))) {
    const binary = path.join(home, 'bin', process.platform === 'win32' ? 'android.exe' : 'android');
    if (!(await exists(binary))) throw new Error('SDK Manager has no Java entry point or native Android CLI. Reinstall current Command-line Tools.');
    return { file: binary, args: [`--sdk=${await sdkRoot()}`, 'sdk'], native: true };
  }
  return { file: await executable('java'), args: [`-Dcom.android.${name === 'sdkmanager' ? 'sdklib' : 'sdkmanager'}.toolsdir=${home}`, '-classpath', path.join(home, 'lib', `${name}-classpath.jar`),
    name === 'sdkmanager' ? 'com.android.sdklib.tool.sdkmanager.SdkManagerCli' : 'com.android.sdklib.tool.AvdManagerCli'] };
}
