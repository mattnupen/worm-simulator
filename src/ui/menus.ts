import { el, button, cardHead, menu } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';

export interface StartActions { onCrawl(): void; onGraphics(): void; onSpeedTest(): void }

/** Start: the parchment title card over the live forest. */
export function showStart(shell: Shell, a: StartActions): void {
  const crawl = button('Crawl', 'play', 'primary', a.onCrawl);
  shell.show('start', 'Start', [
    cardHead('A forest floor in fall'),
    el('p', 'You are an earthworm under the leaves of a northern forest.', 'lead'),
    menu(crawl, button('Graphics', 'sliders', 'secondary', a.onGraphics),
      button('Speed test', 'gauge', 'secondary', a.onSpeedTest)),
  ]);
  crawl.el.focus();
}

/** Crawl: a small hint card; focus rests on it so Space and arrows press no button. */
export function showCrawl(shell: Shell): void {
  const hint = el('p', '', 'hint');
  hint.append(
    icon('drive', 'hint-icon'),
    el('span', 'Crawl with the arrow keys, W A S D, or the joystick. Press Esc or P to pause.'),
  );
  shell.show('crawl', 'Crawling', [hint]);
  shell.panel.focus({ preventScroll: true });
}

export interface PauseActions { onResume(): void; onGraphics(): void; onStart(): void }

export function showPause(shell: Shell, a: PauseActions): void {
  const resume = button('Resume', 'play', 'primary', a.onResume);
  shell.show('pause', 'Paused', [
    el('h1', 'Paused', 'screen-title'),
    menu(resume, button('Graphics', 'sliders', 'secondary', a.onGraphics),
      button('Back to start', 'home', 'secondary', a.onStart)),
  ]);
  resume.el.focus();
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
