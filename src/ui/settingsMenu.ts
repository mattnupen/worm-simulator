import { el } from './dom';
import { CHOICES, CHOICE_LABELS, CHOICE_DESCRIPTIONS, type GraphicsChoice } from '../render/graphics';
import { TEXT_SIZES, TEXT_SIZE_LABELS, type TextSize } from './textSize';

export interface SettingsActions {
  onGraphics(c: GraphicsChoice): void;
  onSound(on: boolean): void;
  onTextSize(size: TextSize): void;
}

/** `graphics` is left out where there are no presets to pick (the Virtual worm page). */
export interface SettingsNow { graphics?: GraphicsChoice; sound: boolean; textSize: TextSize }

/**
 * The Settings page of the game menu (gameMenu.ts; was its own screen until Matt, 2026-10-23):
 * Sound (On, Off), Text size (Normal, Big, Bigger; Matt 2026-10-22), then Graphics (Auto, Low,
 * Medium, High, Ultra), all real radio buttons with their words (never colour alone). A change
 * applies at once, live, and is saved by the caller. The picked Graphics choice's one line sits
 * under its row (and is its description for screen readers), so the small card stays short.
 */
export function settingsFields(current: SettingsNow, a: SettingsActions): HTMLElement[] {
  const sound = group('Sound', 'sound', [true, false], current.sound, (on) => (on ? 'On' : 'Off'), a.onSound);
  const text = group('Text size', 'textSize', TEXT_SIZES, current.textSize, (s) => TEXT_SIZE_LABELS[s], a.onTextSize);
  if (current.graphics === undefined) return [sound, text];
  const desc = el('p', CHOICE_DESCRIPTIONS[current.graphics], 'choice-desc settings-desc');
  desc.id = 'settings-graphics-desc';
  const set = group('Graphics', 'graphics', CHOICES, current.graphics, (c) => CHOICE_LABELS[c], (c) => {
    desc.textContent = CHOICE_DESCRIPTIONS[c];
    a.onGraphics(c);
  });
  for (const input of set.querySelectorAll('input')) input.setAttribute('aria-describedby', desc.id);
  set.append(desc);
  return [sound, text, set];
}

function group<T>(
  legend: string, name: string, values: readonly T[], current: T, label: (v: T) => string, onPick: (v: T) => void,
): HTMLFieldSetElement {
  const set = el('fieldset', '', 'choices settings-choices');
  set.append(el('legend', legend, 'settings-legend'));
  values.forEach((v) => {
    const id = `${name}-${String(v)}`;
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.id = id;
    input.value = String(v);
    input.checked = v === current;
    input.addEventListener('change', () => { if (input.checked) onPick(v); });
    const choice = el('label', '', 'choice');
    choice.htmlFor = id;
    choice.append(input, el('span', label(v), 'choice-name'));
    set.append(choice);
  });
  return set;
}
