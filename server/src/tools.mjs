import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Android, buildProject, describeProject } from './android.mjs';
import { Jobs } from './jobs.mjs';
import { Viewers } from './viewer.mjs';
import { sourceHints } from './source.mjs';
import { createProject, launchPreview, watchProject } from './project.mjs';
import { Debuggers } from './debugger.mjs';
import { analyzeHeap } from './heap.mjs';
import { analyzeTrace, frameSummary } from './performance.mjs';

export function createTools() {
  const android = new Android(), jobs = new Jobs(), viewers = new Viewers(android), definitions = [];
  const debuggers = new Debuggers(android);
  const session = z.string().uuid().describe('Debugger session returned by debug_attach');
  const thread = z.string().regex(/^[a-fA-F0-9]{1,16}$/).describe('Thread ID from debug_threads or debug_status events');
  const serial = z.string().optional().describe('Explicit adb serial; required when multiple devices are connected.');
  const project = z.string().describe('Absolute Android project directory');
  const app = z.string().describe('Android application ID, such as com.example.app');
  const textResult = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
  const add = (name, description, schema, handler, { readOnly = false, destructive = false } = {}) => definitions.push({ name, description, schema, handler: async args => textResult(await handler(args)), annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: false } });
  add('doctor', 'Check SDK, Java, emulator acceleration, connected devices and setup problems.', {}, () => android.doctor(), { readOnly: true });
  add('devices', 'List Android devices and authorization/boot state.', {}, () => android.devices(), { readOnly: true });
  add('avds', 'List installed Android Virtual Device profiles.', {}, () => android.avds(), { readOnly: true });
  add('emulator_start', 'Start or reuse an AVD. Returns a job; poll job_status until complete to get serial.', { avd: z.string(), headless: z.boolean().default(true) }, args => jobs.start('Boot emulator', ctx => android.startEmulator({ ...args, ...ctx })));
  add('emulator_stop', 'Stop only the explicitly selected emulator. Does not wipe its data.', { serial: z.string() }, ({ serial }) => android.stopEmulator(serial), { destructive: true });
  add('sdk_packages', 'List available and installed Android SDK packages.', {}, () => jobs.start('List SDK packages', ctx => android.sdk({ ...ctx, list: true })), { readOnly: true });
  add('sdk_install', 'Install selected SDK packages using already accepted licenses. Set acceptLicenses true only after explicit user acceptance; false declines any new license prompt.', { packages: z.array(z.string()).min(1), acceptLicenses: z.boolean().default(false) }, args => jobs.start('Install SDK packages', ctx => android.sdk({ ...args, ...ctx })));
  add('emulator_create', 'Create an AVD from an already installed system image. Never overwrites an existing AVD.', { name: z.string(), systemImage: z.string(), device: z.string().default('pixel_6') }, args => jobs.start('Create emulator', ctx => android.createEmulator({ ...args, ...ctx })));
  add('project_create', 'Create a Gradle/Compose Android app in an empty directory with a checked Gradle wrapper, Material 3, semantics and a debug preview host.', { directory: z.string(), name: z.string(), app, minSdk: z.number().int().default(26) }, createProject);
  add('project_describe', 'Find Gradle modules, wrapper and APK outputs in a project.', { project }, ({ project }) => describeProject(project), { readOnly: true });
  add('build', 'Run named Gradle build/test/lint tasks. Returns a job; poll job_status for output and APKs. Executes project build code.', { project, tasks: z.array(z.string()).default(['assembleDebug']) }, ({ project, tasks }) => jobs.start('Gradle build', ctx => buildProject(project, tasks, ctx)));
  add('install', 'Install an APK or split APK set on an explicitly selected device without downgrading or wiping app data.', { serial, apks: z.array(z.string()).min(1) }, ({ serial, apks }) => jobs.start('Install APK', () => android.install(serial, apks)));
  add('launch', 'Resolve and launch an installed app activity.', { serial, app, activity: z.string().optional() }, ({ serial, app, activity }) => android.launch(serial, app, activity));
  add('preview', 'Launch a no-argument top-level composable in a debug APK with Compose PreviewActivity declared. Build/install first.', { serial, app, composable: z.string() }, ({ serial, app, composable }) => launchPreview(android, serial, app, composable));
  add('watch', 'Watch edits, incrementally rebuild, skip superseded builds and preserve the running app when APK bytes are unchanged. Changed APKs install and relaunch; this is not VM hot swap. Returns an ongoing job; cancel with job_cancel.', { project, serial, app, tasks: z.array(z.string()).default(['assembleDebug']), composable: z.string().optional(), debounceMs: z.number().int().min(75).max(2000).default(250) }, args => jobs.start('Watch Android project', ctx => watchProject(android, args, ctx)));
  add('viewer_start', 'Mirror a device into a live localhost browser viewer with pointer/keyboard input, UI inspection, and native Codex annotation surfaces. Open the exact returned URL in the in-app browser. Requires a real screenshot before returning.', { serial, project: project.optional(), port: z.number().int().min(0).max(65535).default(0) }, args => viewers.start(args));
  add('viewer_stop', 'Close only a viewer owned by this MCP server, without stopping its emulator.', { serial: z.string() }, ({ serial }) => viewers.stop(serial));
  add('inspect', 'Read the Android accessibility hierarchy. Password values are redacted. Compose nodes require semantics; custom-drawn pixels may have no nodes.', { serial, fresh: z.boolean().default(true), query: z.string().optional(), limit: z.number().int().min(1).max(2000).default(500) }, async ({ serial, fresh, query, limit }) => {
    const tree = await android.inspect(serial, { fresh }); const nodes = query ? tree.nodes.filter(n => [n.text, n.resourceId, n.contentDescription, n.className].some(v => v.toLowerCase().includes(query.toLowerCase()))) : tree.nodes;
    return { ...tree, total: nodes.length, nodes: nodes.slice(0, limit), truncated: nodes.length > limit };
  }, { readOnly: true });
  add('element_source', 'Find source candidates by resource/test tag, text or content description. Returns evidence, not a guaranteed Kotlin source location.', { serial, project, elementId: z.string() }, async ({ serial, project, elementId }) => {
    const tree = await android.inspect(serial); const node = tree.nodes.find(n => n.id === elementId); if (!node) throw new Error('Element no longer exists; inspect again'); return { node, source: await sourceHints(project, node) };
  }, { readOnly: true });
  add('input', 'Tap, swipe, type printable ASCII, or send an Android navigation key. Coordinates are device pixels. Inspect before typing to verify focus.', { serial, action: z.enum(['tap', 'swipe', 'text', 'key']), x: z.number().int().optional(), y: z.number().int().optional(), endX: z.number().int().optional(), endY: z.number().int().optional(), duration: z.number().int().optional(), text: z.string().optional(), key: z.string().optional() }, ({ serial, action, ...args }) => android.input(serial, { type: action, ...args }));
  definitions.push({ name: 'screenshot', description: 'Capture a real device PNG, return it inline, and optionally save it to an absolute path.', schema: { serial, output: z.string().optional() }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }, handler: async ({ serial, output }) => {
    const png = await android.screenshot(serial); if (output) { await mkdir(path.dirname(path.resolve(output)), { recursive: true }); await writeFile(output, png); }
    return { content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }, { type: 'text', text: JSON.stringify({ output: output && path.resolve(output), width: png.readUInt32BE(16), height: png.readUInt32BE(20) }) }] };
  } });
  add('logcat', 'Capture bounded device or app-process logs. Does not clear logs.', { serial, app: app.optional(), lines: z.number().int().min(1).max(5000).default(300), level: z.enum(['V', 'D', 'I', 'W', 'E', 'F']).default('V') }, ({ serial, ...args }) => android.logcat(serial, args), { readOnly: true });
  add('memory', 'Read dumpsys meminfo for an app.', { serial, app }, ({ serial, app }) => android.memory(serial, app), { readOnly: true });
  add('heap_analyze', 'Analyze a local uncompressed Android/Java HPROF without uploads. Returns class counts, payload bytes, optional baseline growth and up to five GC-root field paths for an exact class. Excludes Reference.referent; does not compute dominators or prove leaks. Limits: 256 MiB, 500k objects.', { input: z.string(), baseline: z.string().optional(), targetClass: z.string().max(512).optional() }, args => jobs.start('Analyze heap', () => analyzeHeap(args)), { readOnly: true });
  add('trace_analyze', 'Analyze a local Perfetto trace for app CPU, inclusive slices and FrameTimeline. Requires an absolute native trace_processor path (processor or ANDROID_PLUGIN_TRACE_PROCESSOR). No upload/download.', { input: z.string(), app, processor: z.string().optional() }, args => jobs.start('Analyze trace', ctx => analyzeTrace(args, ctx)), { readOnly: true });
  add('frame_summary', 'Summarize current app gfxinfo samples into duration percentiles and duration buckets. Does not reset counters. Fixed buckets are not refresh-aware jank.', { serial, app }, async ({ serial, app }) => frameSummary((await android.frames(serial, app)).stdout), { readOnly: true });
  add('debug_attach', 'Attach JDWP to one running debuggable app; do not attach while Android Studio owns its debugger. Returns an owned session. Breakpoints pause the app. Detach when done to release owned suspension and port forwarding.', { serial, app }, ({ serial, app }) => debuggers.attach(serial, app));
  add('debug_threads', 'List up to 200 threads and their suspension state in an owned debugger session.', { session }, ({ session }) => debuggers.get(session).threads(), { readOnly: true });
  add('debug_status', 'Read debugger connection, pause state, owned requests and last 100 breakpoint/step events. Poll after reproducing an action.', { session }, ({ session }) => { const client = debuggers.get(session); return { connected: !client.closed, paused: client.paused, requests: [...client.requests.keys()], events: [...client.events] }; }, { readOnly: true });
  add('debug_breakpoint', 'Set a source line breakpoint on a loaded JVM class (Kotlin top-level functions often use ScreenKt). Uses VM line tables, suspends all threads on hit. No deferred class-prepare breakpoint or Kotlin SMAP rewriting.', { session, className: z.string().max(512), line: z.number().int().positive() }, ({ session, className, line }) => debuggers.get(session).breakpoint(className, line));
  add('debug_clear', 'Remove an owned breakpoint or pending step request.', { session, request: z.number().int().positive() }, ({ session, request }) => debuggers.get(session).clear(request));
  add('debug_stack', 'Inspect paused thread stack with VM class, method, source file and line. Generated/inline Kotlin code may need SMAP interpretation.', { session, thread, limit: z.number().int().min(1).max(50).default(30) }, ({ session, thread, limit }) => debuggers.get(session).stack(thread, limit), { readOnly: true });
  add('debug_locals', 'Read up to 50 in-scope local variables in a paused frame using VM debug symbols. Object/string values remain IDs; no target evaluation or object graph traversal.', { session, thread, frame: z.number().int().min(0).max(49).default(0) }, ({ session, thread, frame }) => debuggers.get(session).locals(thread, frame), { readOnly: true });
  add('debug_control', 'Pause/resume the app or step a paused thread into/over/out by source line. A thread ID is required for stepping. Does not evaluate target code.', { session, action: z.enum(['pause', 'resume', 'step_into', 'step_over', 'step_out']), thread: thread.optional() }, ({ session, action, thread }) => debuggers.get(session).control(action, thread));
  add('debug_detach', 'Dispose an owned JDWP session, release debugger suspension and remove only its ADB forward.', { session }, ({ session }) => debuggers.detach(session));
  add('frame_stats', 'Read frame statistics or reset this app’s frame counters before a focused journey.', { serial, app, reset: z.boolean().default(false) }, ({ serial, app, reset }) => android.frames(serial, app, reset));
  add('capture', 'Capture a bounded Perfetto trace, screen video, or HPROF heap dump to a local output path. Heap dumps require a debuggable app.', { serial, kind: z.enum(['trace', 'video', 'heap']), seconds: z.number().int().min(1).max(180).default(10), output: z.string(), app: app.optional() }, ({ serial, ...args }) => jobs.start('Capture Android artifact', ctx => android.capture(serial, { ...args, ...ctx })));
  add('job_status', 'Read completion, errors, output tail and result of a background operation. Poll with a few seconds between calls.', { id: z.string() }, ({ id }) => jobs.get(id), { readOnly: true });
  add('job_cancel', 'Cancel a build, capture or watch job owned by this MCP server.', { id: z.string() }, ({ id }) => jobs.cancel(id), { destructive: true });
  return { definitions, android, jobs, viewers, debuggers, async close() { await debuggers.close(); await viewers.close(); await jobs.close(); } };
}
