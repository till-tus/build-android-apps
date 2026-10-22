import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['server/src/cli.mjs'], outfile: 'server/dist/cli.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'bundle', external: ['bufferutil', 'utf-8-validate'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, legalComments: 'eof', minifyWhitespace: true, metafile: true });
const roots = new Set(Object.keys(result.metafile.inputs).map(file => file.match(/^(.*?node_modules\/(?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
const notices = [];
for (const root of [...roots].sort()) {
  const pkg = JSON.parse(await readFile(root + '/package.json', 'utf8')); let license;
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md']) { try { license = await readFile(root + '/' + name, 'utf8'); break; } catch {} }
  notices.push(`${pkg.name}@${pkg.version}\n${'='.repeat(60)}\n${license || `License: ${pkg.license}. Source: ${JSON.stringify(pkg.repository)}`}\n`);
}
await writeFile('assets/THIRD_PARTY_LICENSES.txt', notices.join('\n'));
console.log('Built self-contained server/dist/cli.mjs');
