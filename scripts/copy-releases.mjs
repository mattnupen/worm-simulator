// Copies every frozen version (releases/vN/index.html) into the build, so Render serves it at
// /vN/ next to the root build. Runs after `npm run build` on Render (render.yaml).
//   node scripts/copy-releases.mjs [--from releases] [--to dist]
// No releases yet (no folder, or no vN folders in it) is fine: nothing is copied.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { releasesToServe } from './releaseLib.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const from = arg('--from', 'releases');
const to = arg('--to', 'dist');

if (!existsSync(path.join(to, 'index.html'))) {
  console.error(`copy-releases: ${to}/index.html is missing. Run npm run build first.`);
  process.exit(1);
}
const versions = existsSync(from) ? releasesToServe(readdirSync(from)) : [];
let copied = 0;
for (const v of versions) {
  const src = path.join(from, v, 'index.html');
  if (!existsSync(src)) {
    console.error(`copy-releases: the release folder ${v}/ has no index.html. Check ${from}/${v}/: every release folder holds one index.html.`);
    process.exit(1);
  }
  mkdirSync(path.join(to, v), { recursive: true });
  copyFileSync(src, path.join(to, v, 'index.html'));
  copied++;
}
console.log(copied ? `copy-releases: served ${versions.join(', ')}` : 'copy-releases: no releases yet');
