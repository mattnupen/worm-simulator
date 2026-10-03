// Freezes the current build as version N (docs/codev/README.md, "Frozen builds"):
//   npm run release -- <N> [--emergency-fix]
// 1. Refuses if releases/vN/ already exists (released versions are frozen) unless --emergency-fix.
// 2. Builds and runs the single-file check (npm run verify:build).
// 3. Refuses if the build is not labelled VN (src/version.ts).
// 4. Copies dist/index.html to releases/vN/index.html. Commit it yourself; Render serves it at /vN/.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { checkBuild, checkTarget, parseReleaseArgs, releasePath } from './releaseLib.mjs';

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

let args;
try {
  args = parseReleaseArgs(process.argv.slice(2));
} catch (e) {
  fail(e.message);
}
const { version, emergencyFix } = args;
const target = releasePath(version);

const refused = checkTarget(version, existsSync(path.dirname(target)), emergencyFix);
if (refused) fail(refused);

execFileSync('npm', ['run', 'verify:build'], { stdio: 'inherit' });
const wrong = checkBuild(readFileSync('dist/index.html', 'utf8'), version);
if (wrong) fail(wrong);

mkdirSync(path.dirname(target), { recursive: true });
copyFileSync('dist/index.html', target);
console.log(`\nrelease: wrote ${target}${emergencyFix ? ' (emergency fix)' : ''}.`);
console.log(`Next: git add ${target} && git commit -m "release: V${version}" && git push`);
console.log(`Then check https://wormsimulator.com/v${version}/ serves it.`);
