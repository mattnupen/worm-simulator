/**
 * What the server and the page agree on: the shapes sent over the API, the size limits, and how a
 * board's areas are worked out from students' answers (build brief section 4,
 * /mnt/project-files/codev/burrow-board-next.md). No DOM or Node code here, so both sides import it.
 */

export const LIMITS = {
  title: 70,
  does: 500,
  notice: 300,
  changed: 300,
  choiceOther: 40,
  note: 200,
  /** A saved picture, after the page shrinks it (bytes). */
  image: 400_000,
  /** Cards one student may post on one board, and "I'd add…" notes. */
  cardsPerStudent: 25,
  notesPerStudent: 60,
} as const;

/** Every phase a board goes through (brief section 3). */
export type Phase = 'setup' | 'think' | 'open' | 'closed';

export const PHASES: readonly { id: Phase; name: string; about: string }[] = [
  { id: 'setup', name: 'Setup', about: 'Only you can see it.' },
  { id: 'think', name: 'Think', about: 'Students post their own idea. They see only their own cards.' },
  { id: 'open', name: 'Share and dig', about: 'Students who posted see everyone\'s ideas and dig from them.' },
  { id: 'closed', name: 'Closed', about: 'Everyone can look. Nobody can post.' },
];

/** A starting choice for the guided card's first question, such as "Birds". */
export interface Choice {
  id: string;
  name: string;
  hint?: string;
}

/** A fact card from the round's lesson, carried with its source (science honesty, CLAUDE.md). */
export interface Fact {
  id: string;
  text: string;
  sourceId?: string;
  sourceTitle: string;
  url?: string;
}

/** A board area. `keys` are the answers that land in it (a choice id, or "other:<words>"). */
export interface Area {
  id: string;
  name: string;
  keys: string[];
}

export interface Board {
  slug: string;
  title: string;
  topic: string;
  /** The guided card's first question, such as "Which predator is your idea about?" */
  question: string;
  choices: Choice[];
  facts: Fact[];
  twists: string[];
  phase: Phase;
  /** Empty until the teacher builds the areas; until then the page suggests them. */
  areas: Area[];
  rev: number;
  created: number;
}

export type Status = 'built' | 'parked' | 'myth' | 'spot';

export const STATUS_LABELS: Record<Status, string> = {
  built: '✓ Built',
  parked: '⏸ Parked',
  myth: '? Myth to teach',
  spot: '★ Spotlight',
};

/** `idea` is a student's; `example` is the teacher's sample card; `earlier` came from last round. */
export type CardKind = 'idea' | 'example' | 'earlier';

export interface Card {
  id: number;
  parentId: number | null;
  kind: CardKind;
  period: number | null;
  nickname: string;
  mine: boolean;
  /** A choice id, or "other" with `choiceOther` holding the student's own words. */
  choice: string;
  choiceOther: string;
  areaOverride: string | null;
  /** A fact id, "game" for a game choice, or "" for none. */
  factRef: string;
  title: string;
  does: string;
  notice: string;
  changed: string;
  twist: string;
  imageId: string | null;
  status: Status | null;
  statusNote: string;
  hidden: boolean;
  x: number | null;
  y: number | null;
  created: number;
  updated: number;
}

export interface Note {
  id: number;
  cardId: number;
  period: number | null;
  nickname: string;
  mine: boolean;
  text: string;
  hidden: boolean;
  created: number;
}

export interface Me {
  student: { nickname: string; period: number } | null;
  teacher: boolean;
  periods: number[];
  current: string | null;
}

export interface BoardState {
  board: Board;
  cards: Card[];
  notes: Note[];
  /** True when this student must post their own idea before seeing the board (think first). */
  gated: boolean;
  canPost: boolean;
}

/** What the page sends to post or change a card. `image`: a data URL, null to remove, absent to keep. */
export interface CardInput {
  parentId?: number | null;
  choice?: string;
  choiceOther?: string;
  factRef?: string;
  title?: string;
  does?: string;
  notice?: string;
  changed?: string;
  twist?: string;
  image?: string | null;
  x?: number | null;
  y?: number | null;
  // teacher only
  status?: Status | null;
  statusNote?: string;
  hidden?: boolean;
  areaOverride?: string | null;
  kind?: CardKind;
}

export const DEFAULT_TWISTS = [
  'Make it happen at night',
  'Make it work in winter',
  'Make it harder for the worm',
  'Add a different animal',
  'Make it happen after a big rain',
];

export const OTHER_AREA: Area = { id: 'other', name: 'Other ideas', keys: [] };
export const EARLIER_AREA: Area = { id: 'earlier', name: 'From last round', keys: ['earlier'] };

const STOP = new Set(['a', 'an', 'the', 'some', 'of']);

/** "People with a Shovel!" and "people with shovels" both become "people with shovel". */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/** The answer a root card gives to the first question, as an area key. */
export function answerKey(card: Pick<Card, 'kind' | 'choice' | 'choiceOther'>): string {
  if (card.kind === 'earlier') return 'earlier';
  if (card.choice === 'other') {
    const n = normalizeAnswer(card.choiceOther);
    return n ? `other:${n}` : 'other';
  }
  return card.choice;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The areas the board would have if the teacher took every suggestion (brief section 4): each
 * starting choice someone picked, a new area for any "Something else" answer two or more students
 * wrote, and everything else in "Other ideas". Empty choices are left out.
 */
export function suggestAreas(choices: readonly Choice[], roots: readonly Card[]): Area[] {
  const counts = new Map<string, number>();
  const words = new Map<string, Map<string, number>>();
  for (const r of roots) {
    const k = answerKey(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (k.startsWith('other:')) {
      const m = words.get(k) ?? new Map<string, number>();
      const w = r.choiceOther.trim();
      m.set(w, (m.get(w) ?? 0) + 1);
      words.set(k, m);
    }
  }
  const areas: Area[] = [];
  for (const c of choices) if (counts.get(c.id)) areas.push({ id: `a-${c.id}`, name: c.name, keys: [c.id] });
  for (const [k, n] of counts) {
    if (!k.startsWith('other:') || n < 2) continue;
    const name = [...(words.get(k) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? k.slice(6);
    areas.push({ id: `a-${k.slice(6).replace(/\s+/g, '-')}`, name: cap(name), keys: [k] });
  }
  if (counts.get('earlier')) areas.push(EARLIER_AREA);
  return areas;
}

/** The areas the board shows: the teacher's, or the suggestions until there are some. */
export function boardAreas(board: Board, roots: readonly Card[]): Area[] {
  return board.areas.length ? board.areas : suggestAreas(board.choices, roots);
}

/** Which area each card sits in. A dig always stays with the idea it came from (brief 4.4). */
export function areaOfCards(cards: readonly Card[], areas: readonly Area[]): Map<number, string> {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const keyArea = new Map<string, string>();
  for (const a of areas) for (const k of a.keys) keyArea.set(k, a.id);
  const ids = new Set(areas.map((a) => a.id));
  const out = new Map<number, string>();
  const rootOf = (c: Card) => {
    const seen = new Set<number>();
    while (c.parentId != null && byId.has(c.parentId) && !seen.has(c.id)) {
      seen.add(c.id);
      c = byId.get(c.parentId)!;
    }
    return c;
  };
  for (const c of cards) {
    const r = rootOf(c);
    const area = r.areaOverride && (ids.has(r.areaOverride) || r.areaOverride === 'other')
      ? r.areaOverride
      : keyArea.get(answerKey(r)) ?? 'other';
    out.set(c.id, area);
  }
  return out;
}

/** The name a student sees for their answer to the first question. */
export function answerName(board: Board, card: Pick<Card, 'kind' | 'choice' | 'choiceOther'>): string {
  if (card.kind === 'earlier') return 'From last round';
  if (card.choice === 'other') return card.choiceOther.trim() || 'Something else';
  return board.choices.find((c) => c.id === card.choice)?.name ?? '';
}

/** A random nickname such as "Swift Robin 42", so no real name is ever stored. */
const ADJ = ['Swift', 'Brave', 'Quiet', 'Clever', 'Sunny', 'Misty', 'Lucky', 'Bold', 'Gentle', 'Mighty', 'Zippy', 'Calm', 'Curious', 'Happy', 'Sneaky', 'Speedy', 'Wise', 'Jolly', 'Bright', 'Cozy'];
const NOUN = ['Robin', 'Fox', 'Otter', 'Moose', 'Loon', 'Owl', 'Fern', 'Pine', 'Maple', 'Beetle', 'Badger', 'Heron', 'Wolf', 'Lynx', 'Chickadee', 'Turtle', 'Birch', 'Acorn', 'Chipmunk', 'Toad'];
export function makeNickname(rand: () => number = Math.random): string {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  return `${pick(ADJ)} ${pick(NOUN)} ${10 + Math.floor(rand() * 90)}`;
}

/** A small, stable shuffle key, so each student sees ideas in their own mixed-up order (brief 6). */
export function shuffleKey(seed: string, id: number): number {
  let h = 2166136261;
  const s = `${seed}:${id}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'board';
}
