# Build Android Apps

This is a cross-platform local Codex plugin. Keep macOS and Windows behavior equivalent. Host processes use argument arrays with `shell: false`; Android remote shell arguments require separate quoting. Do not add a Unix-only dependency to the runtime.

Run `npm run build`, `npm test` and `npm run test:ui` after runtime/viewer changes. The bundled `server/dist/cli.mjs` is committed so a plugin install needs Node.js and the Android SDK, not npm install. Rebuild it after source changes. Plugin assets are resolved relative to the bundle, never the current working directory.

Preserve per-serial ownership and multiple-device ambiguity errors. Never wipe AVDs, clear app data, kill every emulator or use global adb shutdown for cleanup. The viewer stays on loopback, checks Host/Origin, and authenticates HTTP and WebSocket traffic. Do not log viewer session URLs in public artifacts.

Tests with fake devices establish protocol behavior; report real-emulator and Windows execution evidence separately. Source matches remain candidates. Compose watch is rebuild/install/relaunch, not VM hot swap. Native annotation availability belongs to the browser host.
