import { LIMITS, answerName, type Board, type Card, type CardInput } from '../shared/model.ts';
import { $, $$, api, esc, href } from './api.ts';

/**
 * The guided Think card (brief section 6): the step-by-step part that used to be the Google Form.
 * A new idea: pick a group, pick the fact it's based on, write it, then draw it. A dig starts with
 * "What did you change?" and an optional twist. Editing shows the same steps, filled in.
 */
export interface ComposerOptions {
  board: Board;
  parent?: Card;
  edit?: Card;
  teacher: boolean;
  /** True while this student hasn't posted yet (the board opens once they do). */
  firstIdea: boolean;
  onDone: (card: Card) => void;
}

const COLORS: [string, string][] = [
  ['#1d2330', 'Black'], ['#7a4a21', 'Brown'], ['#e0457b', 'Pink'], ['#d92d20', 'Red'],
  ['#f79009', 'Orange'], ['#eab308', 'Yellow'], ['#16a34a', 'Green'], ['#2563eb', 'Blue'], ['#7a5af8', 'Purple'],
];

type StepId = 'change' | 'group' | 'fact' | 'words' | 'picture';
const STEP_NAMES: Record<StepId, string> = { change: 'Your change', group: 'Group', fact: 'Fact', words: 'Your idea', picture: 'Picture' };

let dlg: HTMLDialogElement | null = null;

export function openComposer(o: ComposerOptions) {
  dlg?.remove();
  dlg = document.createElement('dialog');
  dlg.setAttribute('aria-labelledby', 'compTitle');
  document.body.appendChild(dlg);
  const { board, parent, edit } = o;
  const isDig = !!(parent || edit?.parentId != null);
  const steps: StepId[] = isDig ? ['change', 'fact', 'words', 'picture'] : ['group', 'fact', 'words', 'picture'];
  if (!board.facts.length) steps.splice(steps.indexOf('fact'), 1);

  const v = {
    choice: edit?.choice ?? '',
    choiceOther: edit?.choiceOther ?? '',
    factRef: edit?.factRef ?? '',
    title: edit?.title ?? '',
    does: edit?.does ?? '',
    notice: edit?.notice ?? '',
    changed: edit?.changed ?? '',
    twist: edit?.twist ?? '',
    example: edit?.kind === 'example',
  };
  let step = 0;
  let twistIdx = Math.floor(Math.random() * Math.max(1, board.twists.length));

  // picture state
  let picMode: 'draw' | 'upload' | 'none' = edit ? (edit.imageId ? 'draw' : 'none') : 'draw';
  let picTouched = false;
  let uploaded: string | null = null;
  const pad = document.createElement('canvas');
  pad.width = 900;
  pad.height = 600;
  pad.id = 'pad';
  pad.setAttribute('aria-label', 'Drawing area. Draw with your mouse, finger or stylus.');
  const ctx = pad.getContext('2d')!;
  const history: ImageData[] = [];
  let color = COLORS[0][0], size = 9, erasing = false, drawing = false, last: [number, number] | null = null, dirty = false;
  const clearPad = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pad.width, pad.height); dirty = false; };
  clearPad();
  if (edit?.imageId) {
    const im = new Image();
    im.onload = () => { ctx.drawImage(im, 0, 0, pad.width, pad.height); dirty = true; };
    im.src = href(`api/img/${edit.imageId}`);
  }
  const p = (e: PointerEvent): [number, number] => {
    const r = pad.getBoundingClientRect();
    return [((e.clientX - r.left) * pad.width) / r.width, ((e.clientY - r.top) * pad.height) / r.height];
  };
  const stroke = (a: [number, number], b: [number, number]) => {
    ctx.strokeStyle = erasing ? '#fff' : color;
    ctx.lineWidth = erasing ? size * 3 : size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
    dirty = true;
    picTouched = true;
  };
  pad.addEventListener('pointerdown', (e) => {
    drawing = true;
    last = p(e);
    history.push(ctx.getImageData(0, 0, pad.width, pad.height));
    if (history.length > 30) history.shift();
    pad.setPointerCapture(e.pointerId);
    stroke(last, [last[0] + 0.1, last[1]]);
  });
  pad.addEventListener('pointermove', (e) => { if (!drawing || !last) return; const q = p(e); stroke(last, q); last = q; });
  for (const t of ['pointerup', 'pointercancel']) pad.addEventListener(t, () => { drawing = false; });

  /** Drawings are shrunk before saving so the board stays light on Chromebooks (brief section 6). */
  function shrink(src: CanvasImageSource, w: number, h: number, maxW = 600, maxH = 400): string {
    const k = Math.min(1, maxW / w, maxH / h);
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const x = c.getContext('2d')!;
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  function pictureValue(): string | null | undefined {
    if (edit && !picTouched) return undefined; // keep
    if (picMode === 'draw') return dirty ? shrink(pad, pad.width, pad.height) : null;
    if (picMode === 'upload') return uploaded;
    return null;
  }

  const counter = (id: string, max: number) => `<span class="counter" id="${id}-n" aria-live="off"></span><span hidden data-max="${max}"></span>`;

  function stepHTML(id: StepId): string {
    switch (id) {
      case 'change': {
        const tw = board.twists[twistIdx % Math.max(1, board.twists.length)];
        const src = parent ?? (edit && edit.parentId != null ? { title: 'the idea you dug from', period: null } : null);
        return `
          <div class="from">Building on <b>${esc(src?.title ?? '')}</b>${src && 'period' in src && src.period ? ` (Period ${src.period})` : ''}. Their idea stays exactly as it is. Yours becomes a new branch linked to it.</div>
          <label class="field" for="fChanged">What did you change or add?
            <textarea id="fChanged" maxlength="${LIMITS.changed}" placeholder="I made it…">${esc(v.changed)}</textarea></label>
          ${tw ? `<div class="twist" role="group" aria-label="Twist idea"><span>Need a spark? Try a twist: <b id="twistText">${esc(v.twist || tw)}</b></span>
            <button type="button" class="btn ghost small" id="twistUse" aria-pressed="${!!v.twist}">${v.twist ? '✓ Using this twist' : 'Use this twist'}</button>
            <button type="button" class="btn ghost small" id="twistNext">Another one</button></div>` : ''}`;
      }
      case 'group':
        return `
          <p class="q" id="gq">${esc(board.question || 'Which group is your idea about?')}</p>
          <div class="choices" role="radiogroup" aria-labelledby="gq">
            ${board.choices.map((c) => `<label><input type="radio" name="choice" value="${esc(c.id)}" ${v.choice === c.id ? 'checked' : ''}><span>${esc(c.name)}${c.hint ? `<span class="src">${esc(c.hint)}</span>` : ''}</span></label>`).join('')}
            <label><input type="radio" name="choice" value="other" ${v.choice === 'other' ? 'checked' : ''}><span style="flex:1">Something else
              <input type="text" id="fOther" maxlength="${LIMITS.choiceOther}" placeholder="Write it here" value="${esc(v.choiceOther)}" aria-label="Something else: write it here"></span></label>
          </div>`;
      case 'fact':
        return `
          <p class="q" id="fq">Which fact is your idea based on?</p>
          <div class="choices" role="radiogroup" aria-labelledby="fq">
            ${board.facts.map((f) => `<label><input type="radio" name="fact" value="${esc(f.id)}" ${v.factRef === f.id ? 'checked' : ''}><span>${esc(f.text)}<span class="src">Source: ${esc(f.sourceTitle)}</span></span></label>`).join('')}
            <label><input type="radio" name="fact" value="game" ${v.factRef === 'game' ? 'checked' : ''}><span>It's a <b>game choice</b>: something fun the game does that real worms don't</span></label>
            <label><input type="radio" name="fact" value="" ${v.factRef === '' ? 'checked' : ''}><span>Not sure yet</span></label>
          </div>`;
      case 'words':
        return `
          ${isDig ? '' : `<div class="from">Your idea is about <b>${esc(answerName(board, { kind: 'idea', choice: v.choice, choiceOther: v.choiceOther }))}</b>.</div>`}
          <label class="field" for="fTitle">Give it a short title
            <input type="text" id="fTitle" maxlength="${LIMITS.title}" placeholder="A short name for your idea" autocomplete="off" value="${esc(v.title)}"></label>
          <label class="field" for="fDoes">What does the player do?
            <textarea id="fDoes" maxlength="${LIMITS.does}" placeholder="In the game, the worm…">${esc(v.does)}</textarea>${counter('fDoes', LIMITS.does)}</label>
          <label class="field" for="fNotice">How would a player notice it?
            <textarea id="fNotice" maxlength="${LIMITS.notice}" placeholder="They would see, hear or feel…">${esc(v.notice)}</textarea></label>
          ${o.teacher && !isDig ? `<label class="rowline small"><input type="checkbox" id="fExample" ${v.example ? 'checked' : ''}> Show this as an <b>example</b> card</label>` : ''}`;
      case 'picture':
        return `
          <p class="q">Draw your idea, or add a picture</p>
          <div class="pictabs" role="group" aria-label="Picture">
            <button type="button" data-pt="draw" aria-pressed="${picMode === 'draw'}">Draw</button>
            <button type="button" data-pt="upload" aria-pressed="${picMode === 'upload'}">Add an image</button>
            <button type="button" data-pt="none" aria-pressed="${picMode === 'none'}">No picture</button>
          </div>
          <div class="drawbox" id="drawBox" ${picMode === 'draw' ? '' : 'hidden'}>
            <div id="padSlot"></div>
            <div class="padtools" id="padtools">
              ${COLORS.map(([c, n]) => `<button type="button" class="sw" data-c="${c}" style="background:${c}" aria-label="${n}" aria-pressed="${!erasing && color === c}"></button>`).join('')}
              <span class="sep"></span>
              ${[[4, 'Thin'], [9, 'Medium'], [20, 'Thick']].map(([s, n]) => `<button type="button" class="tool" data-size="${s}" aria-pressed="${size === s}">${n}</button>`).join('')}
              <button type="button" class="tool" id="eraser" aria-pressed="${erasing}">Eraser</button>
              <span class="sep"></span>
              <button type="button" class="tool" id="undo">Undo</button>
              <button type="button" class="tool" id="padClear">Clear</button>
            </div>
          </div>
          <div class="upload" id="uploadBox" ${picMode === 'upload' ? '' : 'hidden'}>
            <img id="upPreview" alt="Your image" ${uploaded ? `src="${uploaded}"` : 'hidden'}>
            <label class="btn ghost small" for="fImg">Choose an image</label><input type="file" id="fImg" accept="image/png,image/jpeg,image/webp" hidden>
          </div>
          <p class="privacy">Keep names and faces out of your picture, including your own.</p>`;
    }
  }

  function collect() {
    const val = (id: string) => ($<HTMLInputElement>(`#${id}`, dlg!)?.value ?? undefined);
    const radio = (name: string) => $<HTMLInputElement>(`input[name="${name}"]:checked`, dlg!)?.value;
    const id = steps[step];
    if (id === 'change') v.changed = val('fChanged') ?? v.changed;
    if (id === 'group') { v.choice = radio('choice') ?? ''; v.choiceOther = val('fOther') ?? ''; }
    if (id === 'fact') v.factRef = radio('fact') ?? '';
    if (id === 'words') {
      v.title = val('fTitle') ?? v.title;
      v.does = val('fDoes') ?? v.does;
      v.notice = val('fNotice') ?? v.notice;
      const ex = $<HTMLInputElement>('#fExample', dlg!);
      if (ex) v.example = ex.checked;
    }
  }

  function problem(): string | null {
    const id = steps[step];
    if (id === 'group' && !v.choice) return 'Pick what your idea is about.';
    if (id === 'group' && v.choice === 'other' && !v.choiceOther.trim()) return 'Write what your idea is about in the "Something else" box.';
    if (id === 'change' && !v.changed.trim() && !v.twist) return 'Write what you changed, or use a twist.';
    if (id === 'words' && !v.title.trim()) return 'Give your idea a short title so others can find it.';
    if (id === 'words' && !v.does.trim()) return 'Tell us what the player does.';
    return null;
  }

  function render() {
    const id = steps[step];
    const last = step === steps.length - 1;
    const heading = edit ? 'Change your idea' : parent ? 'Dig from here' : o.firstIdea ? 'Your idea first' : 'New idea';
    dlg!.innerHTML = `
      <form class="comp" novalidate>
        <h2 id="compTitle">${heading}</h2>
        ${o.firstIdea && !edit ? '<p class="small muted">Think on your own first. The board opens as soon as you post.</p>' : ''}
        <ol class="stepper" aria-label="Steps">${steps.map((s, i) => `<li ${i === step ? 'aria-current="step"' : ''} class="${i < step ? 'done' : ''}">${i + 1}. ${STEP_NAMES[s]}</li>`).join('')}</ol>
        ${stepHTML(id)}
        <p class="err" id="err" role="alert" hidden></p>
        <div class="row-end">
          <button type="button" class="btn ghost" id="cancel">Cancel</button>
          ${step > 0 ? '<button type="button" class="btn ghost" id="back">Back</button>' : ''}
          <button type="submit" class="btn" id="next">${last ? (edit ? 'Save changes' : 'Post idea') : 'Next'}</button>
        </div>
      </form>`;
    if (id === 'picture') $('#padSlot', dlg!).replaceWith(pad);
    const first = $<HTMLElement>('input:checked, textarea, input[type=text], .pictabs button', dlg!);
    first?.focus();
    for (const ta of $$<HTMLTextAreaElement>('textarea', dlg!)) {
      const n = $(`#${ta.id}-n`, dlg!);
      if (n) { const upd = () => (n.textContent = `${ta.value.length} / ${ta.maxLength}`); ta.addEventListener('input', upd); upd(); }
    }
  }

  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('#cancel')) { dlg!.close(); return; }
    if (t.closest('#back')) { collect(); step--; render(); return; }
    if (t.closest('#twistNext')) { twistIdx++; v.twist = ''; collect(); render(); return; }
    if (t.closest('#twistUse')) { collect(); v.twist = v.twist ? '' : board.twists[twistIdx % board.twists.length]; render(); return; }
    const pt = t.closest<HTMLElement>('[data-pt]');
    if (pt) {
      picMode = pt.dataset.pt as typeof picMode;
      picTouched = true;
      for (const b of $$('[data-pt]', dlg!)) b.setAttribute('aria-pressed', String(b === pt));
      $('#drawBox', dlg!).hidden = picMode !== 'draw';
      $('#uploadBox', dlg!).hidden = picMode !== 'upload';
      return;
    }
    const sw = t.closest<HTMLElement>('.sw');
    if (sw) { color = sw.dataset.c!; erasing = false; $('#eraser', dlg!).setAttribute('aria-pressed', 'false'); for (const x of $$('.sw', dlg!)) x.setAttribute('aria-pressed', String(x === sw)); }
    const sz = t.closest<HTMLElement>('[data-size]');
    if (sz) { size = Number(sz.dataset.size); for (const x of $$('[data-size]', dlg!)) x.setAttribute('aria-pressed', String(x === sz)); }
    if (t.id === 'eraser') { erasing = !erasing; t.setAttribute('aria-pressed', String(erasing)); }
    if (t.id === 'undo' && history.length) { ctx.putImageData(history.pop()!, 0, 0); picTouched = true; }
    if (t.id === 'padClear') { history.push(ctx.getImageData(0, 0, pad.width, pad.height)); clearPad(); picTouched = true; }
  });
  dlg.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'fOther') return;
    if (t.name === 'choice' && t.value === 'other') $<HTMLInputElement>('#fOther', dlg!)?.focus();
    if (t.id === 'fImg' && t.files?.[0]) {
      const f = t.files[0];
      const url = URL.createObjectURL(f);
      const im = new Image();
      im.onload = () => {
        uploaded = shrink(im, im.naturalWidth, im.naturalHeight, 900, 600);
        URL.revokeObjectURL(url);
        picTouched = true;
        const pv = $<HTMLImageElement>('#upPreview', dlg!);
        pv.src = uploaded;
        pv.hidden = false;
      };
      im.onerror = () => { const err = $('#err', dlg!); err.textContent = 'That file isn\'t a picture we can use. Try a JPG or PNG.'; err.hidden = false; };
      im.src = url;
      t.value = '';
    }
  });
  dlg.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'fOther') { const r = $<HTMLInputElement>('input[name="choice"][value="other"]', dlg!); if (r) r.checked = true; }
  });
  dlg.addEventListener('submit', async (e) => {
    e.preventDefault();
    collect();
    const err = $('#err', dlg!);
    const pr = problem();
    if (pr) { err.textContent = pr; err.hidden = false; return; }
    if (step < steps.length - 1) { step++; render(); return; }
    const btn = $<HTMLButtonElement>('#next', dlg!);
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const body: CardInput = {
      factRef: v.factRef, title: v.title, does: v.does, notice: v.notice, changed: v.changed, twist: v.twist,
      image: pictureValue(),
    };
    if (!isDig) { body.choice = v.choice; body.choiceOther = v.choiceOther; }
    if (o.teacher && !isDig) body.kind = v.example ? 'example' : 'idea';
    try {
      let card: Card;
      if (edit) {
        if (!o.teacher) delete body.kind;
        card = await api<Card>('PATCH', `/cards/${edit.id}`, body);
      } else {
        if (parent) body.parentId = parent.id;
        card = await api<Card>('POST', `/boards/${board.slug}/cards`, body);
      }
      dlg!.close();
      o.onDone(card);
    } catch (x) {
      err.textContent = (x as Error).message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = edit ? 'Save changes' : 'Post idea';
    }
  });
  dlg.addEventListener('close', () => { dlg?.remove(); dlg = null; });
  render();
  dlg.showModal();
}
