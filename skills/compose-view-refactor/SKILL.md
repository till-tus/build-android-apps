---
name: compose-view-refactor
description: Refactor large or fragile Jetpack Compose functions into clear, reusable state-driven components while preserving behavior and semantics.
---

# Refactor Compose UI

Start with the component's callers, state ownership, effects and observable behavior. Preserve the public API and navigation semantics unless the request changes them. Extract a child where it names a coherent UI concept or isolates a recomposition boundary; avoid fragments that only hide a few lines.

Hoist state only to the lowest common owner that needs it. Prefer value/event parameters to passing a whole ViewModel through reusable children. Keep Modifier as an optional parameter and apply it to the outermost meaningful UI element. Preserve modifier ordering, keys, semantics, focus and inset consumption while extracting code.

Key LaunchedEffect/DisposableEffect to the identity of the work they own. Keep side effects out of composable bodies. Use rememberUpdatedState for changing callbacks captured by a long-lived effect when restarting would be wrong. Use derivedStateOf only when derived changes are substantially less frequent than source changes.

Check state restoration and recomposition behavior rather than simply counting composable functions. Run relevant existing tests and a real viewer journey; compare screenshots when layout may change. Avoid broad state-model or dependency migrations during a narrow refactor.
