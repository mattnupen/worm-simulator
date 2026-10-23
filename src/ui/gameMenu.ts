import './gameMenu.css';
import { el } from './dom';
import { icon, type IconName } from './icons';
import { virtualWormIcon } from './virtualWorm';
import { settingsFields, type SettingsActions, type SettingsNow } from './settingsMenu';
import { TEXT, shown, type Line } from '../content/text';
import { SOURCES } from '../content/sources';
import { CHANGELOG_URL, PLANNED_ROUNDS, ROUNDS, VERSION } from '../version';
import { PLAY_GOAL_SECONDS, type Quest, type QuestId } from '../game/quests';

/** The menu's pages, in the icon column's order. */
export type MenuPage = 'mission' | 'rounds' | 'settings' | 'about';

const PAGES: readonly { id: MenuPage; icon: IconName; name: Line }[] = [
  { id: 'mission', icon: 'flag', name: TEXT.menuMission },
  { id: 'rounds', icon: 'list', name: TEXT.menuRounds },
  { id: 'settings', icon: 'sliders', name: TEXT.menuSettings },
  { id: 'about', icon: 'info', name: TEXT.menuAbout },
];

export interface MenuActions extends SettingsActions {
  /** The round's mission line (the lesson's), if this build has one. */
  mission(): Line | undefined;
  /** The round's quests and whole minutes played, if this build has a round. */
  quests(): { quests: readonly Quest[]; playMinutes: number } | undefined;
  settings(): SettingsNow;
  /** "Watch the opening again" (Rounds), when the opening may be replayed now. */
  opening(): (() => void) | undefined;
  /** "Back to start" (Mission), while playing or paused. */
  toStart(): (() => void) | undefined;
  /** The Pause icon: 'pause' while playing, 'resume' while paused, null where the game does not run. */
  pause(): 'pause' | 'resume' | null;
  onPause(): void;
  onResume(): void;
  /** A mouse or touch press on the menu while playing: the keys go back to the worm (main.ts). */
  release(): void;
}

export interface GameMenu {
  readonly el: HTMLElement;
  /** Redraw what depends on the game (the Pause icon, an open page): after every screen change. */
  refresh(): void;
  /** Esc: hides the open page, else folds the column. False when the menu was already shut. */
  escape(): boolean;
  /** Folds everything back to the tab. */
  close(): void;
}

/**
 * The game menu (Matt, 2026-10-23; spec docs/superpowers/specs/2026-10-23-game-menu-panel.md):
 * one tab at the top left; tapping it shows a column of icons (Mission, Rounds, Settings, About,
 * then Pause); tapping an icon opens its small card beside the column, and tapping it again hides
 * the card. The game keeps running while it is open: only Pause stops it.
 *
 * Built once and kept in the DOM, beside the shell's card. Pages are drawn when opened, which is
 * plain DOM work: no 3D, nothing compiles. Every icon is a real button with a spoken name and a
 * hover tooltip; the open page's icon is marked with aria-expanded and a border, not colour alone.
 */
export function createGameMenu(root: HTMLElement, a: MenuActions): GameMenu {
  const nav = el('nav', '', 'game-menu');
  nav.setAttribute('aria-label', 'Game menu');

  const tab = iconButton('menu', shown(TEXT.menuOpen), 'menu-tab');
  tab.setAttribute('aria-expanded', 'false');
  tab.setAttribute('aria-controls', 'menu-icons');

  const column = el('div', '', 'menu-icons');
  column.id = 'menu-icons';
  column.hidden = true;
  const pageButtons = new Map<MenuPage, HTMLButtonElement>();
  for (const p of PAGES) {
    const b = iconButton(p.icon, shown(p.name), 'menu-icon');
    b.dataset.page = p.id;
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'menu-card');
    pageButtons.set(p.id, b);
    b.addEventListener('click', (e) => {
      show(page === p.id ? null : p.id);
      pointer(e);
    });
    column.append(b);
  }
  const line = el('span', '', 'menu-line');
  line.setAttribute('aria-hidden', 'true');
  const pause = iconButton('pause', shown(TEXT.menuPause), 'menu-icon menu-pause');
  pause.addEventListener('click', (e) => {
    if (a.pause() === 'resume') a.onResume();
    else a.onPause();
    pointer(e);
  });
  // Last, after Pause: the virtual worm (the 3D anatomy model), which opens in a new tab.
  column.append(line, pause, virtualWormIcon('menu-icon'));

  const card = el('section', '', 'menu-card');
  card.id = 'menu-card';
  card.hidden = true;
  const title = el('h2', '', 'menu-title');
  title.id = 'menu-title';
  card.setAttribute('aria-labelledby', title.id);
  const body = el('div', '', 'menu-body');
  card.append(title, body);

  const bar = el('div', '', 'menu-bar');
  bar.append(tab, column);
  nav.append(bar, card);
  // First in the page, so Tab reaches the tab before the card, as it sits top left.
  root.prepend(nav);

  let open = false;
  let page: MenuPage | null = null;

  tab.addEventListener('click', (e) => {
    setOpen(!open);
    pointer(e);
  });

  /** A mouse or touch press (not Enter or Space) while playing: the keys go back to the worm. */
  function pointer(e: MouseEvent): void {
    if (e.detail > 0 && a.pause() === 'pause') a.release();
  }

  function setOpen(on: boolean): void {
    open = on;
    nav.dataset.open = on ? 'yes' : 'no';
    column.hidden = !on;
    tab.setAttribute('aria-expanded', String(on));
    const label = shown(on ? TEXT.menuClose : TEXT.menuOpen);
    tab.setAttribute('aria-label', label);
    tab.title = label;
    tab.replaceChildren(icon(on ? 'close' : 'menu', 'menu-glyph'));
    if (!on) show(null);
    else refresh();
  }

  function show(next: MenuPage | null): void {
    page = next;
    for (const [id, b] of pageButtons) b.setAttribute('aria-expanded', String(id === next));
    card.hidden = next === null;
    if (next) draw(next);
  }

  function draw(p: MenuPage): void {
    title.textContent = shown(PAGES.find((x) => x.id === p)!.name);
    card.dataset.page = p;
    body.replaceChildren(...(p === 'mission' ? missionPage() : p === 'rounds' ? roundsPage() : p === 'settings'
      ? settingsFields(a.settings(), a) : aboutPage()));
  }

  function missionPage(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const m = a.mission();
    if (m) out.push(el('p', shown(m).replace(/^Mission:\s*/, ''), 'menu-mission'));
    const q = a.quests();
    if (q) {
      const list = el('ol', '', 'menu-quests');
      list.setAttribute('aria-label', "This round's quests");
      q.quests.forEach((quest, i) => {
        const li = el('li', '', `menu-quest quest-${quest.state}`);
        const mark = el('span', '', 'menu-quest-mark');
        mark.setAttribute('aria-hidden', 'true');
        if (quest.state === 'done') mark.append(icon('check', 'menu-quest-icon'));
        else if (quest.state === 'locked') mark.append(icon('lock', 'menu-quest-icon'));
        else mark.textContent = String(i + 1);
        li.append(mark, el('span', `${QUEST_NAMES[quest.id]} · ${questStatus(quest, q.playMinutes)}`));
        list.append(li);
      });
      out.push(list);
    }
    const home = a.toStart();
    if (home) out.push(textButton('home', shown(TEXT.menuToStart), home));
    return out;
  }

  function roundsPage(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const replay = a.opening();
    if (replay) out.push(textButton('play', shown(TEXT.roundsOpening), replay));
    const list = el('ol', '', 'menu-rounds');
    list.setAttribute('aria-label', 'Every round, newest first');
    const named = new Map(ROUNDS.map((r) => [r.number, r]));
    for (let n = Math.max(PLANNED_ROUNDS, VERSION.number); n >= 1; n--) {
      const r = named.get(n);
      const li = el('li', '', 'menu-round');
      const dot = el('span', String(n), 'menu-round-dot');
      dot.setAttribute('aria-hidden', 'true');
      const words = el('span', '', 'menu-round-words');
      if (!r) {
        li.classList.add('round-soon');
        words.append(el('span', `Round ${n}`, 'menu-round-name'), el('span', shown(TEXT.roundsSoon), 'menu-round-note'));
      } else if (n === VERSION.number) {
        li.classList.add('round-here');
        words.append(el('span', `Round ${n}: ${r.name}`, 'menu-round-name'), el('span', shown(TEXT.roundsHere), 'menu-round-note'));
      } else {
        const link = el('a', `Round ${n}: ${r.name}`, 'menu-round-name');
        link.href = `/v${n}/`;
        words.append(link, el('span', r.about, 'menu-round-note'));
      }
      li.append(dot, words);
      list.append(li);
    }
    out.push(list, outLink(shown(TEXT.roundsChanges), CHANGELOG_URL, 'menu-changes'));
    return out;
  }

  function aboutPage(): HTMLElement[] {
    const src = SOURCES[TEXT.openingInvasive.source];
    const source = el('p', `${shown(TEXT.aboutSource)} `, 'menu-source');
    source.append(outLink(src.short ?? src.publisher, src.url));
    return [
      el('p', shown(TEXT.aboutMade)),
      el('p', shown(TEXT.openingInvasive)),
      source,
      el('p', shown(TEXT.aboutPrivate), 'menu-soft'),
    ];
  }

  function refresh(): void {
    const p = a.pause();
    pause.hidden = line.hidden = p === null;
    const label = shown(p === 'resume' ? TEXT.menuResume : TEXT.menuPause);
    pause.setAttribute('aria-label', label);
    pause.title = label;
    pause.replaceChildren(icon(p === 'resume' ? 'play' : 'pause', 'menu-glyph'));
    // Mission and Rounds follow the game (play minutes, Back to start, the replay). A page the
    // player is working in keeps its focus: it is not redrawn under them.
    if ((page === 'mission' || page === 'rounds') && !card.contains(document.activeElement)) draw(page);
  }

  return {
    el: nav,
    refresh,
    escape() {
      if (page) {
        const b = pageButtons.get(page)!;
        show(null);
        b.focus({ preventScroll: true });
        return true;
      }
      if (open) {
        setOpen(false);
        tab.focus({ preventScroll: true });
        return true;
      }
      return false;
    },
    close: () => setOpen(false),
  };
}

const QUEST_NAMES: Record<QuestId, string> = { learn: 'Learn', play: 'Play', vote: 'Vote' };

function questStatus(q: Quest, minutes: number): string {
  if (q.state === 'done') return 'done';
  if (q.state === 'locked') return q.id === 'play' ? 'after Learn' : 'after Play';
  return q.id === 'play' ? `${minutes} of ${PLAY_GOAL_SECONDS / 60} minutes` : 'to do';
}

function iconButton(name: IconName, label: string, className: string): HTMLButtonElement {
  const b = el('button', '', className);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.append(icon(name, 'menu-glyph'));
  return b;
}

function textButton(name: IconName, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', '', 'menu-action');
  b.type = 'button';
  b.append(icon(name, 'menu-action-icon'), el('span', label));
  b.addEventListener('click', onClick);
  return b;
}

/** A link out, in a new tab (CLAUDE.md: links out are fine; the game itself connects nowhere). */
function outLink(text: string, href: string, className = ''): HTMLAnchorElement {
  const link = el('a', text, className);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(el('span', ' (opens in a new tab)', 'sr-only'));
  return link;
}
