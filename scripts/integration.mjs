/** Real-device check, opt in with ANDROID_TEST_SERIAL or run on emulator CI. */
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { Android, buildProject } from '../server/src/android.mjs';
import { createProject, launchPreview } from '../server/src/project.mjs';
import { createViewer } from '../server/src/viewer.mjs';
import { delay } from '../server/src/process.mjs';
const android = new Android(), serial = await android.device(process.env.ANDROID_TEST_SERIAL);
const output = path.resolve('artifacts/integration'); await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(os.tmpdir(), 'android-real-integration-'));
const project = await createProject({ directory, name: 'Android Lab', app: 'dev.codex.androidlab' });
const built = await buildProject(directory, ['assembleDebug'], { onOutput: text => process.stdout.write(text) });
assert.equal(built.apks.length, 1); await android.install(serial, built.apks); await android.launch(serial, project.app);
await delay(1800); let tree = await android.inspect(serial, { fresh: true });
const counter = tree.nodes.find(n => n.resourceId === 'counter'); assert.ok(counter, 'Compose test tag exposed in the actual Android hierarchy');
await android.input(serial, { type: 'tap', x: Math.round((counter.bounds.left + counter.bounds.right) / 2), y: Math.round((counter.bounds.top + counter.bounds.bottom) / 2) });
await delay(400); tree = await android.inspect(serial, { fresh: true }); assert.ok(tree.nodes.some(n => n.text === 'Count: 1'), 'Native click updates app state');
await writeFile(path.join(output, 'device.png'), await android.screenshot(serial));
const viewer = await createViewer({ android, serial, project: directory }); const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 520, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(viewer.url); await page.waitForFunction(() => document.getElementById('empty').hidden); await delay(2000);
  await page.getByRole('button', { name: 'Inspect element' }).click();
  const screen = await page.locator('canvas').boundingBox();
  const png = await android.screenshot(serial), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  await page.mouse.click(screen.x + screen.width * (counter.bounds.left + counter.bounds.width / 2) / width, screen.y + screen.height * (counter.bounds.top + counter.bounds.height / 2) / height);
  await page.getByRole('region', { name: 'Element inspector' }).waitFor();
  await page.screenshot({ path: path.join(output, 'viewer.png') }); assert.deepEqual(errors, []);
  await page.close(); await delay(400);
  // Real screenshot proof does not establish native-host annotation support; that contract has its own browser test.
  await launchPreview(android, serial, project.app, project.preview); await delay(800);
  const logs = await android.logcat(serial, { app: project.app, lines: 300, level: 'E' }); assert.ok(!logs.stdout.includes('FATAL EXCEPTION'), logs.stdout);
  await android.capture(serial, { kind: 'trace', seconds: 2, output: path.join(output, 'journey.perfetto-trace') });
  await android.capture(serial, { kind: 'video', seconds: 2, output: path.join(output, 'journey.mp4') });
  const summary = { platform: process.platform, serial, generatedProjectBuilt: true, nativeCounterInteraction: true, composeSemantics: true, browserInspection: true, previewLaunchedWithoutCrash: true, traceCaptured: true, videoCaptured: true, annotationContract: 'See Playwright tests; native host must be checked in Codex.' };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary, null, 2));
} finally { await browser.close(); await viewer.close(); }
