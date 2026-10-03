// The pure rules behind `npm run release -- <N>` (scripts/release.mjs), kept apart so they are
// unit-tested (tests/unit/release.test.ts). Types: releaseLib.d.mts.

const USAGE = 'Usage: npm run release -- <N> [--emergency-fix]   (N is the version number, e.g. 1)';

/** The command-line arguments: a whole version number from 1, and the optional emergency flag. */
export function parseReleaseArgs(argv) {
  const emergencyFix = argv.includes('--emergency-fix');
  const rest = argv.filter((a) => a !== '--emergency-fix');
  if (rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) throw new Error(USAGE);
  return { version: Number(rest[0]), emergencyFix };
}

/** The version a built page is stamped with (src/version.ts VERSION_META), or null. */
export function parseVersionLabel(html) {
  const m = html.match(/<meta name="wormsim-version" content="V([1-9]\d*) · ([^"<>]+)">/);
  return m ? { number: Number(m[1]), name: m[2] } : null;
}

/** Where version n's frozen snapshot lives (served at /vN/). */
export function releasePath(n) {
  return `releases/v${n}/index.html`;
}

/** Why version n cannot be written (its folder `exists`), or null when it can. */
export function checkTarget(n, exists, emergencyFix) {
  if (!exists || emergencyFix) return null;
  return `releases/v${n}/ already exists. Released versions are frozen: students and slides point at it. `
    + 'For a real emergency fix, run again with --emergency-fix and note the fix in the version doc '
    + 'and its CHANGELOG entry.';
}

/** Why the built page (`html`) is not version n, or null when it is. */
export function checkBuild(html, n) {
  const v = parseVersionLabel(html);
  if (!v) return 'The build has no version label (meta wormsim-version). Is vite.config.ts stamping it?';
  if (v.number !== n) {
    return `The build is labelled V${v.number} · ${v.name}, not V${n}. Set VERSION in src/version.ts first.`;
  }
  return null;
}
