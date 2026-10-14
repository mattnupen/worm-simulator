import {
  DEFAULT_TWISTS, OTHER_AREA, PHASES, answerKey, slugify, suggestAreas,
  loginsCsv, type Area, type Board, type BoardState, type Choice, type Fact, type Student,
} from '../shared/model.ts';
import { $, api, esc, go, href, reroute, toast } from './api.ts';
import { LESSON_FACTS } from './lessonFacts.ts';

/** The teacher view: sign in, the list of round boards, settings, round setup and the area builder. */

export function showLogin(root: HTMLElement, onDone: () => void) {
  root.innerHTML = `<div class="page center"><form class="sheet narrow" id="f">
    <h1>Teacher sign-in</h1>
    <label class="field" for="pw">Teacher password<input type="password" id="pw" autocomplete="current-password" required></label>
    <p class="err" id="err" role="alert" hidden></p>
    <button class="btn">Sign in</button>
    <a class="small" href="${href('')}">I'm a student</a>
  </form></div>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', '/teacher/login', { password: $<HTMLInputElement>('#pw').value }); onDone(); }
    catch (x) { const err = $('#err'); err.textContent = (x as Error).message; err.hidden = false; }
  });
  $<HTMLInputElement>('#pw').focus();
}

const shell = (body: string) => `
  <div class="toolbar"><div class="brand"><h1>Burrow Board</h1><span>Teacher</span></div>
    <button class="btn ghost small" id="tHome">All boards</button>
    <button class="btn ghost small" id="tOut">Sign out</button></div>
  <div class="page">${body}</div>`;

function wireShell(root: HTMLElement) {
  $('#tHome', root).onclick = () => go('/teacher');
  $('#tOut', root).onclick = async () => { await api('POST', '/teacher/logout'); go('/'); };
}

// ---------------------------------------------------------------- home
/** Saves `text` as a file the teacher downloads (the logins CSV). */
function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function showTeacherHome(root: HTMLElement) {
  const [boards, settings, students] = await Promise.all([
    api<(Board & { cardCount: number })[]>('GET', '/boards'),
    api<{ periods: number[]; current: string | null }>('GET', '/settings'),
    api<Student[]>('GET', '/students'),
  ]);
  const phaseName = (p: string) => PHASES.find((x) => x.id === p)?.name ?? p;
  const nextRound = Math.max(0, ...boards.map((b) => Number(/^v(\d+)$/.exec(b.slug)?.[1] ?? 0))) + 1;
  const periodOpts = settings.periods.map((p) => `<option value="${p}">Period ${p}</option>`).join('');
  const boardLink = (slug: string) => `${location.origin}${href(slug)}`;
  root.innerHTML = shell(`
    <section class="sheet">
      <h1>Round boards</h1>
      ${boards.length ? `<ul class="list">${boards.map((b) => `<li>
        <div class="grow"><b>${esc(b.title)}</b> ${settings.current === b.slug ? '<span class="pill on">Students open this one</span>' : ''}
          <div class="small muted">${esc(boardLink(b.slug))} · ${phaseName(b.phase)} · ${b.cardCount} ${b.cardCount === 1 ? 'card' : 'cards'}</div></div>
        <button class="btn ghost small" data-open="${esc(b.slug)}">Open board</button>
        <button class="btn ghost small" data-setup="${esc(b.slug)}">Setup</button>
        <button class="btn ghost small" data-areas="${esc(b.slug)}">Areas</button>
        <a class="btn ghost small" href="${href(`api/boards/${esc(b.slug)}/export`)}" download>Export for Claude</a>
      </li>`).join('')}</ul>` : '<p class="muted">No boards yet. Make one for the next round.</p>'}
      <form class="rowline" id="newBoard">
        <label class="field" for="nbRound">Round<input id="nbRound" type="number" min="1" max="99" value="${nextRound}" style="width:90px"></label>
        <label class="field grow" for="nbName">Board name<input id="nbName" maxlength="80" placeholder="Round ${nextRound} · Topic"></label>
        <button class="btn" style="align-self:flex-end">+ New round board</button>
      </form>
      <p class="small muted">A board for Round 4 lives at ${esc(boardLink('v4'))}.</p>
    </section>

    <section class="sheet">
      <h2>Student logins</h2>
      <p class="small muted">Make usernames and passwords, download them as a CSV, and hand them out. Write each student's name next to their login in your own copy; the board never stores real names. Passwords are shown only in the CSV, so keep it private. A nickname you set is shown on the board instead of the username. Use a fun nickname, not a full name.</p>
      <form class="rowline" id="gen">
        <label class="field" for="genPeriod">Period<select id="genPeriod" class="plain">${periodOpts}</select></label>
        <label class="field" for="genCount">How many<input id="genCount" type="number" min="1" max="60" value="30" style="width:90px"></label>
        <button class="btn" style="align-self:flex-end">Make logins and download CSV</button>
      </form>
      ${students.length ? `<table class="areas"><thead><tr><th><input type="checkbox" id="allSt" aria-label="Select all logins"></th><th>Period</th><th>Username</th><th>Nickname on the board</th><th>Cards</th><th></th></tr></thead><tbody>
        ${students.map((st) => `<tr>
          <td><input type="checkbox" data-sel="${esc(st.id)}" aria-label="Select ${esc(st.username)}"></td>
          <td>${st.period}</td><td><code>${esc(st.username)}</code></td>
          <td><span class="rowline"><input class="plain" data-nick="${esc(st.id)}" maxlength="30" value="${esc(st.nickname)}" placeholder="(shows the username)" aria-label="Nickname for ${esc(st.username)}"><button class="btn ghost small" data-savenick="${esc(st.id)}">Save</button></span></td>
          <td>${st.cards}</td>
          <td><button class="btn ghost small" data-delst="${esc(st.id)}">Delete</button></td></tr>`).join('')}
      </tbody></table>
      <div class="rowline"><button class="btn ghost" id="resetSel">New passwords for selected, and download CSV</button></div>` : '<p class="muted">No logins yet.</p>'}
    </section>

    <form class="sheet" id="settings">
      <h2>Class periods</h2>
      <label class="field" for="periods">Your class periods (numbers, with commas)<input id="periods" value="${esc(settings.periods.join(', '))}"></label>
      <div><button class="btn ghost">Save periods</button></div>
    </form>
    <form class="sheet danger-zone" id="wipe">
      <h2>Delete everything</h2>
      <p class="small">After Round 8, delete every board, idea, drawing and login (framework P14). This can't be undone. Export any boards you want to keep first.</p>
      <label class="field" for="wipeIn">Type DELETE EVERYTHING to confirm<input id="wipeIn" autocomplete="off"></label>
      <div><button class="btn danger">Delete everything</button></div>
    </form>`);
  wireShell(root);
  $('#newBoard').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = Number($<HTMLInputElement>('#nbRound').value);
    const title = $<HTMLInputElement>('#nbName').value.trim() || `Round ${n}`;
    try {
      const b = await api<Board>('POST', '/boards', { title, slug: `v${n}`, twists: DEFAULT_TWISTS });
      go(`/teacher/b/${b.slug}`);
    } catch (x) { toast((x as Error).message); }
  });
  $('#gen').addEventListener('submit', async (e) => {
    e.preventDefault();
    const period = Number($<HTMLSelectElement>('#genPeriod').value);
    try {
      const made = await api<{ username: string; password: string; period: number }[]>('POST', '/students/generate', { period, count: Number($<HTMLInputElement>('#genCount').value) });
      download(`burrow-logins-period-${period}.csv`, loginsCsv(made));
      toast(`Made ${made.length} logins. The CSV is downloading.`);
      reroute();
    } catch (x) { toast((x as Error).message); }
  });
  root.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-open],[data-setup],[data-areas],[data-savenick],[data-delst],#resetSel,#allSt');
    if (!t) return;
    if (t.dataset.open) go(`/${t.dataset.open}`);
    if (t.dataset.setup) go(`/teacher/b/${t.dataset.setup}`);
    if (t.dataset.areas) go(`/teacher/b/${t.dataset.areas}/areas`);
    if (t.id === 'allSt') for (const c of root.querySelectorAll<HTMLInputElement>('[data-sel]')) c.checked = (t as HTMLInputElement).checked;
    try {
      if (t.dataset.savenick) {
        await api('PATCH', `/students/${t.dataset.savenick}`, { nickname: $<HTMLInputElement>(`[data-nick="${CSS.escape(t.dataset.savenick)}"]`).value });
        toast('Saved.');
      }
      if (t.dataset.delst) {
        if (!confirm('Delete this login? Their cards stay on the boards under their username.')) return;
        await api('DELETE', `/students/${t.dataset.delst}`);
        reroute();
      }
      if (t.id === 'resetSel') {
        const ids = [...root.querySelectorAll<HTMLInputElement>('[data-sel]:checked')].map((c) => c.dataset.sel!);
        if (!ids.length) { toast('Tick the logins that need a new password.'); return; }
        if (!confirm(`Make new passwords for ${ids.length} ${ids.length === 1 ? 'login' : 'logins'}? Their old passwords stop working.`)) return;
        const out = await api<{ username: string; password: string; period: number }[]>('POST', '/students/reset', { ids });
        download('burrow-new-passwords.csv', loginsCsv(out));
        toast('New passwords made. The CSV is downloading.');
      }
    } catch (x) { toast((x as Error).message); }
  });
  $('#settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('PATCH', '/settings', { periods: $<HTMLInputElement>('#periods').value.split(/[\s,]+/).filter(Boolean).map(Number) });
      toast('Saved.');
      reroute();
    } catch (x) { toast((x as Error).message); }
  });
  $('#wipe').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirm('Really delete everything? This can\'t be undone.')) return;
    try { await api('POST', '/wipe', { confirm: $<HTMLInputElement>('#wipeIn').value.trim() }); toast('Everything was deleted.'); go('/'); }
    catch (x) { toast((x as Error).message); }
  });
}

// ---------------------------------------------------------------- setup
export async function showSetup(root: HTMLElement, slug: string) {
  const [board, all, settings] = await Promise.all([
    api<Board>('GET', `/boards/${slug}`),
    api<Board[]>('GET', '/boards'),
    api<{ current: string | null }>('GET', '/settings'),
  ]);
  let choices: Choice[] = board.choices.length ? board.choices : [{ id: '', name: '' }];
  let facts: Fact[] = [...board.facts];
  const lessonIds = new Set(LESSON_FACTS.flatMap((l) => l.facts.map((f) => f.id)));

  root.innerHTML = shell(`
    <form class="sheet" id="setup">
      <div class="rowline"><h1 class="grow">Round setup</h1><button type="button" class="btn ghost small" id="openB">Open board</button><button type="button" class="btn ghost small" id="areasB">Areas</button></div>
      <label class="field" for="title">Board name<input id="title" maxlength="80" value="${esc(board.title)}"></label>
      <label class="field" for="topic">Topic<input id="topic" maxlength="80" value="${esc(board.topic)}" placeholder="Predators"></label>

      <h2>Phase</h2>
      <div class="phase-pick" role="radiogroup" aria-label="Phase">
        ${PHASES.map((p) => `<label><input type="radio" name="phase" value="${p.id}" ${board.phase === p.id ? 'checked' : ''}><b>${p.name}</b><span class="muted">${p.about}</span></label>`).join('')}
      </div>
      <label class="rowline small"><input type="checkbox" id="current" ${settings.current === slug ? 'checked' : ''}> This is the board students open at the main link</label>

      <h2>The first question and its starting groups</h2>
      <p class="small muted">Students pick one of these or write "Something else". The board's areas are built from their answers.</p>
      <label class="field" for="question">First question<input id="question" maxlength="120" value="${esc(board.question)}" placeholder="Which predator is your idea about?"></label>
      <div id="choices"></div>
      <div><button type="button" class="btn ghost small" id="addChoice">+ Add a group</button></div>

      <h2>Fact cards</h2>
      <p class="small muted">Students pick the fact their idea is based on. Every fact needs a source.</p>
      ${LESSON_FACTS.map((l) => `<details><summary>Add facts from the game lesson "${esc(l.lesson)}" (${l.facts.length})</summary>
        <div class="facts-pick">${l.facts.map((f) => `<label><input type="checkbox" data-lf="${esc(f.id)}" ${facts.some((x) => x.id === f.id) ? 'checked' : ''}><span>${esc(f.text)}<span class="src"> · ${esc(f.sourceTitle)}</span></span></label>`).join('')}</div>
      </details>`).join('')}
      <div id="customFacts"></div>
      <div><button type="button" class="btn ghost small" id="addFact">+ Add your own fact</button></div>

      <h2>Twists for "Dig from here"</h2>
      <label class="field" for="twists">One twist per line<textarea id="twists" rows="5">${esc(board.twists.join('\n'))}</textarea></label>

      <p class="err" id="err" role="alert" hidden></p>
      <div class="rowline"><button class="btn">Save setup</button></div>
    </form>
    <section class="sheet">
      <h2>Bring back last round's parked ideas</h2>
      <p class="small muted">Copies every card marked Parked on another board into a "From last round" area here.</p>
      <div class="rowline"><select class="plain grow" id="from">${all.filter((b) => b.slug !== slug).map((b) => `<option value="${esc(b.slug)}">${esc(b.title)}</option>`).join('') || '<option value="">No other boards yet</option>'}</select>
      <button type="button" class="btn ghost" id="importB">Copy parked ideas</button></div>
    </section>
    <section class="sheet danger-zone">
      <h2>Delete this board</h2>
      <p class="small">Deletes this board's ideas, notes and drawings. This can't be undone.</p>
      <div><button type="button" class="btn danger" id="delB">Delete this board</button></div>
    </section>`);
  wireShell(root);

  function drawChoices() {
    $('#choices').innerHTML = choices.map((c, i) => `<div class="rowline" style="margin-bottom:6px">
      <input class="plain grow" data-cn="${i}" maxlength="40" placeholder="Group name, like Birds" value="${esc(c.name)}" aria-label="Group ${i + 1} name">
      <input class="plain grow" data-ch="${i}" maxlength="60" placeholder="Hint, like robins, woodcocks…" value="${esc(c.hint ?? '')}" aria-label="Group ${i + 1} hint">
      <button type="button" class="btn ghost small" data-rc="${i}" aria-label="Remove group ${i + 1}">Remove</button></div>`).join('');
  }
  function drawFacts() {
    const custom = facts.filter((f) => !lessonIds.has(f.id));
    $('#customFacts').innerHTML = custom.map((f) => `<div class="sheet" style="padding:12px;margin:0;gap:6px">
      <label class="field small">Fact<textarea data-ft="${esc(f.id)}" maxlength="300">${esc(f.text)}</textarea></label>
      <div class="rowline"><label class="field small grow">Source (title and publisher)<input data-fs="${esc(f.id)}" maxlength="160" value="${esc(f.sourceTitle)}"></label>
      <label class="field small grow">Source link (https://…)<input data-fu="${esc(f.id)}" maxlength="300" value="${esc(f.url ?? '')}"></label></div>
      <div><button type="button" class="btn ghost small" data-rf="${esc(f.id)}">Remove fact</button></div></div>`).join('');
  }
  drawChoices();
  drawFacts();
  const readChoices = () => {
    choices = choices.map((c, i) => ({
      id: c.id,
      name: $<HTMLInputElement>(`[data-cn="${i}"]`).value.trim(),
      hint: $<HTMLInputElement>(`[data-ch="${i}"]`).value.trim() || undefined,
    }));
  };
  const readFacts = () => {
    facts = facts.map((f) => {
      const t = $<HTMLTextAreaElement>(`[data-ft="${CSS.escape(f.id)}"]`);
      if (!t) return f;
      return { ...f, text: t.value.trim(), sourceTitle: $<HTMLInputElement>(`[data-fs="${CSS.escape(f.id)}"]`).value.trim(), url: $<HTMLInputElement>(`[data-fu="${CSS.escape(f.id)}"]`).value.trim() || undefined };
    });
  };

  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'addChoice') { readChoices(); choices.push({ id: '', name: '' }); drawChoices(); $<HTMLInputElement>(`[data-cn="${choices.length - 1}"]`).focus(); }
    if (t.dataset.rc) { readChoices(); choices.splice(Number(t.dataset.rc), 1); drawChoices(); }
    if (t.id === 'addFact') { readFacts(); facts.push({ id: `own-${Date.now().toString(36)}`, text: '', sourceTitle: '' }); drawFacts(); }
    if (t.dataset.rf) { readFacts(); facts = facts.filter((f) => f.id !== t.dataset.rf); drawFacts(); }
    if (t.id === 'openB') go(`/${slug}`);
    if (t.id === 'areasB') go(`/teacher/b/${slug}/areas`);
    if (t.id === 'importB') {
      const from = $<HTMLSelectElement>('#from').value;
      if (!from) return;
      try { const r = await api<{ imported: number }>('POST', `/boards/${slug}/import`, { from }); toast(`Copied ${r.imported} parked ${r.imported === 1 ? 'idea' : 'ideas'}.`); }
      catch (x) { toast((x as Error).message); }
    }
    if (t.id === 'delB') {
      if (prompt(`Type the board name to delete it: ${board.title}`) !== board.title) return;
      try { await api('DELETE', `/boards/${slug}`); toast('Deleted.'); go('/teacher'); } catch (x) { toast((x as Error).message); }
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.dataset.lf) return;
    readFacts();
    const f = LESSON_FACTS.flatMap((l) => l.facts).find((x) => x.id === t.dataset.lf)!;
    if (t.checked) facts.push(f); else facts = facts.filter((x) => x.id !== f.id);
  });
  $('#setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    readChoices();
    readFacts();
    const err = $('#err');
    err.hidden = true;
    try {
      await api('PATCH', `/boards/${slug}`, {
        title: $<HTMLInputElement>('#title').value,
        topic: $<HTMLInputElement>('#topic').value,
        question: $<HTMLInputElement>('#question').value,
        // a group keeps its id once it has one, so students' answers stay matched after a rename
        choices: choices.filter((c) => c.name).map((c) => ({ ...c, id: c.id || slugify(c.name) })),
        facts: facts.filter((f) => f.text),
        twists: $<HTMLTextAreaElement>('#twists').value.split('\n').map((s) => s.trim()).filter(Boolean),
        phase: $<HTMLInputElement>('input[name="phase"]:checked').value,
      });
      const cur = $<HTMLInputElement>('#current').checked;
      if (cur !== (settings.current === slug)) await api('PATCH', '/settings', { current: cur ? slug : null });
      toast('Saved.');
      reroute();
    } catch (x) { err.textContent = (x as Error).message; err.hidden = false; }
  });
}

// ---------------------------------------------------------------- area builder
/**
 * Brief section 4: every answer students gave to the first question, with how many gave it. Each
 * answer goes in an area. "Use suggestions" makes an area for each starting group someone picked
 * and for any "Something else" answer two or more students wrote; the rest go in "Other ideas".
 */
export async function showAreas(root: HTMLElement, slug: string) {
  const state = await api<BoardState>('GET', `/boards/${slug}/state`);
  const roots = state.cards.filter((c) => c.parentId == null);
  const answers = new Map<string, { n: number; words: Set<string>; label: string }>();
  for (const r of roots) {
    const k = answerKey(r);
    const a = answers.get(k) ?? { n: 0, words: new Set<string>(), label: '' };
    a.n++;
    if (r.choice === 'other') a.words.add(r.choiceOther.trim());
    a.label = r.kind === 'earlier' ? 'From last round' : r.choice === 'other' ? (k === 'other' ? 'Something else (blank)' : `"${[...a.words].join('", "')}"`) : state.board.choices.find((c) => c.id === r.choice)?.name ?? r.choice;
    answers.set(k, a);
  }
  let areas: Area[] = state.board.areas.length ? structuredClone(state.board.areas) : suggestAreas(state.board.choices, roots);
  const saved = state.board.areas.length > 0;

  function draw() {
    const opts = (k: string) => [...areas, OTHER_AREA].map((a) => `<option value="${esc(a.id)}" ${(a.keys.includes(k) || (a.id === 'other' && !areas.some((x) => x.keys.includes(k)))) ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    root.innerHTML = shell(`
      <section class="sheet">
        <div class="rowline"><h1 class="grow">Areas</h1><button class="btn ghost small" id="openB">Open board</button></div>
        <p class="small muted">${saved ? 'These are the areas students see.' : 'Students see these suggested areas until you save your own.'} A dig always stays with the idea it came from. To move one idea's whole branch, open it on the board.</p>
        <h2>Areas</h2>
        <ul class="list">${areas.map((a, i) => `<li><input class="plain grow" data-an="${i}" value="${esc(a.name)}" maxlength="40" aria-label="Area name"><span class="small muted">${((n) => `${n} ${n === 1 ? 'idea' : 'ideas'}`)(a.keys.reduce((n, k) => n + (answers.get(k)?.n ?? 0), 0))}</span><button class="btn ghost small" data-ar="${i}">Remove</button></li>`).join('')}
          <li><span class="grow"><b>Other ideas</b> <span class="small muted">(always there, for anything that fits nowhere)</span></span></li></ul>
        <div class="rowline"><button class="btn ghost small" id="addA">+ Add an area</button><button class="btn ghost small" id="suggest">Use suggestions</button></div>
        <h2>Students' answers</h2>
        ${answers.size ? `<table class="areas"><thead><tr><th>Answer</th><th>Ideas</th><th>Goes in</th></tr></thead><tbody>
          ${[...answers.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, a]) => `<tr><td>${esc(a.label)}</td><td>${a.n}</td><td><select class="plain" data-k="${esc(k)}" aria-label="Area for ${esc(a.label)}">${opts(k)}</select></td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">No ideas yet.</p>'}
        <div class="rowline"><button class="btn" id="save">Save areas</button>${saved ? '<button class="btn ghost" id="reset">Go back to suggestions</button>' : ''}</div>
      </section>`);
    wireShell(root);
  }
  const readNames = () => { areas = areas.map((a, i) => ({ ...a, name: $<HTMLInputElement>(`[data-an="${i}"]`)?.value.trim() || a.name })); };
  draw();
  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'openB') go(`/${slug}`);
    if (t.id === 'addA') { readNames(); const name = prompt('Name the new area'); if (name?.trim()) { areas.push({ id: `a-${slugify(name)}-${Date.now().toString(36)}`, name: name.trim(), keys: [] }); draw(); } }
    if (t.dataset.ar) { readNames(); areas.splice(Number(t.dataset.ar), 1); draw(); }
    if (t.id === 'suggest') { areas = suggestAreas(state.board.choices, roots); draw(); }
    if (t.id === 'save' || t.id === 'reset') {
      readNames();
      try { await api('PATCH', `/boards/${slug}`, { areas: t.id === 'reset' ? [] : areas }); toast('Saved.'); reroute(); }
      catch (x) { toast((x as Error).message); }
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    const k = t.dataset.k;
    if (!k) return;
    readNames();
    for (const a of areas) a.keys = a.keys.filter((x) => x !== k);
    areas.find((a) => a.id === t.value)?.keys.push(k);
    draw();
  });
}
