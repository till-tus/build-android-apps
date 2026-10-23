# Contributing

Use Node.js 22 or 24, Git and a full JDK (21 is used in CI). Clone the repository, then run:

```sh
npm ci
npx playwright install chromium
npm run check
npm run pack:plugin
```

On Linux, `npx playwright install --with-deps chromium` also installs browser system dependencies and may need administrator permission. A device is not needed for the default tests. Real JVM tests need a JDK; the optional native Perfetto test needs `ANDROID_PLUGIN_TRACE_PROCESSOR` pointing to a native executable.

Follow [AGENTS.md](AGENTS.md). Keep macOS and Windows equivalent, use host argument arrays with `shell: false`, quote Android remote shell arguments separately, and keep runtime assets relative to the bundle. Run the full checks after runtime/viewer changes. Commit the regenerated `server/dist/cli.mjs` and `assets/THIRD_PARTY_LICENSES.txt`; CI rejects a stale bundle. Update manifests, CLI version, package lock and documentation together when changing versions. `package.json` is deliberately private to prevent accidental npm publishing; users install through a plugin marketplace.

The packaged runtime must run from a path containing spaces and without `node_modules` or an SDK on PATH when explicit overrides are supplied. Do not introduce runtime dependencies on Unix shell tools, Python, FFmpeg or Android Studio's internal APIs. Use the SDK tool/Java resolvers and test environment changes with synthetic fixtures.

For an opt-in real-device run, install the SDK and Chromium, set `ANDROID_TEST_SERIAL` explicitly, then run `node scripts/integration.mjs`. It builds a temporary sample and installs/replaces `dev.codex.androidlab` on that selected device. Use a disposable development device/AVD. It keeps screenshots, logs, video, heap and trace evidence in ignored `artifacts/integration/`. It leaves the emulator and sample app available for inspection. Never wipe AVDs, clear user app data, remove all forwards, or shut down global ADB for cleanup.

Describe the problem, fix and validation in pull requests. Separate fixture tests, real-emulator evidence, Windows execution and native annotation verification. A passing mock host does not establish a real annotation attachment. Keep captures and reports out of commits. Report security problems using [SECURITY.md](SECURITY.md).

## Repository settings

Automatic deletion of merged branches is enabled. The saved `main` protection requires pull requests, resolved conversations and all eight verification jobs on an up-to-date branch. No second reviewer is required for this solo-maintainer repository. `enforce_admins: false` allows administrators to override the normal requirements; force pushes and branch deletion remain blocked for other users. Merge commits are permitted.

The configuration is saved in `.github/main-protection.json`. GitHub requires public visibility or a plan supporting private-repository protection before it can enforce this policy. A maintainer with the [GitHub CLI](https://cli.github.com/) signed in with repository administration permission can apply or reapply it from this checkout:

```sh
node scripts/configure-repository.mjs till-tus/build-android-apps --dry-run
node scripts/configure-repository.mjs till-tus/build-android-apps
```

The helper is idempotent, enables automatic merged-branch deletion and applies the saved protection to `main`. It does not change repository visibility or create credentials. For a fork, pass its `OWNER/REPO` explicitly.
