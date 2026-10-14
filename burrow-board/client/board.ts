import {
  OTHER_AREA, STATUS_LABELS, answerName, areaOfCards, boardAreas, shuffleKey,
  type Area, type BoardState, type Card, type Me, type Note, type Status,
} from '../shared/model.ts';
import { $, ago, api, esc, go, href, toast } from './api.ts';
import { openComposer } from './composer.ts';

/**
 * The whiteboard (carried over from the prototype): pan and zoom, cards with their pictures,
 * curved branch lines from each idea to the ideas dug from it, areas drawn around groups, a side
 * panel, highlight filters, a list view, and the think-first lock. It asks the server every few
 * seconds for changes, so ideas from other students appear on their own.
 */
const W = 220, GX = 90, GY = 26, PAD = 32, HEAD = 64;
const POLL_MS = 5000;

export async function showBoard(root: HTMLElement, slug: string, me: Me) {
  let state: BoardState;
  let since = '';
  try {
    const s = await api<BoardState & { since: string }>('GET', `/boards/${slug}/state`);
    state = s;
    since = s.since;
  } catch (e) {
    root.innerHTML = `<div class="page center"><div class="sheet narrow"><h1>Burrow Board</h1><p>${esc((e as Error).message)}</p><button class="btn" id="home">Back</button></div></div>`;
    $('#home').onclick = () => go('/');
    return;
  }
  const teacher = me.teacher;
  const seed = me.student?.username ?? 'teacher';
  let hl = 'all', selected: number | null = null, view = { x: 40, y: 30, k: 1 }, mode: 'board' | 'list' = innerWidth < 640 ? 'list' : 'board';
  let tidy = new Map<number, { x: number; y: number }>();
  let firstFit = true;
  let factsOpen = false;

  root.innerHTML = `
    <div class="toolbar">
      <div class="brand"><h1>Burrow Board</h1><span id="bTitle"></span></div>
      <div class="who" id="who"></div>
      <div class="ctl" role="group" aria-label="View">
        <button class="btn ghost small" id="viewBtn"></button>
      </div>
      <button class="btn ghost" id="factsBtn" hidden>Facts</button>
      <button class="btn ghost" id="tidyBtn" title="Line every idea up with its branches">Tidy up</button>
      ${teacher ? '<button class="btn ghost" id="toolsBtn">Teacher tools</button>' : ''}
      <button class="btn" id="newBtn">+ New idea</button>
    </div>
    <div class="banner" id="banner" hidden></div>
    <div class="stage" id="stage">
      <div class="world" id="world"><div id="zones"></div><svg class="edges" id="edges" width="1" height="1" aria-hidden="true"></svg></div>
      <div class="zoom" aria-label="Zoom">
        <button id="zOut" aria-label="Zoom out">−</button><span class="pct" id="zPct">100%</span><button id="zIn" aria-label="Zoom in">+</button><button id="zFit" aria-label="Fit everything" title="Fit everything">⤢</button>
      </div>
      <div class="legend" role="group" aria-label="Highlight" id="legend"></div>
      <div class="gate" id="gate" hidden>
        <div class="box">
          <h2>Think first, then share</h2>
          <p>Post your own idea before you see everyone else's. That way the board gets your idea, not a copy of the first one you saw.</p>
          <div class="steps"><span><b>1</b> Post your idea</span><span>→</span><span><b>2</b> The board opens</span><span>→</span><span><b>3</b> Dig from others</span></div>
          <button class="btn" id="gateBtn">Start my idea</button>
        </div>
      </div>
      <aside class="drawer" id="drawer" hidden aria-label="Facts from the lesson"></aside>
      <div class="listview" id="listview" hidden></div>
      <aside class="panel" id="panel" hidden aria-label="Idea details"></aside>
    </div>`;

  const stage = $('#stage'), world = $('#world'), edges = $('#edges') as unknown as SVGSVGElement, panel = $('#panel'), drawer = $('#drawer');
  const cardEls = new Map<number, HTMLElement>();

  // ------------------------------------------------------------ data helpers
  const cards = () => state.cards;
  const byId = (id: number | null) => (id == null ? undefined : state.cards.find((c) => c.id === id));
  const kidsOf = (id: number) => state.cards.filter((c) => c.parentId === id).sort((a, b) => a.created - b.created);
  const countDesc = (id: number): number => kidsOf(id).reduce((n, k) => n + 1 + countDesc(k.id), 0);
  const notesOf = (id: number): Note[] => state.notes.filter((n) => n.cardId === id);
  const roots = () => state.cards.filter((c) => c.parentId == null || !byId(c.parentId));
  const posted = () => state.cards.some((c) => c.mine && c.parentId == null && c.kind === 'idea');
  const gated = () => !teacher && (state.gated || (state.board.phase === 'think' && !posted()));
  const areasNow = (): Area[] => [...boardAreas(state.board, roots()), OTHER_AREA];
  let areaOf = new Map<number, string>();
  const pos = (c: Card) => tidy.get(c.id) ?? (c.x != null && c.y != null ? { x: c.x, y: c.y } : auto.get(c.id) ?? { x: 0, y: 0 });
  const who = (c: { period: number | null; kind?: string }) => (c.kind === 'example' ? 'Example' : c.period == null ? 'Teacher' : `P${c.period}`);
  const factOf = (c: Card) => state.board.facts.find((f) => f.id === c.factRef);

  // ------------------------------------------------------------ view
  const applyView = () => {
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
    $('#zPct').textContent = `${Math.round(view.k * 100)}%`;
    stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
    stage.style.backgroundSize = `${22 * view.k}px ${22 * view.k}px`;
  };
  const zoomAt = (k: number, cx: number, cy: number) => {
    k = Math.min(1.8, Math.max(0.25, k));
    view.x = cx - ((cx - view.x) * k) / view.k;
    view.y = cy - ((cy - view.y) * k) / view.k;
    view.k = k;
    applyView();
  };

  // ------------------------------------------------------------ layout
  let auto = new Map<number, { x: number; y: number }>();
  function heights() { const h = new Map<number, number>(); cardEls.forEach((el, id) => h.set(id, el.offsetHeight)); return h; }
  function autoLayout() {
    const h = heights();
    auto = new Map();
    // Each student sees ideas in their own shuffled order, not newest or most-dug first (P10).
    const rs = roots().sort((a, b) => shuffleKey(seed, a.id) - shuffleKey(seed, b.id));
    const islands = rs.map((r) => {
      const p = new Map<number, { x: number; y: number }>();
      let y = 0;
      const place = (n: Card, d: number) => {
        const ks = kidsOf(n.id);
        const hn = h.get(n.id) ?? 120;
        if (!ks.length) { p.set(n.id, { x: d * (W + GX), y }); y += hn + GY; return; }
        ks.forEach((k) => place(k, d + 1));
        const first = p.get(ks[0].id)!, lastK = ks[ks.length - 1], lastP = p.get(lastK.id)!;
        const mid = (first.y + lastP.y + (h.get(lastK.id) ?? 120)) / 2 - hn / 2;
        p.set(n.id, { x: d * (W + GX), y: Math.max(mid, 0) });
        y = Math.max(y, p.get(n.id)!.y + hn + GY);
      };
      place(r, 0);
      const depth = Math.max(...[...p.values()].map((q) => q.x)) / (W + GX) + 1;
      return { r, p, w: depth * (W + GX), h: y };
    });
    const zonesL: { mine: typeof islands; ys: number[]; w: number; h: number }[] = [];
    for (const a of areasNow()) {
      const mine = islands.filter((i) => areaOf.get(i.r.id) === a.id);
      if (!mine.length) continue;
      let y = 0, w = 0;
      const ys = mine.map((i) => { const y0 = y; y += i.h + 30; w = Math.max(w, i.w); return y0; });
      zonesL.push({ mine, ys, w: w - GX + PAD * 2, h: y - 30 - GY + PAD + HEAD });
    }
    const perRow = Math.max(1, Math.ceil(zonesL.length / 2));
    let zx = 0, zy = 0, rowH = 0;
    zonesL.forEach((z, k) => {
      if (k && k % perRow === 0) { zx = 0; zy += rowH + 60; rowH = 0; }
      z.mine.forEach((i, n) => i.p.forEach((q, id) => auto.set(id, { x: zx + PAD + q.x, y: zy + HEAD + z.ys[n] + q.y })));
      zx += z.w + 60;
      rowH = Math.max(rowH, z.h);
    });
  }

  function cardHTML(c: Card) {
    const d = countDesc(c.id), n = notesOf(c.id).length;
    const per = c.period;
    return `${c.imageId ? `<img class="thumb" src="${href('api/img/')}${esc(c.imageId)}" alt="" loading="lazy">` : ''}
      <h3>${esc(c.title)}</h3>
      <div class="row">
        ${c.kind === 'example' ? '<span class="tag ex">Example</span>' : `<span class="tag p${per ?? ''}"><span class="dot"></span>${who(c)}</span>`}
        ${c.kind === 'earlier' ? '<span class="tag">Last round</span>' : ''}
        ${c.mine ? '<span class="tag you">Yours</span>' : ''}
        ${c.status ? `<span class="tag st-${c.status}">${STATUS_LABELS[c.status]}${c.status === 'built' && c.statusNote ? ` in ${esc(c.statusNote)}` : ''}</span>` : ''}
        ${c.hidden ? '<span class="tag">Hidden</span>' : ''}
        <span class="right">${d ? `${d} ${d === 1 ? 'dig' : 'digs'}` : ''}${n ? `${d ? ' · ' : ''}${n} 💬` : ''}</span>
      </div>
      ${state.canPost && !gated() ? `<button class="digbtn" data-dig aria-label="Dig from ${esc(c.title)}" title="Dig from here">+</button>` : ''}`;
  }

  function isFaded(c: Card) {
    if (hl === 'all') return false;
    if (hl === 'lonely') return kidsOf(c.id).length > 0;
    if (hl === 'mine') return !c.mine;
    return `p${c.period}` !== hl;
  }

  function renderLegend() {
    const ps = [...new Set(cards().map((c) => c.period).filter((p): p is number => p != null))].sort((a, b) => a - b);
    const opts: [string, string][] = [['all', 'Everything'], ['lonely', 'Needs a dig'], ...(teacher ? [] : [['mine', 'My ideas']] as [string, string][]), ...ps.map((p) => [`p${p}`, `Period ${p}`] as [string, string])];
    if (!opts.some(([k]) => k === hl)) hl = 'all';
    $('#legend').innerHTML = opts.map(([k, n]) => `<button class="chip" data-hl="${k}" aria-pressed="${hl === k}">${n}</button>`).join('');
  }

  function renderChrome() {
    const b = state.board;
    $('#bTitle').textContent = b.title;
    document.title = `${b.title} · Burrow Board`;
    $('#who').innerHTML = teacher
      ? '<b>Teacher</b>'
      : me.student ? `<span class="long">You are</span> <b>${esc(me.student.name)}</b> · Period ${me.student.period} <button class="linkbtn small" id="signOut">Sign out</button>` : '';
    $<HTMLButtonElement>('#newBtn').hidden = !state.canPost || gated();
    $<HTMLButtonElement>('#factsBtn').hidden = !b.facts.length || gated();
    $('#viewBtn').textContent = mode === 'board' ? 'List view' : 'Board view';
    $<HTMLButtonElement>('#tidyBtn').hidden = mode === 'list';
    const banner = $('#banner');
    let msg = '';
    if (b.phase === 'closed') msg = 'This board is closed. You can still look around.';
    else if (b.phase === 'think' && !teacher && posted()) msg = 'Nice work! Everyone\'s ideas appear here when your teacher opens the board for sharing. You can add more ideas or change yours.';
    else if (teacher && b.phase !== 'open') msg = `Phase: ${b.phase === 'setup' ? 'Setup (students can\'t see this board yet)' : b.phase === 'think' ? 'Think (students see only their own ideas)' : 'Closed'}.`;
    banner.textContent = msg;
    banner.hidden = !msg;
    const g = gated();
    stage.classList.toggle('locked', g);
    $('#gate').hidden = !g;
    if (g) { panel.hidden = true; selected = null; }
    $('#listview').hidden = mode !== 'list' || g;
  }

  function render(opts: { pop?: number; focus?: number; fit?: boolean } = {}) {
    areaOf = areaOfCards(cards(), areasNow());
    renderChrome();
    renderLegend();
    cardEls.forEach((el, id) => { if (!byId(id)) { el.remove(); cardEls.delete(id); } });
    for (const c of cards()) {
      let el = cardEls.get(c.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'card';
        el.dataset.id = String(c.id);
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        world.appendChild(el);
        cardEls.set(c.id, el);
        if (opts.pop === c.id) el.classList.add('pop');
      }
      const html = cardHTML(c);
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
      el.setAttribute('aria-label', `${c.title}, ${who(c) === 'Example' ? 'example' : who(c).replace('P', 'Period ')}${c.mine ? ', your idea' : ''}`);
      el.classList.toggle('mine', c.mine);
      el.classList.toggle('sel', selected === c.id);
      el.classList.toggle('faded', isFaded(c));
      el.classList.toggle('hiddenc', c.hidden);
    }
    if (mode === 'list') renderList();
    const imgs = [...world.querySelectorAll<HTMLImageElement>('img.thumb')].filter((im) => !im.complete);
    const finish = () => {
      autoLayout();
      position();
      if (opts.fit || (firstFit && cards().length)) { fit(0.6); firstFit = false; }
      if (opts.focus) focusOn(opts.focus);
    };
    if (imgs.length) Promise.all(imgs.map((im) => new Promise((r) => { im.onload = im.onerror = r; }))).then(finish);
    else finish();
    if (selected && !panel.hidden) showPanel();
    if (factsOpen) renderFacts();
  }

  function position() {
    let maxX = 0, maxY = 0;
    for (const c of cards()) {
      const el = cardEls.get(c.id)!, q = pos(c);
      el.style.left = `${q.x}px`;
      el.style.top = `${q.y}px`;
      maxX = Math.max(maxX, q.x + W);
      maxY = Math.max(maxY, q.y + el.offsetHeight);
    }
    edges.setAttribute('width', String(maxX + 40));
    edges.setAttribute('height', String(maxY + 40));
    $('#zones').innerHTML = areasNow().map((a) => {
      const cs = cards().filter((c) => areaOf.get(c.id) === a.id);
      if (!cs.length) return '';
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const c of cs) { const q = pos(c), el = cardEls.get(c.id)!; l = Math.min(l, q.x); t = Math.min(t, q.y); r = Math.max(r, q.x + W); b = Math.max(b, q.y + el.offsetHeight); }
      const n = cs.filter((c) => c.parentId == null || !byId(c.parentId)).length;
      return `<div class="zone" style="left:${l - PAD}px;top:${t - HEAD}px;width:${r - l + PAD * 2}px;height:${b - t + HEAD + PAD}px"><div class="zh"><b>${esc(a.name)}</b><span>${n} ${n === 1 ? 'idea' : 'ideas'}</span></div></div>`;
    }).join('');
    const chain = new Set<number>();
    for (let n = byId(selected); n; n = byId(n.parentId)) chain.add(n.id);
    edges.innerHTML = cards().filter((c) => c.parentId != null && cardEls.has(c.parentId)).map((c) => {
      const a = byId(c.parentId)!, ea = cardEls.get(a.id)!, eb = cardEls.get(c.id)!, pa = pos(a), pb = pos(c);
      let x1 = pa.x + W, x2 = pb.x;
      const y1 = pa.y + ea.offsetHeight / 2, y2 = pb.y + eb.offsetHeight / 2;
      if (x2 < x1 - 20) { x1 = pa.x; x2 = pb.x + W; }
      const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (x2 >= x1 ? 1 : -1);
      const cls = (chain.has(c.id) && chain.has(a.id)) || selected === a.id ? 'hl' : isFaded(c) && isFaded(a) ? 'faded' : '';
      return `<path class="${cls}" d="M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"/>`;
    }).join('');
  }

  function bounds() {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const x of cards()) { const q = pos(x), el = cardEls.get(x.id)!; a = Math.min(a, q.x - PAD); b = Math.min(b, q.y - HEAD); c = Math.max(c, q.x + W + PAD); d = Math.max(d, q.y + el.offsetHeight + PAD); }
    return { a, b, c, d };
  }
  function fit(minK = 0.25) {
    if (!cards().length) return;
    const { a, b, c, d } = bounds(), sw = stage.clientWidth, sh = stage.clientHeight, pad = 40;
    const k = Math.min(1, Math.max(minK, Math.min((sw - pad * 2) / (c - a), (sh - pad * 2 - 50) / (d - b))));
    const wide = (c - a) * k > sw - pad * 2;
    view = { k, x: wide ? 20 - a * k : (sw - (c - a) * k) / 2 - a * k, y: pad - b * k };
    applyView();
  }
  function focusOn(id: number) {
    const c = byId(id), el = cardEls.get(id);
    if (!c || !el || mode === 'list') return;
    const q = pos(c);
    const panelW = panel.hidden || innerWidth <= 640 ? 0 : 400;
    const sw = stage.clientWidth - panelW, sh = innerWidth <= 640 ? stage.clientHeight * 0.3 : stage.clientHeight;
    world.classList.add('anim');
    view.x = sw / 2 - (q.x + W / 2) * view.k;
    view.y = sh / 2 - (q.y + el.offsetHeight / 2) * view.k;
    applyView();
    setTimeout(() => world.classList.remove('anim'), 400);
  }

  // ------------------------------------------------------------ list view
  function renderList() {
    const item = (c: Card): string => `<li><button data-open="${c.id}"><b>${esc(c.title)}</b><span class="small muted">${who(c) === 'Example' ? 'Example' : who(c).replace('P', 'Period ')}${c.mine ? ' · yours' : ''}${c.status ? ` · ${STATUS_LABELS[c.status]}` : ''}</span></button>${kidsOf(c.id).length ? `<ul aria-label="Dug from ${esc(c.title)}">${kidsOf(c.id).map(item).join('')}</ul>` : ''}</li>`;
    const rs = roots().sort((a, b) => shuffleKey(seed, a.id) - shuffleKey(seed, b.id));
    const html = areasNow().map((a) => {
      const mine = rs.filter((r) => areaOf.get(r.id) === a.id);
      return mine.length ? `<section><h2>${esc(a.name)} <span class="small muted">${mine.length} ${mine.length === 1 ? 'idea' : 'ideas'}</span></h2><ul>${mine.map(item).join('')}</ul></section>` : '';
    }).join('');
    $('#listview').innerHTML = html || '<p class="muted">No ideas yet.</p>';
  }

  // ------------------------------------------------------------ facts drawer
  function renderFacts() {
    drawer.innerHTML = `<header>Facts from the lesson<button class="x" data-closefacts aria-label="Close">×</button></header>
      <div class="body"><p class="small muted">Build your ideas on what's true about real animals. Something real worms can't do is a "game choice".</p>
      ${state.board.facts.map((f) => `<div class="fact">${esc(f.text)}<span class="src">Source: ${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.sourceTitle)}</a>` : esc(f.sourceTitle)}</span></div>`).join('')}</div>`;
    drawer.hidden = false;
  }
  drawer.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-closefacts]')) { factsOpen = false; drawer.hidden = true; } });

  // ------------------------------------------------------------ panel
  function select(id: number | null) {
    selected = id;
    if (mode === 'board') position();
    cardEls.forEach((el, k) => el.classList.toggle('sel', k === id));
    if (id) showPanel(); else panel.hidden = true;
  }

  function showPanel() {
    const c = byId(selected);
    if (!c) { panel.hidden = true; return; }
    const parent = byId(c.parentId), ks = kidsOf(c.id), f = factOf(c);
    const canEdit = (c.mine || teacher) && (teacher || state.board.phase !== 'closed');
    const canDelete = (c.mine && !ks.length && state.board.phase !== 'closed') || teacher;
    const area = areasNow().find((a) => a.id === areaOf.get(c.id));
    const isRoot = c.parentId == null || !parent;
    const sec = (label: string, text: string) => (text ? `<div class="sub">${label}</div><p class="desc">${esc(text)}</p>` : '');
    panel.innerHTML = `
      <header>${c.kind === 'example' ? '<span class="tag ex">Example</span>' : `<span class="tag p${c.period ?? ''}"><span class="dot"></span>${c.period == null ? 'Teacher' : `Period ${c.period}`}</span>`}${c.mine ? '<span class="tag you">Your idea</span>' : ''}<span class="small muted">${ago(c.created)}</span><button class="x" data-close aria-label="Close">×</button></header>
      <div class="body">
        ${parent ? `<div class="small muted">Dug from <button class="linkbtn" data-go="${parent.id}">${esc(parent.title)}</button></div>` : ''}
        <h2>${esc(c.title)}</h2>
        <div class="rowline"><span class="tag">${esc(area?.name ?? '')}</span>${isRoot && c.choice === 'other' ? `<span class="small muted">"${esc(answerName(state.board, c))}"</span>` : ''}${c.nickname && c.kind !== 'example' && c.period != null ? `<span class="small muted">by ${esc(c.nickname)}</span>` : ''}</div>
        ${c.status ? `<div><span class="tag st-${c.status}">${STATUS_LABELS[c.status]}${c.statusNote ? `: ${esc(c.statusNote)}` : ''}</span></div>` : ''}
        ${c.imageId ? `<img class="big" src="${href('api/img/')}${esc(c.imageId)}" alt="Picture for ${esc(c.title)}">` : ''}
        ${sec('What they changed', c.changed)}
        ${c.twist ? `<div class="small"><b>Twist:</b> ${esc(c.twist)}</div>` : ''}
        ${sec('What the player does', c.does)}
        ${sec('How a player would notice', c.notice)}
        ${f ? `<div class="fact">Based on: ${esc(f.text)}<span class="src">Source: ${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.sourceTitle)}</a>` : esc(f.sourceTitle)}</span></div>` : c.factRef === 'game' ? '<div class="small"><b>Game choice:</b> something fun the game does that real worms don\'t.</div>' : ''}
        <div class="acts">
          ${state.canPost ? '<button class="btn" data-dig2>+ Dig from here</button>' : ''}
          ${canEdit ? '<button class="btn ghost" data-edit>Change</button>' : ''}
          ${canDelete ? '<button class="btn ghost" data-del>Delete</button>' : ''}
        </div>
        ${ks.length ? `<div class="sub">Dug from this (${ks.length})</div><ul class="minilist">${ks.map((k) => `<li><button class="linkbtn" data-go="${k.id}">${esc(k.title)}</button> <span class="small muted">· ${who(k)}</span></li>`).join('')}</ul>` : ''}
        <div class="sub">I'd add…</div>
        ${notesOf(c.id).map((n) => `<div class="note">${esc(n.text)} <span>· ${n.period == null ? 'Teacher' : `Period ${n.period}`}${n.hidden ? ' · hidden' : ''}</span>${teacher ? ` <button class="linkbtn small" data-hidenote="${n.id}" data-h="${n.hidden ? 0 : 1}">${n.hidden ? 'Show' : 'Hide'}</button>` : ''}</div>`).join('')}
        ${(state.board.phase === 'open' || teacher) && state.canPost ? '<form class="noteform" data-note><input id="noteIn" maxlength="200" placeholder="A small addition to this idea" aria-label="A small addition to this idea"><button class="btn small">Add</button></form>' : ''}
        ${teacher ? `<div class="sub">Teacher</div>
          <div class="teacher">${(Object.keys(STATUS_LABELS) as Status[]).map((k) => `<button data-status="${k}" aria-pressed="${c.status === k}">${STATUS_LABELS[k]}</button>`).join('')}
            <button data-hide aria-pressed="${c.hidden}">${c.hidden ? 'Show to students' : 'Hide from students'}</button></div>
          <label class="field small">Status note (for Built: the version, like "V5"; for Parked: why)
            <span class="rowline"><input class="plain grow" id="stNote" maxlength="120" value="${esc(c.statusNote)}"><button class="btn ghost small" data-stnote>Save</button></span></label>
          ${isRoot ? `<label class="field small">Move this whole branch to
            <select class="plain" id="moveArea">${areasNow().map((a) => `<option value="${esc(a.id)}" ${area?.id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : ''}` : ''}
      </div>`;
    panel.hidden = false;
  }

  async function patch(id: number, body: object, msg?: string) {
    try { await api('PATCH', `/cards/${id}`, body); if (msg) toast(msg); await refresh(); } catch (e) { toast((e as Error).message); }
  }

  panel.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement, c = byId(selected);
    if (!c) return;
    if (t.closest('[data-close]')) select(null);
    const g = t.closest<HTMLElement>('[data-go]');
    if (g) { select(Number(g.dataset.go)); focusOn(Number(g.dataset.go)); }
    if (t.closest('[data-dig2]')) compose(c);
    if (t.closest('[data-edit]')) compose(byId(c.parentId), c);
    if (t.closest('[data-del]')) {
      if (!confirm(`Delete "${c.title}"? This can't be undone.`)) return;
      try { await api('DELETE', `/cards/${c.id}`); select(null); await refresh(); toast('Deleted.'); } catch (x) { toast((x as Error).message); }
    }
    const st = t.closest<HTMLElement>('[data-status]');
    if (st) await patch(c.id, { status: c.status === st.dataset.status ? null : st.dataset.status });
    if (t.closest('[data-hide]')) await patch(c.id, { hidden: !c.hidden }, c.hidden ? 'Students can see it again.' : 'Hidden from students.');
    if (t.closest('[data-stnote]')) await patch(c.id, { statusNote: $<HTMLInputElement>('#stNote').value }, 'Saved.');
    const hn = t.closest<HTMLElement>('[data-hidenote]');
    if (hn) { try { await api('PATCH', `/notes/${hn.dataset.hidenote}`, { hidden: hn.dataset.h === '1' }); await refresh(); } catch (x) { toast((x as Error).message); } }
  });
  panel.addEventListener('change', async (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'moveArea' && selected) await patch(selected, { areaOverride: t.value }, 'Moved.');
  });
  panel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = $<HTMLInputElement>('#noteIn');
    const v = inp.value.trim();
    if (!v || !selected) return;
    try { await api('POST', `/cards/${selected}/notes`, { text: v }); await refresh(); $<HTMLInputElement>('#noteIn')?.focus(); } catch (x) { toast((x as Error).message); }
  });

  function compose(parent?: Card, edit?: Card) {
    const first = !teacher && !posted();
    openComposer({
      board: state.board, parent, edit, teacher, firstIdea: first,
      onDone: async (card) => {
        selected = card.id;
        await refresh(true);
        if (first) toast(state.board.phase === 'open' ? 'Posted! The board is open. Look around and dig from other ideas.' : 'Posted!');
        else toast(edit ? 'Saved.' : 'Posted!');
        render({ pop: card.id, focus: card.id, fit: first });
        showPanel();
      },
    });
  }

  // ------------------------------------------------------------ pointer: pan, drag own cards, open
  let drag: { sx: number; sy: number; moved: boolean; id: number | null; vx: number; vy: number; px?: number; py?: number; canMove?: boolean } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.zoom, .legend, .panel, .gate, .drawer, .listview') || t.closest('[data-dig]')) return;
    const card = t.closest<HTMLElement>('.card');
    drag = { sx: e.clientX, sy: e.clientY, moved: false, id: card ? Number(card.dataset.id) : null, vx: view.x, vy: view.y };
    if (card) { const c = byId(drag.id)!, q = pos(c); drag.px = q.x; drag.py = q.y; drag.canMove = (c.mine || teacher) && state.board.phase !== 'closed'; }
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    if (drag.id && drag.canMove) {
      tidy.set(drag.id, { x: drag.px! + dx / view.k, y: drag.py! + dy / view.k });
      cardEls.get(drag.id)!.classList.add('dragging');
      position();
    } else { stage.classList.add('panning'); view.x = drag.vx + dx; view.y = drag.vy + dy; applyView(); }
  });
  stage.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('panning');
    if (!d.moved) { select(d.id); return; }
    if (d.id && d.canMove) {
      cardEls.get(d.id)?.classList.remove('dragging');
      const q = tidy.get(d.id)!;
      tidy.delete(d.id);
      const c = byId(d.id)!;
      c.x = Math.round(q.x);
      c.y = Math.round(q.y);
      void api('PATCH', `/cards/${d.id}`, { x: c.x, y: c.y }).catch((x) => toast((x as Error).message));
    }
  });
  stage.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-dig]');
    if (b) compose(byId(Number(b.closest<HTMLElement>('.card')!.dataset.id)));
  });
  stage.addEventListener('keydown', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.card');
    if (c && (e.key === 'Enter' || e.key === ' ') && !(e.target as HTMLElement).closest('[data-dig]')) { e.preventDefault(); select(Number(c.dataset.id)); focusOn(Number(c.dataset.id)); }
    if (e.key === 'Escape') select(null);
  });
  stage.addEventListener('wheel', (e) => {
    if ((e.target as HTMLElement).closest('.panel, .drawer, .listview')) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(view.k * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
  }, { passive: false });
  let pinch: { d: number; k: number } | null = null;
  stage.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { const [a, b] = [e.touches[0], e.touches[1]]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), k: view.k }; drag = null; } }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]], r = stage.getBoundingClientRect();
    zoomAt((pinch.k * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) / pinch.d, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
  }, { passive: true });
  stage.addEventListener('touchend', () => { pinch = null; });

  $('#zIn').onclick = () => zoomAt(view.k * 1.2, stage.clientWidth / 2, stage.clientHeight / 2);
  $('#zOut').onclick = () => zoomAt(view.k / 1.2, stage.clientWidth / 2, stage.clientHeight / 2);
  $('#zFit').onclick = () => fit();
  $('#tidyBtn').onclick = () => {
    // Tidy up only changes your own view: everyone else's board stays as it is.
    world.classList.add('anim');
    tidy = new Map(cards().map((c) => [c.id, auto.get(c.id) ?? pos(c)]));
    position();
    setTimeout(() => world.classList.remove('anim'), 400);
  };
  $('#legend').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-hl]');
    if (!b) return;
    hl = b.dataset.hl!;
    render();
  });
  $('#viewBtn').onclick = () => { mode = mode === 'board' ? 'list' : 'board'; render({ fit: mode === 'board' }); };
  $('#factsBtn').onclick = () => { factsOpen = !factsOpen; if (factsOpen) renderFacts(); else drawer.hidden = true; };
  $('#newBtn').onclick = () => compose();
  $('#gateBtn').onclick = () => compose();
  $('#listview').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
    if (b) select(Number(b.dataset.open));
  });
  $('#toolsBtn')?.addEventListener('click', () => go(`/teacher/b/${slug}`));
  root.addEventListener('click', async (e) => {
    if ((e.target as HTMLElement).id === 'signOut') {
      await api('POST', '/logout');
      go('/');
    }
  });

  // ------------------------------------------------------------ live updates
  async function refresh(force = false) {
    try {
      const s = await api<(BoardState & { since: string }) | { unchanged: true; since: string }>('GET', `/boards/${slug}/state${force ? '' : `?since=${encodeURIComponent(since)}`}`);
      since = s.since;
      if ('unchanged' in s) return;
      const wasGated = gated();
      state = s;
      if (selected && !byId(selected)) { selected = null; panel.hidden = true; }
      render({ fit: wasGated && !gated() });
    } catch { /* offline for a moment: try again next time */ }
  }
  const timer = setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) void refresh(); }, POLL_MS);
  const onResize = () => position();
  addEventListener('resize', onResize);
  addEventListener('popstate', () => { clearInterval(timer); removeEventListener('resize', onResize); }, { once: true });

  applyView();
  render();
}
