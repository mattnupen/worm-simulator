import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import {
  DEFAULT_TWISTS, LIMITS, PHASES, STATUS_LABELS, slugify,
  type Board, type BoardState, type Card, type CardInput, type CardKind, type Me, type Note, type Student,
} from '../shared/model.ts';
import { getSetting, setSetting, wipe } from './db.ts';
import { checkPassword, hashPassword, makePassword, makeUsername } from './accounts.ts';
import { exportBoard } from './export.ts';
import { boardFromRow, cardFromRow, noteFromRow, type Row } from './rows.ts';

export interface AppOptions {
  db: DatabaseSync;
  /** From the TEACHER_PASSWORD environment variable. Empty: the teacher view can't be opened. */
  teacherPassword: string;
  /** True on Render (HTTPS): cookies are marked Secure. */
  secure: boolean;
  /**
   * Other sites allowed to send changes, such as "https://wormsimulator.com", which passes
   * wormsimulator.com/burrow/… through to this service (render.yaml). From PUBLIC_ORIGINS.
   */
  publicOrigins?: string[];
  /** Where the board lives on wormsimulator.com: "/burrow". Requests may come with or without it. */
  basePath?: string;
  /** The built page (dist/). Absent in tests. */
  staticDir?: string;
  now?: () => number;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const STUDENT_COOKIE = 'bb_s';
/** Paths a board's link name can't take, because the page or server uses them. */
const RESERVED = new Set(['teacher', 'api', 'assets', 'index-html']);
const TEACHER_COOKIE = 'bb_t';
const TEACHER = 'teacher';

// The page loads nothing from other sites: no fonts, scripts or trackers (framework P14).
const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

/** The name shown for an author: their teacher-set nickname, else their username, else the saved name. */
const DISPLAY = (t: string) => `COALESCE(NULLIF(s.nickname, ''), s.username, ${t}.nickname)`;
const CARD_SELECT = `SELECT c.*, ${DISPLAY('c')} AS display FROM cards c LEFT JOIN students s ON s.id = c.author`;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(24).toString('base64url');

function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Only these picture types are kept, checked by their first bytes (not by what the page claims). */
function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const str = (v: unknown, max: number, field: string): string => {
  if (v == null) return '';
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`);
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `${field} is too long (${max} letters at most).`);
  return s;
};

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const now = opts.now ?? Date.now;
  const studentTries = new Map<string, { n: number; t: number }>();
  const loginTries = new Map<string, { n: number; t: number }>();

  const periods = (): number[] => JSON.parse(getSetting(db, 'periods', '[1,2,3,4,5,6]')) as number[];

  function throttle(map: Map<string, { n: number; t: number }>, key: string, max: number) {
    const t = now();
    const e = map.get(key);
    if (!e || t - e.t > 60_000) { map.set(key, { n: 1, t }); return; }
    if (++e.n > max) throw new HttpError(429, 'Too many tries. Wait a minute and try again.');
  }

  function who(req: IncomingMessage) {
    const c = parseCookies(req);
    let teacher = false;
    if (c[TEACHER_COOKIE]) {
      const row = db.prepare('SELECT created FROM teacher_sessions WHERE token_hash = ?').get(sha(c[TEACHER_COOKIE])) as Row | undefined;
      teacher = !!row && now() - Number(row.created) < 12 * 3600_000;
    }
    let student: { id: string; name: string; username: string; period: number } | null = null;
    if (c[STUDENT_COOKIE]) {
      const row = db.prepare('SELECT s.id, s.username, s.nickname, s.period FROM student_sessions x JOIN students s ON s.id = x.student_id WHERE x.token_hash = ?')
        .get(sha(c[STUDENT_COOKIE])) as Row | undefined;
      if (row) student = { id: String(row.id), name: String(row.nickname) || String(row.username), username: String(row.username), period: Number(row.period) };
    }
    return { teacher, student, viewer: teacher ? TEACHER : student?.id ?? null };
  }
  type Who = ReturnType<typeof who>;

  const needTeacher = (w: Who) => { if (!w.teacher) throw new HttpError(403, 'Only the teacher can do that.'); };
  const needSomeone = (w: Who) => { if (!w.teacher && !w.student) throw new HttpError(401, 'Sign in with your username and password first.'); };

  function getBoard(slug: string): Board {
    const r = db.prepare('SELECT * FROM boards WHERE slug = ?').get(slug) as Row | undefined;
    if (!r) throw new HttpError(404, 'That board does not exist.');
    return boardFromRow(r);
  }
  const bump = (slug: string) => db.prepare('UPDATE boards SET rev = rev + 1 WHERE slug = ?').run(slug);

  /** The board as this viewer may see it (think first, hidden cards, phases). */
  function boardState(board: Board, w: Who): BoardState {
    if (!w.teacher && board.phase === 'setup') throw new HttpError(404, 'This board is not open yet.');
    const rows = db.prepare(`${CARD_SELECT} WHERE c.board = ? ORDER BY c.id`).all(board.slug) as Row[];
    let cards = rows.map((r) => cardFromRow(r, w.viewer));
    const posted = cards.some((c) => c.mine && c.kind === 'idea' && c.parentId == null);
    let gated = false;
    if (!w.teacher) {
      if (board.phase === 'think') cards = cards.filter((c) => c.mine);
      else if (board.phase === 'open' && !posted) { gated = true; cards = []; }
      else cards = cards.filter((c) => !c.hidden || c.mine);
    }
    const ids = new Set(cards.map((c) => c.id));
    const notes = cards.length
      ? (db.prepare(`SELECT n.*, ${DISPLAY('n')} AS display FROM notes n JOIN cards c ON c.id = n.card_id LEFT JOIN students s ON s.id = n.author WHERE c.board = ? ORDER BY n.id`).all(board.slug) as Row[])
        .map((r) => noteFromRow(r, w.viewer))
        .filter((n) => ids.has(n.cardId) && (w.teacher || !n.hidden || n.mine))
      : [];
    const canPost = w.teacher ? board.phase !== 'closed' : board.phase === 'think' || board.phase === 'open';
    return { board, cards, notes, gated, canPost };
  }

  function saveImage(slug: string, dataUrl: string): string {
    const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) throw new HttpError(400, 'That picture could not be read. Try a JPG or PNG.');
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length > LIMITS.image) throw new HttpError(413, 'That picture is too big.');
    const mime = sniffImage(buf);
    if (!mime) throw new HttpError(400, 'That picture could not be read. Try a JPG or PNG.');
    const id = randomBytes(12).toString('hex');
    db.prepare('INSERT INTO images (id, board, mime, data, created) VALUES (?, ?, ?, ?, ?)').run(id, slug, mime, buf, now());
    return id;
  }

  function cleanCardFields(board: Board, input: CardInput, isRoot: boolean) {
    const out: Record<string, string> = {};
    if (input.title !== undefined) out.title = str(input.title, LIMITS.title, 'The title');
    if (input.does !== undefined) out.does = str(input.does, LIMITS.does, '"What does the player do?"');
    if (input.notice !== undefined) out.notice = str(input.notice, LIMITS.notice, '"How would a player notice it?"');
    if (input.changed !== undefined) out.changed = str(input.changed, LIMITS.changed, '"What did you change?"');
    if (input.twist !== undefined) out.twist = str(input.twist, 80, 'The twist');
    if (input.factRef !== undefined) {
      const f = str(input.factRef, 60, 'The fact');
      if (f && f !== 'game' && !board.facts.some((x) => x.id === f)) throw new HttpError(400, 'Pick one of the facts.');
      out.fact_ref = f;
    }
    if (isRoot && input.choice !== undefined) {
      const c = str(input.choice, 60, 'The group');
      if (c !== 'other' && !board.choices.some((x) => x.id === c)) throw new HttpError(400, 'Pick a group for your idea.');
      out.choice = c;
      out.choice_other = c === 'other' ? str(input.choiceOther, LIMITS.choiceOther, '"Something else"') : '';
      if (c === 'other' && !out.choice_other) throw new HttpError(400, 'Write what your idea is about.');
    }
    return out;
  }

  function createCard(slug: string, w: Who, input: CardInput): Card {
    needSomeone(w);
    const board = getBoard(slug);
    const state = boardState(board, w);
    if (!state.canPost) throw new HttpError(403, board.phase === 'closed' ? 'This board is closed.' : 'This board is not open yet.');
    let parent: Card | undefined;
    if (input.parentId != null) {
      parent = state.cards.find((c) => c.id === input.parentId);
      if (!parent) throw new HttpError(404, 'The idea you dug from is gone.');
    }
    if (!w.teacher) {
      const n = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE board = ? AND author = ?').get(slug, w.viewer) as Row;
      if (Number(n.n) >= LIMITS.cardsPerStudent) throw new HttpError(429, 'You have posted a lot of ideas! Dig into one you already have.');
    }
    const f = cleanCardFields(board, input, !parent);
    if (!f.title) throw new HttpError(400, 'Give your idea a short title.');
    if (!parent && f.choice === undefined) throw new HttpError(400, 'Pick a group for your idea.');
    const kind: CardKind = w.teacher && input.kind === 'example' ? 'example' : 'idea';
    const imageId = typeof input.image === 'string' && input.image ? saveImage(slug, input.image) : null;
    const t = now();
    const r = db.prepare(`INSERT INTO cards (board, parent_id, kind, author, period, nickname, choice, choice_other, fact_ref, title, does, notice, changed, twist, image_id, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      slug, parent?.id ?? null, kind, w.viewer!, w.teacher ? null : w.student!.period, w.teacher ? 'Teacher' : w.student!.username,
      // A dig keeps its idea's answer, so it stays in the same area even if the idea is later hidden.
      parent ? parent.choice : f.choice, parent ? parent.choiceOther : f.choice_other ?? '',
      f.fact_ref ?? '', f.title, f.does ?? '', f.notice ?? '', f.changed ?? '', f.twist ?? '', imageId, t, t,
    );
    bump(slug);
    return cardFromRow(loadCard(Number(r.lastInsertRowid)), w.viewer);
  }

  function loadCard(id: number) {
    const r = db.prepare(`${CARD_SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
    if (!r) throw new HttpError(404, 'That idea is gone.');
    return r;
  }

  function updateCard(id: number, w: Who, input: CardInput): Card {
    needSomeone(w);
    const r = loadCard(id);
    const board = getBoard(String(r.board));
    const own = r.author === w.viewer;
    if (!w.teacher) {
      if (!own) throw new HttpError(403, 'Only the person who made an idea can change it. Dig from it instead!');
      if (board.phase === 'closed') throw new HttpError(403, 'This board is closed.');
      for (const k of ['status', 'statusNote', 'hidden', 'areaOverride', 'kind'] as const)
        if (input[k] !== undefined) throw new HttpError(403, 'Only the teacher can do that.');
    }
    const set: Record<string, unknown> = cleanCardFields(board, input, r.parent_id == null);
    if (set.title === '') throw new HttpError(400, 'Give your idea a short title.');
    if (input.x !== undefined || input.y !== undefined) {
      const num = (v: unknown) => (v == null ? null : Number.isFinite(v) ? Math.max(-1e5, Math.min(1e5, Number(v))) : null);
      set.x = num(input.x);
      set.y = num(input.y);
    }
    if (input.image !== undefined) set.image_id = input.image ? saveImage(board.slug, input.image) : null;
    if (w.teacher) {
      if (input.status !== undefined) {
        if (input.status !== null && !(input.status in STATUS_LABELS)) throw new HttpError(400, 'Unknown status.');
        set.status = input.status;
      }
      if (input.statusNote !== undefined) set.status_note = str(input.statusNote, 120, 'The status note');
      if (input.hidden !== undefined) set.hidden = input.hidden ? 1 : 0;
      if ((input.kind === 'idea' || input.kind === 'example') && r.kind !== 'earlier' && r.author === TEACHER) set.kind = input.kind;
      if (input.areaOverride !== undefined) set.area_override = input.areaOverride ? str(input.areaOverride, 80, 'The area') : null;
    }
    const keys = Object.keys(set);
    if (keys.length) {
      const touchesText = keys.some((k) => !['x', 'y'].includes(k));
      db.prepare(`UPDATE cards SET ${keys.map((k) => `${k} = ?`).join(', ')}${touchesText ? ', updated = ?' : ''} WHERE id = ?`)
        .run(...(keys.map((k) => set[k]) as (string | number | null)[]), ...(touchesText ? [now()] : []), id);
      if (r.image_id && set.image_id !== undefined && set.image_id !== r.image_id) db.prepare('DELETE FROM images WHERE id = ?').run(String(r.image_id));
      bump(board.slug);
    }
    return cardFromRow(loadCard(id), w.viewer);
  }

  function deleteCard(id: number, w: Who) {
    needSomeone(w);
    const r = loadCard(id);
    const board = getBoard(String(r.board));
    if (!w.teacher) {
      if (r.author !== w.viewer) throw new HttpError(403, 'Only the person who made an idea can delete it.');
      if (board.phase === 'closed') throw new HttpError(403, 'This board is closed.');
      const kids = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE parent_id = ?').get(id) as Row;
      if (Number(kids.n)) throw new HttpError(403, 'Someone dug from this idea, so it stays. You can still change it.');
    }
    db.prepare('DELETE FROM cards WHERE id = ?').run(id);
    if (r.image_id) db.prepare('DELETE FROM images WHERE id = ?').run(String(r.image_id));
    bump(board.slug);
  }

  function addNote(cardId: number, w: Who, text: unknown): Note {
    needSomeone(w);
    const r = loadCard(cardId);
    const board = getBoard(String(r.board));
    const state = boardState(board, w);
    if (!state.cards.some((c) => c.id === cardId)) throw new HttpError(404, 'That idea is gone.');
    if (!w.teacher && board.phase !== 'open') throw new HttpError(403, 'You can add to ideas once the board opens.');
    const s = str(text, LIMITS.note, 'Your note');
    if (!s) throw new HttpError(400, 'Write something to add.');
    if (!w.teacher) {
      const n = db.prepare('SELECT COUNT(*) AS n FROM notes WHERE author = ?').get(w.viewer) as Row;
      if (Number(n.n) >= LIMITS.notesPerStudent) throw new HttpError(429, 'You have added lots of notes! Try a dig instead.');
    }
    const res = db.prepare('INSERT INTO notes (card_id, author, period, nickname, text, created) VALUES (?, ?, ?, ?, ?, ?)')
      .run(cardId, w.viewer!, w.teacher ? null : w.student!.period, w.teacher ? 'Teacher' : w.student!.username, s, now());
    bump(board.slug);
    return noteFromRow(db.prepare(`SELECT n.*, ${DISPLAY('n')} AS display FROM notes n LEFT JOIN students s ON s.id = n.author WHERE n.id = ?`).get(Number(res.lastInsertRowid)) as Row, w.viewer);
  }

  function boardFields(body: Row, partial: boolean): Record<string, string> {
    const out: Record<string, string> = {};
    const s = (k: string, max: number) => { if (body[k] !== undefined) out[k] = str(body[k], max, k); };
    s('title', 80); s('topic', 80); s('question', 120);
    if (body.choices !== undefined) {
      const cs = (Array.isArray(body.choices) ? body.choices : []).slice(0, 12).map((c: Row, i: number) => ({
        id: slugify(str(c.id ?? c.name, 40, 'choice') || `c${i}`),
        name: str(c.name, 40, 'A group name'),
        hint: str(c.hint, 60, 'A group hint') || undefined,
      })).filter((c) => c.name && c.id !== 'other');
      out.choices = JSON.stringify(cs);
    }
    if (body.facts !== undefined) {
      const fs = (Array.isArray(body.facts) ? body.facts : []).slice(0, 30).map((f: Row, i: number) => ({
        id: str(f.id, 60, 'fact id') || `f${i + 1}`,
        text: str(f.text, 300, 'A fact'),
        sourceId: str(f.sourceId, 60, 'source id') || undefined,
        sourceTitle: str(f.sourceTitle, 160, 'A source'),
        url: /^https:\/\//.test(String(f.url ?? '')) ? str(f.url, 300, 'A source link') : undefined,
      })).filter((f) => f.text);
      if (fs.some((f) => !f.sourceTitle)) throw new HttpError(400, 'Every fact needs its source (science honesty).');
      out.facts = JSON.stringify(fs);
    }
    if (body.twists !== undefined) out.twists = JSON.stringify((Array.isArray(body.twists) ? body.twists : []).slice(0, 12).map((t) => str(t, 80, 'A twist')).filter(Boolean));
    if (body.phase !== undefined) {
      if (!PHASES.some((p) => p.id === body.phase)) throw new HttpError(400, 'Unknown phase.');
      out.phase = String(body.phase);
    }
    if (body.areas !== undefined) {
      const as = (Array.isArray(body.areas) ? body.areas : []).slice(0, 30).map((a: Row) => ({
        id: str(a.id, 80, 'area id') || `a-${slugify(String(a.name))}`,
        name: str(a.name, 40, 'An area name'),
        keys: (Array.isArray(a.keys) ? a.keys : []).slice(0, 50).map((k) => str(k, 80, 'area key')),
      })).filter((a) => a.name && a.id !== 'other');
      out.areas = JSON.stringify(as);
    }
    if (!partial && !out.title) throw new HttpError(400, 'Give the board a title.');
    return out;
  }

  function importEarlier(slug: string, from: string) {
    const board = getBoard(slug);
    getBoard(from);
    const rows = db.prepare(`${CARD_SELECT} WHERE c.board = ? AND c.status = 'parked'`).all(from) as Row[];
    const t = now();
    for (const r of rows) {
      let img: string | null = null;
      if (r.image_id) {
        const im = db.prepare('SELECT * FROM images WHERE id = ?').get(String(r.image_id)) as Row | undefined;
        if (im) {
          img = randomBytes(12).toString('hex');
          db.prepare('INSERT INTO images (id, board, mime, data, created) VALUES (?, ?, ?, ?, ?)').run(img, board.slug, String(im.mime), im.data as Uint8Array, t);
        }
      }
      db.prepare(`INSERT INTO cards (board, kind, author, period, nickname, choice, choice_other, title, does, notice, image_id, status, status_note, created, updated)
        VALUES (?, 'earlier', ?, ?, ?, 'earlier', '', ?, ?, ?, ?, 'parked', ?, ?, ?)`).run(
        board.slug, TEACHER, r.period == null ? null : Number(r.period), String(r.nickname), String(r.title), String(r.does), String(r.notice), img, String(r.status_note), t, t,
      );
    }
    bump(slug);
    return rows.length;
  }

  // ---------------------------------------------------------------- routes

  async function readJson(req: IncomingMessage): Promise<Row> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 1_200_000) throw new HttpError(413, 'That is too big to save.');
      chunks.push(c as Buffer);
    }
    if (!size) return {};
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return v && typeof v === 'object' ? v : {};
    } catch {
      throw new HttpError(400, 'Bad request.');
    }
  }

  function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  }

  const base = (opts.basePath ?? '').replace(/\/+$/, '');
  const cookie = (name: string, value: string, maxAge: number) =>
    `${name}=${encodeURIComponent(value)}; Path=${base || '/'}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${opts.secure ? '; Secure' : ''}`;

  function me(w: Who): Me {
    const current = getSetting(db, 'current', '');
    let cur: string | null = null;
    if (current) {
      const b = db.prepare('SELECT phase FROM boards WHERE slug = ?').get(current) as Row | undefined;
      if (b && (w.teacher || b.phase !== 'setup')) cur = current;
    }
    return {
      student: w.student ? { name: w.student.name, username: w.student.username, period: w.student.period } : null,
      teacher: w.teacher,
      periods: periods(),
      current: cur,
    };
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string, url: URL) {
    const m = req.method ?? 'GET';
    const w = who(req);
    const seg = path.split('/').filter(Boolean).slice(1); // after "api"
    const body = m === 'POST' || m === 'PATCH' || m === 'PUT' ? await readJson(req) : {};
    const ip = req.socket.remoteAddress ?? '';

    if (seg[0] === 'health') return send(res, 200, { ok: true });
    if (seg[0] === 'me' && m === 'GET') return send(res, 200, me(w));

    if (seg[0] === 'login' && m === 'POST') {
      const username = String(body.username ?? '').trim().toLowerCase();
      throttle(studentTries, ip, 12);
      throttle(studentTries, `u:${username}`, 8);
      const row = db.prepare('SELECT id, pass_hash FROM students WHERE username = ?').get(username) as Row | undefined;
      if (!row || !checkPassword(String(body.password ?? '').trim().toLowerCase(), String(row.pass_hash)))
        throw new HttpError(403, 'That username and password don\'t match. Check your login card.');
      const t = token();
      db.prepare('INSERT INTO student_sessions (token_hash, student_id, created) VALUES (?, ?, ?)').run(sha(t), String(row.id), now());
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(STUDENT_COOKIE, t, 180 * 86400) });
    }
    if (seg[0] === 'logout' && m === 'POST') {
      const c = parseCookies(req)[STUDENT_COOKIE];
      if (c) db.prepare('DELETE FROM student_sessions WHERE token_hash = ?').run(sha(c));
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(STUDENT_COOKIE, '', 0) });
    }

    if (seg[0] === 'students') {
      needTeacher(w);
      const list = (): Student[] => (db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM cards c WHERE c.author = s.id) AS n FROM students s ORDER BY s.period, s.username`).all() as Row[])
        .map((r) => ({ id: String(r.id), username: String(r.username), nickname: String(r.nickname), period: Number(r.period), cards: Number(r.n), created: Number(r.created) }));
      if (!seg[1] && m === 'GET') return send(res, 200, list());
      // Makes `count` new logins for a period. The passwords are sent back this once, for the CSV.
      if (seg[1] === 'generate' && m === 'POST') {
        const period = Number(body.period), count = Number(body.count);
        if (!periods().includes(period)) throw new HttpError(400, 'Pick one of your class periods.');
        if (!Number.isInteger(count) || count < 1 || count > 60) throw new HttpError(400, 'Make between 1 and 60 logins at a time.');
        const taken = new Set((db.prepare('SELECT username FROM students').all() as Row[]).map((r) => String(r.username)));
        const made = [];
        const ins = db.prepare('INSERT INTO students (id, username, pass_hash, period, created) VALUES (?, ?, ?, ?, ?)');
        for (let i = 0; i < count; i++) {
          const username = makeUsername(taken), password = makePassword();
          ins.run(randomBytes(9).toString('hex'), username, hashPassword(password), period, now());
          made.push({ username, password, period });
        }
        return send(res, 201, made);
      }
      if (seg[1] === 'reset' && m === 'POST') {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(String);
        const out = [];
        for (const id of ids) {
          const r = db.prepare('SELECT username, period FROM students WHERE id = ?').get(id) as Row | undefined;
          if (!r) continue;
          const password = makePassword();
          db.prepare('UPDATE students SET pass_hash = ? WHERE id = ?').run(hashPassword(password), id);
          db.prepare('DELETE FROM student_sessions WHERE student_id = ?').run(id);
          out.push({ username: String(r.username), password, period: Number(r.period) });
        }
        return send(res, 200, out);
      }
      if (seg[1]) {
        const r = db.prepare('SELECT id FROM students WHERE id = ?').get(seg[1]) as Row | undefined;
        if (!r) throw new HttpError(404, 'That login is gone.');
        if (m === 'PATCH') {
          if (body.nickname !== undefined) db.prepare('UPDATE students SET nickname = ? WHERE id = ?').run(str(body.nickname, 30, 'The nickname'), seg[1]);
          if (body.period !== undefined) {
            if (!periods().includes(Number(body.period))) throw new HttpError(400, 'Pick one of your class periods.');
            db.prepare('UPDATE students SET period = ? WHERE id = ?').run(Number(body.period), seg[1]);
          }
          db.exec('UPDATE boards SET rev = rev + 1');
          return send(res, 200, list().find((x) => x.id === seg[1]));
        }
        if (m === 'DELETE') {
          // Their cards stay on the boards under their username; only the login goes.
          db.prepare('DELETE FROM students WHERE id = ?').run(seg[1]);
          return send(res, 200, { ok: true });
        }
      }
    }

    if (seg[0] === 'teacher' && seg[1] === 'login' && m === 'POST') {
      throttle(loginTries, ip, 8);
      if (!opts.teacherPassword) throw new HttpError(503, 'The teacher password isn\'t set up yet (TEACHER_PASSWORD on Render).');
      const a = Buffer.from(sha(String(body.password ?? '')));
      const b = Buffer.from(sha(opts.teacherPassword));
      if (!timingSafeEqual(a, b)) throw new HttpError(403, 'That password doesn\'t match.');
      const t = token();
      db.prepare('INSERT INTO teacher_sessions (token_hash, created) VALUES (?, ?)').run(sha(t), now());
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(TEACHER_COOKIE, t, 12 * 3600) });
    }
    if (seg[0] === 'teacher' && seg[1] === 'logout' && m === 'POST') {
      const c = parseCookies(req)[TEACHER_COOKIE];
      if (c) db.prepare('DELETE FROM teacher_sessions WHERE token_hash = ?').run(sha(c));
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(TEACHER_COOKIE, '', 0) });
    }

    if (seg[0] === 'settings') {
      needTeacher(w);
      if (m === 'PATCH') {
        if (body.periods !== undefined) {
          const ps = (Array.isArray(body.periods) ? body.periods : []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 20);
          if (!ps.length) throw new HttpError(400, 'Add at least one class period.');
          setSetting(db, 'periods', JSON.stringify([...new Set(ps)].sort((a, b) => a - b)));
        }
        if (body.current !== undefined) {
          if (body.current) getBoard(String(body.current));
          setSetting(db, 'current', body.current ? String(body.current) : '');
        }
      }
      return send(res, 200, { periods: periods(), current: getSetting(db, 'current', '') || null });
    }

    if (seg[0] === 'wipe' && m === 'POST') {
      needTeacher(w);
      if (body.confirm !== 'DELETE EVERYTHING') throw new HttpError(400, 'Type DELETE EVERYTHING to confirm.');
      wipe(db);
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(TEACHER_COOKIE, '', 0) });
    }

    if (seg[0] === 'boards' && !seg[1]) {
      needTeacher(w);
      if (m === 'POST') {
        const f = boardFields(body, false);
        // The board's link: wormsimulator.com/burrow/<slug>, such as "v4" for Round 4.
        const want = slugify(String(body.slug ?? '') || f.title);
        if (RESERVED.has(want)) throw new HttpError(400, `"${want}" can't be a board's link name. Try another.`);
        if (body.slug && db.prepare('SELECT 1 FROM boards WHERE slug = ?').get(want)) throw new HttpError(400, `There's already a board at /${want}.`);
        let slug = want;
        for (let i = 2; db.prepare('SELECT 1 FROM boards WHERE slug = ?').get(slug); i++) slug = `${want}-${i}`;
        db.prepare('INSERT INTO boards (slug, title, topic, question, choices, facts, twists, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          slug, f.title, f.topic ?? '', f.question ?? 'Which group is your idea about?', f.choices ?? '[]', f.facts ?? '[]',
          f.twists ?? JSON.stringify(DEFAULT_TWISTS), now(),
        );
        return send(res, 201, getBoard(slug));
      }
      const rows = db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM cards c WHERE c.board = b.slug) AS n FROM boards b ORDER BY created DESC`).all() as Row[];
      return send(res, 200, rows.map((r) => ({ ...boardFromRow(r), cardCount: Number(r.n) })));
    }

    if (seg[0] === 'boards' && seg[1]) {
      const slug = seg[1];
      if (!seg[2]) {
        needTeacher(w);
        if (m === 'PATCH') {
          getBoard(slug);
          const f = boardFields(body, true);
          const keys = Object.keys(f);
          if (keys.length) db.prepare(`UPDATE boards SET ${keys.map((k) => `${k} = ?`).join(', ')}, rev = rev + 1 WHERE slug = ?`).run(...keys.map((k) => f[k]), slug);
          return send(res, 200, getBoard(slug));
        }
        if (m === 'DELETE') {
          getBoard(slug);
          db.prepare('DELETE FROM boards WHERE slug = ?').run(slug);
          if (getSetting(db, 'current', '') === slug) setSetting(db, 'current', '');
          return send(res, 200, { ok: true });
        }
        return send(res, 200, getBoard(slug));
      }
      if (seg[2] === 'state' && m === 'GET') {
        needSomeone(w);
        const board = getBoard(slug);
        if (!w.teacher && board.phase === 'setup') throw new HttpError(404, 'This board is not open yet.');
        // Pages ask every few seconds; "rev" changes on every edit, so most answers are tiny.
        const key = `${board.rev}:${w.viewer}`;
        if (url.searchParams.get('since') === key) return send(res, 200, { unchanged: true, since: key });
        return send(res, 200, { ...boardState(board, w), since: key });
      }
      if (seg[2] === 'cards' && m === 'POST') return send(res, 201, createCard(slug, w, body as CardInput));
      if (seg[2] === 'import' && m === 'POST') { needTeacher(w); return send(res, 200, { imported: importEarlier(slug, String(body.from ?? '')) }); }
      if (seg[2] === 'export' && m === 'GET') {
        needTeacher(w);
        const board = getBoard(slug);
        const file = exportBoard(db, board);
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="burrow-board-${slug}.zip"`,
          'Cache-Control': 'no-store',
        });
        return res.end(file);
      }
    }

    if (seg[0] === 'cards' && seg[1]) {
      const id = Number(seg[1]);
      if (!seg[2] && m === 'PATCH') return send(res, 200, updateCard(id, w, body as CardInput));
      if (!seg[2] && m === 'DELETE') { deleteCard(id, w); return send(res, 200, { ok: true }); }
      if (seg[2] === 'notes' && m === 'POST') return send(res, 201, addNote(id, w, body.text));
    }

    if (seg[0] === 'notes' && seg[1]) {
      needTeacher(w);
      const id = Number(seg[1]);
      const r = db.prepare('SELECT c.board FROM notes n JOIN cards c ON c.id = n.card_id WHERE n.id = ?').get(id) as Row | undefined;
      if (!r) throw new HttpError(404, 'That note is gone.');
      if (m === 'PATCH') db.prepare('UPDATE notes SET hidden = ? WHERE id = ?').run(body.hidden ? 1 : 0, id);
      else if (m === 'DELETE') db.prepare('DELETE FROM notes WHERE id = ?').run(id);
      bump(String(r.board));
      return send(res, 200, { ok: true });
    }

    if (seg[0] === 'img' && seg[1] && m === 'GET') {
      needSomeone(w);
      const r = db.prepare('SELECT mime, data FROM images WHERE id = ?').get(seg[1]) as Row | undefined;
      if (!r) throw new HttpError(404, 'Not found.');
      res.writeHead(200, {
        'Content-Type': String(r.mime),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      return res.end(r.data as Uint8Array);
    }

    throw new HttpError(404, 'Not found.');
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
    const dir = opts.staticDir;
    if (!dir || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404); return res.end(); }
    let file = normalize(join(dir, decodeURIComponent(path)));
    if (!file.startsWith(normalize(dir)) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); return res.end('Build the page first: npm run build'); }
    const hashed = file.includes(`${normalize('/assets/')}`);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Content-Security-Policy': PAGE_CSP,
    });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const url = new URL(req.url ?? '/', 'http://board.local');
      let path = url.pathname;
      if (base && path === base) { res.writeHead(301, { Location: `${base}/` }); return res.end(); }
      if (base && path.startsWith(`${base}/`)) path = path.slice(base.length);
      if (path === '/api' || path.startsWith('/api/')) {
        // Changes must come from this site's own page (blocks other sites posting with a student's cookie).
        const origin = req.headers.origin;
        if (req.method !== 'GET' && origin && new URL(origin).host !== req.headers.host && !(opts.publicOrigins ?? []).includes(origin)) throw new HttpError(403, 'Not allowed.');
        await api(req, res, path, url);
      } else serveStatic(req, res, path);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: e instanceof HttpError ? e.message : 'Something went wrong. Try again.' });
      else res.end();
    }
  };
}
