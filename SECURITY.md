# Security

Security fixes target the latest version on `main`. Install updates by refreshing the marketplace and reinstalling the plugin; bundled npm dependencies only change when the bundle is rebuilt.

The host Node executable is a separate security dependency. Use the latest patched Node 24 LTS (minimum 24.22.1) or Node 22 LTS (minimum 22.23.4), including the [21 October 2026 security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). Startup enforces these supported major lines and minimum patches; Node 23/25 and prereleases are refused. `doctor`/`help` stay available for setup diagnosis. npm auditing and a rebuilt bundle do not patch Node itself. Restart the desktop host and plugin processes after changing the executable. The offline baseline must be raised again when future advisories require it.

## Report a vulnerability privately

Use [GitHub's private vulnerability report](https://github.com/till-tus/build-android-apps/security/advisories/new) when available. If GitHub does not offer private reporting for this repository, open an issue asking the maintainer to arrange a private channel, without including vulnerability details or sensitive data. Never post credentials, authenticated viewer URLs, real heap dumps, or private app data in a public issue.

Include the plugin version/commit, OS and CPU architecture, Node/SDK versions, a minimal synthetic reproduction, expected behavior and impact. Redact device identifiers and project paths where appropriate.

## Trust and data boundaries

- The MCP server runs as your local user. It can build project code, install APKs, control the selected device, read app logs and capture screen/heap/trace data. Only build trusted projects: Gradle build scripts execute code on your computer.
- The viewer listens on IPv4 loopback, checks Host/Origin, and authenticates API and WebSocket requests with a random session credential. The credential is carried in the URL fragment and request headers. Anyone with the complete URL and access to that loopback service can control the selected device. Do not publish, forward or expose it through a tunnel.
- Password-marked hierarchy text is redacted. Other UI text, screenshots, source hints, logs, traces and heap data can contain sensitive information. Review artifacts before sharing. The plugin performs capture/analysis locally; context returned to Codex or attached to chat is subject to your host's data handling. Gradle and SDK installation may download dependencies from their configured repositories.
- The debugger creates a session-owned ADB forward. Detach after use; ADB and JDWP are development interfaces, not network authentication boundaries. Use trusted devices and keep ADB on the local host.
- CI scans complete reachable Git history and source snapshots with Gitleaks, audits npm dependencies, and checks the committed bundle. These checks reduce risk; they do not prove the absence of every secret or vulnerability.

If a real secret is committed, revoke or rotate it immediately, then arrange history cleanup with the maintainer before sharing the repository. Removing only the current file does not remove historical copies or previously downloaded artifacts.
