---
name: compose-performance-audit
description: Diagnose Compose jank, excessive recomposition, slow lists and startup regressions by connecting code findings to measured Android behavior.
---

# Compose performance audit

Define a repeatable journey and symptom before optimizing. Emulator timings are useful for diagnosis but do not establish real-device performance. For final measurements use a profileable, non-debuggable benchmark/release variant on representative hardware.

Inspect state reads, unstable parameters, expensive composition/layout work, lazy keys, image decoding and work on the main thread. Do not assume recomposition itself is a bug. Check whether a supposedly expensive function actually appears in a trace. Avoid annotating mutable objects `@Stable`/`@Immutable` to silence reports; those annotations are contracts.

Use `frame_stats` with reset before a focused flow, then read after the same flow. Use [android-perfetto](../android-perfetto/SKILL.md) for scheduler/main-thread/render evidence. Frame statistics are not a full Compose recomposition profiler; custom graphics and some rendering paths may need different evidence. Use compiler stability/recomposition reports only when supported by the project's actual Compose compiler version.

Fix the smallest measured cause. Typical remedies include deferring high-frequency state reads to layout/draw, stable lazy keys, moving blocking work to a suitable dispatcher, bounded image sizes and a baseline profile for startup paths. Compare the same flow, variant and device after the change and state the measurement limits.
