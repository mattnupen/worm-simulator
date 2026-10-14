import type { Me } from '../shared/model.ts';
import { $, api, esc, go, here, href, toast } from './api.ts';
import { showBoard } from './board.ts';
import { showAreas, showLogin, showSetup, showTeacherHome } from './teacher.ts';

/**
 * Burrow Board's pages, all under wormsimulator.com/burrow/:
 * - /burrow/          sign in, then the board students should open;
 * - /burrow/v3        a round's board (the board's link name);
 * - /burrow/teacher   the teacher view; /burrow/teacher/b/<board> setup; …/areas the area builder.
 */
const app = document.getElementById('app')!;

async function route() {
  const root = document.createElement('div');
  root.style.display = 'contents';
  app.replaceChildren(root);
  const path = here();
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
  const b = /^\/([^/]+)\/?$/.exec(path);
  if (b) {
    if (!me.student && !me.teacher) return showSignIn(root);
    return showBoard(root, decodeURIComponent(b[1]), me);
  }
  if (me.teacher && !me.student) return go('/teacher');
  if (!me.student) return showSignIn(root);
  if (me.current) return go(`/${me.current}`);
  root.innerHTML = `<div class="page center"><div class="sheet narrow"><h1>Burrow Board</h1>
    <p>Hi, <b>${esc(me.student.name)}</b>! There's no board open right now. Check back when your teacher says it's time.</p>
    <div><button class="btn ghost" id="signOut">Sign out</button></div></div></div>`;
  $('#signOut').onclick = async () => { await api('POST', '/logout'); void route(); };
}

function showSignIn(root: HTMLElement) {
  root.innerHTML = `<div class="page center"><form class="sheet narrow" id="signin">
    <h1>Burrow Board</h1>
    <p>Share your ideas for Worm Simulator, and build on other students' ideas.</p>
    <label class="field" for="user">Username<input id="user" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="Like bluehawk32"></label>
    <label class="field" for="pass">Password<input id="pass" type="password" autocomplete="current-password" autocapitalize="none" required></label>
    <p class="small muted">Your teacher gives you these. Don't share them.</p>
    <p class="err" id="err" role="alert" hidden></p>
    <button class="btn">Sign in</button>
    <a class="small" href="${href('teacher')}">Teacher sign-in</a>
  </form></div>`;
  $('#signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err');
    try {
      await api('POST', '/login', { username: $<HTMLInputElement>('#user').value, password: $<HTMLInputElement>('#pass').value });
      void route();
    } catch (x) { err.textContent = (x as Error).message; err.hidden = false; }
  });
  $<HTMLInputElement>('#user').focus();
}

addEventListener('popstate', () => void route());
void route();
