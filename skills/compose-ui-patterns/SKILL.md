---
name: compose-ui-patterns
description: Implement Android Compose screens, navigation, lists, forms, state and reusable UI with platform-appropriate interactions and accessibility.
---

# Compose UI patterns

Read nearby screens and the project's navigation/state conventions. A screen consumes immutable UI state and emits user actions; domain work belongs outside composition. Collect lifecycle-aware flows at an appropriate route boundary. Use rememberSaveable for lightweight user state that should survive recreation and SavedStateHandle for navigation/process restoration when appropriate.

For lists, use stable keys and content types, preserve scroll position and give load/error/empty states an action that resolves the state. Keep item state keyed to identity. For forms, retain user input on validation or network errors, use the correct keyboard/IME action and move focus predictably. Avoid requesting focus on every recomposition.

Keep navigation events separate from business state. Respect system back and predictive back; dismiss modal UI before navigating a parent stack. Match the existing Navigation library instead of migrating versions as a side effect.

Use content descriptions for actionable icons, semantics for custom components and real text for labels. Merge semantics deliberately: the external hierarchy sees accessibility nodes, not every composable. Stable `Modifier.testTag` plus `testTagsAsResourceId` on a debug root improves viewer inspection, but test tags do not replace accessibility labels.

Verify the primary journey with `inspect`, `input` and screenshots in the browser viewer. Test at least restoration, keyboard appearance and back behavior when changed.
