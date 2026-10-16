import './quests.css';
import { el, button, cardHead, menu, type Button } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';
import { FORM_URL, VERSION_TITLE } from '../version';
import { openVersions } from './versionsDialog';
import { TEXT, shown, type Line } from '../content/text';
import { PLAY_GOAL_SECONDS, type Quest, type QuestId } from '../game/quests';

export interface StartActions {
  onCrawl(): void;
  onSettings(): void;
  /** "Watch the opening": the opening scene again (src/opening/). */
  onOpening?(): void;
  /**
   * The preview link (?opening=1, Matt's review): "Watch the opening" leads Start, right under the
   * title, open whatever the quests say, and gets focus.
   */
  openingPreview?: boolean;
}

/**
 * The round's quests on Start (src/game/quests.ts): Learn, Play, Vote, in that order. Learn opens
 * the lesson, Play is the Crawl button, Vote opens the vote reminder.
 */
export interface StartRound {
  lessonTitle: string;
  quests: readonly Quest[];
  /** Whole minutes played toward the Play quest. */
  playMinutes: number;
  onLesson(): void;
  onVote(): void;
}

const QUEST_NAMES: Record<QuestId, string> = { learn: 'Learn', play: 'Play', vote: 'Vote' };
const BEFORE: Record<QuestId, string> = { learn: '', play: 'Learn', vote: 'Play' };

/**
 * Start: the parchment title card over the live forest. With a round, its three quests come first,
 * each a numbered row with its state in words and an icon (never colour alone): done (a tick, and
 * it can be done again), next (the main button, which gets focus) or locked (a lock and a disabled
 * button: "Finish Learn first"). Without a round, Crawl leads as before. `fromGraphics`: back from
 * the Settings screen, so focus returns to its button. The speed test has no button (Matt,
 * 2026-10-12): it opens with ?speedtest=1.
 */
export function showStart(shell: Shell, a: StartActions, fromGraphics = false, round?: StartRound): void {
  const graphics = button('Settings', 'sliders', 'secondary', a.onSettings);
  const preview = !!(a.openingPreview && a.onOpening);
  const watch = a.onOpening ? button(shown(TEXT.openingWatch), 'eye', preview ? 'primary' : 'secondary', a.onOpening) : null;
  const head: HTMLElement[] = [cardHead(VERSION_TITLE), el('p', 'You are an earthworm under the leaves of a northern forest.', 'lead')];
  // The preview link: the opening leads, under the title, and is focused.
  if (preview && watch) head.push(menu(watch));
  const rowWatch = preview ? null : watch;
  if (!round) {
    const crawl = button('Crawl', 'play', preview ? 'secondary' : 'primary', a.onCrawl);
    shell.show('start', 'Start', [...head, menu(crawl, ...(rowWatch ? [rowWatch] : []), graphics), versionsLink(shell)]);
    (fromGraphics ? graphics : preview && watch ? watch : crawl).el.focus();
    return;
  }
  const list = el('ol', '', 'quests');
  list.setAttribute('aria-label', "This round's quests");
  let focus: Button | null = null;
  let crawl: Button | null = null;
  round.quests.forEach((q, i) => {
    const label = q.id === 'learn' ? `Learn: ${round.lessonTitle}` : q.id === 'play' ? 'Crawl' : 'Vote';
    const act = q.id === 'learn' ? round.onLesson : q.id === 'play' ? a.onCrawl : round.onVote;
    const b = button(label, q.id === 'learn' ? 'eye' : q.id === 'play' ? 'play' : 'form', q.state === 'next' ? 'primary' : 'secondary', act);
    if (q.state === 'locked') b.el.disabled = true;
    if (q.state === 'next') focus = b;
    if (q.id === 'play') crawl = b;
    const li = el('li', '', `quest quest-${q.state}`);
    li.dataset.quest = q.id;
    const mark = el('span', '', 'quest-mark');
    mark.setAttribute('aria-hidden', 'true');
    if (q.state === 'done') mark.append(icon('check', 'quest-icon'));
    else if (q.state === 'locked') mark.append(icon('lock', 'quest-icon'));
    else mark.textContent = String(i + 1);
    const words = el('div', '', 'quest-words');
    words.append(el('p', `Quest ${i + 1} · ${QUEST_NAMES[q.id]}`, 'quest-name'), el('p', status(q, round.playMinutes), 'quest-status'));
    li.append(mark, words, b.el);
    list.append(li);
  });
  const tools = el('div', '', 'menu menu-row');
  // Settings first, as before the opening existed, so its place in the Tab order holds.
  tools.append(graphics.el);
  if (rowWatch) tools.append(rowWatch.el);
  shell.show('start', 'Start', [...head, list, tools, versionsLink(shell)]);
  // Every quest done: Crawl leads (play on as long as you like).
  const first: Button = fromGraphics ? graphics : preview && watch ? watch : focus ?? crawl ?? graphics;
  first.el.focus();
}

/**
 * "Versions", bottom right of Start (Matt, 2026-10-12): a link-styled button that opens the list of
 * rounds (versionsDialog.ts). It comes after the menu in the focus order.
 */
function versionsLink(shell: Shell): HTMLParagraphElement {
  const p = el('p', '', 'version');
  const b = el('button', 'Versions', 'versions-link');
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'dialog');
  b.addEventListener('click', () => openVersions(shell.root, b));
  p.append(b);
  return p;
}

function status(q: Quest, minutes: number): string {
  if (q.state === 'locked') return `Locked: finish ${BEFORE[q.id]} first`;
  if (q.id === 'learn') return q.state === 'done' ? 'Done. You can look again.' : 'Start here';
  if (q.id === 'play') {
    return q.state === 'done' ? 'Done. Keep playing any time.' : `${minutes} of ${PLAY_GOAL_SECONDS / 60} minutes played`;
  }
  return q.state === 'done' ? 'Done. Thanks for voting!' : 'Vote in the Google Form';
}

/**
 * Vote: the third quest. "Open the form" links to this round's Google Form in a new tab (Matt,
 * 2026-10-13). The game never sees the answers, so the student comes back and taps "I voted".
 */
export function showVote(shell: Shell, onVoted: () => void, onStart: () => void): void {
  const form = el('a', '', 'btn btn-primary');
  form.href = FORM_URL;
  form.target = '_blank';
  form.rel = 'noopener noreferrer';
  form.append(icon('external', 'btn-icon'), el('span', 'Open the form', 'btn-label'), el('span', ' (opens in a new tab)', 'sr-only'));
  const voted = button('I voted', 'check', 'secondary', onVoted);
  const actions = menu(voted, button('Back to start', 'home', 'secondary', onStart));
  actions.prepend(form);
  shell.show('vote', 'Vote', [
    el('h1', 'Quest 3 · Vote', 'screen-title'),
    el('p', 'Open the Google Form. Vote, and share your design ideas for the game.', 'lead'),
    el('p', 'When you have sent the form, come back and tap "I voted".', 'vote-note'),
    actions,
  ]);
  form.focus();
}

/** A touch screen with no hover (the Action prompt's own test, hud.css): the touch controls line. */
const TOUCH = '(hover: none) and (pointer: coarse)';

/**
 * The crawl card on the surface (Matt, 2026-10-12): the short controls line (the touch line on a
 * touch screen), then `mission`, the round's lesson mission, when there is one, with a flag.
 * Focus rests on it so Space and arrows press no button.
 */
export function showCrawl(shell: Shell, mission?: Line): void {
  const touch = typeof matchMedia === 'function' && matchMedia(TOUCH).matches;
  const hint = el('p', '', 'hint');
  hint.append(
    icon('drive', 'hint-icon'),
    el('span', shown(touch ? TEXT.crawlHintTouch : TEXT.crawlHint)),
  );
  const lines = [hint];
  if (mission) {
    const q = el('p', '', 'hint hint-think');
    // "Mission:" in bold, so it stands apart from the question.
    const text = shown(mission);
    const words = el('span');
    const label = /^Mission:/.exec(text)?.[0];
    if (label) words.append(el('strong', label), text.slice(label.length));
    else words.textContent = text;
    q.append(icon('flag', 'hint-icon'), words);
    lines.push(q);
  }
  shell.show('crawl', 'Crawling', lines);
  shell.panel.focus({ preventScroll: true });
}

export interface PauseActions {
  onResume(): void;
  onSettings(): void;
  onStart(): void;
  /** The preview link (?opening=1) only: "Watch the opening" again from Pause. */
  onOpening?(): void;
}

/** Paused. `fromGraphics`: back from the Settings screen, so focus returns to its button. */
export function showPause(shell: Shell, a: PauseActions, fromGraphics = false): void {
  const resume = button('Resume', 'play', 'primary', a.onResume);
  const graphics = button('Settings', 'sliders', 'secondary', a.onSettings);
  shell.show('pause', 'Paused', [
    el('h1', 'Paused', 'screen-title'),
    menu(
      resume,
      ...(a.onOpening ? [button(shown(TEXT.openingWatch), 'eye', 'secondary', a.onOpening)] : []),
      graphics,
      button('Back to start', 'home', 'secondary', a.onStart),
    ),
  ]);
  (fromGraphics ? graphics : resume).el.focus();
}

/**
 * The game cannot go on, and the only way on is a reload: by default the graphics stopped (the
 * context was lost outside the speed test); main.ts passes its own title and message when the
 * world failed to build or the game loop crashed ("Something went wrong").
 */
export function showLost(
  shell: Shell,
  message = 'The computer reset its 3D graphics. Reload the page to keep playing.',
  title = 'The graphics stopped',
): void {
  const reload = button('Reload the page', 'back', 'primary', () => location.reload());
  shell.show('lost', title, [
    el('h1', title, 'screen-title'),
    el('p', message, 'lead'),
    menu(reload),
  ]);
  reload.el.focus();
}
