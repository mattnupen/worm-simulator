import { el, button } from './dom';
import { ROUNDS, VERSION } from '../version';

/**
 * The Versions list (Matt, 2026-10-12): one row per round, "Round N: Name" and one sentence. Each
 * earlier round is a real link to its frozen snapshot at /vN/; the round being played says so
 * instead. A modal <dialog> (Esc, Close or a tap outside closes it), styled like the lesson's
 * panels (lesson.css .lesson-dialog). Focus returns to `from`.
 */
export function openVersions(root: HTMLElement, from: HTMLElement): void {
  const d = el('dialog', '', 'lesson-dialog versions-dialog');
  const h = el('h2', 'Versions', 'dialog-title');
  h.id = 'versions-title';
  d.setAttribute('aria-labelledby', h.id);
  const close = button('Close', 'close', 'secondary', () => d.close());
  close.el.classList.add('btn-small', 'dialog-close');
  const head = el('div', '', 'dialog-head');
  head.append(h, close.el);

  const list = el('ul', '', 'versions-list');
  for (const r of [...ROUNDS].reverse()) {
    const li = el('li', '', 'version-row');
    const title = `Round ${r.number}: ${r.name}`;
    if (r.number === VERSION.number) {
      li.append(el('p', '', 'version-name'));
      li.lastElementChild!.append(el('span', title), el('span', 'You are playing this one', 'version-here'));
    } else {
      const a = el('a', title, 'version-name');
      a.href = `/v${r.number}/`;
      li.append(a);
    }
    li.append(el('p', r.about, 'version-about'));
    list.append(li);
  }
  d.append(head, list);
  d.addEventListener('close', () => {
    d.remove();
    from.focus({ preventScroll: true });
  });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  root.append(d);
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
  close.el.focus();
}
