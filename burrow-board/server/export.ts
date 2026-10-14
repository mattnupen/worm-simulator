import type { DatabaseSync } from 'node:sqlite';
import {
  OTHER_AREA, STATUS_LABELS, answerName, areaOfCards, boardAreas, type Board, type Card,
} from '../shared/model.ts';
import { cardFromRow, type Row } from './rows.ts';
import { zip } from './zip.ts';

/**
 * "Export for Claude" (brief section 6): the whole board as a zip with
 * - board.md: every area, then every idea with the ideas dug from it indented under it;
 * - board.json: the same data for scripts;
 * - images/: each card's picture, named by card number.
 * It holds login usernames and class periods only, never anything that names a student (framework P14).
 */
export function exportBoard(db: DatabaseSync, board: Board): Buffer {
  // Usernames only, never the nicknames the teacher may set: Claude gets de-identified data (P14).
  const cards = (db.prepare('SELECT c.*, COALESCE(s.username, c.nickname) AS display FROM cards c LEFT JOIN students s ON s.id = c.author WHERE c.board = ? ORDER BY c.id').all(board.slug) as Row[]).map((r) => cardFromRow(r, null));
  const notes = db.prepare('SELECT n.card_id, n.period, n.nickname, n.text, n.hidden FROM notes n JOIN cards c ON c.id = n.card_id WHERE c.board = ? ORDER BY n.id').all(board.slug) as Row[];
  const images = new Map<string, { mime: string; data: Uint8Array }>();
  for (const c of cards) {
    if (!c.imageId) continue;
    const im = db.prepare('SELECT mime, data FROM images WHERE id = ?').get(c.imageId) as Row | undefined;
    if (im) images.set(c.imageId, { mime: String(im.mime), data: im.data as Uint8Array });
  }
  const ext = (mime: string) => (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/svg+xml' ? 'svg' : 'jpg');
  const imageName = (c: Card) => (c.imageId && images.has(c.imageId) ? `images/card-${c.id}.${ext(images.get(c.imageId)!.mime)}` : null);

  const roots = cards.filter((c) => c.parentId == null || !cards.some((p) => p.id === c.parentId));
  const areas = [...boardAreas(board, roots), OTHER_AREA];
  const areaOf = areaOfCards(cards, areas);
  const kids = (id: number) => cards.filter((c) => c.parentId === id);
  const fact = (c: Card) => (c.factRef === 'game' ? 'Game choice' : board.facts.find((f) => f.id === c.factRef)?.text ?? '');
  const who = (c: Card) => (c.kind === 'example' ? 'Teacher example' : c.period == null ? 'Teacher' : `Period ${c.period}, ${c.nickname}`);

  const lines: string[] = [
    `# ${board.title}`,
    '',
    `Topic: ${board.topic}. First question: "${board.question}". Phase: ${board.phase}.`,
    `${cards.length} cards, ${notes.length} "I'd add…" notes. Exported ${new Date().toISOString().slice(0, 10)}.`,
    'Students are shown by class period and login username only, never by name.',
    '',
  ];
  const write = (c: Card, depth: number) => {
    const pad = '  '.repeat(depth);
    const tags = [
      who(c),
      c.status ? `${STATUS_LABELS[c.status]}${c.statusNote ? ` (${c.statusNote})` : ''}` : '',
      c.hidden ? 'HIDDEN by teacher' : '',
    ].filter(Boolean).join(' · ');
    lines.push(`${pad}- **${c.title}** (#${c.id}; ${tags})`);
    if (depth === 0) lines.push(`${pad}  - Answer: ${answerName(board, c)}`);
    if (c.changed) lines.push(`${pad}  - What they changed: ${c.changed}`);
    if (c.twist) lines.push(`${pad}  - Twist: ${c.twist}`);
    if (fact(c)) lines.push(`${pad}  - Based on: ${fact(c)}`);
    if (c.does) lines.push(`${pad}  - What the player does: ${c.does}`);
    if (c.notice) lines.push(`${pad}  - How a player would notice: ${c.notice}`);
    const img = imageName(c);
    if (img) lines.push(`${pad}  - Picture: ${img}`);
    for (const n of notes.filter((n) => Number(n.card_id) === c.id))
      lines.push(`${pad}  - I'd add (${n.period == null ? 'Teacher' : `Period ${n.period}`}${n.hidden ? ', hidden' : ''}): ${n.text}`);
    for (const k of kids(c.id)) write(k, depth + 1);
  };
  for (const a of areas) {
    const rs = roots.filter((r) => areaOf.get(r.id) === a.id);
    if (!rs.length) continue;
    lines.push(`## ${a.name}`, '');
    for (const r of rs) write(r, 0);
    lines.push('');
  }
  if (board.facts.length) {
    lines.push('## Fact cards from the lesson', '');
    for (const f of board.facts) lines.push(`- ${f.text} (Source: ${f.sourceTitle}${f.url ? `, ${f.url}` : ''})`);
    lines.push('');
  }

  const json = {
    board: { ...board, rev: undefined },
    areas,
    cards: cards.map((c) => ({ ...c, mine: undefined, area: areaOf.get(c.id), image: imageName(c) })),
    notes: notes.map((n) => ({ cardId: Number(n.card_id), period: n.period, nickname: n.nickname, text: n.text, hidden: !!n.hidden })),
  };
  const enc = new TextEncoder();
  return zip([
    { name: 'board.md', data: enc.encode(lines.join('\n')) },
    { name: 'board.json', data: enc.encode(JSON.stringify(json, null, 2)) },
    ...cards.filter((c) => imageName(c)).map((c) => ({ name: imageName(c)!, data: images.get(c.imageId!)!.data })),
  ]);
}
