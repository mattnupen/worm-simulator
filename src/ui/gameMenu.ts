import './gameMenu.css';
import { el } from './dom';
import { icon, type IconName } from './icons';
import { virtualWormLink } from './virtualWorm';
import { settingsFields, type SettingsActions, type SettingsNow } from './settingsMenu';
import { TEXT, shown, type Line } from '../content/text';
import { SOURCES } from '../content/sources';
import { CHANGELOG_URL, PLANNED_ROUNDS, ROUNDS, VERSION } from '../version';
import { PLAY_GOAL_SECONDS, type Quest, type QuestId } from '../game/quests';

/** The menu's pages, in the order of its tabs. */
export type MenuPage = 'mission' | 'rounds' | 'settings' | 'about';

/**
 * A page a host page adds to the menu, first among the tabs (such as the Virtual worm page's own
 * options). It draws itself, like the built-in pages, each time it opens.
 */
export interface ExtraPage {
  id: string;
  icon: IconName;
  name: Line;
  draw(): HTMLElement[];
}

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
  /** True while the panel is out. */
  readonly open: boolean;
  /** Redraw what depends on the game (the Pause button, the open page): after every screen change. */
  refresh(): void;
  /** Esc: slides the panel away. False when it was already shut. */
  escape(): boolean;
  /** Slides the panel away, back to the tab. */
  close(): void;
  /** Slides the panel out, on the page it last showed. */
  slideOut(): void;
}

/**
 * The game menu (Matt, 2026-10-23; redesigned 2026-10-24): one tab at the top left. Tapping it
 * slides the whole panel out from the left edge of the window as one box, with its pages as tabs
 * across the top (Mission, Rounds, Settings, About) and Pause and the Virtual worm along the
 * bottom. The tab turns into an X that juts out from the panel's right side, and slides with it.
 * The game keeps running while it is open: only Pause stops it.
 *
 * Built once and kept in the DOM, beside the shell's card. Pages are drawn when opened, which is
 * plain DOM work: no 3D, nothing compiles. The tabs are real ARIA tabs (arrow keys move between
 * them); the open one is marked with aria-selected, bold words and an underline, not colour alone.
 */
export function createGameMenu(root: HTMLElement, a: MenuActions, opts: { virtualWorm?: boolean; pages?: readonly ExtraPage[] } = {}): GameMenu {
  const extra = opts.pages ?? [];
  const all: readonly { id: string; icon: IconName; name: Line }[] = [...extra, ...PAGES];
  const nav = el('nav', '', 'game-menu');
  nav.setAttribute('aria-label', 'Game menu');
  nav.dataset.open = 'no';

  const tab = iconButton('menu', shown(TEXT.menuOpen), 'menu-tab');
  tab.setAttribute('aria-expanded', 'false');
  tab.setAttribute('aria-controls', 'menu-panel');

  const panel = el('div', '', 'menu-panel');
  panel.id = 'menu-panel';
  panel.inert = true;

  const tabs = el('div', '', 'menu-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Menu pages');
  const pageTabs = new Map<string, HTMLButtonElement>();
  for (const p of all) {
    const b = el('button', '', 'menu-tabs-tab');
    b.type = 'button';
    b.id = `menu-tab-${p.id}`;
    b.dataset.page = p.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'menu-page');
    b.append(icon(p.icon, 'menu-tab-icon'), el('span', shown(p.name), 'menu-tab-name'));
    pageTabs.set(p.id, b);
    b.addEventListener('click', (e) => {
      show(p.id);
      pointer(e);
    });
    tabs.append(b);
  }
  // Arrow keys move along the tabs (the ARIA tabs pattern); each tab is in the Tab order too.
  tabs.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1
      : step ? (all.findIndex((p) => p.id === page) + step + all.length) % all.length : -1;
    if (to < 0) return;
    e.preventDefault();
    show(all[to].id);
    pageTabs.get(all[to].id)!.focus({ preventScroll: true });
  });

  const body = el('section', '', 'menu-body');
  body.id = 'menu-page';
  body.setAttribute('role', 'tabpanel');

  const foot = el('div', '', 'menu-foot');
  const pause = el('button', '', 'menu-action menu-pause');
  pause.type = 'button';
  pause.addEventListener('click', (e) => {
    if (a.pause() === 'resume') a.onResume();
    else a.onPause();
    pointer(e);
  });
  foot.append(pause);
  // After Pause: the virtual worm (the 3D anatomy model), which opens in a new tab. Not on the
  // Virtual worm page itself.
  if (opts.virtualWorm !== false) foot.append(virtualWormLink('menu-action menu-worm'));

  panel.append(tabs, body, foot);
  // The tab comes first for Tab and screen readers (then the panel it opens), though it sits on
  // the panel's right side (gameMenu.css). The menu is first in the page, as it sits top left.
  nav.append(tab, panel);
  root.prepend(nav);

  let open = false;
  let page: string = all[0].id;

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
    panel.inert = !on;
    tab.setAttribute('aria-expanded', String(on));
    const label = shown(on ? TEXT.menuClose : TEXT.menuOpen);
    tab.setAttribute('aria-label', label);
    tab.title = label;
    tab.replaceChildren(icon(on ? 'close' : 'menu', 'menu-glyph'));
    if (on) {
      refresh();
      draw(page);
    }
  }

  function show(next: string): void {
    page = next;
    draw(next);
  }

  function draw(p: string): void {
    for (const [id, b] of pageTabs) {
      b.setAttribute('aria-selected', String(id === p));
      b.tabIndex = id === p ? 0 : -1;
    }
    body.setAttribute('aria-labelledby', `menu-tab-${p}`);
    body.dataset.page = p;
    const own = extra.find((x) => x.id === p);
    body.replaceChildren(...(own ? own.draw() : p === 'mission' ? missionPage() : p === 'rounds' ? roundsPage() : p === 'settings'
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
    pause.hidden = p === null;
    foot.hidden = pause.hidden && opts.virtualWorm === false;
    pause.replaceChildren(icon(p === 'resume' ? 'play' : 'pause', 'menu-action-icon'),
      el('span', shown(p === 'resume' ? TEXT.menuResume : TEXT.menuPause)));
    // Mission and Rounds follow the game (play minutes, Back to start, the replay). A page the
    // player is working in keeps its focus: it is not redrawn under them.
    if (open && (page === 'mission' || page === 'rounds') && !body.contains(document.activeElement)) draw(page);
  }

  return {
    el: nav,
    get open() { return open; },
    refresh,
    escape() {
      if (!open) return false;
      setOpen(false);
      tab.focus({ preventScroll: true });
      return true;
    },
    close: () => setOpen(false),
    slideOut: () => setOpen(true),
  };
}

const QUEST_NAMES: Record<QuestId, string> = { learn: 'Learn', play: 'Play', vote: 'Vote' };

function questStatus(q: Quest, minutes: number): string {
  if (q.state === 'done') return 'done';
  if (q.state === 'locked') return `after ${(q.waitsOn ?? []).map((id) => QUEST_NAMES[id]).join(' and ')}`;
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
