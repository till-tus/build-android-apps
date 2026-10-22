---
name: android-system-integrations
description: Design and implement Android app links, intents, app shortcuts, sharing, notifications and system entry points with correct lifecycle and navigation behavior.
---

# Android system entry points

Inspect the manifest, application ID, navigation graph and existing entry points first. Model the user action and destination clearly before adding an intent filter or shortcut. Android integrations have their own platform contracts; do not translate iOS App Intents mechanically.

For Android App Links, scope hosts/path patterns narrowly, use autoVerify and the domain's Digital Asset Links association, and test both cold and warm activity entry. Treat incoming URIs/extras as untrusted. Validate identifiers, authorization and destination state before navigating. Avoid adding broadly exported components or implicit intent handlers unrelated to the requested action.

Use the Android Sharesheet with correct MIME types and content URIs through FileProvider. Grant only the URI permissions needed. For app shortcuts, use stable IDs, localized labels and destinations the user can revisit. For notifications, create channels, handle the applicable notification permission, use appropriately immutable PendingIntents and preserve the expected back stack.

Test external entry from a stopped app, an already running app and a logged-out state where relevant. Verify system back returns to the expected surface. Use logs and the emulator viewer for proof. Consult current official Android documentation for platform/target-SDK-specific behavior rather than changing target SDK or permissions as an incidental fix.
