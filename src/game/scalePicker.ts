import { storedScale, updateSettings, type KeyValueStore } from '../save/settingsStore';
import type { ScaleMode } from '../surface/worldScale';

/**
 * A World scale pick is built this long after the last one (ms): arrowing from Classic to True
 * builds the forest once, not for every choice passed on the way.
 */
export const SCALE_SETTLE_MS = 400;

/** What the World scale screen says under its choices (the card is the aria-live region). */
export type ScaleStatus = 'idle' | 'building' | 'ready';

export interface ScalePickerHost {
  /** The mode the forest is built in now. */
  current(): ScaleMode;
  /** Rebuilds the forest in `mode` (setScale, then world.switchForest). May throw. */
  build(mode: ScaleMode): void;
  /** The status line changed: show it (if the World scale screen is up). */
  show(status: ScaleStatus, mode: ScaleMode): void;
  /** build() threw. The picker has stopped; the caller shows the crash card. */
  failed(e: unknown): void;
}

/** setTimeout and clearTimeout, injectable for tests. */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const BROWSER_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * The World scale screen's logic (Step 1b spec 4.3), apart from the DOM and the renderer. A pick
 * waits SCALE_SETTLE_MS for the next one; then (or at once, when the player leaves the screen:
 * flush) the last pick is built and saved.
 *
 * Saving: a device that never chose keeps no scale, so a later DEFAULT_SCALE (Task 15, class
 * votes) still reaches it. A settled pick is stored only if it differs from the mode in effect
 * when the screen opened, or if a scale is already stored. Opening the screen and leaving it on
 * the same choice, or arrowing away and back before it settles, saves nothing.
 */
export class ScalePicker {
  private openedAt: ScaleMode;
  private pending: ScaleMode | null = null;
  private timer: unknown = null;
  private stopped = false;
  private state: ScaleStatus = 'idle';

  constructor(
    private readonly host: ScalePickerHost,
    private readonly store: KeyValueStore | null,
    private readonly timers: Timers = BROWSER_TIMERS,
    private readonly settleMs = SCALE_SETTLE_MS,
  ) {
    this.openedAt = host.current();
  }

  /** The choice the screen shows checked: a waiting pick, else the built mode. */
  get shown(): ScaleMode {
    return this.pending ?? this.host.current();
  }

  /** The status line to draw. */
  get status(): ScaleStatus {
    return this.state;
  }

  /** A pick is waiting to be built. */
  get waiting(): boolean {
    return this.pending !== null;
  }

  /** The World scale screen opened: no note yet, and the save rule compares with this mode. */
  open(): void {
    this.flush();
    this.openedAt = this.host.current();
    this.state = 'idle';
  }

  /** The player picked `mode`: it is built once the picking settles. */
  choose(mode: ScaleMode): void {
    if (this.stopped) return;
    this.pending = mode;
    this.clearTimer();
    if (this.state !== 'building') {
      this.state = 'building';
      this.host.show('building', mode);
    }
    this.timer = this.timers.set(() => { this.flush(); }, this.settleMs);
  }

  /**
   * Builds and saves a waiting pick now (the settle timer, or the player leaving the screen).
   * False if the build threw (host.failed was told, and the picker has stopped).
   */
  flush(): boolean {
    if (this.stopped) return false;
    const mode = this.pending;
    if (mode === null) return true;
    this.clearTimer();
    this.pending = null;
    if (mode !== this.host.current()) {
      try {
        this.host.build(mode);
      } catch (e) {
        this.stop();
        this.host.failed(e);
        return false;
      }
    }
    if (mode !== this.openedAt || storedScale(this.store) !== null) updateSettings(this.store, { scale: mode });
    this.state = 'ready';
    this.host.show('ready', mode);
    return true;
  }

  /** The game is lost (crash, graphics reset): drop a waiting pick and never build again. */
  stop(): void {
    this.stopped = true;
    this.pending = null;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }
}
