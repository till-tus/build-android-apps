import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseHeap, analyzeHeap } from '../server/src/heap.mjs';
import { frameSummary, parseCsv, traceQueries, analyzeTrace } from '../server/src/performance.mjs';
import { sourceHints } from '../server/src/source.mjs';
import { executable } from '../server/src/paths.mjs';
import { run } from '../server/src/process.mjs';
import { Android } from '../server/src/android.mjs';

const u4 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
function heapFixture(size = 4, extra = false) {
  const id = n => { const b = Buffer.alloc(size); b.writeUInt32BE(n, size - 4); return b; };
  const record = (tag, payload) => Buffer.concat([Buffer.from([tag]), u4(0), u4(payload.length), payload]);
  const strings = ['Owner', 'LeakedScreen', 'java/lang/ref/Reference', 'child', 'referent'];
  const records = strings.map((s, i) => record(1, Buffer.concat([id(i + 1), Buffer.from(s)])));
  for (let i = 0; i < 3; i++) records.push(record(2, Buffer.concat([u4(i + 1), id(i + 10), u4(0), id(i + 1)])));
  const clazz = (n, fields) => Buffer.concat([Buffer.from([0x20]), id(n), u4(0), id(0), id(0), id(0), id(0), id(0), id(0), u4(size), Buffer.from([0, 0, 0, 0, 0, fields.length]), ...fields.flatMap(f => [id(f), Buffer.from([2])])]);
  const object = (n, type, refs) => Buffer.concat([Buffer.from([0x21]), id(n), u4(0), id(type), u4(refs.length * size), ...refs.map(id)]);
  const payload = Buffer.concat([clazz(10, [4]), clazz(11, []), clazz(12, [5]), object(20, 10, [21]), object(21, 11, []), object(22, 12, [23]), object(23, 11, []), ...(extra ? [object(24, 11, [])] : []), Buffer.from([0xff]), id(20), Buffer.from([0xff]), id(22), Buffer.from([0x90]), id(23)]);
  return Buffer.concat([Buffer.from('JAVA PROFILE 1.0.3\0'), u4(size), Buffer.alloc(8), ...records, record(0x1c, payload), record(0x2c, Buffer.alloc(0))]);
}
test('4/8 byte Android HPROF: class census, strong root paths, weak references and malformed limits', () => {
  for (const size of [4, 8]) {
    const result = parseHeap(heapFixture(size), { targetClass: 'LeakedScreen' });
    assert.equal(result.classes.find(c => c.className === 'LeakedScreen').count, 2);
    assert.deepEqual(result.paths.map(p => p.found), [true, false]);
    assert.equal(result.paths[0].steps.at(-1).via, 'child'); assert.equal(result.roots, 2);
    assert.throws(() => parseHeap(heapFixture(size).subarray(0, -4)), /Truncated/);
    assert.throws(() => parseHeap(heapFixture(size), { maxObjects: 1 }), /exceeds/);
    assert.throws(() => parseHeap(heapFixture(size), { targetClass: 'LeakedScreen', maxEdges: 0 }), /edge limit/);
  }
});
test('heap baseline compares class counts without exporting object contents', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'android-heap-baseline-'));
  try {
    const input = path.join(temp, 'after.hprof'), baseline = path.join(temp, 'before.hprof');
    await writeFile(input, heapFixture(4, true)); await writeFile(baseline, heapFixture());
    const result = await analyzeHeap({ input, baseline, targetClass: 'LeakedScreen' });
    assert.equal(result.growth.find(c => c.className === 'LeakedScreen').countDelta, 1);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('real JVM HPROF: reads a locally captured heap and finds a static owner path', { timeout: 150_000 }, async t => {
  let java, javac;
  try { java = await executable('java'); javac = path.join(path.dirname(java), process.platform === 'win32' ? 'javac.exe' : 'javac'); await access(javac); }
  catch { t.skip('JDK unavailable'); return; }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'android-heap-real-'));
  try {
    await writeFile(path.join(directory, 'HeapFixture.java'), `import java.lang.management.ManagementFactory;
import com.sun.management.HotSpotDiagnosticMXBean;
public class HeapFixture {
  static class Screen { int counter = 7; }
  static class Owner { Screen child = new Screen(); }
  static Owner retained = new Owner();
  public static void main(String[] args) throws Exception {
    ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class).dumpHeap(args[0], true);
  }
}
`);
    await run(javac, [path.join(directory, 'HeapFixture.java')], { timeout: 60_000 });
    const input = path.join(directory, 'real.hprof'); await run(java, ['-cp', directory, 'HeapFixture', input], { timeout: 60_000 });
    const result = await analyzeHeap({ input, targetClass: 'HeapFixture$Screen' });
    assert.equal(result.targetSummary.count, 1); assert.equal(result.paths[0].found, true);
    assert.ok(result.paths[0].steps.some(s => s.via === 'retained')); assert.equal(result.paths[0].steps.at(-1).via, 'child');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('frame statistics use integer nanoseconds, discard flagged/incomplete rows and report percentiles', () => {
  const start = 12345678900000000n;
  const text = 'Flags,IntendedVsync,FrameCompleted,\n' + [10, 20, 40].map(ms => `0,${start},${start + BigInt(ms * 1e6)},`).join('\n') + `\n1,${start},${start + 2000000000n},\n0,0,0,\n0,100,9223372036854775807,`;
  const result = frameSummary(text); assert.equal(result.samples, 3); assert.equal(result.p50Ms, 20); assert.equal(result.p95Ms, 40); assert.equal(result.over16_67Ms, 2);
  assert.equal(frameSummary('no samples').p95Ms, null);
});
test('trace SQL executes against the documented table shape and excludes unrelated packages', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE process(upid INTEGER,name TEXT); CREATE TABLE thread(utid INTEGER,upid INTEGER,tid INTEGER,name TEXT);
      CREATE TABLE sched_slice(utid INTEGER,dur INTEGER); CREATE TABLE thread_track(id INTEGER,utid INTEGER); CREATE TABLE slice(track_id INTEGER,name TEXT,dur INTEGER);
      CREATE TABLE actual_frame_timeline_slice(upid INTEGER,dur INTEGER,jank_type TEXT,present_type TEXT);
      INSERT INTO process VALUES(1,'dev.test.app'),(2,'dev.test.app:worker'),(3,'other.app');
      INSERT INTO thread VALUES(1,1,1,'main'),(2,2,2,'worker'),(3,3,3,'foreign');
      INSERT INTO sched_slice VALUES(1,10000000),(2,20000000),(3,1000000000);
      INSERT INTO actual_frame_timeline_slice VALUES(1,20000000,'App Deadline Missed','Late Present');`);
    const queries = traceQueries('dev.test.app'); assert.equal(db.prepare(queries.cpu).all().length, 2); assert.equal(db.prepare(queries.frames).all()[0].samples, 1);
    assert.throws(() => traceQueries("dev.test.app'; DROP TABLE process"));
  } finally { db.close(); }
  assert.deepEqual(parseCsv('"thread","slice","cpu_ms"\r\n"main","a,""b""\nc",1.5\r\n'), [{ thread: 'main', slice: 'a,"b"\nc', cpu_ms: '1.5' }]);
});
test('trace analyzer requires a local explicit processor rather than downloading or uploading', async () => {
  await assert.rejects(analyzeTrace({ input: import.meta.filename, app: 'dev.test.app', processor: 'relative-tool' }), /absolute native/);
});
test('trace capture explicitly configures process metadata, app atrace and Android FrameTimeline', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'android-trace-config-')), android = new Android(), calls = [];
  android.device = async () => 'selected';
  android.shell = async (serial, args, options) => { calls.push({ serial, args, options }); return { stdout: '' }; };
  android.adb = async () => ({ stdout: '' });
  try {
    await android.capture('selected', { kind: 'trace', seconds: 2, app: 'dev.test.app', output: path.join(directory, 'trace.pftrace') });
    const call = calls.find(c => c.args[0] === 'perfetto'); assert.ok(call.args.includes('--txt')); assert.match(call.options.input, /duration_ms: 2000/);
    assert.match(call.options.input, /android\.surfaceflinger\.frametimeline/); assert.match(call.options.input, /linux\.process_stats/); assert.match(call.options.input, /atrace_apps: "dev\.test\.app"/);
    await assert.rejects(android.capture('selected', { kind: 'trace', seconds: 1, app: 'dev.bad"', output: path.join(directory, 'bad') }), /package name/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('native Perfetto processor reads actual trace slices without fabricating missing CPU/frame events', { skip: !process.env.ANDROID_PLUGIN_TRACE_PROCESSOR }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'android-perfetto-real-'));
  try {
    const input = path.join(directory, 'trace.json');
    await writeFile(input, JSON.stringify({ traceEvents: [
      { ph: 'M', name: 'process_name', pid: 1, args: { name: 'dev.test.app' } },
      { ph: 'M', name: 'thread_name', pid: 1, tid: 1, args: { name: 'main' } },
      { ph: 'X', name: 'fixture-work', pid: 1, tid: 1, ts: 100, dur: 20000 }
    ] }));
    const result = await analyzeTrace({ input, app: 'dev.test.app' });
    assert.equal(result.sections.slices[0].slice, 'fixture-work'); assert.equal(Number(result.sections.slices[0].total_ms), 20);
    assert.equal(result.sections.cpu.length, 0); assert.ok(result.warnings.some(w => w.startsWith('cpu:')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('source candidates rank test tags above incidental text and resolve string resources to callsites', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'android-source-rank-'));
  try {
    await mkdir(path.join(directory, 'res/values'), { recursive: true });
    await writeFile(path.join(directory, 'A.kt'), '// counter comment\n' + 'val counterNoise = 1\n'.repeat(20));
    await writeFile(path.join(directory, 'Z.kt'), 'fun Screen() {\n Button(modifier = Modifier.testTag("counter")) {}\n Text(stringResource(R.string.title))\n}');
    await writeFile(path.join(directory, 'res/values/strings.xml'), '<string name="title">Dashboard</string>');
    const ranked = await sourceHints(directory, { resourceId: 'dev.test:id/counter' });
    assert.equal(ranked[0].confidence, 'test-tag-literal'); assert.equal(ranked[0].declarationCandidate.name, 'Screen');
    const strings = await sourceHints(directory, { text: 'Dashboard' }); assert.equal(strings[0].confidence, 'string-resource-reference');
    assert.deepEqual(await sourceHints(directory, { password: true, text: 'Dashboard' }), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
