import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['server/src/cli.mjs'], outfile: 'server/dist/cli.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'bundle', external: ['bufferutil', 'utf-8-validate'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, legalComments: 'eof', minifyWhitespace: true, metafile: true });
const roots = new Set(Object.keys(result.metafile.inputs).map(file => file.match(/^(.*?node_modules\/(?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
const notices = [];
// This npm tarball declares MIT but omits the upstream license file. Keep a
// version-specific copy rather than silently dropping the copyright notice.
const licenseFallbacks = { '@nodable/entities@3.1.0': 'assets/licenses/nodable-entities-3.1.0-MIT.txt' };
for (const root of [...roots].sort()) {
  const pkg = JSON.parse(await readFile(root + '/package.json', 'utf8')); let license;
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md']) { try { license = await readFile(root + '/' + name, 'utf8'); break; } catch {} }
  if (!license && licenseFallbacks[`${pkg.name}@${pkg.version}`]) license = await readFile(licenseFallbacks[`${pkg.name}@${pkg.version}`], 'utf8');
  if (!license) throw new Error(`Missing redistribution license for ${pkg.name}@${pkg.version}; add a verified license before bundling.`);
  notices.push(`${pkg.name}@${pkg.version}\n${'='.repeat(60)}\n${license}\n`);
}
await writeFile('assets/THIRD_PARTY_LICENSES.txt', notices.join('\n'));
console.log('Built self-contained server/dist/cli.mjs');
