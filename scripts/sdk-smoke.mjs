import { sdkCommand } from '../server/src/paths.mjs';
import { run } from '../server/src/process.mjs';
for (const [name, args] of [['sdkmanager', ['--version']], ['avdmanager', ['list', 'device']]]) {
  const command = await sdkCommand(name);
  const result = await run(command.file, command.native ? ['--version'] : [...command.args, ...args], { timeout: 60_000 });
  if (!result.stdout.trim()) throw new Error(`${name} produced no output`);
  console.log(`${process.platform}: ${name} ${command.native ? 'native CLI' : 'Java entry point'} works`);
}
