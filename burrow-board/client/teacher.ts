import {
  DEFAULT_TWISTS, OTHER_AREA, PHASES, answerKey, slugify, suggestAreas,
  type Area, type Board, type BoardState, type Choice, type Fact,
} from '../shared/model.ts';
import { $, api, esc, go, reroute, toast } from './api.ts';
import { LESSON_FACTS } from './lessonFacts.ts';

/** The teacher view: sign in, the list of round boards, settings, round setup and the area builder. */

export function showLogin(root: HTMLElement, onDone: () => void) {
  root.innerHTML = `<div class="page center"><form class="sheet narrow" id="f">
    <h1>Teacher sign-in</h1>
    <label class="field" for="pw">Teacher password<input type="password" id="pw" autocomplete="current-password" required></label>
    <p class="err" id="err" role="alert" hidden></p>
    <button class="btn">Sign in</button>
    <a class="small" href="/">I'm a student</a>
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
export async function showTeacherHome(root: HTMLElement) {
  const [boards, settings] = await Promise.all([
    api<(Board & { cardCount: number })[]>('GET', '/boards'),
    api<{ classCode: string; periods: number[]; current: string | null }>('GET', '/settings'),
  ]);
  const phaseName = (p: string) => PHASES.find((x) => x.id === p)?.name ?? p;
  root.innerHTML = shell(`
    <section class="sheet">
      <div class="rowline"><h1 class="grow">Round boards</h1><button class="btn" id="newBoard">+ New round board</button></div>
      ${boards.length ? `<ul class="list">${boards.map((b) => `<li>
        <div class="grow"><b>${esc(b.title)}</b> ${settings.current === b.slug ? '<span class="pill on">Students open this one</span>' : ''}
          <div class="small muted">${phaseName(b.phase)} · ${b.cardCount} ${b.cardCount === 1 ? 'card' : 'cards'}</div></div>
        <button class="btn ghost small" data-open="${esc(b.slug)}">Open board</button>
        <button class="btn ghost small" data-setup="${esc(b.slug)}">Setup</button>
        <button class="btn ghost small" data-areas="${esc(b.slug)}">Areas</button>
        <a class="btn ghost small" href="/api/boards/${esc(b.slug)}/export" download>Export for Claude</a>
      </li>`).join('')}</ul>` : '<p class="muted">No boards yet. Make one for the next round.</p>'}
    </section>
    <form class="sheet" id="settings">
      <h2>Class settings</h2>
      <p class="small muted">Students go to <b>${esc(location.origin)}</b>, type the class code, and pick their period. They get a random nickname. No names or emails are stored.</p>
      <div class="rowline">
        <label class="field grow" for="code">Class code<input id="code" value="${esc(settings.classCode)}" maxlength="24" autocomplete="off"></label>
        <label class="field grow" for="periods">Class periods (numbers, with commas)<input id="periods" value="${esc(settings.periods.join(', '))}"></label>
      </div>
      <div><button class="btn">Save settings</button></div>
    </form>
    <form class="sheet danger-zone" id="wipe">
      <h2>Delete everything</h2>
      <p class="small">At the end of the project, delete every board, idea, drawing and nickname (framework P14). This can't be undone. Export any boards you want to keep first.</p>
      <label class="field" for="wipeIn">Type DELETE EVERYTHING to confirm<input id="wipeIn" autocomplete="off"></label>
      <div><button class="btn danger">Delete everything</button></div>
    </form>`);
  wireShell(root);
  $('#newBoard').onclick = async () => {
    const title = prompt('Name the board (for example "Round 4 · Predators")');
    if (!title?.trim()) return;
    try {
      const b = await api<Board>('POST', '/boards', { title, twists: DEFAULT_TWISTS });
      go(`/teacher/b/${b.slug}`);
    } catch (x) { toast((x as Error).message); }
  };
  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-open],[data-setup],[data-areas]');
    if (!t) return;
    if (t.dataset.open) go(`/b/${t.dataset.open}`);
    if (t.dataset.setup) go(`/teacher/b/${t.dataset.setup}`);
    if (t.dataset.areas) go(`/teacher/b/${t.dataset.areas}/areas`);
  });
  $('#settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('PATCH', '/settings', {
        classCode: $<HTMLInputElement>('#code').value,
        periods: $<HTMLInputElement>('#periods').value.split(/[\s,]+/).filter(Boolean).map(Number),
      });
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
    if (t.id === 'openB') go(`/b/${slug}`);
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
    if (t.id === 'openB') go(`/b/${slug}`);
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
