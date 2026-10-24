import { createGameMenu } from '../ui/gameMenu';
import { applyTextSize } from '../ui/textSize';
import { setSoundEnabled } from '../ui/lessonSound';
import { browserStore, loadSettings, updateSettings } from '../save/settingsStore';
import { lessonDone } from '../save/lessonStore';
import { loadRound } from '../save/questStore';
import { lessonFor } from '../content/lessons';
import { playMinutes, quests, type QuestProgress } from '../game/quests';
import { VERSION } from '../version';
import { ANATOMY_UI } from '../content/anatomy';

/**
 * The game menu on the Virtual worm page too (Matt, 2026-10-24): the same tab at the top left,
 * with the round's mission and quests, the rounds, Settings (Sound and Text size: the page has no
 * graphics presets) and About, with the viewer's own controls as the first page. Mission's "Back
 * to start" goes to the game. Nothing here pauses.
 */
export function addPageMenu(app: HTMLElement, controls: HTMLElement | null): void {
  const store = browserStore();
  const saved = loadSettings(store);
  let { sound, textSize } = saved;
  setSoundEnabled(sound);
  applyTextSize(textSize);
  const lesson = lessonFor('');
  const round = loadRound(store, VERSION.number);
  const progress = (): QuestProgress => ({
    learned: !lesson || lessonDone(store, lesson.id),
    playSeconds: round.playSeconds,
    voted: round.voted,
  });
  const mission = lesson?.steps.find((s): s is Extract<typeof s, { kind: 'mission' }> => s.kind === 'mission');
  const menu = createGameMenu(app, {
    mission: () => mission?.short ?? mission?.notice,
    quests: () => lesson ? { quests: quests(progress()), playMinutes: playMinutes(progress()) } : undefined,
    settings: () => ({ sound, textSize }),
    onGraphics: () => {},
    onSound: (on) => {
      sound = updateSettings(store, { sound: on }).sound;
      setSoundEnabled(sound);
    },
    onTextSize: (size) => {
      textSize = updateSettings(store, { textSize: size }).textSize;
      applyTextSize(textSize);
    },
    opening: () => undefined,
    toStart: () => () => location.assign(location.pathname),
    pause: () => null,
    onPause: () => {},
    onResume: () => {},
    release: () => {},
  }, {
    virtualWorm: false,
    // The viewer's controls are the menu's first page, so they hide with it (Matt, 2026-10-24).
    extra: controls ? { icon: 'virtualWorm', name: ANATOMY_UI.title, body: controls } : undefined,
  });
  // A wide screen opens on them; a phone starts with the menu shut, so the worm shows first.
  if (controls && innerWidth > 700) menu.open('extra');
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.escape()) e.preventDefault();
  });
}
