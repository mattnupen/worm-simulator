import './quests.css';
import { el, button, cardHead, menu, type Button } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';
import { VERSION_LABEL } from '../version';
import { TEXT, shown } from '../content/text';
import { PLAY_GOAL_SECONDS, type Quest, type QuestId } from '../game/quests';

export interface StartActions { onCrawl(): void; onGraphics(): void; onSpeedTest(): void }

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
 * the Graphics screen, so focus returns to its button.
 */
export function showStart(shell: Shell, a: StartActions, fromGraphics = false, round?: StartRound): void {
  const graphics = button('Graphics', 'sliders', 'secondary', a.onGraphics);
  const speed = button('Speed test', 'gauge', 'secondary', a.onSpeedTest);
  const head = [cardHead('A forest floor in fall'), el('p', 'You are an earthworm under the leaves of a northern forest.', 'lead')];
  if (!round) {
    const crawl = button('Crawl', 'play', 'primary', a.onCrawl);
    shell.show('start', 'Start', [...head, menu(crawl, graphics, speed), el('p', VERSION_LABEL, 'version')]);
    (fromGraphics ? graphics : crawl).el.focus();
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
  tools.append(graphics.el, speed.el);
  shell.show('start', 'Start', [...head, list, tools, el('p', VERSION_LABEL, 'version')]);
  // Every quest done: Crawl leads (play on as long as you like).
  const first: Button = fromGraphics ? graphics : focus ?? crawl ?? graphics;
  first.el.focus();
}

function status(q: Quest, minutes: number): string {
  if (q.state === 'locked') return `Locked: finish ${BEFORE[q.id]} first`;
  if (q.id === 'learn') return q.state === 'done' ? 'Done. You can look again.' : 'Start here';
  if (q.id === 'play') {
    return q.state === 'done' ? 'Done. Keep playing any time.' : `${minutes} of ${PLAY_GOAL_SECONDS / 60} minutes played`;
  }
  return q.state === 'done' ? 'Done. Thanks for voting!' : 'Vote in the Google Form from Canvas';
}

/**
 * Vote: the third quest. The game never links to the form or sees it (no network at runtime,
 * CLAUDE.md), so the student opens it from Canvas and then says so here.
 */
export function showVote(shell: Shell, onVoted: () => void, onStart: () => void): void {
  const voted = button('I voted', 'check', 'primary', onVoted);
  shell.show('vote', 'Vote', [
    el('h1', 'Quest 3 · Vote', 'screen-title'),
    el('p', 'Open the Google Form from Canvas. Vote, and share your design ideas for the game.', 'lead'),
    el('p', 'When you have sent the form, come back and tap "I voted".', 'vote-note'),
    menu(voted, button('Back to start', 'home', 'secondary', onStart)),
  ]);
  voted.el.focus();
}

/**
 * Crawl: a small hint card, the controls then "look, don't eat" (the surface has mushrooms and
 * puffballs; parent spec 5). Focus rests on it so Space and arrows press no button.
 */
export function showCrawl(shell: Shell): void {
  const hint = el('p', '', 'hint');
  hint.append(
    icon('drive', 'hint-icon'),
    el('span', shown(TEXT.crawlHint)),
  );
  shell.show('crawl', 'Crawling', [hint, el('p', shown(TEXT.lookDontEat), 'hint-safety')]);
  shell.panel.focus({ preventScroll: true });
}

export interface PauseActions { onResume(): void; onGraphics(): void; onStart(): void }

/** Paused. `fromGraphics`: back from the Graphics screen, so focus returns to its button. */
export function showPause(shell: Shell, a: PauseActions, fromGraphics = false): void {
  const resume = button('Resume', 'play', 'primary', a.onResume);
  const graphics = button('Graphics', 'sliders', 'secondary', a.onGraphics);
  shell.show('pause', 'Paused', [
    el('h1', 'Paused', 'screen-title'),
    menu(resume, graphics, button('Back to start', 'home', 'secondary', a.onStart)),
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
