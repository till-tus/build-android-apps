import test from 'node:test';
import assert from 'node:assert/strict';
import { wheelInput } from '../viewer/wheel.js';
import { AnnexB } from '../server/src/h264.mjs';
import { createViewer } from '../server/src/viewer.mjs';
import { FakeAndroid } from './fixtures.mjs';
import { WebSocket } from 'ws';
import { delay } from '../server/src/process.mjs';

test('20 wheel events merge; at most one swipe is in flight and pending work cancels', async () => {
  const actions = []; let release;
  const wheel = wheelInput(action => { actions.push(action); return new Promise(resolve => { release = resolve; }); }, { delay: 5 });
  const action = { x: 100, y: 400, dx: 0, dy: 4, width: 360, height: 720 };
  try {
    for (let i = 0; i < 20; i++) wheel.push(action);
    await delay(30); assert.equal(actions.length, 1); assert.equal(actions[0].endY, 320); assert.equal(actions[0].duration, 80);
    for (let i = 0; i < 20; i++) wheel.push(action);
    await delay(20); assert.equal(actions.length, 1);
    release(); await delay(20); assert.equal(actions.length, 2);
    wheel.push(action); wheel.cancel(); release(); await delay(20); assert.equal(actions.length, 2);
    wheel.push(action); await delay(20); assert.equal(actions.length, 3);
    wheel.cancel(); wheel.push(action); release(); await delay(20); assert.equal(actions.length, 4, 'A new gesture after cancellation must not get stuck behind the previous in-flight swipe');
  } finally { wheel.cancel(); release?.(); }
});

test('video releases the previous access unit as soon as the next slice header arrives', () => {
  const frames = [], parser = new AnnexB({ onFrame: frame => frames.push(frame) });
  parser.push(Buffer.from([0, 0, 0, 1, 0x65, 0x80, 0xaa]));
  assert.equal(frames.length, 0);
  parser.push(Buffer.from([0, 0, 0, 1, 0x41, 0x80]));
  assert.equal(frames.length, 1, 'Must not wait for the remainder of the next frame');
  assert.ok(frames[0].includes(Buffer.from([0x65, 0x80, 0xaa])));
  parser.push(Buffer.from([0xbb])); assert.equal(frames.length, 1);
  parser.flush(); assert.equal(frames.length, 2);
});

test('viewer uses its selected serial directly; PNG captures coalesce and avoid the fixed 250ms delay', async () => {
  const android = new FakeAndroid(); let selections = 0, active = 0, peak = 0, fastInputs = 0;
  const originalDevice = android.device.bind(android), screenshot = android.screenshot.bind(android);
  android.device = async serial => { selections++; return originalDevice(serial); };
  android.inputOnDevice = async (serial, action) => { fastInputs++; return android.input(serial, action); };
  android.screenshot = async () => { active++; peak = Math.max(peak, active); await delay(10); const image = await screenshot(); active--; return image; };
  const viewer = await createViewer({ android, enableVideo: false }); let ws;
  try {
    const token = new URL(viewer.url).hash.slice(1), headers = { Authorization: `Bearer ${token}` };
    for (let i = 0; i < 3; i++) await fetch(viewer.origin + '/api/input', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'tap', x: 100, y: 160 }) });
    assert.equal(selections, 1); assert.equal(fastInputs, 3);
    await Promise.all(Array.from({ length: 6 }, () => fetch(viewer.origin + '/api/screenshot', { headers })));
    assert.equal(peak, 1);
    const times = [];
    ws = new WebSocket(viewer.origin.replace('http', 'ws') + '/stream', `android.${token}`, { origin: viewer.origin });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('PNG stream stalled')), 4000);
      ws.on('error', reject);
      ws.on('message', (data, binary) => { if (binary && data[0] === 2) { times.push(Date.now()); if (times.length === 6) { clearTimeout(timeout); resolve(); } } });
    });
    const intervals = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
    assert.ok(intervals[2] < 200, `Median PNG interval ${intervals[2]}ms still resembles the old fixed delay`);
    assert.equal(peak, 1);
  } finally { ws?.terminate(); await viewer.close(); }
});
