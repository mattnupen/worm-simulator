import type { Me } from '../shared/model.ts';
import { $, api, esc, go, toast } from './api.ts';
import { showBoard } from './board.ts';
import { showAreas, showLogin, showSetup, showTeacherHome } from './teacher.ts';

/**
 * Burrow Board's pages:
 * - /            join (class code and period), then the board students should open;
 * - /b/<board>   a round's board;
 * - /teacher     the teacher view (boards, settings); /teacher/b/<board> setup; …/areas the area builder.
 */
const app = document.getElementById('app')!;

async function route() {
  const root = document.createElement('div');
  root.style.display = 'contents';
  app.replaceChildren(root);
  const path = location.pathname;
  let me: Me;
  try {
    me = await api<Me>('GET', '/me');
  } catch (e) {
    root.innerHTML = `<div class="page center"><div class="sheet narrow"><h1>Burrow Board</h1><p>${esc((e as Error).message)}</p></div></div>`;
    return;
  }
  const t = /^\/teacher(?:\/b\/([^/]+)(\/areas)?)?\/?$/.exec(path);
  if (t) {
    if (!me.teacher) return showLogin(root, () => route());
    try {
      if (t[1] && t[2]) return await showAreas(root, decodeURIComponent(t[1]));
      if (t[1]) return await showSetup(root, decodeURIComponent(t[1]));
      return await showTeacherHome(root);
    } catch (e) { toast((e as Error).message); return; }
  }
  const b = /^\/b\/([^/]+)\/?$/.exec(path);
  if (b) {
    if (!me.student && !me.teacher) return showJoin(root, me, decodeURIComponent(b[1]));
    return showBoard(root, decodeURIComponent(b[1]), me);
  }
  if (me.teacher && !me.student) return go('/teacher');
  if (!me.student) return showJoin(root, me, null);
  if (me.current) return go(`/b/${me.current}`);
  root.innerHTML = `<div class="page center"><div class="sheet narrow"><h1>Burrow Board</h1>
    <p>Hi, <b>${esc(me.student.nickname)}</b>! There's no board open right now. Check back when your teacher says it's time.</p></div></div>`;
}

function showJoin(root: HTMLElement, me: Me, next: string | null) {
  let period = 0;
  root.innerHTML = `<div class="page center"><form class="sheet narrow" id="join">
    <h1>Burrow Board</h1>
    <p>Share your ideas for Worm Simulator, and build on other students' ideas.</p>
    <label class="field" for="code">Class code<input id="code" autocomplete="off" autocapitalize="characters" required placeholder="From your teacher"></label>
    <div class="field"><span id="pl">Your class period</span><div class="periods" role="group" aria-labelledby="pl">
      ${me.periods.map((p) => `<button type="button" data-p="${p}" aria-pressed="false">${p}</button>`).join('')}</div></div>
    <p class="small muted">You'll get a fun nickname. Don't use your real name anywhere on the board.</p>
    <p class="err" id="err" role="alert" hidden></p>
    <button class="btn">Join</button>
    <a class="small" href="/teacher">Teacher sign-in</a>
  </form></div>`;
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
    if (!b) return;
    period = Number(b.dataset.p);
    for (const x of root.querySelectorAll('[data-p]')) x.setAttribute('aria-pressed', String(x === b));
  });
  $('#join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err');
    if (!period) { err.textContent = 'Pick your class period.'; err.hidden = false; return; }
    try {
      const r = await api<{ nickname: string }>('POST', '/join', { code: $<HTMLInputElement>('#code').value, period });
      toast(`Welcome, ${r.nickname}!`);
      if (next) route(); else go('/');
    } catch (x) { err.textContent = (x as Error).message; err.hidden = false; }
  });
  $<HTMLInputElement>('#code').focus();
}

addEventListener('popstate', () => void route());
void route();
