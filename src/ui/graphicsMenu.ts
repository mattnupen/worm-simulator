import { el, button, menu } from './dom';
import { CHOICES, CHOICE_LABELS, CHOICE_DESCRIPTIONS, type GraphicsChoice } from '../render/graphics';
import type { Shell } from './shell';

/**
 * The Graphics screen: five real radio buttons (Auto, Low, Medium, High, Ultra), each with a
 * one-line description. A change applies at once, live, and is saved by the caller.
 */
export function showGraphics(
  shell: Shell, current: GraphicsChoice, onChoose: (c: GraphicsChoice) => void, onBack: () => void,
): void {
  const set = el('fieldset', '', 'choices');
  set.append(el('legend', 'Graphics', 'screen-title'));
  let checked: HTMLInputElement | null = null;
  for (const c of CHOICES) {
    const id = `graphics-${c}`;
    const input = el('input');
    input.type = 'radio';
    input.name = 'graphics';
    input.id = id;
    input.value = c;
    input.checked = c === current;
    input.setAttribute('aria-describedby', `${id}-desc`);
    input.addEventListener('change', () => { if (input.checked) onChoose(c); });
    if (input.checked) checked = input;
    const label = el('label', '', 'choice');
    label.htmlFor = id;
    const words = el('span', '', 'choice-words');
    const desc = el('span', CHOICE_DESCRIPTIONS[c], 'choice-desc');
    desc.id = `${id}-desc`;
    words.append(el('span', CHOICE_LABELS[c], 'choice-name'), desc);
    label.append(input, words);
    set.append(label);
  }
  const back = button('Back', 'back', 'secondary', onBack);
  shell.show('graphics', 'Graphics', [set, menu(back)]);
  (checked ?? back.el).focus();
}
