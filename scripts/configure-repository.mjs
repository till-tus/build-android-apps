// Maintainer tooling only. Requires the GitHub CLI signed in with repo admin access.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const [repository, option, ...extra] = process.argv.slice(2);
if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || extra.length || (option && option !== '--dry-run')) {
  console.error('Usage: node scripts/configure-repository.mjs OWNER/REPO [--dry-run]');
  process.exitCode = 1;
} else {
  const protection = JSON.parse(await readFile(new URL('../.github/main-protection.json', import.meta.url), 'utf8'));
  if (option === '--dry-run') {
    console.log(JSON.stringify({ repository, delete_branch_on_merge: true, branch: 'main', protection }, null, 2));
  } else {
    const api = (method, endpoint, value) => {
      const result = spawnSync('gh', ['api', '--method', method, endpoint, '--input', '-'], {
        input: JSON.stringify(value), encoding: 'utf8', shell: false, windowsHide: true, timeout: 60_000
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'GitHub API request failed');
      return JSON.parse(result.stdout);
    };
    try {
      const updated = api('PATCH', `repos/${repository}`, { delete_branch_on_merge: true });
      console.log(`Automatic merged-branch deletion: ${updated.delete_branch_on_merge}. Visibility: ${updated.visibility}.`);
      const applied = api('PUT', `repos/${repository}/branches/main/protection`, protection);
      console.log(`Main protection enabled. Administrator enforcement: ${applied.enforce_admins.enabled} (false allows admin override).`);
    } catch (error) {
      console.error(error.message.trim());
      console.error('If GitHub requires Pro for a private repository, rerun after you choose to make it public or upgrade. This script never changes repository visibility.');
      process.exitCode = 1;
    }
  }
}
