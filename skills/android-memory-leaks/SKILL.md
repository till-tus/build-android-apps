---
name: android-memory-leaks
description: Investigate Android retained activities, growing Java/Kotlin heaps and memory regressions using meminfo, bounded HPROF capture and repeatable journeys.
---

# Android memory investigation

Define the repeatable flow (for example open/close a screen ten times) and establish a baseline with `memory`. Repeat under comparable conditions, allow cleanup, and compare Java heap, native heap, graphics and total PSS. Growth alone does not prove a leak; distinguish expected caches from retained owners.

For a debuggable app, `capture` kind `heap` with the application ID and absolute `.hprof` output path runs `am dumpheap`, waits for a stable artifact and pulls it. Poll the capture job until complete. Heap dumps may pause the app and contain app/user data; keep them local unless the user asks to share them.

Use `heap_analyze` on the local artifact with optional `baseline` and exact `targetClass` (for example the Activity class). Poll its job. It returns class counts/payload-byte growth and up to five field paths from roots, excluding `java.lang.ref.Reference.referent`. It does not print string/array contents, compute dominators or prove that a referenced object should have died. Payload sizes omit headers, alignment and native memory. No root path is not proof of no leak. The parser bounds files to 256 MiB, objects to 500,000 and graph traversal to two million edges.

For larger/unsupported dumps, dominators or full retained-size analysis, open HPROF in Android Studio's memory profiler or an appropriate analyzer. Look for destroyed Activity/Fragment/View references, listeners, singleton caches, coroutine scope lifetimes and Compose effects that never dispose. Use LeakCanary only when adding a debug dependency fits the task and the app's existing tooling.

Native/graphics growth may not appear in a Java HPROF. Use the appropriate Android Studio/Perfetto native allocation tooling for that evidence. Do not report a heap root or leak location unless you actually inspected it. Fix ownership/lifetime at the cause, then repeat the same journey and compare captures.
