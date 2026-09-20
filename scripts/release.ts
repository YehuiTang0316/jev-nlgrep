import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

type PackageVersion = { name: string; version: string };
function stableVersion(version: string): number[] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error(`Expected a stable x.y.z version, got ${version}`);
  const numbers = version.split('.').map(Number);
  if (!numbers.every(Number.isSafeInteger)) throw new Error('Version components are too large');
  return numbers;
}
export async function releaseDecision(pkg: PackageVersion, registryFetch: typeof fetch = fetch): Promise<boolean> {
  const target = stableVersion(pkg.version);
  const response = await registryFetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`, {
    headers: { Accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return true;
  if (!response.ok) throw new Error(`Registry check failed: HTTP ${response.status}; refusing to publish`);
  const metadata = await response.json() as { name?: string; versions?: Record<string, unknown>; 'dist-tags'?: { latest?: string } };
  if (metadata.name !== pkg.name || !metadata.versions || typeof metadata.versions !== 'object') throw new Error('Invalid registry metadata; refusing to publish');
  if (Object.hasOwn(metadata.versions, pkg.version)) return false;
  const latest = metadata['dist-tags']?.latest;
  if (latest) {
    const previous = stableVersion(latest);
    const differing = target.findIndex((value, index) => value !== previous[index]);
    if (differing < 0 || target[differing]! < previous[differing]!) throw new Error(`Version ${pkg.version} must be greater than npm latest ${latest}`);
  }
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as PackageVersion;
  const publish = await releaseDecision(pkg);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `publish=${publish}\nversion=${pkg.version}\n`);
  console.log(`${pkg.name}@${pkg.version}: ${publish ? 'ready to publish' : 'already published; skipping'}`);
}
