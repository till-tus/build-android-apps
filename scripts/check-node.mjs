import { assertNodeRuntime } from '../server/src/runtime.mjs';
try {
  const status = assertNodeRuntime();
  console.log(`Node.js ${status.version} is supported (${status.required}); executable: ${process.execPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
