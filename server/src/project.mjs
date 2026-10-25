import { mkdir, writeFile, copyFile, readdir, watch } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProject, packageName, integer } from './android.mjs';
import { exists } from './paths.mjs';
import { delay } from './process.mjs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function createProject({ directory, name = 'My App', app = 'com.example.myapp', minSdk = 26 }) {
  packageName(app); integer(minSdk, 26, 36, 'minSdk');
  if (!/^[A-Za-z][A-Za-z0-9 _-]{0,60}$/.test(name)) throw new Error('Project name must start with a letter and contain only letters, numbers, spaces, underscores, or hyphens.');
  const root = path.resolve(directory);
  if (await exists(root) && (await readdir(root)).length) throw new Error('Project destination must be empty; existing files will not be overwritten.');
  const files = {
    '.gitignore': '.gradle/\n.idea/\nlocal.properties\n**/build/\n*.iml\n',
    'settings.gradle.kts': `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name = "${name}"\ninclude(":app")\n`,
    'build.gradle.kts': 'plugins {\n    id("com.android.application") version "9.1.1" apply false\n    id("org.jetbrains.kotlin.plugin.compose") version "2.2.10" apply false\n}\n',
    'gradle.properties': 'org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nkotlin.code.style=official\n',
    'gradle/wrapper/gradle-wrapper.properties': 'distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-9.8.1-bin.zip\ndistributionSha256Sum=dce76f55f8e251a3a1f130eb120f30b3d271de2b76c9b0729d316b5a1b6dc01f3\nnetworkTimeout=60000\nvalidateDistributionUrl=true\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n',
    'gradlew': '#!/bin/sh\napp_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nif [ -n "$JAVA_HOME" ]; then java_cmd="$JAVA_HOME/bin/java"; else java_cmd=java; fi\nexec "$java_cmd" -classpath "$app_dir/gradle/wrapper/gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain "$@"\n',
    'gradlew.bat': '@echo off\r\nsetlocal\r\nset "JAVA_EXE=java.exe"\r\nif defined JAVA_HOME set "JAVA_EXE=%JAVA_HOME%\\bin\\java.exe"\r\n"%JAVA_EXE%" -classpath "%~dp0gradle\\wrapper\\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*\r\n',
    'app/build.gradle.kts': `plugins { id("com.android.application"); id("org.jetbrains.kotlin.plugin.compose") }\nandroid {\n    namespace = "${app}"\n    compileSdk = 36\n    defaultConfig { applicationId = "${app}"; minSdk = ${minSdk}; targetSdk = 36; versionCode = 1; versionName = "1.0" }\n    buildFeatures { compose = true }\n    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }\n}\ndependencies {\n    implementation(platform("androidx.compose:compose-bom:2025.08.01"))\n    implementation("androidx.activity:activity-compose:1.11.0")\n    implementation("androidx.compose.material3:material3")\n    implementation("androidx.compose.ui:ui-tooling-preview")\n    debugImplementation("androidx.compose.ui:ui-tooling")\n}\n`,
    'app/src/main/AndroidManifest.xml': `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="${name}" android:theme="@android:style/Theme.Material.Light.NoActionBar" android:supportsRtl="true">\n        <activity android:name=".MainActivity" android:exported="true">\n            <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>\n        </activity>\n    </application>\n</manifest>\n`,
    'app/src/debug/AndroidManifest.xml': '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name="androidx.compose.ui.tooling.PreviewActivity" android:exported="true"/></application></manifest>\n',
    [`app/src/main/java/${app.replaceAll('.', '/')}/MainActivity.kt`]: `package ${app}\n\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.activity.enableEdgeToEdge\nimport androidx.compose.foundation.layout.*\nimport androidx.compose.material3.*\nimport androidx.compose.runtime.*\nimport androidx.compose.runtime.saveable.rememberSaveable\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.platform.testTag\nimport androidx.compose.ui.semantics.semantics\nimport androidx.compose.ui.semantics.testTagsAsResourceId\nimport androidx.compose.ui.tooling.preview.Preview\nimport androidx.compose.ui.unit.dp\n\nclass MainActivity : ComponentActivity() {\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n        enableEdgeToEdge()\n        setContent { App() }\n    }\n}\n\n@Preview(showBackground = true)\n@Composable\nfun App() {\n    var count by rememberSaveable { mutableIntStateOf(0) }\n    MaterialTheme {\n        Scaffold(modifier = Modifier.semantics { testTagsAsResourceId = true }) { insets ->\n            Column(Modifier.fillMaxSize().padding(insets).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {\n                Text("${name}", style = MaterialTheme.typography.headlineLarge)\n                Text("Built with Jetpack Compose", style = MaterialTheme.typography.bodyLarge)\n                Button(onClick = { count++ }, modifier = Modifier.testTag("counter")) { Text("Count: $count") }\n            }\n        }\n    }\n}\n`
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content, { mode: relative === 'gradlew' ? 0o755 : 0o644 });
  }
  await copyFile(fileURLToPath(new URL('../../assets/gradle-wrapper.jar', import.meta.url)), path.join(root, 'gradle/wrapper/gradle-wrapper.jar'));
  return { directory: root, app, activity: `${app}/.MainActivity`, preview: `${app}.MainActivityKt.App` };
}

export async function launchPreview(android, serial, app, composable) {
  packageName(app); if (!/^[\w.$]+$/.test(composable)) throw new Error('Expected a fully qualified top-level, no-argument composable function');
  serial = await android.device(serial);
  const result = await android.shell(serial, ['am', 'start', '-W', '-n', `${app}/androidx.compose.ui.tooling.PreviewActivity`, '--es', 'composable', composable]);
  if (/Error:|Exception/.test(result.stdout)) throw new Error(result.stdout);
  return result;
}

/** Incremental build/install/relaunch loop, deliberately not advertised as VM hot swap. */
export async function watchProject(android, { project, serial, app, tasks = ['assembleDebug'], composable, debounceMs = 250 }, { signal, onOutput, build = buildProject }) {
  serial = await android.device(serial); packageName(app); const root = path.resolve(project);
  integer(debounceMs, 75, 2000, 'Debounce');
  let dirty = true, lastChange = 0, installedHash;
  const watcher = watch(root, { recursive: true, signal });
  const monitor = (async () => { try { for await (const event of watcher) {
    const file = String(event.filename || '');
    if (/(^|[/\\])(build|\.gradle|\.git|\.idea|\.kotlin)([/\\]|$)/.test(file) || !(/\.(kt|java|xml|kts|gradle|properties|toml)$/.test(file) || /(^|[/\\])src[/\\]/.test(file))) continue;
    dirty = true; lastChange = Date.now();
  } } catch (e) { if (!signal.aborted) throw e; } })();
  // Observe failures even while the build is running.
  let monitorError; monitor.catch(e => { monitorError = e; });
  while (!signal.aborted) {
    if (monitorError) throw monitorError;
    if (dirty && Date.now() - lastChange > debounceMs) {
      dirty = false;
      try {
        onOutput('Building…\n'); const built = await build(root, tasks, { signal, onOutput });
        if (signal.aborted) break;
        if (dirty) { onOutput('Source changed during build; rebuilding before installing stale output.\n'); continue; }
        const debugApks = built.apks.filter(p => /[/\\]outputs[/\\]apk[/\\]/.test(p) && p.endsWith('-debug.apk'));
        if (debugApks.length !== 1) throw new Error('Watch requires exactly one debug APK; build and install explicitly for multi-module or split APK projects.');
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(debugApks[0])) hash.update(chunk);
        const apkHash = hash.digest('hex');
        if (dirty || signal.aborted) continue;
        if (installedHash === apkHash) { onOutput('APK unchanged; preserving the running app and its state.\n'); continue; }
        await android.install(serial, debugApks);
        if (composable) await launchPreview(android, serial, app, composable); else await android.launch(serial, app);
        installedHash = apkHash; onOutput(`Reloaded ${app} at ${new Date().toISOString()}\n`);
      } catch (e) { if (!signal.aborted) onOutput(`Build/reload failed: ${e.message}\n`); }
    }
    await delay(75);
  }
  await monitor; return { stopped: true };
}
