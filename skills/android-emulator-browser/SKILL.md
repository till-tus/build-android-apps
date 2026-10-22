---
name: android-emulator-browser
description: Mirror a real Android emulator or device into the Codex in-app browser with input, accessibility inspection and native annotations. Also run debug Compose previews and rebuild them on source edits.
---

# Android in the side panel

1. Obtain a real, explicit serial from `devices` or a completed `emulator_start` job. Keep the same serial as the app build/run workflow.
2. Call `viewer_start` with that serial and the absolute project path, when available, for source candidates. It returns only after a real screenshot succeeds.
3. Open the exact returned localhost URL, including its fragment, in Codex's in-app browser. Use the available browser-tab tool or `open_in_codex` with a browser target. Preserve the fragment: it is the session credential. Do not put the URL in public logs or reports.
4. Verify the actual app frame, then exercise a meaningful control and inspect the result. A page loading is not proof that live streaming works. Take browser-visible screenshot evidence when reporting UI QA.

The tool's MCP process owns its viewers. `viewer_stop` closes only that server's viewer for the given serial. It does not stop the device. Do not use unscoped cleanup that could disrupt another chat. A CLI alternative is `node <plugin-root>/server/dist/cli.mjs viewer --serial <serial> --project <absolute-project>` in a long-running terminal; keep it alive and stop it when done.

## Inspection and annotations

The crosshair switches between interacting and inspecting. The viewer converts scaled screen points back to device pixels and picks the smallest/deepest exposed accessibility node. Source candidates are text/resource/test-tag matches with evidence, not authoritative mappings to composable source.

On a host exposing `document.oai.annotation`, the screen registers a custom annotation surface. Host annotation mode selects Android nodes and carries flat metadata (serial, ID, class, package, text, bounds and capture time) into the normal composer annotation. The viewer freezes its rendered frame and picking tree while annotation mode is active. The API is feature-detected; normal controls remain usable in ordinary browsers. If native annotations are absent, report that host limitation and use the inspector's Copy button for context. Do not claim a replacement panel or annotation attachment was created.

UIAutomator may omit custom canvases, WebView internals and merged Compose semantics. Unsupported/stale points yield coordinate-based screen regions. For an app you control, expose meaningful accessibility semantics and stable test tags; enabling `testTagsAsResourceId` on a debug root improves targeting. Do not infer private UI data from pixels.

## Compose previews and source edits

For an installed debug app declaring Compose `PreviewActivity`, call `preview` with the fully qualified, no-argument top-level composable (for example `com.example.app.MainActivityKt.App`). The generated project includes that debug-only host. Arbitrary `@PreviewParameter`, private composables or parameterized composables require an explicit debug wrapper; do not rewrite a production manifest to force support.

`watch` starts a cancellable job that watches source/resources/catalogs, rebuilds the debug APK, installs, and relaunches the app or selected preview. Pass `composable` for a preview. `debounceMs` defaults to 250 (75–2000 allowed). It skips superseded build outputs and avoids reinstall/relaunch when the APK hash is unchanged, preserving running state for no-op edits. Changed APKs still restart: this does not provide Android Studio Apply Changes or arbitrary VM hot swap. Confirm a changed real frame after editing. Watch requires one unambiguous debug APK; for split or multi-app projects build/install explicitly.

For responsiveness, the viewer merges wheel bursts, bounds pending wheel gestures and reuses its selected serial for input. PNG capture is shared and paced up to 15 fps; H.264 uses low-latency access-unit delivery and decoder keyframe recovery. These policies do not establish end-to-end latency on an untested emulator. If video cannot recover, the viewer switches to PNG. Verify interaction on the actual target before reporting a speedup.
