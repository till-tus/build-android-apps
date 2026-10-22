# Validation

## 0.2.0 — Windows, 23 October 2026

Validated on Windows x64 with Node 24.18.0, Android Studio's JBR 21.0.10, Chromium 156 and the official native Perfetto v58.2 processor. Local verification covers:

- 30 Node tests (including real JVM breakpoint/stack/local/step/detach, overlapping attach/shutdown cleanup and real captured JVM HPROF ownership-path tests) and five Chromium UI tests. The optional native Perfetto test is enabled with `ANDROID_PLUGIN_TRACE_PROCESSOR`; other environments explicitly skip it if absent. The JVM test waits for the asynchronous VM-start event, which can arrive after the IDSizes reply on Windows/Node 22.
- The rebuilt bundled MCP server advertises all 39 tools, validates schemas and survives invalid calls.
- A 20-event wheel burst becomes one 80 ms swipe, with one wheel request in flight. Cancellation, new gestures after cancellation and switching to inspection are covered.
- Synthetic-device PNG delivery avoids the old fixed 250 ms delay, concurrent capture requests coalesce, and viewer input does not repeat device discovery. The H.264 parser releases a previous frame upon receiving the next slice header. Decoder congestion/keyframe recovery and encoder-to-PNG fallback are browser-tested with a decoder double.
- Desktop (520×900) and narrow (320×720) rendered viewer checks cover canvas drawing, selection, input, annotation contracts, responsive bounds and page errors. These are fixture-device browser checks, not real-emulator latency measurements.
- Real JVM HPROF parsing finds an expected static-owner field path. Synthetic Android 4/8-byte HPROF fixtures cover class growth, weak-reference exclusion, unreachable roots, truncation and object/edge limits. The official native processor reads a Chrome trace fixture and returns its real inclusive slice duration without inventing missing CPU/frame data.
- Watch checks cover resource/version-catalog edits, unchanged APK state preservation and skipping superseded builds.

This Windows machine has Java but no Android SDK, emulator or AVD. Real ART/JDWP, Android heap and changed trace-config checks run in the real-emulator CI job, which now tests breakpoint/stack/locals/detach, captured Android HPROF analysis and native Perfetto analysis. Inspect the [workflow for the release commit](https://github.com/till-tus/build-android-apps/actions/workflows/ci.yml) for its result. No local end-to-end Android speedup or native Codex annotation delivery is claimed. The user's installed 0.1.1 plugin is deliberately left unchanged while in use.

## 0.1.1 — previous macOS / Apple Silicon evidence, 22 October 2026

Verified with Node 25.6.1, Android Studio's JBR 21, Android Emulator 37.2.12, an API 36.1 arm64 Google APIs image and device `emulator-5554`.

- All 13 Node tests and three Chromium UI tests pass.
- All nine skill entry points pass the Skill Creator validator.
- The bundled MCP server initializes over stdio, advertises all 27 tools and returns schema/tool errors without corrupting the connection.
- A newly generated Compose app builds using Gradle 9.3.1 / AGP 9.1.1, installs, launches and exposes its test tag in the real Android hierarchy.
- A click in Codex's live side-panel viewer changes the actual native app counter. Inspection highlights the button and retains its parent test tag when selecting its text.
- Compose PreviewActivity launches without a fatal exception.
- Perfetto trace, MP4 and HPROF capture produce local artifacts.
- Editing the sample source triggers an incremental build, installation and relaunch; the changed text appears in the real Android hierarchy.
- Codex installs the local marketplace plugin without an npm install in the packaged runtime.

Artifacts from the real-device run are under ignored `artifacts/integration/`, including `result.json`, `device.png`, `viewer.png`, `journey.mp4`, `journey.perfetto-trace` and `app.hprof`. They are not committed. A captured trace or heap is evidence of capture, not evidence that an analyzer has established a performance issue or leak.

The host exposes the native annotation API and the viewer registers its surface. Browser contract tests verify identity, scaled bounds, metadata, frame/tree freezing and input suppression using a test double. Activation/composer delivery of a real annotation was **not** verified: the host did not confirm activation through the automated click, and native Codex UI access is unavailable to this task's automation. Test the final handoff manually in a compatible host with annotation permissions enabled. No synthetic annotation is represented as a real chat attachment.

The invisible annotation cursor was reproduced using the installed desktop host's renderer in an isolated Chromium page against the real emulator viewer. The viewer's CSP rejected the host's inline style elements: the host suppressed the system pointer, but its replacement cursor and interaction layer lost their positioning styles. Allowing `style-src-elem 'self' 'unsafe-inline'` restored the cursor at the pointer without changing the script policy, authentication, or origin checks. An independently authored host double now tests that same shadow-root stylesheet boundary, cursor position above the emulator, element metadata, and input suppression in cross-platform CI. The desktop renderer used during diagnosis is not redistributed with the plugin.

## Automated platforms

The repository's [Verify plugin workflow](https://github.com/till-tus/build-android-apps/actions/workflows/ci.yml) runs the bundle, MCP protocol, unit tests, Chromium interactions, annotation contract, SDK launcher smoke tests and packaging on Windows, macOS and Linux with Node 22 and 24. A separate Linux/KVM job exercises a real Android emulator. Check the workflow against the current commit for its latest status. Hosted Windows tests do not establish that a particular user's hypervisor, SDK image or USB device works.

## Issues found and corrected

- Old SDK command-line tools parsed minor-version API 36.1 as API 0, disabling emulator acceleration. Updated the local tools using existing licenses, selected the newest installed revision, and created an isolated corrected AVD. The user's existing AVD was not wiped or rewritten.
- New SDK tools route SDK management through a native Android CLI instead of a Java sdkmanager class. Both launcher forms are supported; Java tools launch directly without `.bat`/host-shell quoting.
- Compose text children can hide the parent button's test tag. Picking retains the tagged interactive parent and visible label.
- A first-frame/inspection race returned an empty hierarchy. The initial viewer now attempts inspection before returning, and concurrent refreshes share the pending result.
- Separate viewer processes contend for Android's exclusive UIAutomation service. Inspection is serialized by a per-device process-aware lock with stale-owner recovery.
- Android's Perfetto SELinux domain cannot write `/data/local/tmp`; traces use `/data/misc/perfetto-traces`.
- Synthetic cross-platform path tests used the host's separator for another OS. Path defaults now use the explicitly selected platform's path implementation.
- A restrictive stylesheet CSP blocked the host annotation overlay after it hid the system cursor. Inline style elements are now allowed for the host; inline scripts remain blocked.
