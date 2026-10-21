import { el } from './dom';
import { icon, type IconName } from './icons';
import { TEXT, shown } from '../content/text';

/**
 * What one press of Action (Space, or the touch Action button) will do now (V2 spec 4 and 7):
 * dig down on the surface, come up near the top underground, or switch to the Wide or the Close
 * view deeper down. While a robin holds the worm (V4), it is the grip mini-game's "Hold on": held,
 * not pressed (src/predators/tug.ts).
 */
export type ActionKind = 'digDown' | 'comeUp' | 'viewWide' | 'viewClose' | 'grip';

export interface ActionPrompt {
  /** Shows the prompt for `kind`, or hides it (null). Call every frame: an unchanged kind does nothing. */
  set(kind: ActionKind | null): void;
  /**
   * True while the on-screen Action button is pressed (touch, pen or mouse), and also from any
   * press until the next endStep(): a tap shorter than a game step (or than a slow frame) still
   * reads as held for one step. A hold outlasts set(null) and a later set(kind), as holding Space
   * does, so a hidden-then-shown prompt never makes a second press. Reading it changes nothing.
   */
  readonly touchHeld: boolean;
  /** After each game step (main.ts): a press already let go stops reading as held. Allocates nothing. */
  endStep(): void;
  dispose(): void;
}

/** Every kind, once (params.ts reads ?prompt= against it). */
export const ACTION_KINDS: readonly ActionKind[] = ['digDown', 'comeUp', 'viewWide', 'viewClose', 'grip'];
const ICONS: Readonly<Record<ActionKind, IconName>> = {
  digDown: 'digDown', comeUp: 'comeUp', viewWide: 'viewWide', viewClose: 'viewClose', grip: 'grip',
};

/**
 * The Action prompt: one real button in the HUD, bottom right, with an icon and a word from
 * src/content/text.ts (icon plus word, never colour alone), shown only while crawling (hud.css).
 * On a device with a keyboard it also wears a "Space" key chip; on a touch screen the whole
 * 64 px+ button is the Action press. It takes no keyboard focus (Space already means Action, and
 * must not also "click" it), so the crawl's focus stays on the card. It never flashes or pulses.
 * set() writes the DOM only when the kind changes, and allocates nothing.
 */
export function createActionPrompt(root: HTMLElement): ActionPrompt {
  const btn = el('button', '', 'btn btn-primary action-prompt');
  btn.type = 'button';
  btn.tabIndex = -1;
  btn.hidden = true;
  btn.setAttribute('aria-keyshortcuts', 'Space');
  const icons = ACTION_KINDS.map((k) => {
    const s = icon(ICONS[k], 'btn-icon action-icon');
    s.hidden = true;
    return s;
  });
  const word = el('span', '', 'btn-label');
  const key = el('kbd', 'Space', 'action-key');
  key.setAttribute('aria-hidden', 'true');
  btn.append(...icons, word, key);
  root.appendChild(btn);

  let kind: ActionKind | null = null;
  let pointer: number | null = null;
  /** Pressed since the last endStep(): a quick tap still reads as held for a step. */
  let tapped = false;

  const end = (): void => {
    pointer = null;
    btn.classList.remove('held');
  };
  /** On the window, so the lift ends the hold wherever it lands, even while the button is hidden. */
  const release = (e: PointerEvent): void => {
    if (e.pointerId === pointer) end();
  };
  const down = (e: PointerEvent): void => {
    // A hidden prompt starts no press.
    if (e.button !== 0 || pointer !== null || kind === null) return;
    // No focus, no text selection, no long-press menu: it is a game button.
    e.preventDefault();
    pointer = e.pointerId;
    tapped = true;
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('held');
  };
  // Switch Access and screen readers send only a click (detail 0), never a pointerdown: one press.
  // A pointer's own click (detail 1+) was already counted by pointerdown.
  const click = (e: MouseEvent): void => {
    if (e.detail === 0 && kind !== null) tapped = true;
  };
  // No menu on a long press; no click after a tap, which would land on whatever card replaced
  // the button by then (Esc pressed mid-tap: "Back to start").
  const cancel = (e: Event): void => e.preventDefault();
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('click', click);
  btn.addEventListener('contextmenu', cancel);
  btn.addEventListener('touchend', cancel, { passive: false });
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', end);

  return {
    set(next) {
      if (next === kind) return;
      if (kind !== null) icons[ACTION_KINDS.indexOf(kind)].hidden = true;
      kind = next;
      if (next === null) {
        btn.hidden = true;
        tapped = false;
        return;
      }
      icons[ACTION_KINDS.indexOf(next)].hidden = false;
      word.textContent = shown(TEXT[next]);
      btn.hidden = false;
    },
    get touchHeld() {
      return pointer !== null || tapped;
    },
    endStep() {
      tapped = false;
    },
    dispose() {
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('click', click);
      btn.removeEventListener('contextmenu', cancel);
      btn.removeEventListener('touchend', cancel);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('blur', end);
      btn.remove();
    },
  };
}
