# Architecture

The plugin contains nine workflow skills, a local MCP server and a localhost browser viewer. Node 22+ and the installed Android SDK are the runtime dependencies. The committed server bundle includes its npm dependencies; the same artifact runs on macOS, Windows and Linux.

## Request and rendering paths

Codex → MCP stdio → scoped Android/Gradle operations. Long operations run as bounded, cancelable jobs. The viewer uses the exact device serial selected by the workflow. It listens only on IPv4 loopback and requires a random session credential for API and WebSocket access. The credential lives in the URL fragment and authenticated request headers/subprotocol, not query strings. Host and Origin checks prevent cross-site API and WebSocket requests. There is no arbitrary shell endpoint or unauthenticated device listing.

Device display → adb exec-out screenrecord H.264 → incremental Annex-B/access-unit parser → authenticated WebSocket → WebCodecs → canvas. An IDR carries cached SPS/PPS configuration. Slow clients wait for a new keyframe rather than decoding after a dropped reference frame. The bounded Android screenrecord process restarts; it is stopped when no client needs it. Unsupported browser/device codecs fall back to backpressured PNG frames from screencap.

Pointer and keyboard → validated API → bounded serial input queue → separately quoted Android remote shell arguments → adb input. Host subprocesses never invoke a command shell. SDK tools and Gradle launch through Java entry points, avoiding Windows batch-file quoting. ASCII typing, clicks, long presses, swipes, wheel scroll and navigation keys work; multi-touch and arbitrary Unicode injection need a future input transport.

UIAutomator XML → bounded, password-redacted tree → periodic browser cache → synchronous hit test. Points and rectangles use device pixels internally and viewport CSS pixels at the annotation boundary. The host surface API supplies native annotation attachments. The viewer freezes the canvas/picking tree during annotation mode. Empty/custom-drawn/stale regions carry coordinate context. Source indexing returns bounded, explicit text matches rather than claiming exact Kotlin AST mappings.

## Capability mapping

| Build iOS Apps capability | Android counterpart |
| --- | --- |
| Xcode/simulator build, run, logs, screenshots | Gradle wrapper, adb, AVD and bounded logcat tools |
| Simulator browser mirror | Local H.264/WebCodecs viewer with PNG fallback |
| SwiftUI package preview | Debug Compose PreviewActivity and no-argument wrapper |
| Preview hot reload | Incremental rebuild/install/relaunch watcher |
| App Intents | Android intents, App Links, shortcuts, Sharesheet, notifications |
| Liquid Glass / SwiftUI patterns | Compose Material 3, adaptive layouts, edge-to-edge |
| View refactoring and performance review | Compose state/effect/refactoring and performance workflows |
| ETTrace profiling | Perfetto capture and gfxinfo frame statistics |
| Memgraph leak analysis | meminfo and HPROF capture/analyzer workflow |

## Deliberate boundaries

This package uses Codex's browser panel. It cannot add private native panel chrome. Annotation availability depends on the host release and permissions; the browser tests verify the documented API contract with a test double, not delivery to a real chat. Source matching is heuristic. UIAutomator sees accessibility semantics rather than the complete Compose tree. Watch reloads the app and does not implement Apply Changes, Live Edit or arbitrary VM hot swap. JDWP breakpoints and heap/trace analysis remain Android Studio/analyzer workflows. Audio, multi-touch and Unicode injection are not included in the core ADB input transport.

Public plugin directory submission of local MCP servers has separate OpenAI partner eligibility requirements; a local/repo marketplace does not need public submission. See [desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only).
