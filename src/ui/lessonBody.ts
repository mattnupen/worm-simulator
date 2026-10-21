import type { BodyPart } from '../content/lessons/lesson';

/**
 * The `body` step's diagram (content/lessons/lesson.ts): an earthworm cut open from the side, head
 * on the left, with the parts food passes through. Drawn in code and captioned as a drawing, not a
 * photo; the shapes are simplified and not to scale. Each part is its own element (`data-part`),
 * so the lesson can mark the one the leaf is in, and the leaf bit (`.body-leaf`) moves to it.
 * The words for each part are on the card beside it, so nothing relies on the picture.
 */

/** Where the leaf bit sits for each part (x in the view box). */
const LEAF_X: Readonly<Record<BodyPart, number>> = {
  mouth: 22, pharynx: 62, crop: 152, gizzard: 196, intestine: 400, casts: 622,
};

/** Before the first stop, the leaf waits just outside the mouth. */
export const LEAF_START_X = -14;

export function leafX(part: BodyPart): number {
  return LEAF_X[part];
}

/** Each part's label sits above the body over its part; these keep the labels inside the box. */
const LABEL_X: Readonly<Record<BodyPart, number>> = {
  mouth: 30, pharynx: 70, crop: 152, gizzard: 200, intestine: 400, casts: 592,
};

export function labelX(part: BodyPart): number {
  return LABEL_X[part];
}

/** The segments' furrows: thin rings across the body, every 18 units. */
function furrows(): string {
  const out: string[] = [];
  for (let x = 46; x < 586; x += 18) out.push(`M${x} 74 Q${x + 4} 110 ${x} 146`);
  return out.join(' ');
}

export const BODY_SVG = `<svg viewBox="-30 0 680 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path class="body-skin" d="M6 110 C6 86 18 74 40 74 L556 76 C590 78 606 94 608 110 C606 126 590 142 556 144 L40 146 C18 146 6 134 6 110 Z"/>
  <path class="body-band" d="M250 74 L304 74 L304 146 L250 146 Z"/>
  <path class="body-furrows" d="${furrows()}"/>
  <path class="body-tube" d="M40 110 L596 110"/>
  <g class="body-part" data-part="mouth"><path d="M6 110 C6 96 14 88 26 88 L36 100 L36 120 L26 132 C14 132 6 124 6 110 Z"/></g>
  <g class="body-part" data-part="pharynx"><ellipse cx="62" cy="110" rx="22" ry="20"/></g>
  <g class="body-part" data-part="crop"><ellipse cx="152" cy="110" rx="22" ry="23"/></g>
  <g class="body-part" data-part="gizzard"><rect x="176" y="88" width="40" height="44" rx="12"/></g>
  <g class="body-part" data-part="intestine"><rect x="218" y="99" width="380" height="22" rx="11"/></g>
  <g class="body-part" data-part="casts"><circle cx="620" cy="104" r="7"/><circle cx="634" cy="116" r="6"/><circle cx="618" cy="124" r="6"/></g>
  <g class="body-leaf"><path d="M-12 0 C-7 -11 7 -11 12 0 C7 11 -7 11 -12 0 Z"/><path class="body-leaf-vein" d="M-12 0 L12 0"/></g>
  <g class="body-label" hidden><path class="body-label-line" d="M0 34 L0 72"/><text x="0" y="26" text-anchor="middle"></text></g>
</svg>`;
