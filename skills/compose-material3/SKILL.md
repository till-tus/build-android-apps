---
name: compose-material3
description: Create or refine native Android visual design with Jetpack Compose, Material 3, adaptive layouts and edge-to-edge support. Use when designing Android screens or modernizing app theming.
---

# Compose and Material 3

Inspect the app's theme, navigation and UI components before introducing a design system. Use existing typography, spacing, color roles and shape tokens. Express a distinctive product through those tokens rather than rebuilding every standard control. Verify any version-sensitive API against official Android documentation or the installed dependency source.

Use `MaterialTheme` colorScheme, typography and shapes; never scatter raw colors across screens. Respect dark theme and dynamic color choices. Use a Scaffold and consume its content padding once. Draw edge-to-edge intentionally, account for status/navigation bars and IME, and test gesture and three-button navigation. Avoid adding safe-area padding independently at every nested layer.

Use window size and available space for navigation and list/detail decisions. Keep phone flows coherent and use supporting panes where extra width helps. Do not stretch a phone form across a tablet. Use touch targets at least 48dp, meaningful semantics and logical traversal. Test large text, dark mode and empty/error/loading states in the real emulator viewer.

Use platform sharing, date/time selection, permission and file-picking patterns when they fit. Keep one obvious primary action; surface setup only where needed. Inspect a real screenshot after implementation rather than inferring layout from source.

References: [Material 3](https://developer.android.com/develop/ui/compose/designsystems/material3), [adaptive layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive), [edge-to-edge](https://developer.android.com/develop/ui/compose/layouts/insets).
