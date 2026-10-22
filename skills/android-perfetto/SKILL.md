---
name: android-perfetto
description: Capture Android system traces and frame statistics for a focused startup or interaction journey, then investigate scheduling, rendering and main-thread delays.
---

# Focused Android profiling

Select the device serial, package, build variant and exact journey. Warm/cold startup are different experiments; document which one is measured. Avoid using a debug emulator trace as a release performance claim.

Call `frame_stats` with reset for the app, reproduce the journey, then `frame_summary` for duration percentiles or `frame_stats` for raw counters. Fixed duration buckets are not refresh-aware jank. For a system trace call `capture` with kind `trace`, selected `app`, an absolute `.perfetto-trace` output path, and a bounded duration (1–60 seconds). It starts a job; perform the journey while recording and poll until the artifact is pulled successfully. `job_cancel` cancels owned recording work. The capture records scheduler, frequency, idle, activity/window manager, gfx, view and binder categories, process metadata, selected-app atrace events and FrameTimeline on Android 12+.

Use `trace_analyze` with the local artifact and package when a native Perfetto v58.2+ processor is available. Supply its absolute path as `processor` or set `ANDROID_PLUGIN_TRACE_PROCESSOR`. The tool runs fixed local SQL for scheduled per-thread CPU time, inclusive trace slices and FrameTimeline groups. It never downloads the processor or uploads traces. Missing sources/tables produce explicit warnings; empty results do not establish zero cost. Inclusive slice totals can overlap and are not sampled method flamegraphs. FrameTimeline counts can include more than one app surface.

Inspect the trace in Android Studio Profiler or [Perfetto UI](https://ui.perfetto.dev/), following the user's data-sharing preferences. Correlate long frames with app main thread, RenderThread, CPU scheduling, binder calls, I/O and GC. Do not invent trace-derived findings when only the artifact was captured. For allocation/memory use [android-memory-leaks](../android-memory-leaks/SKILL.md).

Report the artifact path, measured journey, build/device conditions and the evidence for any conclusion. Compare a fixed journey before/after when validating a fix.
