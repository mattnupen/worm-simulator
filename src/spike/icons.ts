/**
 * Small decorative inline SVG icons for the speed-test UI. Every icon is aria-hidden: the words
 * next to it carry the meaning. The markup is static (no user data), so innerHTML is safe here.
 */
const SVG = 'xmlns="http://www.w3.org/2000/svg" focusable="false"';

const ICONS = {
  /** A fall leaf with a midrib and veins, for the title seal. */
  leaf: `<svg ${SVG} viewBox="0 0 48 48"><g transform="rotate(-35 24 24)">
    <path d="M24 3C34 12 37 22 33 32c-2 5-5 8-9 10-4-2-7-5-9-10C11 22 14 12 24 3z" fill="#d9661c"/>
    <path d="M24 3C34 12 37 22 33 32c-2 5-5 8-9 10V3z" fill="#e8892a"/>
    <path d="M24 8v38M24 18l-6-5M24 18l6-5M24 26l-8-6M24 26l8-6M24 34l-7-5M24 34l7-5"
      stroke="#7a3410" stroke-width="1.6" stroke-linecap="round" fill="none"/></g></svg>`,
  /** Play triangle for the start button. */
  play: `<svg ${SVG} viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>`,
  /** Check mark in a circle: PASS (shape and glyph, not just colour). */
  pass: `<svg ${SVG} viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#2f6a2b" stroke="#1d3f1a" stroke-width="3"/>
    <path d="M13 25l7 7 15-16" stroke="#fffaf0" stroke-width="5.5" stroke-linecap="round"
      stroke-linejoin="round" fill="none"/></svg>`,
  /** Cross in a diamond: FAIL (different shape from PASS). */
  fail: `<svg ${SVG} viewBox="0 0 48 48"><path d="M24 2l22 22-22 22L2 24z" fill="#a8341c" stroke="#5e1a0b"
      stroke-width="3" stroke-linejoin="round"/>
    <path d="M16.5 16.5l15 15M31.5 16.5l-15 15" stroke="#fffaf0" stroke-width="5.5"
      stroke-linecap="round" fill="none"/></svg>`,
  /** Two stacked sheets for "Copy results". */
  copy: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linejoin="round"><rect x="8" y="8" width="12" height="13" rx="2"/>
    <path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"/></svg>`,
  /** Four arrows for driving. */
  drive: `<svg ${SVG} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l4 5h-8zM12 22l-4-5h8zM2 12l5-4v8zM22 12l-5 4V8z"/>
    <circle cx="12" cy="12" r="2.6"/></svg>`,
  /** Back arrow for returning to the results. */
  back: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M10 5l-7 7 7 7M3 12h18"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, className = 'icon'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = className;
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}
