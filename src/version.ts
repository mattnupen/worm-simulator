/**
 * The version students play (docs/codev/README.md): a number and a short name, set when the
 * version is planned and never changed after release. Shown on the Start screen and stamped into
 * the built page as VERSION_META, which `npm run release` checks before it freezes a snapshot.
 * Bump both for the next version's first commit.
 */
export const VERSION = { number: 2, name: 'Underground' } as const;

/** "V2 · Underground": the Start-screen label, slides, form, Canvas post and changelog all use it. */
export const VERSION_LABEL = `V${VERSION.number} · ${VERSION.name}`;

/** Injected into the built page's <head> (vite.config.ts). scripts/releaseLib.mjs parses it. */
export const VERSION_META = `<meta name="wormsim-version" content="${VERSION_LABEL}">`;
