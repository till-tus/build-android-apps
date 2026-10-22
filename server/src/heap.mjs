import { open } from 'node:fs/promises';
import path from 'node:path';

const primitiveNames = { 4: 'boolean[]', 5: 'char[]', 6: 'float[]', 7: 'double[]', 8: 'byte[]', 9: 'short[]', 10: 'int[]', 11: 'long[]' };
const primitiveSizes = { 4: 1, 5: 2, 6: 4, 7: 8, 8: 1, 9: 2, 10: 4, 11: 8 };
class Reader {
  constructor(data, size, offset = 0, end = data.length) { Object.assign(this, { data, size, offset, end }); }
  bytes(n) { if (!Number.isSafeInteger(n) || n < 0 || this.offset + n > this.end) throw new Error('Truncated or invalid HPROF record'); return this.data.subarray(this.offset, this.offset += n); }
  u1() { return this.bytes(1)[0]; }
  u2() { return this.bytes(2).readUInt16BE(); }
  u4() { return this.bytes(4).readUInt32BE(); }
  id() { return this.bytes(this.size).toString('hex'); }
  valueSize(type) { const size = type === 2 ? this.size : primitiveSizes[type]; if (!size) throw new Error(`Unsupported HPROF value type ${type}`); return size; }
}

/** Bounded, local HPROF census and field paths. Never exports string/array contents. */
export function parseHeap(data, { targetClass, maxObjects = 500_000, maxEdges = 2_000_000 } = {}) {
  const end = data.indexOf(0);
  if (end < 0 || end > 32 || !/^JAVA PROFILE 1\.0\.[123]$/.test(data.subarray(0, end).toString())) throw new Error('Expected an uncompressed Java/Android HPROF');
  const header = new Reader(data, 4, end + 1), size = header.u4(); header.bytes(8);
  if (![4, 8].includes(size)) throw new Error('Unsupported HPROF ID size');
  const strings = new Map(), names = new Map(), classes = new Map(), objects = new Map(), roots = new Map();
  const zero = '0'.repeat(size * 2); let records = 0;
  const add = (key, value) => {
    if (objects.has(key)) throw new Error('Duplicate HPROF object');
    if (objects.size >= maxObjects) throw new Error(`Heap exceeds ${maxObjects} objects; use Android Studio for this dump`);
    objects.set(key, value);
  };
  const root = (r, kind, extra) => { const object = r.id(); r.bytes(extra); if (object !== zero) roots.set(object, kind); };
  const heap = r => {
    while (r.offset < r.end) {
      const tag = r.u1();
      if ([0xff, 5, 7, 0x89, 0x8a, 0x8b, 0x8c, 0x8d].includes(tag)) root(r, tag, 0);
      else if (tag === 1) root(r, tag, size);
      else if ([2, 3, 8, 0x8e].includes(tag)) root(r, tag, 8);
      else if ([4, 6].includes(tag)) root(r, tag, 4);
      else if (tag === 0x90) r.id(); // Android ROOT_UNREACHABLE is not a GC root.
      else if (tag === 0xfe) { r.u4(); r.id(); } // Android heap name
      else if (tag === 0x20) {
        const object = r.id(); r.u4(); const superId = r.id(), loader = r.id(); r.bytes(size * 4); const instanceSize = r.u4();
        const constants = r.u2(); for (let i = 0; i < constants; i++) { r.u2(); r.bytes(r.valueSize(r.u1())); }
        const staticFields = [], staticCount = r.u2();
        for (let i = 0; i < staticCount; i++) { const name = r.id(), type = r.u1(); if (type === 2) staticFields.push({ name, object: r.id() }); else r.bytes(r.valueSize(type)); }
        const fields = [], fieldCount = r.u2(); for (let i = 0; i < fieldCount; i++) fields.push({ name: r.id(), type: r.u1() });
        const clazz = { superId, loader, instanceSize, fields, staticFields }; classes.set(object, clazz); add(object, { kind: 'class', clazz });
      } else if (tag === 0x21) {
        const object = r.id(); r.u4(); const classId = r.id(), length = r.u4(), offset = r.offset; r.bytes(length);
        add(object, { kind: 'instance', classId, offset, length });
      } else if (tag === 0x22) {
        const object = r.id(); r.u4(); const count = r.u4(), classId = r.id(), offset = r.offset; r.bytes(count * size);
        add(object, { kind: 'array', classId, offset, count, length: count * size });
      } else if (tag === 0x23 || tag === 0xc3) {
        const object = r.id(); r.u4(); const count = r.u4(), type = r.u1(), length = count * r.valueSize(type);
        if (type === 2) throw new Error('Invalid primitive array type');
        if (tag !== 0xc3) r.bytes(length);
        add(object, { kind: 'primitive', type, length });
      } else throw new Error(`Unsupported HPROF heap tag 0x${tag.toString(16)}; use Android Studio for this dump`);
    }
  };
  const r = new Reader(data, size, header.offset);
  while (r.offset < r.end) {
    if (++records > 2_000_000) throw new Error('HPROF record limit exceeded');
    const tag = r.u1(); r.u4(); const length = r.u4(), start = r.offset; r.bytes(length);
    const record = new Reader(data, size, start, start + length);
    if (tag === 1) { if (strings.size >= 500_000) throw new Error('HPROF string table limit exceeded'); const key = record.id(); strings.set(key, record.bytes(length - size).toString('utf8')); }
    else if (tag === 2) { record.u4(); const classId = record.id(); record.u4(); names.set(classId, record.id()); }
    else if (tag === 0x0c || tag === 0x1c) heap(record);
  }
  const className = classId => (strings.get(names.get(classId)) || `<unknown:${classId}>`).replaceAll('/', '.');
  const nameOf = object => object.kind === 'primitive' ? primitiveNames[object.type] : className(object.classId);
  // Avoid quadratic class-name lookups when reporting a large dump.
  for (const [classId, object] of objects) if (object.kind === 'class') object.name = `class ${className(classId)}`;
  const census = new Map(), targets = [];
  for (const [objectId, object] of objects) {
    object.name ||= nameOf(object);
    const row = census.get(object.name) || { className: object.name, count: 0, payloadBytes: 0 };
    row.count++; row.payloadBytes += object.length || 0; census.set(object.name, row);
    if (object.name === targetClass && targets.length < 5) targets.push(objectId);
  }
  let edges = 0;
  function* references(object) {
    if (object.kind === 'class') {
      yield [object.clazz.superId, '<superclass>']; yield [object.clazz.loader, '<classLoader>'];
      for (const field of object.clazz.staticFields) yield [field.object, strings.get(field.name) || '<static>'];
    } else if (object.kind === 'array') {
      const reader = new Reader(data, size, object.offset, object.offset + object.length);
      for (let i = 0; i < object.count; i++) yield [reader.id(), `[${i}]`];
    } else if (object.kind === 'instance') {
      const reader = new Reader(data, size, object.offset, object.offset + object.length); let current = object.classId; const seen = new Set();
      while (current !== zero) {
        if (seen.has(current)) throw new Error('Cyclic HPROF class hierarchy'); seen.add(current);
        const clazz = classes.get(current); if (!clazz) throw new Error(`Missing HPROF class ${current}`);
        for (const field of clazz.fields) {
          const fieldName = strings.get(field.name) || '<field>';
          if (field.type === 2) { const value = reader.id(); if (!(className(current) === 'java.lang.ref.Reference' && fieldName === 'referent')) yield [value, fieldName]; }
          else reader.bytes(reader.valueSize(field.type));
        }
        current = clazz.superId;
      }
    }
  }
  const paths = [];
  if (targets.length) {
    const parents = new Map(), queue = [];
    for (const [objectId, kind] of roots) if (objects.has(objectId)) { parents.set(objectId, { rootKind: kind }); queue.push(objectId); }
    const wanted = new Set(targets);
    for (let index = 0; index < queue.length && wanted.size; index++) {
      const parent = queue[index]; wanted.delete(parent);
      for (const [child, field] of references(objects.get(parent))) {
        if (++edges > maxEdges) throw new Error('Heap graph exceeds edge limit; use Android Studio for this dump');
        if (child === zero || parents.has(child) || !objects.has(child)) continue;
        parents.set(child, { parent, field }); queue.push(child);
      }
    }
    for (const objectId of targets) {
      if (!parents.has(objectId)) { paths.push({ objectId, found: false }); continue; }
      let current = objectId; const steps = [];
      while (current) {
        const entry = parents.get(current); steps.push({ objectId: current, className: objects.get(current).name, via: entry.field, rootKind: entry.rootKind }); current = entry.parent;
        if (steps.length > 256) break;
      }
      paths.push({ objectId, found: true, truncated: Boolean(current), steps: steps.reverse() });
    }
  }
  return { objects: objects.size, roots: roots.size, classes: [...census.values()].sort((a, b) => b.payloadBytes - a.payloadBytes || b.count - a.count), paths,
    limits: 'Payload bytes exclude headers/alignment/native memory. Paths exclude Reference.referent, are not dominators, and do not by themselves prove a leak. At most five exact-class instances are inspected.' };
}

async function load(file, options) {
  const handle = await open(path.resolve(file), 'r');
  try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > 256 * 1024 * 1024) throw new Error('HPROF must be a regular file up to 256 MiB; use Android Studio for larger dumps'); return parseHeap(await handle.readFile(), options); }
  finally { await handle.close(); }
}
export async function analyzeHeap({ input, baseline, targetClass }) {
  const result = await load(input, { targetClass });
  let growth;
  if (baseline) {
    const before = await load(baseline, {}), prior = new Map(before.classes.map(c => [c.className, c]));
    growth = result.classes.map(c => ({ className: c.className, countDelta: c.count - (prior.get(c.className)?.count || 0), payloadBytesDelta: c.payloadBytes - (prior.get(c.className)?.payloadBytes || 0) }));
    const afterNames = new Set(result.classes.map(c => c.className));
    for (const c of before.classes) if (!afterNames.has(c.className)) growth.push({ className: c.className, countDelta: -c.count, payloadBytesDelta: -c.payloadBytes });
    growth.sort((a, b) => b.payloadBytesDelta - a.payloadBytesDelta || b.countDelta - a.countDelta);
  }
  return { ...result, input: path.resolve(input), baseline: baseline && path.resolve(baseline), classes: result.classes.slice(0, 50), targetSummary: result.classes.find(c => c.className === targetClass), growth: growth?.slice(0, 50) };
}
