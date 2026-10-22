import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const skipped = new Set(['.git', '.gradle', '.idea', 'build', 'node_modules', '.kotlin', 'captures']);
export async function sourceHints(project, node) {
  if (!project || node.password) return [];
  const tokens = [node.resourceId?.split('/').pop(), node.text, node.contentDescription].filter(v => v && v.length >= 3 && v.length < 160);
  if (!tokens.length) return [];
  const results = []; let count = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (++count > 6000 || results.length >= 12) return;
      if (entry.isSymbolicLink() || skipped.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!/\.(kt|java|xml)$/.test(entry.name) || (await stat(full)).size > 500_000) continue;
      const lines = (await readFile(full, 'utf8')).split(/\r?\n/);
      lines.forEach((line, index) => {
        if (results.length >= 12) return;
        const token = tokens.find(t => line.includes(t));
        if (token) results.push({ location: `${full}:${index + 1}`, snippet: line.trim().slice(0, 240), matched: token, confidence: 'text-match' });
      });
    }
  }
  await walk(path.resolve(project)); return results;
}
