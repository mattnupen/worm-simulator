/**
 * Small decorative inline SVG icons for the menus and the speed test. Every icon is aria-hidden: the words
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
  /** Back arrow. */
  back: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M10 5l-7 7 7 7M3 12h18"/></svg>`,
  /** Two bars: Pause. */
  pause: `<svg ${SVG} viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.5"/>
    <rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>`,
  /** Three sliders: Graphics. */
  sliders: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2.4" fill="currentColor"/>
    <circle cx="15" cy="12" r="2.4" fill="currentColor"/><circle cx="7" cy="18" r="2.4" fill="currentColor"/></svg>`,
  /** A speedometer: Speed test. */
  gauge: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round"><path d="M3.5 17a9 9 0 1 1 17 0"/><path d="M12 15l4.5-5.5"/>
    <circle cx="12" cy="15" r="1.8" fill="currentColor"/></svg>`,
  /** A little house: Back to start. */
  home: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>`,
  /** The Action prompt (src/ui/actionPrompt.ts). Dig down: an arrow going down through the ground line. */
  digDown: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 9h6M15.5 9h6"/><path d="M12 3v16M6.5 13.5L12 19l5.5-5.5"/></svg>`,
  /** Come up: an arrow rising out through the ground line. */
  comeUp: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 15h6M15.5 15h6"/><path d="M12 21V5M6.5 10.5L12 5l5.5 5.5"/></svg>`,
  /** Wide view: four corners pointing out. */
  viewWide: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>
    <path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6"/></svg>`,
  /** Close view: a magnifying glass. */
  viewClose: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6M7 10h6M10 7v6"/></svg>`,
  /** A tick: a saved setting. */
  check: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
      stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>`,
  /** The lesson (src/ui/lesson.ts). Read aloud: a speaker with sound waves. */
  speaker: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h4l5-4.5v14l-5-4.5H4z" fill="currentColor"/>
    <path d="M16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/></svg>`,
  /** A shadow passing: a bird shape over a dark oval. */
  shadow: `<svg ${SVG} viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="19" rx="9" ry="2.6" opacity=".45"/>
    <path d="M2 9c4-1 7 0 10 3 3-3 6-4 10-3-3 1-5 3-7 5h-6C7 12 5 10 2 9z"/></svg>`,
  /** Thumps: rings spreading through the ground. */
  thump: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round"><path d="M2 6h20"/><path d="M9 11a3 2 0 0 0 6 0M5.5 14.5a6.5 4.5 0 0 0 13 0M2.5 18a9.5 6 0 0 0 19 0"/></svg>`,
  /** An eye: "While you play, notice…". */
  eye: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
  /** A form with ticked lines: the vote reminder. */
  form: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/>
    <path d="M7.5 8.5l1.5 1.5 2.5-3M13.5 9h3.5M7.5 15l1.5 1.5 2.5-3M13.5 15.5h3.5"/></svg>`,
  /** Sorting cards: up (first group) and down (second group). */
  up: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M6 11l6-6 6 6"/></svg>`,
  down: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15M6 13l6 6 6-6"/></svg>`,
  /** A turn-around arrow: "Look again" on a sorted card (a different shape from the tick). */
  turn: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>`,
  /** A padlock: a quest that is not open yet. */
  lock: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/>
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, className = 'icon'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = className;
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}
