import { spawn } from 'node:child_process';

export class CommandError extends Error {
  constructor(message, details = {}) { super(message); this.name = 'CommandError'; Object.assign(this, details); }
}

/** Execute argv directly. Device text is never interpolated into a host shell. */
export function run(file, args = [], { cwd, env, timeout = 30_000, maxBytes = 16 * 1024 * 1024, input, signal, onOutput, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], signal });
    const stdout = [], stderr = []; let bytes = 0, failure;
    const timer = setTimeout(() => { failure = new CommandError(`${file} timed out after ${timeout}ms`); child.kill(); }, timeout);
    const collect = (target, kind) => data => {
      bytes += data.length;
      if (bytes > maxBytes) { failure = new CommandError(`${file} exceeded its output limit`); child.kill(); return; }
      target.push(data); onOutput?.(data.toString(), kind);
    };
    child.stdout.on('data', collect(stdout, 'stdout')); child.stderr.on('data', collect(stderr, 'stderr'));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout), err = Buffer.concat(stderr).toString();
      if (failure) return reject(failure);
      if (code !== 0) return reject(new CommandError(`${file} exited with ${code}: ${err || out.toString()}`, { code, stdout: out.toString(), stderr: err }));
      resolve({ stdout: binary ? out : out.toString(), stderr: err, code });
    });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}

// adb shell joins arguments on the DEVICE. Quote even when host spawn uses argv.
export function remoteQuote(value) { return "'" + String(value).replaceAll("'", "'\\''") + "'"; }
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
