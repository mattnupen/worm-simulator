import { el, button, menu } from './dom';
import { CHOICES, CHOICE_LABELS, CHOICE_DESCRIPTIONS, type GraphicsChoice } from '../render/graphics';
import { TEXT_SIZES, TEXT_SIZE_LABELS, type TextSize } from './textSize';
import type { Shell } from './shell';

export interface SettingsActions {
  onGraphics(c: GraphicsChoice): void;
  onSound(on: boolean): void;
  onTextSize(size: TextSize): void;
  onBack(): void;
}

/**
 * The Settings screen (Matt, 2026-10-12): Sound (On, Off), Text size (Normal, Big, Bigger; Matt
 * 2026-10-22), then Graphics (Auto, Low, Medium, High, Ultra), all real radio buttons with their words (never colour alone). A change applies at once,
 * live, and is saved by the caller. Focus starts on the checked Graphics choice, as before.
 */
export function showSettings(
  shell: Shell, current: { graphics: GraphicsChoice; sound: boolean; textSize: TextSize }, a: SettingsActions,
): void {
  const title = el('h1', 'Settings', 'screen-title');

  const sound = el('fieldset', '', 'choices choices-row');
  sound.append(el('legend', 'Sound', 'settings-legend'));
  for (const on of [true, false]) {
    const id = `sound-${on ? 'on' : 'off'}`;
    const input = radio('sound', id, on === current.sound, () => a.onSound(on));
    const label = el('label', '', 'choice');
    label.htmlFor = id;
    label.append(input, el('span', on ? 'On' : 'Off', 'choice-name'));
    sound.append(label);
  }

  const text = el('fieldset', '', 'choices choices-row choices-3');
  text.append(el('legend', 'Text size', 'settings-legend'));
  for (const size of TEXT_SIZES) {
    const id = `text-${size}`;
    const input = radio('textSize', id, size === current.textSize, () => a.onTextSize(size));
    const label = el('label', '', 'choice');
    label.htmlFor = id;
    label.append(input, el('span', TEXT_SIZE_LABELS[size], 'choice-name'));
    text.append(label);
  }

  const set = el('fieldset', '', 'choices');
  set.append(el('legend', 'Graphics', 'settings-legend'));
  let checked: HTMLInputElement | null = null;
  for (const c of CHOICES) {
    const id = `graphics-${c}`;
    const input = radio('graphics', id, c === current.graphics, () => a.onGraphics(c));
    input.value = c;
    input.setAttribute('aria-labelledby', `${id}-name`);
    input.setAttribute('aria-describedby', `${id}-desc`);
    if (input.checked) checked = input;
    const label = el('label', '', 'choice');
    label.htmlFor = id;
    const words = el('span', '', 'choice-words');
    const desc = el('span', CHOICE_DESCRIPTIONS[c], 'choice-desc');
    desc.id = `${id}-desc`;
    const name = el('span', CHOICE_LABELS[c], 'choice-name');
    name.id = `${id}-name`;
    words.append(name, desc);
    label.append(input, words);
    set.append(label);
  }
  const back = button('Back', 'back', 'secondary', a.onBack);
  shell.show('graphics', 'Settings', [title, sound, text, set, menu(back)]);
  (checked ?? back.el).focus();
}

function radio(name: string, id: string, checked: boolean, onPick: () => void): HTMLInputElement {
  const input = el('input');
  input.type = 'radio';
  input.name = name;
  input.id = id;
  input.checked = checked;
  input.addEventListener('change', () => { if (input.checked) onPick(); });
  return input;
}
