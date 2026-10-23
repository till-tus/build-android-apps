import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
const manifest = JSON.parse(await readFile('plugin.json', 'utf8'));
const output = path.resolve(`artifacts/build-android-apps-${manifest.version}`);
await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
for (const name of ['plugin.json', 'mcp.json', '.codex-plugin', '.agents/plugins/marketplace.json', '.mcp.json', 'skills', 'assets', 'viewer', 'server/dist', 'docs', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md', 'CONTRIBUTING.md', 'AGENTS.md']) await cp(name, path.join(output, name), { recursive: true });
console.log(output);
