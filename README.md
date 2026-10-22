# Build Android Apps

A local Codex plugin for native Android development on **macOS and Windows**. It combines nine Android/Compose workflow skills with 27 MCP tools and an interactive emulator viewer in Codex's browser side panel.

The viewer streams a real device, forwards input, inspects Android accessibility elements, finds source candidates, and integrates with the host's native annotation surface API. No cloud service, API key, Android app account, FFmpeg, scrcpy, or npm install is required to **run the packaged plugin**.

## Install

Install [Node.js 22 or newer](https://nodejs.org/) and [Android Studio](https://developer.android.com/studio/install). In Android Studio's SDK Manager install Android SDK Platform-Tools, Emulator, current Command-line Tools and a compatible system image. Create an AVD in Device Manager. Apple Silicon uses `arm64-v8a`; Windows x64 and Intel Macs use `x86_64`. Windows needs hardware virtualization and an emulator-supported hypervisor. [Acceleration setup](https://developer.android.com/studio/run/emulator-acceleration).

Clone this private repository with your GitHub account, then register its marketplace in Codex. These commands work in macOS Terminal and Windows PowerShell:

```sh
git clone https://github.com/till-tus/build-android-apps.git
cd build-android-apps
codex plugin marketplace add .
codex plugin add build-android-apps@till-android-tools
```

Start a new local Codex chat and select **Build Android Apps**, or ask it to build/run an Android app. The committed bundle already includes runtime npm dependencies. Your SDK, emulator images and Java remain separate installations. Cloud-only chats cannot reach your computer's emulator.

If the SDK is outside the standard location, set `ANDROID_HOME`. Java resolves from `JAVA_HOME`, Android Studio's bundled JBR, or PATH. Optional overrides point at individual executable files: `ANDROID_PLUGIN_ADB`, `ANDROID_PLUGIN_EMULATOR`, `ANDROID_PLUGIN_JAVA`, `ANDROID_PLUGIN_SDKMANAGER`, `ANDROID_PLUGIN_AVDMANAGER`. Node must be on the PATH inherited by Codex; restart Codex after changing system environment settings.

## Use

Example prompts:

- “Build a native Compose app for my book collection and show it in the side panel.”
- “Run this project on my Pixel AVD, inspect the onboarding screen and fix its layout.”
- “Watch my Compose preview and rebuild it when I change the source.”
- “Capture a Perfetto trace while I scroll this list and investigate the slow frames.”

The agent discovers the SDK and project, chooses an explicit device, builds and installs the app, starts a viewer, and opens the exact local viewer URL in Codex's in-app browser. The crosshair selects Android elements. The pencil appears when native host annotations are available. Use Codex's annotation mode to select an element and send feedback into chat. The inspector's **Copy** button also exports element context.

For direct CLI use, from this checkout:

```sh
node server/dist/cli.mjs doctor
node server/dist/cli.mjs avds
node server/dist/cli.mjs emulator-start --avd Pixel_6
node server/dist/cli.mjs project-create --directory ./MyApp --name "My App" --app com.example.myapp
node server/dist/cli.mjs build --project ./MyApp
node server/dist/cli.mjs viewer --serial emulator-5554 --project ./MyApp
```

`viewer` stays in the foreground; open the printed URL in Codex's browser and keep that terminal alive. Ctrl+C closes its viewer without stopping the emulator. CLI long operations wait for completion. MCP long operations return a job ID; poll `job_status`. Use absolute APK and artifact paths. `help` lists commands and argument conventions.

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
- `watch` rebuilds, installs and relaunches a single debug APK. It is not VM hot swap or Android Studio Live Edit. Previews require an installed debug host and a top-level no-argument composable; the generated app includes one.
- Tools capture Perfetto/HPROF artifacts; analysis and JDWP breakpoint debugging use Android Studio or an appropriate analyzer. No simulated profiling results are reported.
- Emulator support depends on the installed SDK, matching image architecture and host hypervisor. Hosted Windows CI tests the Node/MCP/viewer and SDK launch paths; full device interaction is exercised separately on a Linux emulator.

## Development and validation

```sh
npm ci
npx playwright install chromium
npm run check
npm run pack:plugin
```

`npm run build` creates a self-contained `server/dist/cli.mjs` and dependency license notices. Commit both after source/dependency changes. `pack:plugin` creates an installable folder under `artifacts/` with skills, manifests, viewer, server and licenses. Runtime dependencies are locked in `package-lock.json`; tests also launch the bundled MCP server over stdio.

Tests cover hierarchy parsing/redaction, malicious command arguments, ambiguous devices, portable project creation, H.264 frame parsing, job lifecycle, authenticated HTTP/WebSocket access, inspection ownership across viewers, real browser input/inspection, narrow-panel layout and annotation coordinates/metadata. CI runs on macOS, Windows and Linux with Node 22 and 24. A separate KVM emulator job builds the generated app, tests real Compose semantics/taps, opens the viewer, launches a Compose preview, verifies a source-edit rebuild/relaunch, and captures screenshot/video/trace/heap evidence. Run it locally with an already booted device using `node scripts/integration.mjs`; it creates a temporary sample project and installs `dev.codex.androidlab`. See [validation notes](docs/validation.md) for the observed results and annotation verification boundary.

## Troubleshooting

- **No SDK/Java:** run `doctor`. Set `ANDROID_HOME`/`JAVA_HOME`, install the listed SDK packages, and restart Codex after PATH changes.
- **Multiple devices:** pass the selected `serial` to every tool. Device `offline`/`unauthorized` states need boot completion or USB authorization.
- **AVD boots without acceleration or reports API 0:** update Command-line Tools in SDK Manager and recreate the AVD using a correctly parsed system image. Old SDK tools cannot read newer minor-version image metadata. Do not edit/wipe an existing user's AVD as a repair shortcut.
- **Video is blank/unsupported:** choose **Use PNG transport** in the viewer menu. Some device/browser H.264 configurations are unsupported. Verify an actual frame before reporting success.
- **Element missing:** wait for animations to settle and refresh the hierarchy. Add meaningful Compose semantics/test tags in apps you control, or annotate a screen region.
- **Pencil absent:** the host annotation API is unavailable or not enabled on that page. Use the host's Site tools/annotation permissions, or copy context from the inspector.

The viewer binds to loopback, uses per-session credentials and checks browser origins. Treat its URL as a session secret. Screenshots, UI trees, logs, source hints and heap dumps can contain app data; keep test artifacts out of Git.

Independent implementation; not an official OpenAI or Google plugin. [MIT license](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md). Public directory submission of a local MCP plugin has separate [OpenAI eligibility requirements](https://developers.openai.com/plugins/deploy/desktop-only); the private repository/local marketplace installation above is the distribution path here.
