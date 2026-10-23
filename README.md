# Build Android Apps

A local Codex plugin for native Android development on **macOS and Windows**. It combines nine Android/Compose workflow skills with 39 MCP tools and an interactive emulator viewer in Codex's browser side panel.

The viewer streams a real device, forwards input, inspects Android accessibility elements, finds source candidates, and integrates with the host's native annotation surface API. No cloud service, API key, Android app account, FFmpeg, scrcpy, or npm install is required to **run the packaged plugin**.

## Install

### Prerequisites

| Component | Requirement |
| --- | --- |
| Host | A local Codex desktop chat on macOS or Windows, with local plugins and browser access enabled. Account/workspace policies can restrict plugins. |
| Node.js | [Node.js 22 or 24 LTS](https://nodejs.org/), on the PATH inherited by Codex. The runtime requires Node 22+. |
| Git | [Git](https://git-scm.com/downloads), for cloning and marketplace updates. |
| Android tools | [Android Studio](https://developer.android.com/studio/install) is the easiest way to install/manage the SDK, Java and virtual devices. A separately installed SDK and JDK also work. |
| Java | A full JDK compatible with your project. JDK 21 is tested; the generated AGP 9.1.1 / Gradle 9.3.1 project requires at least JDK 17. Android Studio's bundled JBR works. |
| Device | An accelerated AVD matching the host CPU, or a USB-connected Android device with USB debugging authorized. The generated sample requires Android 8 / API 26 or newer. |

In Android Studio's **SDK Manager**, install **Android SDK Platform-Tools**, **Android Emulator** (for AVDs), and current **Android SDK Command-line Tools**. For generated projects, also install **Android SDK Platform 36** (`platforms;android-36`) and **Build-Tools 36.0.0** (`build-tools;36.0.0`). Existing projects may require other platform/build-tool versions. Review and accept the SDK licenses in Android Studio. The plugin does not accept new licenses unless you explicitly request it.

In **Device Manager**, create and boot an AVD with a compatible system image. Use `arm64-v8a` on Apple Silicon; use `x86_64` on Intel Macs and Windows x64. Enable the host's hardware virtualization/hypervisor using the [Android emulator acceleration guide](https://developer.android.com/studio/run/emulator-acceleration). Windows ARM emulation is not verified here; a supported physical device can avoid emulator/hypervisor requirements. USB devices may need an OEM driver on Windows; enable Developer options → USB debugging and approve the computer on the device.

First builds need internet access to download Gradle and Maven dependencies; SDK/image installation also downloads packages. Allow the relevant Gradle, Google Android and Maven repositories through your network policy. Corporate proxy/CA settings for Java/Gradle must be configured separately. Never disable TLS verification as a workaround.

### Register and install

Install the current [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) if `codex` is not available (`npm install -g @openai/codex`), and confirm `codex plugin --help` lists `add` and `marketplace`. Then clone and register this marketplace. These commands work in macOS Terminal and Windows PowerShell:

```sh
git clone https://github.com/till-tus/build-android-apps.git
cd build-android-apps
codex plugin marketplace add .
codex plugin add build-android-apps@till-android-tools
```

Restart the desktop app, open its plugin browser, select **Till's Android Tools** if needed, and ensure **Build Android Apps** is installed/enabled. Start a new **local** chat in your Android project and select the plugin. Hosts differ in local marketplace UI; see the [official OpenAI installation/marketplace documentation](https://developers.openai.com/plugins/build/plugins). If the CLI and desktop app run under different OS accounts or configuration homes, register/install in the account used by the desktop app.

The committed bundle already includes runtime npm dependencies: do **not** run `npm install` just to use the plugin. Your SDK, emulator images and JDK remain separate installations. The plugin itself needs no API key; Codex uses your normal host sign-in. Cloud-only chats cannot reach your computer's emulator. WSL, containers, remote SSH hosts and split Windows/WSL SDK installations are not a validated side-panel setup; keep Node, SDK, ADB and Codex on the same host. Linux runs the CLI/MCP/viewer and is tested in CI; this does not establish Linux desktop host/annotation availability.

### Configure and verify

SDK lookup uses `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then standard per-user locations. Java lookup uses `ANDROID_PLUGIN_JAVA`, `JAVA_HOME`, Android Studio's bundled JBR on macOS/Windows, then PATH. Use a JDK matching your project's Gradle/AGP requirements; installing a newer Java alone does not make every older Gradle version compatible. Builds obtain the real JDK home from the JVM, including when Java on PATH is a symlink or shim.

If detection needs help, set the following for the current terminal (adjust to your installation):

macOS / zsh:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

Windows / PowerShell:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
```

For the desktop app, save variables through your OS's user environment settings or launch it from a configured environment; terminal-only exports and version-manager shell initialization may not reach an already running GUI app. Restart Codex after changes. On macOS, a `.zshrc` edit alone does not configure apps launched from Finder. For headless Linux SDK use, set `ANDROID_HOME` to your SDK location (normally `$HOME/Android/Sdk`) and `JAVA_HOME` to your installed JDK.

Optional overrides point to individual executable files: `ANDROID_PLUGIN_ADB`, `ANDROID_PLUGIN_EMULATOR`, `ANDROID_PLUGIN_JAVA`, `ANDROID_PLUGIN_SDKMANAGER`, `ANDROID_PLUGIN_AVDMANAGER`. Do not include shell quotes inside their values. For SDK manager overrides use the SDK's standard launcher, not an arbitrary script. A manually configured MCP client must invoke `node` with the **absolute** path to `server/dist/cli.mjs` and argument `mcp`; `${PLUGIN_ROOT}` in the supplied manifests is expanded by the plugin host. If Node is unavailable to the host, fix its PATH or use an absolute Node executable in your own client configuration.

From the cloned repository, run:

```sh
node server/dist/cli.mjs doctor
node server/dist/cli.mjs devices
node server/dist/cli.mjs avds
```

`doctor` returns a report: inspect its `issues` list even if the command exits successfully. A ready device has state `device`. Use its exact serial on device tools; the plugin refuses to choose when several are connected. As a first chat prompt, try: “Run doctor, use my selected Android device, build this project and open its live viewer.” Long MCP operations return job IDs; wait for `job_status` to report completion.

### Update or uninstall

For this cloned/local marketplace, run `git pull --ff-only` from the checkout, then `codex plugin add build-android-apps@till-android-tools` to refresh the installed copy. Restart Codex and start a new chat. The installed cache is a copy; editing the checkout does not update an active plugin. For a Git-backed marketplace, also run `codex plugin marketplace upgrade till-android-tools` before reinstalling.

To uninstall, run `codex plugin remove build-android-apps@till-android-tools`; remove the marketplace with `codex plugin marketplace remove till-android-tools` if no longer needed. SDKs, AVDs, projects and captured artifacts are managed separately.

## Use

Example prompts:

- “Build a native Compose app for my book collection and show it in the side panel.”
- “Run this project on my Pixel AVD, inspect the onboarding screen and fix its layout.”
- “Watch my Compose preview and rebuild it when I change the source.”
- “Capture a Perfetto trace while I scroll this list and investigate the slow frames.”

The agent discovers the SDK and project, chooses an explicit device, builds and installs the app, starts a viewer, and opens the exact local viewer URL in Codex's in-app browser. The crosshair selects Android elements. The pencil appears when native host annotations are available. Use Codex's annotation mode to select an element and send feedback into chat. The inspector's **Copy** button also exports element context.

## New in 0.2.1

Portable Java home resolution, a verified standalone runtime, complete dependency/icon notices, CI secret and dependency scanning, and expanded first-install instructions. See the [public readiness audit](docs/public-readiness.md) and [validation notes](docs/validation.md).

## New in 0.2.0

- **More responsive preview:** wheel bursts merge into one short swipe with at most one wheel gesture in flight. Viewer input reuses its selected device instead of running `adb devices` for every event. PNG capture requests share one operation, with a capture-time-aware 15 fps ceiling instead of a fixed 250 ms pause. Video frames are released as soon as the next slice header arrives; congested decoders reset and wait for a keyframe, with PNG recovery if video cannot catch up. Drawing no longer relayouts the page on every frame.
- **In-chat debugging:** attach to a running debuggable app, list threads, set line breakpoints on loaded JVM classes, pause/resume, step into/over/out, and inspect stacks and locals. Sessions own their ADB forward and detach on MCP shutdown. No target expressions or methods are evaluated.
- **Local heap analysis:** read Android/Java HPROF files, compare class counts and payload bytes against a baseline, and inspect bounded field paths from GC roots to an exact target class. The analyzer excludes `Reference.referent` and never prints string/array contents. These paths identify ownership evidence; they are not dominator analysis or automatic leak proof.
- **Performance summaries:** summarize app frame-duration percentiles; analyze captured Perfetto traces for per-thread scheduled CPU time, inclusive trace slices and FrameTimeline groups. Trace capture now explicitly includes process metadata and FrameTimeline (Android 12+) and can enable the selected app's atrace events.
- **Better source candidates and watch:** exact test-tag/resource references outrank incidental text; visible string resources resolve to call sites. Watch includes resource files and version catalogs, skips superseded builds, and preserves the running app when the APK hash is unchanged. Changed APKs still reinstall and relaunch.

### Debugging from a Codex chat

Use `debug_attach` with the selected serial and application ID, then retain its session ID for all `debug_*` calls. Launch the screen first: `debug_breakpoint` requires an already loaded class and executable line. A top-level Kotlin function often belongs to `package.ScreenKt`, rather than `package.Screen`. After reproducing the action, read `debug_status`, use the event's thread ID with `debug_stack`/`debug_locals`, then resume or step. Breakpoint events suspend all app threads. Always `debug_detach` when finished; do not concurrently attach Android Studio to the same process. JVM source line tables are reported as supplied, so inline Kotlin and Compose-generated code can still require SMAP interpretation. Locals need debug symbols; object/string locals are returned as IDs.

### Analyzing captured artifacts

`heap_analyze` accepts `input`, optional `baseline` and optional exact `targetClass`. It accepts uncompressed HPROF up to 256 MiB and 500,000 objects, examines up to five target instances and bounds graph traversal. Use Android Studio for larger dumps, dominators, full retained-size analysis or unsupported formats. Payload bytes exclude object headers, alignment and native memory.

`frame_summary` reads existing `gfxinfo` samples without resetting them. Its duration buckets are not refresh-aware jank measurements. `trace_analyze` accepts local `input`, application ID and an absolute native Perfetto executable through `processor` or `ANDROID_PLUGIN_TRACE_PROCESSOR`. Install a current native processor from the [official Perfetto releases](https://github.com/google/perfetto/releases) (v58.2 is tested; the binary may be named `trace_processor_shell`). Analysis runs locally and does not upload traces or download a processor automatically. Missing events are reported as missing data. Scheduled CPU time and inclusive slices are not method-sampling flamegraphs.

For direct CLI use, from this checkout:

```sh
node server/dist/cli.mjs doctor
node server/dist/cli.mjs avds
node server/dist/cli.mjs emulator-start --avd Pixel_6
node server/dist/cli.mjs project-create --directory ./MyApp --name "My App" --app com.example.myapp
node server/dist/cli.mjs build --project ./MyApp
node server/dist/cli.mjs install --serial emulator-5554 --apks '["./MyApp/app/build/outputs/apk/debug/app-debug.apk"]'
node server/dist/cli.mjs launch --serial emulator-5554 --app com.example.myapp
node server/dist/cli.mjs viewer --serial emulator-5554 --project ./MyApp
```

Replace `Pixel_6` and `emulator-5554` with your actual AVD name and serial. Run `devices` again after boot to obtain the serial. `viewer` stays in the foreground; open the printed URL in Codex's browser and keep that terminal alive. Ctrl+C closes its viewer without stopping the emulator. CLI long operations wait for completion. MCP long operations return a job ID; poll `job_status`. Use absolute APK and artifact paths when working outside this checkout. `help` lists commands and argument conventions. JSON array arguments need to reach Node intact; in Windows PowerShell 5.1, ask the plugin to install the APK through MCP if its legacy native-command quoting strips the JSON quotes (PowerShell 7 is recommended).

## Included workflows

| Skill | Purpose |
| --- | --- |
| Android debugger | Project setup, build, install, launch, logs and UI-driven diagnosis |
| Android emulator browser | Side-panel mirror, annotations, debug Compose previews and edit watcher |
| Compose Material 3 | Native visual design, theming, adaptive layouts and edge-to-edge |
| Compose UI patterns | State, navigation, forms, lists, semantics and restoration |
| Compose view refactor | Component boundaries, state ownership, effects and stable behavior |
| Compose performance audit | Measurement-led recomposition, layout and jank investigation |
| Android Perfetto | Bounded system traces and frame statistics |
| Android memory leaks | meminfo, HPROF capture and retained-object investigation |
| Android system integrations | App Links, intents, shortcuts, sharing and notifications |

The [architecture and capability mapping](docs/architecture.md) describe how these correspond to the upstream iOS plugin.

## Current boundaries

- This uses Codex's existing browser panel. Private native panel chrome is not an extension provided by this package.
- Native annotations require a compatible host exposing `document.oai.annotation` on a top-level localhost page and the user's annotation permissions. Ordinary browsers support the viewer and inspector. Automated tests exercise the documented host API contract with a test double; a real chat attachment must be verified in the target Codex release.
- Android UI inspection sees accessibility semantics. Custom canvases, WebView internals and merged Compose nodes may expose less detail; the annotation then carries screen coordinates. Source links are explicitly labeled text/resource/test-tag candidates.
- The core input transport supports taps, swipes, long presses, wheel scrolling, ASCII typing/paste and navigation keys. It does not provide multi-touch, Unicode injection, audio streaming or gamepad support.
- `watch` avoids unchanged APK restarts but rebuilds, installs and relaunches changed APKs. VM hot swap/Android Studio Live Edit is not implemented. Previews require an installed debug host and a top-level no-argument composable; the generated app includes one.
- JDWP debugging requires a running debuggable app with debug symbols and loaded classes. Kotlin inline source remapping, expression evaluation, deferred breakpoints and native debugging remain outside this debugger. Heap analysis is bounded and does not compute dominators; trace analysis requires a separately installed native Perfetto processor. No simulated profiling results are reported.
- Emulator support depends on the installed SDK, matching image architecture and host hypervisor. Hosted Windows CI tests the Node/MCP/viewer and SDK launch paths; full device interaction is exercised separately on a Linux emulator.

## Development and validation

```sh
npm ci
npx playwright install chromium
npm run check
npm run pack:plugin
```

`npm run build` creates a self-contained `server/dist/cli.mjs` and dependency license notices. Commit both after source/dependency changes. `pack:plugin` creates an installable folder under `artifacts/` with skills, manifests, viewer, server and licenses. Runtime dependencies are locked in `package-lock.json`; tests also launch a relocated bundled MCP server without `node_modules`. `package.json` remains `private` to prevent accidental npm publishing; it does not restrict GitHub or plugin marketplace distribution. See [contributing](CONTRIBUTING.md) for platform checks and [security](SECURITY.md) for private reporting and data boundaries.

Tests cover hierarchy parsing/redaction, malicious command arguments, ambiguous devices, portable project creation, H.264 frame parsing, job lifecycle, authenticated HTTP/WebSocket access, inspection ownership across viewers, real browser input/inspection, narrow-panel layout and annotation coordinates/metadata. CI runs on macOS, Windows and Linux with Node 22 and 24. A separate KVM emulator job builds the generated app, tests real Compose semantics/taps, opens the viewer, launches a Compose preview, verifies a source-edit rebuild/relaunch, and captures screenshot/video/trace/heap evidence. Run it locally with an already booted device using `node scripts/integration.mjs`; it creates a temporary sample project and installs `dev.codex.androidlab`. See [validation notes](docs/validation.md) for the observed results and annotation verification boundary.

## Troubleshooting

- **No SDK/Java:** run `doctor`. Set `ANDROID_HOME`/`JAVA_HOME`, install the listed SDK packages, and restart Codex after PATH changes.
- **`node` or `codex` not found:** install the prerequisites for the same OS/user running the desktop app, confirm their versions in a new terminal, and restart the app. PowerShell execution-policy restrictions on npm's `.ps1` launcher can be avoided by using `npm.cmd` / `codex.cmd` rather than weakening the policy.
- **Plugin missing / `plugin` command unknown:** update the Codex host/CLI, check `codex plugin marketplace list` and `codex plugin list`, refresh/reinstall the cached copy, and start a new local chat. Workspace policy may disable local plugins.
- **SDK license / platform error:** use SDK Manager to install the project's exact platform and build-tools and review its licenses. The generated project uses API 36 / Build-Tools 36.0.0. Set a compatible JDK when Gradle reports a Java version mismatch.
- **Viewer does not connect:** use the complete returned URL, including its fragment. Allow local loopback/WebSocket access in the host/firewall; keep `127.0.0.1` out of proxy routing (for example through `NO_PROXY`). Do not replace the host, remove the fragment, expose a public port or tunnel the viewer.
- **Multiple devices:** pass the selected `serial` to every tool. Device `offline`/`unauthorized` states need boot completion or USB authorization.
- **AVD boots without acceleration or reports API 0:** update Command-line Tools in SDK Manager and recreate the AVD using a correctly parsed system image. Old SDK tools cannot read newer minor-version image metadata. Do not edit/wipe an existing user's AVD as a repair shortcut.
- **Video is blank/unsupported:** choose **Use PNG transport** in the viewer menu. Some device/browser H.264 configurations are unsupported. Verify an actual frame before reporting success.
- **Element missing:** wait for animations to settle and refresh the hierarchy. Add meaningful Compose semantics/test tags in apps you control, or annotate a screen region.
- **Pencil absent:** the host annotation API is unavailable or not enabled on that page. Use the host's Site tools/annotation permissions, or copy context from the inspector.

The viewer binds to loopback, uses per-session credentials and checks browser origins. Treat its URL as a session secret. Screenshots, UI trees, logs, source hints and heap dumps can contain app data; keep test artifacts out of Git. Capture and analysis run locally; context returned to Codex or attached to chat follows the host's data handling. Only build trusted projects because Gradle scripts execute local code. The plugin never needs you to publish a viewer URL or upload a heap to use local analysis.

Independent implementation; not an official OpenAI or Google plugin. [MIT license](LICENSE), [third-party notices and icon attribution](THIRD_PARTY_NOTICES.md). Android is a trademark of Google LLC. Public source hosting and marketplace installation are separate from submission to the universal Plugins Directory, which has its own [OpenAI eligibility requirements](https://developers.openai.com/plugins/deploy/desktop-only).
