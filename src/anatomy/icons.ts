/**
 * Icons for the anatomy viewer's buttons, in the game's icon style (src/ui/icons.ts): 24px line
 * drawings in the text colour. Each is decorative (aria-hidden): the word beside it, or the
 * button's label, carries the meaning. Static markup, so innerHTML is safe.
 */
const S = 'xmlns="http://www.w3.org/2000/svg" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
/** A worm lying in a gentle S, the base of several icons. */
const WORM = 'M3 15c2.5-5 5.5-5 8-1.5S16.5 18 21 9';

const ICONS = {
  worm: `<svg ${S}><path d="${WORM}" stroke-width="3.4"/></svg>`,
  head: `<svg ${S}><path d="M10 17c3-4 6-4 11-1" stroke-width="3.4"/><circle cx="7" cy="9" r="4.5"/><path d="M4 12l-2.5 2.5"/><path d="M6 8.5h2" stroke-width="1.6"/></svg>`,
  tail: `<svg ${S}><path d="M3 16c4-3 7-3 10 1" stroke-width="3.4"/><circle cx="17" cy="9" r="4.5"/><path d="M20 12l2.5 2.5"/></svg>`,
  saddle: `<svg ${S}><path d="M2 13h20" stroke-width="3.4"/><rect x="8.5" y="8.5" width="7" height="9" rx="2.5" fill="currentColor" stroke="none"/></svg>`,
  belly: `<svg ${S}><path d="M3 8h18" stroke-width="3.4"/><path d="M12 21v-8M8.5 16.5L12 13l3.5 3.5"/></svg>`,
  inside: `<svg ${S}><rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M5 12h14" stroke-width="3"/></svg>`,
  gut: `<svg ${S}><path d="M2 12h3M19 12h3"/><path d="M5 12c0-2 1.5-3 3-3s3 1 4 1 2.5-2 4-2 3 2 3 4-1.5 4-3 4-3-2-4-2-2.5 1-4 1-3-1-3-3z"/></svg>`,
  blood: `<svg ${S}><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z" fill="currentColor"/></svg>`,
  nerves: `<svg ${S}><circle cx="7" cy="8" r="3" fill="currentColor"/><path d="M7 11v4c0 3 4 4 7 4h8M12 19v-3M17 19v-3M17 19v3M12 19v3"/></svg>`,
  repro: `<svg ${S}><ellipse cx="12" cy="13" rx="6" ry="7.5"/><ellipse cx="12" cy="14" rx="2.4" ry="3" fill="currentColor" stroke="none"/></svg>`,
  muscles: `<svg ${S}><rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M8 7v10M12 7v10M16 7v10"/></svg>`,
  nephridia: `<svg ${S}><path d="M3 18h3c0-6 3-6 3 0s3 6 3 0 3-6 3 0 3 6 3 0h3"/></svg>`,
  solid: `<svg ${S}><rect x="2.5" y="7" width="19" height="10" rx="5" fill="currentColor"/></svg>`,
  cut: `<svg ${S}><path d="M7.5 7h9a5 5 0 0 1 0 10h-9a5 5 0 0 1 0-10z"/><path d="M7.5 12h9a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z" fill="currentColor"/></svg>`,
  ghost: `<svg ${S}><rect x="2.5" y="7" width="19" height="10" rx="5" stroke-dasharray="2.5 2.5"/><path d="M7 12h10"/></svg>`,
  labels: `<svg ${S}><path d="M3 6h10l5 6-5 6H3z"/><circle cx="7" cy="12" r="1.6" fill="currentColor"/></svg>`,
  views: `<svg ${S}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
  layers: `<svg ${S}><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 17l9 5 9-5"/></svg>`,
  parts: `<svg ${S}><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l6 6"/></svg>`,
  hide: `<svg ${S}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><path d="M4 20L20 4"/></svg>`,
  fade: `<svg ${S}><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>`,
  only: `<svg ${S}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/></svg>`,
  close: `<svg ${S} stroke-width="2.8"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  reset: `<svg ${S} stroke-width="2.6"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 3.5v4h4"/></svg>`,
  fold: `<svg ${S} stroke-width="2.8"><path d="M15 5l-7 7 7 7"/></svg>`,
  peel: `<svg ${S}><path d="M4 18c4-1 6-5 6-12M10 6c3 3 7 4 10 3"/><path d="M4 18h16"/></svg>`,
} as const;

export type AnatomyIcon = keyof typeof ICONS;

export function anatomyIcon(name: AnatomyIcon): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'anatomy-icon';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}
