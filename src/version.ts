/**
 * The version students play (docs/codev/README.md): a number and a short name, set when the
 * version is planned and never changed after release. Shown on the Start screen and stamped into
 * the built page as VERSION_META, which `npm run release` checks before it freezes a snapshot.
 * Bump both for the next version's first commit.
 */
export const VERSION = { number: 4, name: 'Eating' } as const;

/**
 * This round's Google Form (Matt, 2026-10-13): the Vote quest links to it, in a new tab. Set it
 * for each round once Matt shares the form; the game only opens it and never sees the answers.
 */
export const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfgTEm9FWml-DPfnpGdSpS1is1pRVaB4mIzLUSRyx8T-yU-0Q/viewform?usp=header';

/** "V2 · Underground": the Start-screen label, slides, form, Canvas post and changelog all use it. */
export const VERSION_LABEL = `V${VERSION.number} · ${VERSION.name}`;

/** Injected into the built page's <head> (vite.config.ts). scripts/releaseLib.mjs parses it. */
export const VERSION_META = `<meta name="wormsim-version" content="${VERSION_LABEL}">`;

/** "Version 3 · Predators": the Start card's line under the title (Matt, 2026-10-12). */
export const VERSION_TITLE = `Version ${VERSION.number} · ${VERSION.name}`;

/**
 * Every major version (one per round), oldest first, for the Start screen's Versions list (Matt,
 * 2026-10-12). Add the next round's entry with its first commit. Each opens its frozen snapshot
 * at /vN/; the one being played is marked instead of linked. Simple words for 6th graders.
 */
export const ROUNDS: readonly { number: number; name: string; about: string }[] = [
  { number: 1, name: 'True Size', about: 'See the forest at its real size next to your 15 cm worm.' },
  { number: 2, name: 'Underground', about: 'Dig down through the soil layers and make your own tunnels.' },
  { number: 3, name: 'Predators', about: 'Learn which animals hunt worms, then design a predator for the game.' },
  { number: 4, name: 'Eating', about: 'Follow a leaf through a worm\'s body, and dig away from a hungry robin.' },
];

/**
 * How many rounds the unit has (docs/codev/roadmap.md: V1–V8). The game menu's Rounds page lists the
 * ones after ROUNDS as "Coming soon", with no link (Matt, 2026-10-23).
 */
export const PLANNED_ROUNDS = 8;

/** "What changed in each round": the student-friendly changelog on GitHub (the repo is public). */
export const CHANGELOG_URL = 'https://github.com/mattnupen/worm-simulator/blob/main/CHANGELOG.md';
