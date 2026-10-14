import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { setSetting } from '../server/db.ts';
import type { BoardState, Card } from '../shared/model.ts';

// A tiny JPEG header is enough: the server checks a picture's first bytes, not the whole image.
const JPG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString('base64')}`;

let server: Server;
let base = '';

beforeAll(async () => {
  const db = openDb(':memory:');
  setSetting(db, 'class_code', 'TEST-1');
  setSetting(db, 'periods', '[1,3,5]');
  server = createServer(createApp({ db, teacherPassword: 'pw', secure: false }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

/** One browser: keeps its own cookie. */
function client() {
  let cookie = '';
  return async function call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, data: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : (text as T) };
  };
}

const teacher = client();
const amy = client();
const ben = client();
const late = client();

describe('Burrow Board server', () => {
  it('needs the class code and a real period to join', async () => {
    expect((await amy('POST', '/api/join', { code: 'nope', period: 1 })).status).toBe(403);
    expect((await amy('POST', '/api/join', { code: 'test-1', period: 2 })).status).toBe(400);
    const ok = await amy('POST', '/api/join', { code: 'test-1', period: 1 });
    expect(ok.status).toBe(200);
    expect(ok.data.nickname).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
    await ben('POST', '/api/join', { code: 'TEST-1', period: 3 });
    await late('POST', '/api/join', { code: 'TEST-1', period: 5 });
    expect((await amy('GET', '/api/me')).data.student.period).toBe(1);
  });

  it('keeps teacher tools behind the password', async () => {
    expect((await amy('POST', '/api/boards', { title: 'x' })).status).toBe(403);
    expect((await teacher('POST', '/api/teacher/login', { password: 'wrong' })).status).toBe(403);
    expect((await teacher('POST', '/api/teacher/login', { password: 'pw' })).status).toBe(200);
  });

  let slug = '';
  it('lets the teacher set up a round', async () => {
    const b = await teacher('POST', '/api/boards', {
      title: 'Round 4 · Predators', topic: 'Predators', question: 'Which predator is your idea about?',
      choices: [{ name: 'Birds' }, { name: 'Mammals' }],
      facts: [{ id: 'f1', text: 'Robins find worms by looking and listening.', sourceTitle: 'All About Birds', url: 'https://example.org' }],
    });
    expect(b.status).toBe(201);
    slug = b.data.slug;
    expect(slug).toBe('round-4-predators');
    expect(b.data.choices.map((c: { id: string }) => c.id)).toEqual(['birds', 'mammals']);
    // facts must carry a source
    expect((await teacher('PATCH', `/api/boards/${slug}`, { facts: [{ text: 'No source' }] })).status).toBe(400);
    // students can't see a board in setup
    expect((await amy('GET', `/api/boards/${slug}/state`)).status).toBe(404);
    await teacher('PATCH', `/api/boards/${slug}`, { phase: 'think' });
    await teacher('PATCH', '/api/settings', { current: slug });
    expect((await amy('GET', '/api/me')).data.current).toBe(slug);
  });

  let amyCard: Card;
  it('think: students post and see only their own ideas', async () => {
    const bad = await amy('POST', `/api/boards/${slug}/cards`, { title: 'No group' });
    expect(bad.status).toBe(400);
    const a = await amy('POST', `/api/boards/${slug}/cards`, { choice: 'birds', factRef: 'f1', title: 'Robin shadow', does: 'Dig when the shadow passes', image: JPG });
    expect(a.status).toBe(201);
    amyCard = a.data;
    expect(amyCard.mine).toBe(true);
    expect(amyCard.imageId).toBeTruthy();
    await ben('POST', `/api/boards/${slug}/cards`, { choice: 'other', choiceOther: 'Fish', title: 'Trout in the creek' });
    const s = (await ben('GET', `/api/boards/${slug}/state`)).data as BoardState;
    expect(s.cards.map((c) => c.title)).toEqual(['Trout in the creek']);
    // the teacher sees everything
    expect((await teacher('GET', `/api/boards/${slug}/state`)).data.cards).toHaveLength(2);
    // nobody's secret id is ever sent
    expect(JSON.stringify(s)).not.toMatch(/author/);
  });

  it('rejects files that are not pictures', async () => {
    const svg = `data:image/png;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`;
    expect((await amy('POST', `/api/boards/${slug}/cards`, { choice: 'birds', title: 'x', image: svg })).status).toBe(400);
  });

  it('open: the board stays locked until you post (think first)', async () => {
    await teacher('PATCH', `/api/boards/${slug}`, { phase: 'open' });
    const locked = (await late('GET', `/api/boards/${slug}/state`)).data as BoardState;
    expect(locked.gated).toBe(true);
    expect(locked.cards).toHaveLength(0);
    // can't dig before posting your own idea
    expect((await late('POST', `/api/boards/${slug}/cards`, { parentId: amyCard.id, title: 'dig' })).status).toBe(404);
    const open = (await ben('GET', `/api/boards/${slug}/state`)).data as BoardState;
    expect(open.gated).toBe(false);
    expect(open.cards).toHaveLength(2);
  });

  it('only the maker can change a card; anyone can dig from it', async () => {
    expect((await ben('PATCH', `/api/cards/${amyCard.id}`, { title: 'Mine now' })).status).toBe(403);
    const dig = await ben('POST', `/api/boards/${slug}/cards`, { parentId: amyCard.id, title: 'Night robins', changed: 'At night', twist: 'Make it happen at night' });
    expect(dig.status).toBe(201);
    // a dig keeps its idea's group
    expect(dig.data.choice).toBe('birds');
    expect((await amy('PATCH', `/api/cards/${amyCard.id}`, { title: 'Robin shadow warning' })).data.title).toBe('Robin shadow warning');
    // students can't set teacher-only fields
    expect((await amy('PATCH', `/api/cards/${amyCard.id}`, { status: 'built' })).status).toBe(403);
    // a card someone dug from can't be deleted by its maker
    expect((await amy('DELETE', `/api/cards/${amyCard.id}`)).status).toBe(403);
  });

  it('notes, hiding and statuses', async () => {
    expect((await ben('POST', `/api/cards/${amyCard.id}/notes`, { text: 'Only in the daytime?' })).status).toBe(201);
    await teacher('PATCH', `/api/cards/${amyCard.id}`, { status: 'built', statusNote: 'V5', hidden: false });
    const s = (await ben('GET', `/api/boards/${slug}/state`)).data as BoardState;
    const c = s.cards.find((x) => x.id === amyCard.id)!;
    expect(c.status).toBe('built');
    expect(s.notes).toHaveLength(1);
    const trout = s.cards.find((x) => x.title === 'Trout in the creek')!;
    await teacher('PATCH', `/api/cards/${trout.id}`, { hidden: true });
    expect(((await amy('GET', `/api/boards/${slug}/state`)).data as BoardState).cards.some((x) => x.id === trout.id)).toBe(false);
    // the maker still sees their own hidden card
    expect(((await ben('GET', `/api/boards/${slug}/state`)).data as BoardState).cards.some((x) => x.id === trout.id)).toBe(true);
  });

  it('answers "unchanged" when nothing changed since the last look', async () => {
    const first = await amy('GET', `/api/boards/${slug}/state`);
    const again = await amy('GET', `/api/boards/${slug}/state?since=${encodeURIComponent(first.data.since)}`);
    expect(again.data.unchanged).toBe(true);
  });

  it('serves pictures only to people on the board', async () => {
    const outsider = client();
    expect((await outsider('GET', `/api/img/${amyCard.imageId}`)).status).toBe(401);
    expect((await amy('GET', `/api/img/${amyCard.imageId}`)).status).toBe(200);
  });

  it('exports the board for Claude', async () => {
    const res = await fetch(`${base}/api/boards/${slug}/export`);
    expect(res.status).toBe(403);
  });

  it('closed: nobody posts', async () => {
    await teacher('PATCH', `/api/boards/${slug}`, { phase: 'closed' });
    expect((await amy('POST', `/api/boards/${slug}/cards`, { choice: 'birds', title: 'Late' })).status).toBe(403);
    // everyone can look, even someone who never posted
    expect(((await late('GET', `/api/boards/${slug}/state`)).data as BoardState).gated).toBe(false);
  });

  it('delete everything empties the store', async () => {
    expect((await teacher('POST', '/api/wipe', { confirm: 'nope' })).status).toBe(400);
    expect((await teacher('POST', '/api/wipe', { confirm: 'DELETE EVERYTHING' })).status).toBe(200);
    expect((await amy('GET', '/api/me')).data.student).toBeNull();
  });
});
