import net from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { packageName } from './android.mjs';

const handshake = Buffer.from('JDWP-Handshake');
const int = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const long = n => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(n)); return b; };
const string = s => Buffer.concat([int(Buffer.byteLength(s)), Buffer.from(s)]);
const id = (value, size) => {
  if (!/^[a-f\d]{1,16}$/i.test(value) || value.length > size * 2) throw new Error('Invalid debugger object ID');
  return Buffer.from(value.padStart(size * 2, '0'), 'hex');
};
class Reader {
  constructor(data) { this.data = data; this.offset = 0; }
  bytes(n) { if (n < 0 || this.offset + n > this.data.length) throw new Error('Truncated JDWP packet'); const b = this.data.subarray(this.offset, this.offset += n); return b; }
  byte() { return this.bytes(1)[0]; }
  int() { return this.bytes(4).readInt32BE(); }
  long() { return this.bytes(8).readBigInt64BE(); }
  id(n) { return this.bytes(n).toString('hex'); }
  string() { return this.bytes(this.int()).toString(); }
  count() { const n = this.int(); if (n < 0 || n > 100_000) throw new Error('Invalid JDWP item count'); return n; }
}

/** Minimal JDWP client: no target expression evaluation or arbitrary method invocation. */
export class DebugClient {
  constructor() { this.pending = new Map(); this.sequence = 0; this.events = []; this.requests = new Map(); this.paused = false; }
  async connect(port) {
    const socket = this.socket = net.createConnection({ host: '127.0.0.1', port });
    const connected = once(socket, 'connect');
    socket.setNoDelay(true);
    socket.on('error', error => this.fail(error)); socket.on('close', () => { this.closed = true; this.fail(new Error('Debugger disconnected')); });
    let buffer = Buffer.alloc(0), ready = false;
    const greeted = new Promise((resolve, reject) => {
      this.greetingReject = reject;
      socket.on('data', chunk => { try {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > 32_000_000) throw new Error('JDWP receive buffer exceeded');
        if (!ready) {
          if (buffer.length < handshake.length) return;
          if (!buffer.subarray(0, handshake.length).equals(handshake)) throw new Error('Invalid JDWP handshake');
          buffer = buffer.subarray(handshake.length); ready = true; resolve();
        }
        while (buffer.length >= 11) {
          const length = buffer.readUInt32BE();
          if (length < 11 || length > 16_000_000) throw new Error('Invalid JDWP packet length');
          if (buffer.length < length) break;
          const packet = buffer.subarray(0, length); buffer = buffer.subarray(length);
          if (packet[8] & 0x80) {
            const pending = this.pending.get(packet.readUInt32BE(4));
            if (!pending) continue;
            this.pending.delete(packet.readUInt32BE(4)); clearTimeout(pending.timer);
            const code = packet.readUInt16BE(9);
            if (code) pending.reject(new Error(`JDWP error ${code} (101: absent debug info, 10: invalid thread, 13: thread not suspended, 99: unsupported operation)`));
            else pending.resolve(new Reader(packet.subarray(11)));
          } else if (packet[9] === 64 && packet[10] === 100) {
            if (this.sizes) this.event(packet.subarray(11));
            else (this.earlyEvents ||= []).push(packet.subarray(11));
          }
        }
      } catch (error) { this.fail(error); socket.destroy(); } });
    });
    // Both promises have handlers immediately, including connection failures.
    const timer = setTimeout(() => { this.fail(new Error('JDWP connection timed out')); socket.destroy(); }, 5000);
    try {
      await Promise.all([connected.then(() => socket.write(handshake)), greeted]);
      const r = await this.command(1, 7);
      this.sizes = Object.fromEntries(['field', 'method', 'object', 'reference', 'frame'].map(key => [key, r.int()]));
      if (Object.values(this.sizes).some(n => ![4, 8].includes(n))) throw new Error('Unsupported JDWP ID size');
      for (const event of this.earlyEvents || []) this.event(event);
      this.earlyEvents = [];
      return this;
    } catch (error) { socket.destroy(); throw error; }
    finally { clearTimeout(timer); this.greetingReject = undefined; }
  }
  fail(error) { this.greetingReject?.(error); for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
  command(set, command, payload = Buffer.alloc(0)) {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error('Debugger disconnected'));
    const sequence = ++this.sequence, header = Buffer.alloc(11); header.writeUInt32BE(payload.length + 11); header.writeUInt32BE(sequence, 4); header[9] = set; header[10] = command;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(sequence); reject(new Error('JDWP command timed out')); this.socket.destroy(); }, 5000);
      this.pending.set(sequence, { resolve, reject, timer }); this.socket.write(Buffer.concat([header, payload]));
    });
  }
  location(r) { return { type: r.byte(), classId: r.id(this.sizes.reference), methodId: r.id(this.sizes.method), codeIndex: r.long().toString() }; }
  event(data) {
    const r = new Reader(data), suspendPolicy = r.byte(), count = r.count();
    if (suspendPolicy) this.paused = true;
    for (let i = 0; i < count; i++) {
      const kind = r.byte(), request = r.int(), event = { kind, request, suspendPolicy, at: Date.now() };
      if ([1, 2, 90].includes(kind)) {
        event.thread = r.id(this.sizes.object);
        if (kind !== 90) event.location = this.location(r);
      } else if (![99, 100].includes(kind)) throw new Error(`Unsupported JDWP event ${kind}`);
      if (kind === 1) this.requests.delete(request); // Count(1) automatically removes a step request in the VM.
      this.events.push(event); if (this.events.length > 100) this.events.shift();
    }
  }
  async threads() {
    const r = await this.command(1, 4), count = r.count(), threads = [];
    const ids = Array.from({ length: count }, () => r.id(this.sizes.object));
    for (const thread of ids.slice(0, 200)) {
      const name = (await this.command(11, 1, id(thread, this.sizes.object))).string();
      const status = await this.command(11, 4, id(thread, this.sizes.object));
      threads.push({ id: thread, name, status: status.int(), suspended: Boolean(status.int() & 1) });
    }
    return { threads, truncated: count > 200 };
  }
  async methods(classId) {
    const r = await this.command(2, 5, id(classId, this.sizes.reference)), count = r.count(), methods = [];
    for (let i = 0; i < count; i++) methods.push({ id: r.id(this.sizes.method), name: r.string(), signature: r.string(), modifiers: r.int() });
    return methods;
  }
  async lines(classId, methodId) {
    const r = await this.command(6, 1, Buffer.concat([id(classId, this.sizes.reference), id(methodId, this.sizes.method)]));
    r.long(); r.long(); const count = r.count(), lines = [];
    for (let i = 0; i < count; i++) lines.push({ codeIndex: r.long().toString(), line: r.int() });
    return lines;
  }
  async breakpoint(className, line) {
    if (!/^[\w$]+(?:\.[\w$]+)*$/.test(className) || !Number.isInteger(line) || line < 1) throw new Error('Expected a fully qualified JVM class name and positive source line');
    const r = await this.command(1, 2, string(`L${className.replaceAll('.', '/')};`)), count = r.count(), locations = [];
    for (let c = 0; c < count; c++) {
      const type = r.byte(), classId = r.id(this.sizes.reference), status = r.int();
      if (!(status & 2)) continue;
      for (const method of await this.methods(classId)) {
        if (method.modifiers & (0x100 | 0x400)) continue; // native or abstract
        const lines = await this.lines(classId, method.id).catch(error => { if (/JDWP error (101|511)\b/.test(error.message)) return []; throw error; });
        for (const entry of lines) if (entry.line === line) locations.push({ type, classId, methodId: method.id, ...entry });
      }
    }
    if (!locations.length) throw new Error('No executable location at that line in a loaded class. Launch the screen first, use the generated JVM class name (e.g. ScreenKt), and check debug symbols.');
    if (locations.length > 32) throw new Error('Too many executable locations on that source line');
    const requests = [];
    try { for (const location of locations) {
      const bytes = Buffer.concat([Buffer.from([location.type]), id(location.classId, this.sizes.reference), id(location.methodId, this.sizes.method), long(location.codeIndex)]);
      const response = await this.command(15, 1, Buffer.concat([Buffer.from([2, 2]), int(1), Buffer.from([7]), bytes]));
      const request = response.int(); this.requests.set(request, 2); requests.push(request);
    } } catch (error) { for (const request of requests) await this.clear(request).catch(() => {}); throw error; }
    return { requests, locations, className, line };
  }
  async clear(request) {
    const kind = this.requests.get(request); if (!kind) throw new Error('Breakpoint/step request is not owned by this debugger');
    await this.command(15, 2, Buffer.concat([Buffer.from([kind]), int(request)])); this.requests.delete(request); return { removed: request };
  }
  async stack(thread, limit = 30) {
    const available = (await this.command(11, 7, id(thread, this.sizes.object))).int();
    const r = await this.command(11, 6, Buffer.concat([id(thread, this.sizes.object), int(0), int(Math.min(limit, available))])), count = r.count(), frames = [];
    for (let i = 0; i < count; i++) {
      const frameId = r.id(this.sizes.frame), location = this.location(r);
      const signature = (await this.command(2, 1, id(location.classId, this.sizes.reference))).string();
      const sourceFile = await this.command(2, 7, id(location.classId, this.sizes.reference)).then(r => r.string()).catch(() => null);
      const method = (await this.methods(location.classId)).find(m => m.id === location.methodId);
      const lines = await this.lines(location.classId, location.methodId).catch(() => []);
      const line = lines.filter(l => BigInt(l.codeIndex) <= BigInt(location.codeIndex)).at(-1)?.line ?? null;
      frames.push({ frameId, ...location, signature, method: method?.name, sourceFile, line });
    }
    return { thread, frames, mapping: 'VM line tables; Kotlin inline/Compose generated code may require SMAP interpretation' };
  }
  async locals(thread, frame = 0) {
    const r = await this.command(11, 6, Buffer.concat([id(thread, this.sizes.object), int(frame), int(1)]));
    if (r.count() !== 1) throw new Error('Stack frame is unavailable');
    const frameId = r.id(this.sizes.frame), location = this.location(r);
    const table = await this.command(6, 2, Buffer.concat([id(location.classId, this.sizes.reference), id(location.methodId, this.sizes.method)]));
    table.int(); const count = table.count(), slots = [];
    for (let i = 0; i < count; i++) {
      const start = table.long(), name = table.string(), signature = table.string(), length = table.int(), slot = table.int();
      const index = BigInt(location.codeIndex);
      if (index >= start && index < start + BigInt(length) && slots.length < 50) slots.push({ name, signature, slot });
    }
    if (!slots.length) return { thread, frameId, variables: [] };
    const values = await this.command(16, 1, Buffer.concat([id(thread, this.sizes.object), id(frameId, this.sizes.frame), int(slots.length), ...slots.map(s => Buffer.concat([int(s.slot), Buffer.from(s.signature[0])]))]));
    if (values.count() !== slots.length) throw new Error('Unexpected JDWP local value count');
    const variables = slots.map(slot => {
      const type = String.fromCharCode(values.byte()); let value;
      if ('[Lstglc'.includes(type)) value = { objectId: values.id(this.sizes.object) };
      else if (type === 'I') value = values.int();
      else if (type === 'J') value = values.long().toString();
      else if (type === 'Z') value = Boolean(values.byte());
      else if (type === 'B') value = values.bytes(1).readInt8();
      else if (type === 'C') value = String.fromCharCode(values.bytes(2).readUInt16BE());
      else if (type === 'S') value = values.bytes(2).readInt16BE();
      else if (type === 'F') value = values.bytes(4).readFloatBE();
      else if (type === 'D') value = values.bytes(8).readDoubleBE();
      else throw new Error(`Unsupported JDWP value tag ${type}`);
      return { ...slot, type, value };
    });
    return { thread, frameId, variables, note: 'Object/string values are IDs. Optimized Kotlin locals may be absent. No target code is evaluated.' };
  }
  async control(action, thread) {
    if (action === 'pause') { if (!this.paused) { await this.command(1, 8); this.paused = true; } }
    else if (action === 'resume') { this.paused = false; await this.command(1, 9); }
    else if (['step_into', 'step_over', 'step_out'].includes(action)) {
      if (!this.paused) throw new Error('Pause or hit a breakpoint before stepping');
      for (const [request, kind] of this.requests) if (kind === 1) await this.clear(request);
      const step = Buffer.concat([id(thread, this.sizes.object), int(1), int({ step_into: 0, step_over: 1, step_out: 2 }[action])]);
      // Filters are applied in order: Count must follow Step so an unrelated
      // instruction cannot consume the one-shot count before the next line.
      const r = await this.command(15, 1, Buffer.concat([Buffer.from([1, 2]), int(2), Buffer.from([10]), step, Buffer.from([1]), int(1)]));
      this.requests.set(r.int(), 1); this.paused = false; await this.command(1, 9);
    } else throw new Error('Unsupported debugger action');
    return { action, paused: this.paused };
  }
  async close() { try { if (!this.socket?.destroyed) await this.command(1, 6); } finally { this.socket?.destroy(); } }
}

export class Debuggers {
  constructor(android) { this.android = android; this.sessions = new Map(); this.starting = new Map(); this.closing = false; }
  async attach(serial, app) {
    serial = await this.android.device(serial); packageName(app);
    if (this.closing) throw new Error('Debugger server is shutting down');
    if (this.starting.has(serial) || [...this.sessions.values()].some(s => s.serial === serial)) throw new Error('This server already owns or is attaching a debugger on this device; detach it first');
    if (this.sessions.size + this.starting.size >= 4) throw new Error('At most four debugger sessions may be attached');
    const operation = this.attachSelected(serial, app); this.starting.set(serial, operation);
    try { return await operation; } finally { this.starting.delete(serial); }
  }
  async attachSelected(serial, app) {
    const pid = (await this.android.shell(serial, ['pidof', '-s', app])).stdout.trim();
    if (!/^\d+$/.test(pid)) throw new Error('Launch the debuggable app before attaching');
    await this.android.shell(serial, ['run-as', app, 'id']);
    const port = Number((await this.android.adb(serial, ['forward', 'tcp:0', `jdwp:${pid}`])).stdout.trim());
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ADB did not allocate a debugger port');
    const client = new DebugClient();
    try { await client.connect(port); }
    catch (error) { await this.android.adb(serial, ['forward', '--remove', `tcp:${port}`]).catch(() => {}); throw error; }
    const session = randomUUID(); this.sessions.set(session, { client, serial, app, pid, port });
    return { session, serial, app, pid, paused: client.paused };
  }
  get(session) { const owned = this.sessions.get(session); if (!owned) throw new Error('Debugger session not owned by this server'); return owned.client; }
  async detach(session) {
    const owned = this.sessions.get(session); if (!owned) throw new Error('Debugger session not owned by this server');
    try { await owned.client.close(); }
    finally { this.sessions.delete(session); await this.android.adb(owned.serial, ['forward', '--remove', `tcp:${owned.port}`]).catch(() => {}); }
    return { detached: session };
  }
  async close() { this.closing = true; await Promise.allSettled([...this.starting.values()]); await Promise.allSettled([...this.sessions.keys()].map(s => this.detach(s))); }
}
