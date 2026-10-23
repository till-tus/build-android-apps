# Architecture

The plugin contains nine workflow skills, a local MCP server and a localhost browser viewer. A security-patched Node 22 LTS (22.23.4+) or 24 LTS (24.22.1+) and the installed Android SDK are the runtime dependencies. Other major lines/prereleases and older patches are rejected at startup, including when npm installation/engine checks are bypassed. CLI `doctor` and `help` remain available for repair. The committed server bundle includes its npm dependencies; the same artifact runs on macOS, Windows and Linux.

## Request and rendering paths

Codex → MCP stdio → scoped Android/Gradle operations. Long operations run as bounded jobs; subprocess jobs support cancellation. Local heap parsing is synchronous and bounded by file/object/edge limits. The viewer uses the exact device serial selected by the workflow. It listens only on IPv4 loopback and requires a random session credential for API and WebSocket access. The credential lives in the URL fragment and authenticated request headers/subprotocol, not query strings. Host and Origin checks prevent cross-site API and WebSocket requests. There is no arbitrary shell endpoint or unauthenticated device listing.

Device display → adb exec-out screenrecord H.264 → incremental Annex-B/access-unit parser → authenticated WebSocket → WebCodecs → canvas. The parser releases the previous frame when the next slice header is available, without waiting for another complete NAL. An IDR carries cached SPS/PPS configuration. Slow clients wait for a new keyframe rather than decoding after a dropped reference frame. Decoder backlog resets into keyframe recovery, then PNG fallback if recovery times out. The bounded Android screenrecord process restarts; it is stopped when no client needs it. Shared, backpressured PNG capture is paced at up to 15 fps after subtracting capture time. Browser PNG decoding keeps one active bitmap and one newest pending frame; canvas redraws do not trigger layout on every frame.

Pointer and keyboard → validated API → bounded serial input queue → separately quoted Android remote shell arguments → adb input. The viewer resolves its serial once; gestures avoid repeated device discovery. Wheel bursts coalesce over 32 ms into 80 ms swipes, with one wheel request in flight and one accumulated pending gesture. Inspection is debounced after input. Host subprocesses never invoke a command shell. SDK tools and Gradle launch through Java entry points, avoiding Windows batch-file quoting. ASCII typing, clicks, long presses, swipes, wheel scroll and navigation keys work; multi-touch and arbitrary Unicode injection need a future input transport.

UIAutomator XML → bounded, password-redacted tree → periodic browser cache → synchronous hit test. Points and rectangles use device pixels internally and viewport CSS pixels at the annotation boundary. The host surface API supplies native annotation attachments. The viewer freezes the canvas/picking tree during annotation mode. Empty/custom-drawn/stale regions carry coordinate context. Source indexing returns bounded, explicit text matches rather than claiming exact Kotlin AST mappings.

## Capability mapping

| Build iOS Apps capability | Android counterpart |
| --- | --- |
| Xcode/simulator build, run, logs, screenshots | Gradle wrapper, adb, AVD and bounded logcat tools |
| Simulator browser mirror | Local H.264/WebCodecs viewer with PNG fallback |
| SwiftUI package preview | Debug Compose PreviewActivity and no-argument wrapper |
| Preview hot reload | Debounced watcher; skips superseded builds and unchanged APK restarts |
| App Intents | Android intents, App Links, shortcuts, Sharesheet, notifications |
| Liquid Glass / SwiftUI patterns | Compose Material 3, adaptive layouts, edge-to-edge |
| View refactoring and performance review | Compose state/effect/refactoring and performance workflows |
| ETTrace profiling | Perfetto capture/local SQL analysis and frame-duration summaries |
| Memgraph leak analysis | meminfo, HPROF capture, local census/baseline comparison and bounded GC-root paths |
| Source debugger | Scoped JDWP attach, line breakpoints, stacks, locals and source stepping |

## Debugging and artifact analysis

JDWP uses a session-owned `adb forward tcp:0 jdwp:PID`, a loopback socket, framed command/reply IDs and the VM's negotiated identifier sizes. Breakpoint/step events suspend all threads; dispose releases debugger suspension and cleanup removes only that session's forward. There is no expression evaluation or target method invocation. Source positions come from VM line tables and do not rewrite Kotlin SMAPs.

The bundled HPROF parser accepts 4/8-byte IDs and standard Android heap records, bounds inputs to 256 MiB/500,000 objects, and never returns string/array contents. Breadth-first field traversal finds up to five exact-class paths, skips `Reference.referent`, and stops at two million edges. Class payload-byte growth is not retained-size/dominator analysis. Perfetto analysis calls an explicitly configured native processor with fixed local SQL; it reports per-thread scheduled CPU, inclusive slices and FrameTimeline groups. Missing events are explicit, and no trace is uploaded.

## Deliberate boundaries

This package uses Codex's browser panel. It cannot add private native panel chrome. Annotation availability depends on the host release and permissions; the browser tests verify the documented API contract with a test double, not delivery to a real chat. Source candidates rank exact tag/resource evidence but remain heuristic. UIAutomator sees accessibility semantics rather than the complete Compose tree. Changed APKs still restart; Apply Changes, Live Edit and arbitrary VM hot swap are not implemented. Deferred class-load breakpoints, Kotlin SMAP rewriting, expression evaluation, native debugging and heap dominators remain external-tool workflows. Audio, multi-touch and Unicode injection are not included in the core ADB input transport.

Public plugin directory submission of local MCP servers has separate OpenAI partner eligibility requirements; a local/repo marketplace does not need public submission. See [desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only).
