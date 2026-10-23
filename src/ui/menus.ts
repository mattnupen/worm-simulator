import './quests.css';
import { el, button, cardHead, menu, type Button } from './dom';
import { virtualWormLink } from './virtualWorm';
import { icon } from './icons';
import type { Shell } from './shell';
import { FORM_URL, VERSION_TITLE } from '../version';
import { TEXT, shown } from '../content/text';
import { PLAY_GOAL_SECONDS, type Quest, type QuestId } from '../game/quests';

export interface StartActions {
  onCrawl(): void;
  /**
   * The preview link (?opening=1, Matt's review): "Watch the opening" leads Start, right under the
   * title, open whatever the quests say, and gets focus. Otherwise the replay is in the game menu's
   * Rounds page (gameMenu.ts).
   */
  onOpeningPreview?(): void;
  /** `?nest=1` (V4 review): "Watch the nest scene" under the title (after the opening's preview), focused. */
  onNest?(): void;
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
 * button: "Finish Learn first"). Without a round, Crawl leads as before. Settings, the rounds and
 * the opening's replay live in the game menu (gameMenu.ts; Matt, 2026-10-23). The speed test has
 * no button (Matt, 2026-10-12): it opens with ?speedtest=1.
 */
export function showStart(shell: Shell, a: StartActions, round?: StartRound): void {
  const watch = a.onOpeningPreview ? button(shown(TEXT.openingWatch), 'eye', 'primary', a.onOpeningPreview) : null;
  const head: HTMLElement[] = [cardHead(VERSION_TITLE), el('p', 'You are an earthworm under the leaves of a northern forest.', 'lead')];
  // The preview link: the opening leads, under the title, and is focused.
  if (watch) head.push(menu(watch));
  // The nest scene's preview link: its button leads, under the title, and is focused.
  const nest = a.onNest ? button(shown(TEXT.nestWatch), 'eye', 'primary', a.onNest) : null;
  if (nest) head.push(menu(nest));
  const preview = nest ?? watch;
  if (!round) {
    const crawl = button('Crawl', 'play', watch ? 'secondary' : 'primary', a.onCrawl);
    shell.show('start', 'Start', [...head, menu(crawl), wormLink()]);
    (preview ?? crawl).el.focus();
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
  shell.show('start', 'Start', [...head, list, wormLink()]);
  // Every quest done: Crawl leads (play on as long as you like).
  const first: Button | null = preview ?? focus ?? crawl;
  first?.el.focus();
}

/** The virtual worm (the 3D anatomy model), under the quests: it opens in a new tab. */
function wormLink(): HTMLElement {
  const m = el('div', '', 'menu');
  m.append(virtualWormLink('btn btn-secondary'));
  return m;
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

/**
 * Crawling on the surface: no card, so the forest shows (the round's mission is on the game menu's
 * Mission page; Matt, 2026-10-23). Focus goes to the hidden card's place, so Space and the arrows
 * move the worm instead of pressing a button.
 */
export function showCrawl(shell: Shell): void {
  shell.show('crawl', 'Crawling', []);
  shell.panel.hidden = true;
  releaseFocus(shell);
}

/** Keys back to the worm: off any button, onto the page (a hidden card cannot take focus). */
export function releaseFocus(shell: Shell): void {
  if (!shell.panel.hidden) shell.panel.focus({ preventScroll: true });
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/**
 * Paused (the game menu's Pause, or a hidden browser tab): a small chip beside the menu's tab with
 * Resume, so a frozen game never looks broken. Esc and P no longer pause (Matt, 2026-10-23).
 */
export function showPause(shell: Shell, onResume: () => void): void {
  const resume = button(shown(TEXT.menuResume), 'play', 'primary', onResume);
  shell.show('pause', shown(TEXT.paused), [el('span', shown(TEXT.paused), 'paused-label'), resume.el]);
  resume.el.focus({ preventScroll: true });
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
