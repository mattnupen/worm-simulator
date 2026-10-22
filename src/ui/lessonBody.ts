import type { BodyPart } from '../content/lessons/lesson';

/**
 * The `body` step's diagram (content/lessons/lesson.ts): a nightcrawler cut open from the side,
 * head on the left, drawn in code. Two views:
 * - a big close-up (222 drawing units tall) that pans along the worm to the part the food is in, and shows what happens to
 *   it there: the pharynx reaches out and grabs the leaf, spit wets it, the crop swells with it, the
 *   gizzard squeezes it into crumbs against grains of sand, food soaks from the intestine into the
 *   blood, and casts come out of the back end;
 * - a small map of the whole worm above it, with a box showing where the close-up is.
 *
 * The layout follows school dissection guides (docs/codev/research/eating.md): mouth under the
 * prostomium, pharynx, five pairs of hearts around the esophagus, crop, gizzard, then one long
 * intestine to the anus; septa between segments; the clitellum about a third of the way back
 * (from segment 31); the dorsal blood vessel on top and the nerve cord along the bottom. Sizes are
 * simplified. Every part's name and fact are also on the card in words, so nothing relies on the
 * picture, and under reduced motion nothing moves or pans smoothly (it jumps).
 */

/** Segment width and count (a nightcrawler has more segments; 100 keeps the clitellum about a third back). */
const S = 34;
const N = 100;
/** Where segment `i` (1-based) starts. */
const seg = (i: number): number => 40 + (i - 1) * S;
/** The tail tip. */
const END = seg(N + 1);
/** The body's midline, and its half thickness along most of its length. */
const MID = 140;
const HALF = 80;
/** The close-up's width in drawing units: narrower on a phone, so the parts stay big. */
const closeWidth = (): number => (typeof matchMedia === 'function' && matchMedia('(max-width: 600px)').matches ? 380 : 640);

/** The body's half thickness at x: a rounded nose, a long even body, a slimmer rounded tail. */
function half(x: number): number {
  if (x <= 0 || x >= END) return 0;
  if (x < 150) return HALF * Math.sqrt(1 - ((150 - x) / 150) ** 2) * 0.82 + HALF * 0.18 * (x / 150);
  const tailStart = END - 360;
  const body = x < tailStart ? HALF : HALF - 14 * ((x - tailStart) / 360);
  const capStart = END - 70;
  return x < capStart ? body : body * Math.sqrt(1 - ((x - capStart) / 70) ** 2);
}

/** The outline at `inset` units inside the skin, as a closed path. */
function outline(inset: number): string {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let x = 0; x <= END; x += 6) {
    const h = Math.max(0, half(x) - inset);
    top.push(`${x} ${(MID - h).toFixed(1)}`);
    bottom.push(`${x} ${(MID + h).toFixed(1)}`);
  }
  return `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`;
}

/** Thin walls (septa) between segments, inside the body cavity. */
function septa(): string {
  const out: string[] = [];
  for (let i = 2; i <= N; i++) {
    const x = seg(i);
    const h = half(x) - 12;
    if (h > 10) out.push(`M${x} ${MID - h} L${x + 4} ${MID + h}`);
  }
  return out.join(' ');
}

/** Furrows on the skin at each segment's edge, and two bristles (setae) under each segment. */
function skinMarks(): { furrows: string; setae: string } {
  const furrows: string[] = [];
  const setae: string[] = [];
  for (let i = 2; i <= N; i++) {
    const x = seg(i);
    const h = half(x);
    if (h < 8) continue;
    furrows.push(`M${x} ${MID - h} l2 9 M${x} ${MID + h} l2 -9`);
    for (const dx of [11, 23]) {
      const xs = x + dx;
      const hs = half(xs);
      setae.push(`M${xs} ${MID + hs - 2} l-4 9`);
    }
  }
  return { furrows: furrows.join(' '), setae: setae.join(' ') };
}

/** The intestine: a long tube from the gizzard to the anus, pinched a little at every septum. */
function intestine(): string {
  const start = seg(19);
  const stop = END - 26;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let x = start; x <= stop; x += 6) {
    const into = (x - seg(1)) % S;
    const pinch = 5 * Math.exp(-(((into - 0) / 6) ** 2)) + 5 * Math.exp(-(((into - S) / 6) ** 2));
    const taper = Math.min(1, (stop - x) / 120);
    const h = (34 - pinch) * (0.55 + 0.45 * taper);
    top.push(`${x} ${(MID - h).toFixed(1)}`);
    bottom.push(`${x} ${(MID + h).toFixed(1)}`);
  }
  return `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`;
}

/** Five hearts: loops from the dorsal vessel down around the esophagus to the ventral vessel. */
function hearts(): string {
  const out: string[] = [];
  for (let i = 7; i <= 11; i++) {
    const x = seg(i) + S / 2;
    out.push(`M${x} 94 C${x - 18} 112 ${x - 18} 168 ${x} 186`);
  }
  return out.join(' ');
}

/** Muscle strands from the pharynx to the body wall (they pull it open and pump it). */
function pharynxMuscles(): string {
  const out: string[] = [];
  for (const x of [96, 122, 148, 174]) {
    const h = half(x) - 12;
    out.push(`M${x} ${MID - 30} L${x - 8} ${MID - h} M${x} ${MID + 30} L${x - 8} ${MID + h}`);
  }
  return out.join(' ');
}

/** Bits of sand and grit, scattered in a box around (cx, cy). */
function grains(cx: number, cy: number, w: number, h: number, n: number, seed: number): string {
  let r = seed;
  const rand = (): number => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = cx + (rand() - 0.5) * w;
    const y = cy + (rand() - 0.5) * h;
    out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.6 + rand() * 2).toFixed(1)}"/>`);
  }
  return out.join('');
}

/** A torn bit of fallen leaf, centred on 0 0, with its veins. */
const LEAF = `<path class="food-leaf-blade" d="M-26 -4 C-20 -18 -2 -22 12 -16 L18 -20 L20 -10 C27 -4 26 8 16 14 L8 12 L2 20 C-10 20 -22 12 -26 -4 Z"/>
  <path class="food-leaf-vein" d="M-22 0 C-8 -2 6 -2 20 -6 M-6 -2 L-2 -14 M4 -3 L10 -14 M-4 -1 L0 12 M8 -4 L12 8"/>`;

/** The leaf after the gizzard: small crumbs. */
const CRUMBS = [
  [-14, -6], [-6, 4], [2, -8], [10, 2], [-12, 8], [16, -4], [4, 10], [-2, -2], [12, 10], [-18, 0],
].map(([x, y], i) => `<path d="M${x - 3} ${y} l3 -3 l4 1 l-1 4 l-4 1 Z" transform="rotate(${i * 37} ${x} ${y})"/>`).join('');

/** Food soaking from the intestine into the blood: dots that rise to the dorsal vessel. */
const SOAK = [-60, -20, 20, 60, 100].map((dx, i) => `<circle class="soak-dot" style="animation-delay:${i * 0.45}s" cx="${dx}" cy="0" r="4"/>`).join('');

/** Casts: dark granules of worm poop out of the back end. */
const CASTS = [[14, -6], [26, 4], [18, 16], [38, -2], [34, 14], [48, 8], [28, -14]]
  .map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${6 + (i % 3)}" ry="${5 + (i % 2)}"/>`).join('');

/** One worm, drawn in drawing units; the close-up and the map each use it. */
function wormDrawing(detail: boolean): string {
  const clit = `<path class="body-clitellum" d="M${seg(31)} ${MID - HALF - 6} L${seg(38)} ${MID - HALF - 6} L${seg(38)} ${MID + HALF + 6} L${seg(31)} ${MID + HALF + 6} Z"/>`;
  if (!detail) {
    return `<path class="body-skin" d="${outline(0)}"/>${clit}<path class="map-gut" d="M30 ${MID} L${END - 20} ${MID}"/>`;
  }
  const { furrows, setae } = skinMarks();
  return `
  <path class="body-skin" d="${outline(0)}"/>
  ${clit}
  <path class="body-cavity" d="${outline(12)}"/>
  <path class="body-septa" d="${septa()}"/>
  <path class="body-furrows" d="${furrows}"/>
  <path class="body-setae" d="${setae}"/>
  <path class="body-vessel dorsal" d="M60 94 L${END - 40} 94"/>
  <path class="body-vessel ventral" d="M60 186 L${END - 40} 186"/>
  <path class="body-nerve" d="M118 106 C150 120 150 190 ${seg(7)} 204 L${END - 40} 204"/>
  <ellipse class="body-brain" cx="112" cy="102" rx="16" ry="10"/>
  <path class="body-hearts" d="${hearts()}"/>
  <path class="gut esophagus" d="M200 ${MID - 11} L${seg(15) + 4} ${MID - 11} L${seg(15) + 4} ${MID + 11} L200 ${MID + 11} Z"/>
  <g class="body-part" data-part="intestine">
    <path class="gut intestine" d="${intestine()}"/>
    <path class="gut-content" d="M${seg(19) + 8} ${MID} L${END - 40} ${MID}"/>
    <path class="typhlosole" d="M${seg(19) + 10} ${MID - 22} L${END - 60} ${MID - 22}"/>
    <g class="grit">${grains((seg(19) + END) / 2, MID, END - seg(19) - 80, 22, 260, 7)}</g>
  </g>
  <g class="body-part" data-part="crop"><ellipse class="gut crop-sac" cx="${seg(15) + S}" cy="${MID}" rx="38" ry="32"/></g>
  <g class="body-part" data-part="gizzard">
    <path class="gut gizzard-wall" d="M${seg(17)} ${MID - 22} C${seg(17) + 6} ${MID - 40} ${seg(19) - 6} ${MID - 40} ${seg(19)} ${MID - 22} L${seg(19)} ${MID + 22} C${seg(19) - 6} ${MID + 40} ${seg(17) + 6} ${MID + 40} ${seg(17)} ${MID + 22} Z"/>
    <path class="gizzard-muscle" d="M${seg(17) + 12} ${MID - 32} L${seg(17) + 12} ${MID + 32} M${seg(18)} ${MID - 36} L${seg(18)} ${MID + 36} M${seg(19) - 12} ${MID - 32} L${seg(19) - 12} ${MID + 32}"/>
    <rect class="gizzard-lumen" x="${seg(17) + 8}" y="${MID - 13}" width="${2 * S - 16}" height="26" rx="10"/>
    <g class="grit">${grains(seg(18), MID, 2 * S - 32, 22, 26, 3)}</g>
  </g>
  <g class="body-part" data-part="pharynx">
    <path class="pharynx-muscles" d="${pharynxMuscles()}"/>
    <g class="pharynx-move"><path class="gut pharynx" d="M34 ${MID - 18} C70 ${MID - 34} 170 ${MID - 34} 206 ${MID - 12} L206 ${MID + 12} C170 ${MID + 34} 70 ${MID + 34} 34 ${MID + 18} Z"/></g>
  </g>
  <g class="body-part" data-part="mouth">
    <path class="prostomium" d="M2 ${MID - 6} C2 ${MID - 30} 26 ${MID - 40} 44 ${MID - 30} C30 ${MID - 22} 18 ${MID - 12} 14 ${MID - 4} Z"/>
    <path class="gut mouth" d="M6 ${MID - 2} C14 ${MID - 12} 30 ${MID - 14} 38 ${MID - 10} L38 ${MID + 10} C30 ${MID + 14} 14 ${MID + 12} 6 ${MID + 2} Z"/>
  </g>
  <g class="body-part" data-part="casts">
    <path class="gut anus" d="M${END - 30} ${MID - 8} L${END + 2} ${MID - 4} L${END + 2} ${MID + 4} L${END - 30} ${MID + 8} Z"/>
  </g>
  <g class="food-casts" transform="translate(${END} ${MID + 10})">${CASTS}</g>
  <text class="body-note" x="112" y="84" text-anchor="middle">brain</text>
  <text class="body-note" x="${seg(9) + 8}" y="84" text-anchor="middle">5 pairs of hearts</text>
  <text class="body-note" x="${seg(34) + S / 2}" y="${MID - HALF - 14}" text-anchor="middle">clitellum</text>`;
}

/** Where the close-up centres for each stop (null: before the first tap), and where the food is. */
const VIEW: Readonly<Record<BodyPart | 'start', { readonly at: number; readonly food: number }>> = {
  start: { at: 210, food: -70 },
  mouth: { at: 240, food: -24 },
  pharynx: { at: 270, food: 130 },
  crop: { at: 470, food: seg(15) + S },
  gizzard: { at: 560, food: seg(18) },
  intestine: { at: 900, food: 900 },
  casts: { at: END - 220, food: END - 40 },
};

export interface BodyDiagram {
  readonly el: HTMLElement;
  /** Move the close-up and the food to `part` (null: before the first stop), and label it `name`. */
  show(part: BodyPart | null, name: string, seen: ReadonlySet<BodyPart>): void;
}

export function bodyDiagram(): BodyDiagram {
  const fig = document.createElement('figure');
  fig.className = 'body-diagram';
  const W = closeWidth();
  const mapW = END + 180;
  fig.innerHTML = `
<p class="body-map-head" aria-hidden="true"><span>Head</span><span>Tail</span></p>
<svg class="body-map" viewBox="-20 40 ${mapW} 200" preserveAspectRatio="none" aria-hidden="true">
  ${wormDrawing(false)}
  <rect class="body-window" x="0" y="44" width="${W}" height="192" rx="24"/>
</svg>
<svg class="body-close" viewBox="0 14 ${W} 222" aria-hidden="true">
  <defs>
    <linearGradient id="worm-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8f4c3c"/><stop offset="0.55" stop-color="#c37d68"/><stop offset="1" stop-color="#e2ad98"/>
    </linearGradient>
  </defs>
  <g class="body-world">
    ${wormDrawing(true)}
    <g class="food" data-food="leaf">
      <g class="food-leaf">${LEAF}</g>
      <g class="food-spit"><circle cx="-20" cy="-18" r="4"/><circle cx="18" cy="16" r="3.5"/><circle cx="-14" cy="18" r="3"/><circle cx="24" cy="-12" r="3"/></g>
      <g class="food-crumbs">${CRUMBS}</g>
      <g class="food-soak">${SOAK}</g>
    </g>
    <g class="body-label" hidden><text y="42" text-anchor="middle"></text><path class="body-label-line" d="M0 48 L0 70"/></g>
  </g>
</svg>`;
  const world = fig.querySelector('.body-world') as SVGGElement;
  const food = fig.querySelector('.food') as SVGGElement;
  const label = fig.querySelector('.body-label') as SVGGElement;
  const box = fig.querySelector('.body-window') as SVGRectElement;
  let last: number | null = null;

  return {
    el: fig,
    show(part, name, seen) {
      const v = VIEW[part ?? 'start'];
      // On a phone the close-up is narrower, so it centres on the food (the head and tail a little in).
      const at = W === 640 ? v.at : part === 'casts' ? END - 110 : v.food + (part === null || part === 'mouth' ? 120 : 0);
      const left = at - W / 2;
      // A long pan (the gizzard to the tail) takes longer, so the food can be followed.
      const secs = last === null ? 0 : Math.min(3, 0.9 + Math.abs(at - last) / 1500);
      last = at;
      for (const e of [world, food, box]) e.style.transitionDuration = `${secs}s`;
      world.style.transform = `translate(${-left}px, 0)`;
      food.style.transform = `translate(${v.food}px, ${MID}px)`;
      box.style.transform = `translate(${left}px, 0)`;
      fig.dataset.at = part ?? 'start';
      for (const p of fig.querySelectorAll<SVGGElement>('.body-part')) {
        const which = p.dataset.part as BodyPart;
        p.classList.toggle('seen', seen.has(which));
        p.classList.toggle('here', which === part);
      }
      label.toggleAttribute('hidden', !part);
      if (part) {
        label.style.transform = `translate(${v.food}px, 0)`;
        (label.querySelector('text') as SVGTextElement).textContent = name;
      }
    },
  };
}
