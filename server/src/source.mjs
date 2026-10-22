import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const skipped = new Set(['.git', '.gradle', '.idea', 'build', 'node_modules', '.kotlin', 'captures']);
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function sourceHints(project, node) {
  if (!project || node.password) return [];
  const resource = node.resourceId?.split('/').pop();
  const tokens = [...new Set([resource, node.text, node.label, node.contentDescription].filter(v => v && v.length >= 3 && v.length < 160))];
  if (!tokens.length) return [];
  const files = []; let count = 0, bytes = 0;
  async function walk(dir, depth = 0) {
    if (depth > 30) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++count > 6000) return;
      if (entry.isSymbolicLink() || skipped.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full, depth + 1); continue; }
      const size = (await stat(full).catch(() => ({ size: Infinity }))).size;
      if (!/\.(kt|java|xml)$/.test(entry.name) || size > 500_000 || bytes + size > 32_000_000) continue;
      bytes += size;
      const content = await readFile(full, 'utf8').catch(() => ''); files.push({ full, lines: content.split(/\r?\n/) });
    }
  }
  await walk(path.resolve(project));
  const strings = new Set();
  for (const file of files) if (/[/\\]values[^/\\]*[/\\]/.test(file.full)) for (const line of file.lines) {
    const match = line.match(/<string\s+name=["']([\w]+)["'][^>]*>([^<]*)<\/string>/);
    if (match && tokens.includes(match[2])) strings.add(match[1]);
  }
  const results = [];
  for (const { full, lines } of files) {
    let declaration;
    lines.forEach((line, index) => {
      const symbol = line.match(/\b(?:fun|class|interface|object)\s+(?:[\w.]+\.)?([\w]+)\b/);
      if (symbol) declaration = { name: symbol[1], line: index + 1 };
      if (/^\s*(?:\/\/|\*|<!--)/.test(line)) return;
      let token, confidence, score = 0;
      if (resource && new RegExp(`\\btestTag\\s*\\(\\s*"${escape(resource)}"\\s*\\)`).test(line)) { token = resource; confidence = 'test-tag-literal'; score = 100; }
      else if (resource && (new RegExp(`\\bR\\.id\\.${escape(resource)}\\b`).test(line) || line.includes(`@+id/${resource}"`) || line.includes(`@id/${resource}"`))) { token = resource; confidence = 'resource-reference'; score = 90; }
      else for (const name of strings) if (new RegExp(`\\bR\\.string\\.${escape(name)}\\b`).test(line) || line.includes(`@string/${name}"`)) { token = name; confidence = 'string-resource-reference'; score = 80; break; }
      if (!score) {
        token = tokens.find(t => line.includes(t)); if (!token) return;
        const literal = line.includes(`"${token}"`) || line.includes(`>${token}<`);
        score = literal ? 60 : 10; confidence = literal ? 'literal-text' : 'text-match';
      }
      results.push({ location: `${full}:${index + 1}`, file: full, line: index + 1, snippet: line.trim().slice(0, 240), matched: token, confidence, score, declarationCandidate: declaration });
      if (results.length > 24) { results.sort((a, b) => b.score - a.score); results.length = 24; }
    });
  }
  return results.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line).slice(0, 12);
}
