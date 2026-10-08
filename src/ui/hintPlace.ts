/**
 * Keeps the first visit's hint card (undergroundHint.ts) off the worm's head (V2 spec 6): it sits
 * at the top or the bottom of the screen (`data-at` on the panel, hintCard.css), starting on the
 * side away from the head, and moves to the other side when the head comes near it. Where the head
 * would be under the card on both sides (the middle of a short phone screen) the card is hidden
 * until the head moves off. Reads the card's size once per card (a layout read), then only compares
 * numbers; writes the attribute only when the place changes. Allocates nothing per frame.
 */
export interface HintPlace {
  /** This frame's head on screen (CSS pixels). Does nothing unless the hint card is showing. */
  update(headX: number, headY: number): void;
}

type At = 'top' | 'bottom' | 'off';

/** The head counts as under the card within this of its edge, and leaves it beyond this. */
const NEAR = 40;
const CLEAR = 64;

export function createHintPlace(panel: HTMLElement): HintPlace {
  /** The card's box at the top and at the bottom (left, top, right, bottom), measured per card. */
  const top = [0, 0, 0, 0];
  const bottom = [0, 0, 0, 0];
  let measured = false;

  function measure(at: 'top' | 'bottom', out: number[]): void {
    panel.dataset.at = at;
    const r = panel.getBoundingClientRect();
    out[0] = r.left; out[1] = r.top; out[2] = r.right; out[3] = r.bottom;
  }
  const near = (b: number[], x: number, y: number, pad: number): boolean =>
    x > b[0] - pad && x < b[2] + pad && y > b[1] - pad && y < b[3] + pad;

  function place(at: At): void {
    if (panel.dataset.at !== at) panel.dataset.at = at;
  }

  return {
    update(x, y) {
      if (panel.dataset.card !== 'hint' || panel.hidden) {
        measured = false;
        return;
      }
      if (!measured || panel.dataset.at === undefined) {
        measure('bottom', bottom);
        measure('top', top);
        measured = true;
        // Start on the side away from the head.
        place(!near(top, x, y, CLEAR) ? 'top' : !near(bottom, x, y, CLEAR) ? 'bottom' : 'off');
        return;
      }
      const at = panel.dataset.at as At;
      if (at === 'top' && near(top, x, y, NEAR)) place(!near(bottom, x, y, CLEAR) ? 'bottom' : 'off');
      else if (at === 'bottom' && near(bottom, x, y, NEAR)) place(!near(top, x, y, CLEAR) ? 'top' : 'off');
      else if (at === 'off') {
        if (!near(top, x, y, CLEAR)) place('top');
        else if (!near(bottom, x, y, CLEAR)) place('bottom');
      }
    },
  };
}
