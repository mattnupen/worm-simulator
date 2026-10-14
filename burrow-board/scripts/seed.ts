/**
 * Fills a local board with made-up sample ideas, so Burrow Board can be tried before any student
 * uses it: `npm run seed`, then `npm run dev` (or `npm start` after a build). Every sample login's password is "sample".
 * Never run it on the real site: it adds a board called "Sample · Predators".
 * The sample ideas and sketches come from the prototype; the facts are copied word for word from
 * the game's Predators lesson (src/content/lessons/predators.ts) with their sources.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openDb, setSetting } from '../server/db.ts';
import { hashPassword } from '../server/accounts.ts';
import { DEFAULT_TWISTS } from '../shared/model.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const db = openDb(join(process.env.DATA_DIR ?? join(here, '..', 'data'), 'board.db'));
const slug = 'sample';
db.prepare('DELETE FROM boards WHERE slug = ?').run(slug);

const S = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200" fill="#fff"/><g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="4">${inner}</g></svg>`;
const soil = '<path d="M0 120 C60 112 120 126 180 118 S260 114 300 120" stroke="#7a4a21"/><path d="M0 120 L0 200 L300 200 L300 120" fill="#f3e3cc" stroke="none"/>';
const worm = (x: number, y: number, c = '#e0457b') => `<path d="M${x} ${y} q12 -10 24 0 t24 0 t24 0" stroke="${c}" stroke-width="9"/>`;
const label = (x: number, y: number, t: string, c = '#1d2330', s = 18) => `<text x="${x}" y="${y}" font-family="Comic Sans MS, cursive" font-size="${s}" fill="${c}" stroke="none">${t}</text>`;
const SK: Record<string, string> = {
  shadow: S(`<circle cx="260" cy="34" r="18" stroke="#f79009"/>${soil}<path d="M90 40 q20 -18 40 0 q20 -18 40 0" stroke="#1d2330"/><ellipse cx="130" cy="122" rx="40" ry="7" fill="#1d2330" stroke="none" opacity=".35"/>${worm(100, 160)}${label(18, 30, '2 sec!', '#1d2330', 20)}`),
  night: S(`<rect width="300" height="120" fill="#1e2a4a" stroke="none"/><circle cx="240" cy="40" r="20" fill="#fef3c7" stroke="none"/><circle cx="250" cy="34" r="18" fill="#1e2a4a" stroke="none"/>${soil}${worm(80, 160)}<ellipse cx="220" cy="165" rx="26" ry="14" fill="#5b4636" stroke="#3b2a1e"/>${label(200, 196, 'mole', '#1d2330', 16)}`),
  cloud: S(`<path d="M40 60 a20 20 0 0 1 36 -12 a24 24 0 0 1 44 6 a16 16 0 0 1 2 32 h-80 a14 14 0 0 1 -2 -26z" stroke="#667085" fill="#eef2f6"/><path d="M200 50 q16 -14 32 0 q16 -14 32 0" stroke="#1d2330"/>${soil}${label(140, 104, '?', '#d92d20', 34)}${worm(110, 165)}`),
  woodcock: S(`${soil}<ellipse cx="90" cy="80" rx="42" ry="26" fill="#c08a5a" stroke="#7a4a21"/><circle cx="112" cy="64" r="16" fill="#c08a5a" stroke="#7a4a21"/><circle cx="118" cy="60" r="3" fill="#1d2330" stroke="none"/><path d="M126 68 L200 150" stroke="#1d2330" stroke-width="5"/>${worm(196, 168)}${label(180, 40, 'feel the poke')}`),
  deep: S(`${soil}<path d="M0 160 H300" stroke="#c9a77d" stroke-dasharray="6 8"/><path d="M40 120 V196" stroke="#1d2330" stroke-width="3"/><path d="M150 40 L176 130" stroke="#1d2330" stroke-width="5"/>${worm(160, 182, '#16a34a')}${label(200, 60, 'SAFE!', '#16a34a')}`),
  mole: S(`${soil}<ellipse cx="200" cy="152" rx="34" ry="18" fill="#5b4636" stroke="#3b2a1e"/>${worm(60, 160)}${worm(90, 178)}${label(20, 40, 'mole pantry')}${label(20, 64, 'ESCAPE →')}`),
  split: S(`${worm(60, 100)}<path d="M150 70 l-10 60" stroke="#667085" stroke-dasharray="6 6"/>${worm(160, 100)}${label(60, 170, '2 worms??', '#1d2330', 22)}`),
  log: S(`${soil}<rect x="60" y="88" width="180" height="34" rx="16" fill="#a16207" stroke="#713f12"/><path d="M80 140 q20 -6 40 0 q20 6 40 0" stroke="#f79009" stroke-width="10"/>${worm(200, 170)}${label(40, 50, 'wet = good AND bad')}`),
};

const facts = [
  { id: 'predators:2.reveal.0', text: 'Robins often find worms by standing still and staring at the ground with their head tipped to one side.', sourceId: 'allaboutbirds-robin', sourceTitle: 'American Robin Life History (Cornell Lab of Ornithology, All About Birds)', url: 'https://www.allaboutbirds.org/guide/American_Robin/lifehistory' },
  { id: 'predators:3.reveal.1', text: 'A woodcock pushes its long bill into the soil. The bill can feel a worm moving underground.', sourceId: 'mndnr-woodcock', sourceTitle: 'American Woodcock (Minnesota DNR)', url: 'https://dnr.state.mn.us/birds/woodcock.html' },
  { id: 'predators:sample-nightcrawler', text: 'When a nightcrawler is disturbed, it pulls back down into its burrow very fast.', sourceId: 'csu-nightcrawlers', sourceTitle: 'Nightcrawlers (Colorado State University, Arthropods of Colorado)', url: 'https://webdoc.agsci.colostate.edu/bspm/arthropodsofcolorado/Nightcrawlers.pdf' },
  { id: 'predators:sample-salamander', text: 'Red-backed salamanders eat spiders, insects, snails, earthworms and other small animals.', sourceId: 'adw-red-backed-salamander', sourceTitle: 'Plethodon cinereus (Eastern Red-backed Salamander) (Animal Diversity Web, University of Michigan)', url: 'https://animaldiversity.org/accounts/Plethodon_cinereus/' },
];
const choices = [
  { id: 'birds', name: 'Birds', hint: 'robins, woodcocks…' },
  { id: 'mammals', name: 'Mammals', hint: 'moles, shrews…' },
  { id: 'amphibians', name: 'Amphibians', hint: 'salamanders, toads…' },
  { id: 'bugs', name: 'Insects and bugs', hint: 'beetles…' },
];
const now = Date.now();
db.prepare('INSERT INTO boards (slug, title, topic, question, choices, facts, twists, phase, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
  slug, 'Sample · Predators', 'Predators', 'Which predator is your idea about?', JSON.stringify(choices), JSON.stringify(facts), JSON.stringify(DEFAULT_TWISTS), 'open', now,
);
setSetting(db, 'periods', '[1,3,5]');
setSetting(db, 'current', slug);

const people = { a: [1, 'swiftfox21'], b: [3, 'calmheron47'], c: [5, 'luckyloon63'], d: [1, 'boldbirch18'], e: [5, 'zippyotter85'], f: [3, 'quietowl32'] } as const;
type P = keyof typeof people;
// Sample logins: the six who wrote the sample ideas, and three that haven't posted (tester1, 3, 5).
const pass = hashPassword('sample');
const login = db.prepare('INSERT OR REPLACE INTO students (id, username, pass_hash, nickname, period, created) VALUES (?, ?, ?, ?, ?, ?)');
for (const [p, [period, user]] of Object.entries(people)) login.run(`sample-${p}`, user, pass, '', period, Date.now());
for (const period of [1, 3, 5]) login.run(`sample-t${period}`, `tester${period}`, pass, '', period, Date.now());
db.prepare("UPDATE students SET nickname = 'Robin Fan' WHERE id = 'sample-a'").run();
const img = (k?: string) => {
  if (!k) return null;
  const id = randomBytes(12).toString('hex');
  db.prepare('INSERT INTO images (id, board, mime, data, created) VALUES (?, ?, ?, ?, ?)').run(id, slug, 'image/svg+xml', Buffer.from(SK[k]), now);
  return id;
};
const ids: Record<string, number> = {};
const add = (key: string, parent: string | null, p: P, choice: string, title: string, does: string, extra: { notice?: string; changed?: string; sk?: string; mins: number; fact?: string; status?: string; note?: string; other?: string }) => {
  const [period, nick] = people[p];
  const t = now - extra.mins * 60000;
  const r = db.prepare(`INSERT INTO cards (board, parent_id, kind, author, period, nickname, choice, choice_other, fact_ref, title, does, notice, changed, image_id, status, status_note, created, updated)
    VALUES (?, ?, 'idea', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    slug, parent ? ids[parent] : null, `sample-${p}`, period, nick, choice, extra.other ?? '', extra.fact ?? '', title, does, extra.notice ?? '', extra.changed ?? '', img(extra.sk), extra.status ?? null, extra.note ?? '', t, t,
  );
  ids[key] = Number(r.lastInsertRowid);
};
add('shadow', null, 'a', 'birds', 'Robin shadow warning', 'When a robin flies over, its shadow hits the ground first. If you see it you have 2 seconds to dig down.', { notice: 'The screen gets a little darker for a moment.', sk: 'shadow', mins: 300, fact: facts[0].id });
add('night', 'shadow', 'b', 'birds', 'Night mode', 'At night there are no robin shadows, so birds are less of a problem. But other hunters are out.', { changed: 'I made it happen at night.', sk: 'night', mins: 220 });
add('cloud', 'shadow', 'c', 'birds', 'Cloud or bird?', 'Clouds make shadows too. Sometimes it is just a cloud and you dug for nothing.', { changed: 'Clouds trick you.', notice: 'Clouds are slow, birds are fast.', sk: 'cloud', mins: 90 });
add('woodcock', null, 'a', 'birds', 'Woodcock probe attack', 'A woodcock pokes its long bill into the soil. You feel the poke and have to wriggle sideways, not up.', { notice: 'The controller or screen shakes a little.', sk: 'woodcock', mins: 260, fact: facts[1].id, status: 'spot' });
add('deep', 'woodcock', 'f', 'birds', 'Too deep for the bill', 'If you are deeper than the bill is long, you are safe. Show a depth meter so you know.', { changed: 'I added a depth meter.', sk: 'deep', mins: 160 });
add('mole', null, 'e', 'mammals', 'Mole pantry escape', 'A mole catches you and keeps you in its tunnel. You have to escape before it comes back.', { sk: 'mole', mins: 200, fact: 'game' });
add('pantry', 'mole', 'd', 'mammals', 'Pantry friends', 'Other worms are stuck too. If you escape you can lead them out.', { changed: 'You can save other worms.', mins: 60 });
add('split', null, 'd', 'other', 'Split in two to escape', 'If a bird bites you in half, both halves turn into new worms and keep playing.', { sk: 'split', mins: 180, status: 'myth', other: 'Any predator' });
add('log', null, 'f', 'amphibians', 'Salamander under the log', 'Under logs it is wet and good for worms, but salamanders hide there too. A risky shortcut.', { sk: 'log', mins: 45, fact: facts[3].id });
add('beetle', null, 'c', 'bugs', 'Beetle chase', 'A ground beetle chases you through the leaf litter. You are faster underground than on top.', { mins: 20 });
add('fish', null, 'e', 'other', 'Trout at the creek', 'If you wash into the creek after rain, a fish might be waiting.', { mins: 25, other: 'Fish' });
add('fish2', null, 'b', 'other', 'Flood to the river', 'Big rain pushes you toward the river and the fish.', { mins: 15, other: 'fish' });
db.prepare("INSERT INTO notes (card_id, author, period, nickname, text, created) VALUES (?, 'sample-d', 1, 'Bold Birch 18', 'What if it only works in the daytime?', ?)").run(ids.shadow, now);
db.prepare("INSERT INTO notes (card_id, author, period, nickname, text, created) VALUES (?, 'teacher', NULL, 'Teacher', 'Great myth to check in the next lesson. Is it true?', ?)").run(ids.split, now);
console.log('Sample board ready at /burrow/sample. Logins tester1, tester3 and tester5 (password "sample") haven\'t posted yet.');
