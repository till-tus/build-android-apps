// Security baseline: Node's 21 October 2026 security release. Keep the engine
// range and README in sync; use the latest patched release within these LTS lines.
export const nodeRange = '>=22.23.4 <23 || >=24.22.1 <25';
export const nodeSecurityRelease = 'https://nodejs.org/en/blog/vulnerability/october-2026-security-releases';
const minimums = new Map([[22, [23, 4]], [24, [22, 1]]]);

export function nodeRuntimeStatus(version = process.version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const [major, minor, patch] = match ? match.slice(1).map(Number) : [];
  const minimum = minimums.get(major);
  const supported = Boolean(minimum && (minor > minimum[0] || minor === minimum[0] && patch >= minimum[1]));
  const reason = supported ? 'supported' : !match ? 'invalid-or-prerelease' : minimum ? 'outdated-security-patch' : major < 22 || major === 23 || major === 25 ? 'end-of-life' : 'unsupported-major';
  return { version, supported, reason, required: nodeRange, securityRelease: nodeSecurityRelease,
    ...(!supported ? { issue: `Unsupported or security-outdated Node.js ${version}${reason === 'end-of-life' ? ' (end of life)' : ''}. Install the latest patched Node 24 LTS (at least 24.22.1), or Node 22 LTS (at least 22.23.4). Other major lines, EOL releases and prereleases are not supported. Restart Codex and its plugin processes after updating the Node executable on its PATH.` } : {}) };
}

export function assertNodeRuntime(version = process.version) {
  const status = nodeRuntimeStatus(version);
  if (!status.supported) throw new Error(status.issue);
  return status;
}
