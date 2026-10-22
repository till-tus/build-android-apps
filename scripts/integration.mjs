/** Real-device check, opt in with ANDROID_TEST_SERIAL or run on emulator CI. */
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { Android, buildProject } from '../server/src/android.mjs';
import { createProject, launchPreview, watchProject } from '../server/src/project.mjs';
import { createViewer } from '../server/src/viewer.mjs';
import { delay } from '../server/src/process.mjs';
import { Debuggers } from '../server/src/debugger.mjs';
import { analyzeHeap } from '../server/src/heap.mjs';
import { frameSummary, analyzeTrace } from '../server/src/performance.mjs';
const android = new Android(), serial = await android.device(process.env.ANDROID_TEST_SERIAL);
const output = path.resolve('artifacts/integration'); await mkdir(output, { recursive: true });
const environmentWarnings = [];
async function waitForTree(predicate, label, timeout = 45_000) {
  const start = Date.now(); let tree, lastError;
  while (Date.now() - start < timeout) {
    try {
      tree = await android.inspect(serial, { fresh: true });
      const systemAnr = tree.nodes.some(n => n.packageName === 'android' && n.resourceId === 'android:id/alertTitle' && /^System UI (?:isn't|is not) responding$/.test(n.text));
      if (systemAnr && process.env.CI === 'true' && environmentWarnings.length < 3) {
        const wait = tree.nodes.find(n => n.packageName === 'android' && n.resourceId === 'android:id/aerr_wait');
        if (wait?.bounds) {
          const warning = 'Hosted emulator System UI ANR: selecting Wait; app assertions remain required.';
          environmentWarnings.push(warning); console.warn(warning);
          await writeFile(path.join(output, `system-ui-anr-${environmentWarnings.length}.png`), await android.screenshot(serial));
          await android.input(serial, { type: 'tap', x: Math.round(wait.bounds.left + wait.bounds.width / 2), y: Math.round(wait.bounds.top + wait.bounds.height / 2) });
          await delay(500); continue;
        }
      }
      if (predicate(tree) && !systemAnr) return tree;
    }
    catch (error) { lastError = error.message; }
    await delay(500);
  }
  // Capture evidence even when startup fails before the browser is created.
  await writeFile(path.join(output, 'device-timeout.png'), await android.screenshot(serial)).catch(() => {});
  await writeFile(path.join(output, 'hierarchy-timeout.json'), JSON.stringify({ label, tree, lastError }, null, 2));
  await android.logcat(serial, { app: 'dev.codex.androidlab', lines: 300 }).then(log => writeFile(path.join(output, 'startup-logcat.txt'), log.stdout)).catch(() => {});
  throw new Error(`Timed out waiting for ${label}; inspect the startup evidence artifacts.`);
}
const directory = await mkdtemp(path.join(os.tmpdir(), 'android-real-integration-'));
const project = await createProject({ directory, name: 'Android Lab', app: 'dev.codex.androidlab' });
const sourceFile = path.join(directory, 'app/src/main/java/dev/codex/androidlab/MainActivity.kt');
// A plain Kotlin method provides a stable JDWP line independent of Compose's
// generated inline/lambda line tables.
await writeFile(sourceFile, (await readFile(sourceFile, 'utf8')).replace('count++', 'count = nextCount(count)') + '\nfun nextCount(value: Int): Int {\n    return value + 1\n}\n');
const built = await buildProject(directory, ['assembleDebug'], { onOutput: text => process.stdout.write(text) });
assert.equal(built.apks.length, 1); await android.install(serial, built.apks); await android.launch(serial, project.app);
let tree = await waitForTree(t => t.nodes.some(n => n.resourceId === 'counter'), 'the Compose counter test tag');
const counter = tree.nodes.find(n => n.resourceId === 'counter'); assert.ok(counter, 'Compose test tag exposed in the actual Android hierarchy');
await android.input(serial, { type: 'tap', x: Math.round((counter.bounds.left + counter.bounds.right) / 2), y: Math.round((counter.bounds.top + counter.bounds.bottom) / 2) });
tree = await waitForTree(t => t.nodes.some(n => n.text === 'Count: 1'), 'the native counter update'); assert.ok(tree.nodes.some(n => n.text === 'Count: 1'), 'Native click updates app state');
await writeFile(path.join(output, 'device.png'), await android.screenshot(serial));
const viewer = await createViewer({ android, serial, project: directory }); const browser = await chromium.launch();
const debuggers = new Debuggers(android);
let page;
try {
  page = await browser.newPage({ viewport: { width: 520, height: 900 } }); page.setDefaultTimeout(15_000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(viewer.url); await page.waitForFunction(() => document.getElementById('empty').hidden); await delay(2000);
  await page.getByRole('button', { name: 'Inspect element' }).click();
  const screen = await page.locator('canvas').boundingBox();
  const png = await android.screenshot(serial), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  await page.mouse.click(screen.x + screen.width * (counter.bounds.left + counter.bounds.width / 2) / width, screen.y + screen.height * (counter.bounds.top + counter.bounds.height / 2) / height);
  await page.getByRole('region', { name: 'Element inspector' }).waitFor();
  await page.screenshot({ path: path.join(output, 'viewer.png') }); assert.deepEqual(errors, []);
  await page.close(); await delay(400);
  const debug = await debuggers.attach(serial, project.app), client = debuggers.get(debug.session);
  const breakpointLine = (await readFile(sourceFile, 'utf8')).split('\n').findIndex(line => line.includes('return value + 1')) + 1;
  await client.breakpoint('dev.codex.androidlab.MainActivityKt', breakpointLine);
  let tapError;
  const tap = android.input(serial, { type: 'tap', x: Math.round(counter.bounds.left + counter.bounds.width / 2), y: Math.round(counter.bounds.top + counter.bounds.height / 2) }).catch(e => { tapError = e; });
  const started = Date.now();
  while (!client.events.some(e => e.kind === 2)) { if (Date.now() - started > 15_000) throw new Error('Real Android breakpoint did not fire'); await delay(50); }
  const hit = client.events.find(e => e.kind === 2), stack = await client.stack(hit.thread, 10);
  assert.equal(stack.frames[0].line, breakpointLine); assert.equal(stack.frames[0].sourceFile, 'MainActivity.kt');
  const locals = await client.locals(hit.thread); assert.equal(locals.variables.find(v => v.name === 'value').value, 1);
  await debuggers.detach(debug.session); await tap; if (tapError) throw tapError;
  // Real screenshot proof does not establish native-host annotation support; that contract has its own browser test.
  await launchPreview(android, serial, project.app, project.preview);
  await waitForTree(t => t.nodes.some(n => n.text === 'Built with Jetpack Compose'), 'the Compose preview');
  const logs = await android.logcat(serial, { app: project.app, lines: 300, level: 'E' }); assert.ok(!logs.stdout.includes('FATAL EXCEPTION'), logs.stdout);
  await android.capture(serial, { kind: 'trace', app: project.app, seconds: 2, output: path.join(output, 'journey.perfetto-trace') });
  await android.capture(serial, { kind: 'video', seconds: 2, output: path.join(output, 'journey.mp4') });
  await android.capture(serial, { kind: 'heap', app: project.app, output: path.join(output, 'app.hprof') });
  const heap = await analyzeHeap({ input: path.join(output, 'app.hprof'), targetClass: 'dev.codex.androidlab.MainActivity' });
  assert.ok(heap.targetSummary?.count >= 1, 'Actual Android HPROF identifies app activities');
  await writeFile(path.join(output, 'heap-summary.json'), JSON.stringify(heap, null, 2));
  await writeFile(path.join(output, 'frame-summary.json'), JSON.stringify(frameSummary((await android.frames(serial, project.app)).stdout), null, 2));
  if (process.env.ANDROID_PLUGIN_TRACE_PROCESSOR) {
    const trace = await analyzeTrace({ input: path.join(output, 'journey.perfetto-trace'), app: project.app });
    await writeFile(path.join(output, 'trace-summary.json'), JSON.stringify(trace, null, 2));
  }
  const controller = new AbortController(); let reloads = 0, watchLog = '';
  const watching = watchProject(android, { project: directory, serial, app: project.app }, { signal: controller.signal, onOutput: text => { watchLog = (watchLog + text).slice(-6000); if (text.startsWith('Reloaded ')) reloads++; } });
  const waitReload = async target => { const start = Date.now(); while (reloads < target) { if (Date.now() - start > 90_000) throw new Error(`Watch reload timed out: ${watchLog}`); await delay(250); } };
  try {
    await waitReload(1);
    const source = path.join(directory, 'app/src/main/java/dev/codex/androidlab/MainActivity.kt');
    await writeFile(source, (await readFile(source, 'utf8')).replace('Built with Jetpack Compose', 'Reload verified'));
    await waitReload(2);
    assert.ok((await waitForTree(t => t.nodes.some(n => n.text === 'Reload verified'), 'the rebuilt source edit')).nodes.some(n => n.text === 'Reload verified'), 'An actual source edit is rebuilt, installed and rendered');
  } finally { controller.abort(); await watching; }
  const summary = { platform: process.platform, serial, environmentWarnings, generatedProjectBuilt: true, nativeCounterInteraction: true, composeSemantics: true, browserInspection: true, debuggerBreakpointStackAndLocals: true, androidHeapAnalyzed: true, traceAnalyzed: Boolean(process.env.ANDROID_PLUGIN_TRACE_PROCESSOR), previewLaunchedWithoutCrash: true, traceCaptured: true, videoCaptured: true, heapCaptured: true, sourceWatchReloadVerified: true, annotationContract: 'See Playwright tests; native host must be checked in Codex.' };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(0, 3000)); }
  console.error('Device hierarchy:', JSON.stringify((await android.inspect(serial, { fresh: true }).catch(e => ({ error: e.message }))).nodes?.slice(0, 12)));
  throw error;
} finally { await debuggers.close(); await browser.close(); await viewer.close(); }
