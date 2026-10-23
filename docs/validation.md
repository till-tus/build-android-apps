# Validation

## 0.2.2 — patched Node LTS baseline, 23 October 2026

Issue [#8](https://github.com/till-tus/build-android-apps/issues/8) identified outdated recorded Node runtimes and an unrestricted engine range. The [official 21 October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) sets the baseline used here: Node 22.23.4+ within 22.x, or 24.22.1+ within 24.x. Other majors and prereleases are rejected. Historical versions below are observations, not current supported-version recommendations.

Fresh local macOS/Apple Silicon verification uses **Node 24.22.1**, activated as the executable resolved by `node` on the host PATH, and JBR 21.0.10. A clean dependency install, bundle build, **33 passing Node tests** (one optional native Perfetto test skipped), **five Chromium tests**, SDK smoke checks and packaging pass. Runtime regressions test both patched floors, vulnerable prior patches, EOL releases, prereleases, bundled MCP startup rejection and continued CLI help/doctor diagnostics. `doctor` includes `nodeExecutable`, the policy, support reason and an explicit EOL/outdated issue.

Fresh hosted Windows x64 checks on 23 October confirm **Node 22.23.4** ([job](https://github.com/till-tus/build-android-apps/actions/runs/39945785453/job/120388161059)) and **24.22.1** ([job](https://github.com/till-tus/build-android-apps/actions/runs/39945785453/job/120388161202)) on the 0.2.2 security-fix commit `c9bc827`. Both pass 33 Node tests (one optional processor test skipped), five Chromium tests, SDK launcher smoke checks, bundle freshness and packaging. The logs record the actual `node.exe` version/path before dependency installation.

The complete [security-fix CI run](https://github.com/till-tus/build-android-apps/actions/runs/39945785453) passed all six OS/Node combinations, the security scan and the [Linux/KVM real-emulator job](https://github.com/till-tus/build-android-apps/actions/runs/39945785453/job/120388160720). Its recorded result confirms generated-project build, native counter interaction, Compose semantics, browser inspection, debugger breakpoint/stack/locals, captured Android heap analysis, native trace analysis, preview launch, video capture and source-watch reload. A hosted System UI ANR required the fixture's scoped Wait action; every app assertion still passed. Native Codex annotation delivery remains a separate manual host check.

The CI 22/24 matrix on macOS, Windows and Linux now resolves the latest patch (`check-latest: true`), prints the exact version/executable in **Verify patched LTS runtime**, and fails before npm installation if it is below the baseline. Fresh hosted Windows execution and the Linux/KVM Android journey are reported by the [Verify plugin workflow](https://github.com/till-tus/build-android-apps/actions/workflows/ci.yml). This does not assert that a previously recorded physical Windows installation was upgraded. Already-running desktop/plugin processes must be restarted after a Node executable change; an npm audit does not establish runtime patch status.

## 0.2.1 — public repository preparation, 23 October 2026

The readiness audit covers source, the committed runtime, full Git history, all retained CI logs/artifacts, redistribution notices and installation documentation. See the [audit record](public-readiness.md) for scope and results.

Historical macOS / Apple Silicon validation used Node 25.6.1 and Android Studio JBR 21.0.10; that Node version is now explicitly unsupported and superseded by the 0.2.2 evidence above. A clean `npm ci` and `npm run check` passed 31 Node tests and five Chromium tests; the optional native Perfetto test was skipped without a processor. New checks exercised an out-of-JDK Java launcher with a path containing spaces and a relocated bundled MCP server without `node_modules`. The SDK smoke check covered the native SDK manager and Java AVD manager.

The previous [CI run at ab0d1ef](https://github.com/till-tus/build-android-apps/actions/runs/39867056420) passes all six OS/Node combinations (macOS, Windows, Linux; Node 22/24), plus the Linux/KVM real-emulator journey including native Perfetto analysis. This is separately observed hosted Windows execution, not a local Windows run of the readiness changes. Native Codex annotation delivery remains a manual host-specific boundary.

## 0.2.0 — Windows, 23 October 2026

Validated on Windows x64 with Node 24.18.0, Android Studio's JBR 21.0.10, Chromium 156 and the official native Perfetto v58.2 processor. Local verification covers:

- 30 Node tests (including real JVM breakpoint/stack/local/step/detach, overlapping attach/shutdown cleanup and real captured JVM HPROF ownership-path tests) and five Chromium UI tests. The optional native Perfetto test is enabled with `ANDROID_PLUGIN_TRACE_PROCESSOR`; other environments explicitly skip it if absent. The JVM test waits for the asynchronous VM-start event, which can arrive after the IDSizes reply on Windows/Node 22.
- The rebuilt bundled MCP server advertises all 39 tools, validates schemas and survives invalid calls.
- A 20-event wheel burst becomes one 80 ms swipe, with one wheel request in flight. Cancellation, new gestures after cancellation and switching to inspection are covered.
- Synthetic-device PNG delivery avoids the old fixed 250 ms delay, concurrent capture requests coalesce, and viewer input does not repeat device discovery. The H.264 parser releases a previous frame upon receiving the next slice header. Decoder congestion/keyframe recovery and encoder-to-PNG fallback are browser-tested with a decoder double.
- Desktop (520×900) and narrow (320×720) rendered viewer checks cover canvas drawing, selection, input, annotation contracts, responsive bounds and page errors. These are fixture-device browser checks, not real-emulator latency measurements.
- Real JVM HPROF parsing finds an expected static-owner field path. Synthetic Android 4/8-byte HPROF fixtures cover class growth, weak-reference exclusion, unreachable roots, truncation and object/edge limits. The official native processor reads a Chrome trace fixture and returns its real inclusive slice duration without inventing missing CPU/frame data.
- Watch checks cover resource/version-catalog edits, unchanged APK state preservation and skipping superseded builds.

The real-emulator integration waits for actual Compose semantics after launch, clicks, previews and reloads, rather than relying on fixed startup delays. A slow hosted runner exposed the old 1.8-second startup assumption; timeouts now retain a device screenshot, hierarchy and app logcat for diagnosis. The same debugger/heap/trace/source-watch integration completed successfully on the first 0.2.0 run; later runs are tracked per commit in Actions.

Those diagnostics identified a hosted API 36 System UI ANR dialog covering an already rendered app. In `CI=true` only, the fixture can select the exact system dialog's Wait action up to three times, preserving a screenshot and recording `environmentWarnings` in the result. It does not dismiss app ANRs or pass until the expected app semantics appear. Local device sessions are unaffected.

External JVM fixture compilation/startup/capture has a separate bounded integration-test budget (150 seconds overall, 60 seconds per compiler/capture subprocess) for cold Windows runners. Runtime JDWP command limits and the assertions are unchanged.

That Windows validation environment had Java but no Android SDK, emulator or AVD. Real ART/JDWP, Android heap and changed trace-config checks run in the real-emulator CI job, which tests breakpoint/stack/locals/detach, captured Android HPROF analysis and native Perfetto analysis. Inspect the [workflow for the release commit](https://github.com/till-tus/build-android-apps/actions/workflows/ci.yml) for its result. No local Windows end-to-end Android speedup or native Codex annotation delivery is claimed.

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
