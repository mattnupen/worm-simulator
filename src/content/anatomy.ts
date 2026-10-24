import type { Line } from './text';

/**
 * The anatomy model's part names and one-sentence facts (src/anatomy/, the `?anatomy=1` viewer
 * and lessons). Names are plain words a 6th grader knows, with the science word after. Every fact
 * is sourced (docs/codev/research/anatomy.md has the quote for each).
 */
export interface AnatomyPart {
  /** The label on the model. */
  readonly name: Line;
  /** The science word, shown smaller after the name ('' when the name is the science word). */
  readonly science: string;
  readonly system: 'skin' | 'muscles' | 'gut' | 'blood' | 'nerves' | 'repro' | 'nephridia';
  readonly fact: Line;
}

const ui = (text: string): Line => ({ kind: 'ui', text });

export const ANATOMY_PARTS = {
  prostomium: {
    name: ui('Mouth lobe'), science: 'prostomium', system: 'skin',
    fact: { kind: 'fact', text: 'This lobe can close over the mouth, or reach forward to feel what is around.', source: 'esb-biology', verified: true },
  },
  segments: {
    name: ui('Segments'), science: '', system: 'skin',
    fact: { kind: 'fact', text: 'A nightcrawler has 110 to 180 ring-shaped segments.', source: 'smith-1917', verified: true },
  },
  setae: {
    name: ui('Bristles'), science: 'setae', system: 'skin',
    fact: { kind: 'fact', text: 'Every segment except the first has eight tiny bristles that help the worm grip.', source: 'esb-biology', verified: true },
  },
  clitellum: {
    name: ui('Saddle'), science: 'clitellum', system: 'skin',
    fact: { kind: 'fact', text: 'Only grown-up worms have the saddle. After mating, it makes a cocoon for the eggs.', source: 'sciencelearn-outside', verified: true },
  },
  skin: {
    name: ui('Skin'), science: '', system: 'skin',
    fact: { kind: 'fact', text: 'A worm breathes through its thin skin, so the skin must stay damp.', source: 'usbg-earthworms', verified: true },
  },
  circular: {
    name: ui('Ring muscles'), science: 'circular muscle', system: 'muscles',
    fact: { kind: 'fact', text: 'When these muscles squeeze, the worm gets long and thin.', source: 'sciencelearn-earthworm', verified: true },
  },
  longitudinal: {
    name: ui('Long muscles'), science: 'longitudinal muscle', system: 'muscles',
    fact: { kind: 'fact', text: 'When these muscles squeeze, the worm gets short and fat.', source: 'sciencelearn-earthworm', verified: true },
  },
  septa: {
    name: ui('Segment walls'), science: 'septa', system: 'muscles',
    fact: { kind: 'fact', text: 'Thin, see-through walls divide the inside of the body into segments.', source: 'lander-lumbricus', verified: true },
  },
  pharynx: {
    name: ui('Pharynx'), science: '', system: 'gut',
    fact: { kind: 'fact', text: 'The worm pushes its pharynx out of its mouth to grab food.', source: 'sciencelearn-earthworm', verified: true },
  },
  esophagus: {
    name: ui('Esophagus'), science: '', system: 'gut',
    fact: { kind: 'fact', text: 'This thin tube runs from the pharynx back to the crop.', source: 'lander-lumbricus', verified: true },
  },
  calciferous: {
    name: ui('Calcium glands'), science: 'calciferous glands', system: 'gut',
    fact: { kind: 'fact', text: 'Two pairs of these glands sit on the esophagus, just behind the hearts.', source: 'lander-lumbricus', verified: true },
  },
  crop: {
    name: ui('Crop'), science: '', system: 'gut',
    fact: { kind: 'fact', text: 'The crop stores food for a short time.', source: 'usbg-earthworms', verified: true },
  },
  gizzard: {
    name: ui('Gizzard'), science: '', system: 'gut',
    fact: { kind: 'fact', text: 'Worms have no teeth. The gizzard\'s strong muscles grind food with grains of sand.', source: 'sciencelearn-earthworm', verified: true },
  },
  intestine: {
    name: ui('Intestine'), science: '', system: 'gut',
    fact: { kind: 'fact', text: 'The long intestine runs to the tail. Here food is broken down and soaked up.', source: 'sciencelearn-earthworm', verified: true },
  },
  hearts: {
    name: ui('Hearts'), science: 'aortic arches', system: 'blood',
    fact: { kind: 'fact', text: 'A nightcrawler has five pairs of hearts that pump its blood.', source: 'lander-lumbricus', verified: true },
  },
  dorsalVessel: {
    name: ui('Top blood vessel'), science: 'dorsal vessel', system: 'blood',
    fact: { kind: 'fact', text: 'Blood flows forward, toward the head, along the top of the worm.', source: 'lander-lumbricus', verified: true },
  },
  ventralVessel: {
    name: ui('Bottom blood vessel'), science: 'ventral vessel', system: 'blood',
    fact: { kind: 'fact', text: 'Blood flows back, toward the tail, along the bottom of the worm.', source: 'lander-lumbricus', verified: true },
  },
  brain: {
    name: ui('Brain'), science: 'cerebral ganglia', system: 'nerves',
    fact: { kind: 'fact', text: 'The small brain sits on top of the pharynx in segment 3.', source: 'lander-lumbricus', verified: true },
  },
  nerveCord: {
    name: ui('Nerve cord'), science: '', system: 'nerves',
    fact: { kind: 'fact', text: 'A nerve cord runs the whole length of the worm, along its belly.', source: 'hst-dissection', verified: true },
  },
  nerves: {
    name: ui('Nerves'), science: 'segmental nerves', system: 'nerves',
    fact: { kind: 'fact', text: 'Each segment has three pairs of nerves that branch out from the cord.', source: 'lander-lumbricus', verified: true },
  },
  seminalVesicles: {
    name: ui('Sperm sacs'), science: 'seminal vesicles', system: 'repro',
    fact: { kind: 'fact', text: 'There are three pairs of sperm sacs. The back pair is the biggest.', source: 'smith-1917', verified: true },
  },
  receptacles: {
    name: ui('Sperm holders'), science: 'seminal receptacles', system: 'repro',
    fact: { kind: 'fact', text: 'Two pairs of these small sacs open in the grooves between segments 9, 10 and 11.', source: 'lander-lumbricus', verified: true },
  },
  ovaries: {
    name: ui('Ovaries'), science: '', system: 'repro',
    fact: { kind: 'fact', text: 'A pair of small ovaries sits in segment 13.', source: 'lander-lumbricus', verified: true },
  },
  nephridia: {
    name: ui('Waste tubes'), science: 'nephridia', system: 'nephridia',
    fact: { kind: 'fact', text: 'Almost every segment has a pair of these tiny tubes. They clean waste out of the body, a bit like kidneys.', source: 'lander-lumbricus', verified: true },
  },
} as const satisfies Record<string, AnatomyPart>;

export type AnatomyPartId = keyof typeof ANATOMY_PARTS;

/** The viewer's buttons and headings. */
export const ANATOMY_UI = {
  // The same name and icon as the game's link to it (src/ui/virtualWorm.ts).
  title: ui('Virtual worm'),
  views: ui('Look at'),
  systems: ui('Show or hide'),
  wall: ui('Body wall'),
  solid: ui('Whole'),
  cut: ui('Cut open'),
  ghost: ui('See-through'),
  labels: ui('Labels'),
  close: ui('Close'),
  toGame: ui('Back to the game'),
  hidePanel: ui('Hide'),
  showPanel: ui('Menu'),
  source: ui('Source:'),
  tabViews: ui('Views'),
  tabLayers: ui('Layers'),
  tabParts: ui('Parts'),
  peel: ui('Peel away'),
  howSolid: ui('how solid'),
  find: ui('Find a part'),
  reset: ui('Reset'),
  actHide: ui('Hide'),
  actFade: ui('Fade'),
  actOnly: ui('Only'),
  sysSkin: ui('Skin'),
  sysMuscles: ui('Muscles'),
  sysGut: ui('Food tube'),
  sysBlood: ui('Blood'),
  sysNerves: ui('Nerves'),
  sysRepro: ui('Reproduction'),
  sysNephridia: ui('Waste tubes'),
  viewOutside: ui('Whole'),
  viewHead: ui('Head'),
  viewBelly: ui('Underside'),
  viewInside: ui('Inside'),
  viewGut: ui('Eating'),
  viewBlood: ui('Blood'),
  viewNerves: ui('Nerves'),
  viewRepro: ui('Eggs'),
  viewMuscles: ui('Muscles'),
  viewNephridia: ui('Waste'),
  viewGhost: ui('See-through'),
  viewTail: ui('Tail'),
  viewSaddle: ui('Saddle'),
  viewBristles: ui('Bristles'),
  viewCrawl: ui('Crawling'),
  bristle: ui('Bristle'),
  front: ui('Head end'),
  play: ui('Play'),
  pause: ui('Pause'),
  slow: ui('Slow motion'),
  oneMm: ui('1 mm'),
} as const satisfies Record<string, Line>;

/**
 * The bristle close-up's lines (src/anatomy/bristles/; Matt, 2026-10-24). `grip` shows while the
 * close-up's segment is short and fat, `slide` while it is long and thin, `turns` on the crawl view.
 */
export const BRISTLE_FACTS = {
  grip: { kind: 'fact', text: 'When a segment squeezes short and fat, its bristles stick out and grip the soil.', source: 'kurth-kier-2015', verified: true },
  slide: { kind: 'fact', text: 'When a segment stretches long and thin, its bristles pull in, so it can slide forward.', source: 'baruch-annelida', verified: true },
  turns: { kind: 'fact', text: 'The worm grips with the bristles at one end while the other end moves, then they swap.', source: 'sciencelearn-underground', verified: true },
} as const satisfies Record<string, Line>;

/** Every line of the parts, keyed for lineProblems (tests/unit/content.test.ts). */
export function anatomyLines(): Record<string, Line> {
  const out: Record<string, Line> = { ...ANATOMY_UI };
  for (const [id, l] of Object.entries(BRISTLE_FACTS)) out[`bristles.${id}`] = l;
  for (const [id, p] of Object.entries(ANATOMY_PARTS)) {
    out[`${id}.name`] = p.name;
    out[`${id}.fact`] = p.fact;
  }
  return out;
}
