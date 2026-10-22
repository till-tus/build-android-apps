import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { delay } from './process.mjs';

/** UIAutomation is exclusive on a device, even across separate MCP/viewer processes. */
export async function withInspectionLock(serial, operation) {
  const directory = path.join(os.tmpdir(), 'codex-android-ui-' + createHash('sha256').update(serial).digest('hex').slice(0, 20));
  const ownerFile = path.join(directory, 'owner.json'), id = randomUUID(), started = Date.now();
  while (true) {
    try { await mkdir(directory, { mode: 0o700 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await readFile(ownerFile, 'utf8').then(JSON.parse).catch(() => null);
      let dead = false;
      if (Number.isInteger(owner?.pid)) { try { process.kill(owner.pid, 0); } catch (e) { dead = e.code === 'ESRCH'; } }
      const age = Date.now() - (await stat(directory).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs;
      if (dead || age > 60_000) { await rm(directory, { recursive: true, force: true }); continue; }
      if (Date.now() - started > 25_000) throw new Error('Another Android UI inspection is still running for this device. Retry after it completes.');
      await delay(120);
    }
  }
  try {
    await writeFile(ownerFile, JSON.stringify({ id, pid: process.pid }), { mode: 0o600 });
    return await operation();
  } finally {
    const owner = await readFile(ownerFile, 'utf8').then(JSON.parse).catch(() => null);
    if (!owner || owner.id === id) await rm(directory, { recursive: true, force: true });
  }
}
