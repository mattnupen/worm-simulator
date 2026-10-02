import {
  AutoGraphics, autoSessionStart, isChoice, type GraphicsChoice, type PresetId,
} from '../render/graphics';
import { FPS_WINDOW_MS } from '../render/fps';
import { loadSettings, saveSettings, type KeyValueStore, type Settings } from '../save/settingsStore';

/**
 * Which preset is active: a forced `?preset=` (benchmarks, never saved), the player's menu
 * choice, or Auto. Saves every change. Pure apart from the injected store.
 */
export class GraphicsControl {
  private settings: Settings;
  private auto: AutoGraphics;
  /** fps samples before this time still mix in frames from before the last interruption. */
  private feedFrom = -Infinity;

  constructor(private readonly store: KeyValueStore | null, private forced: PresetId | null) {
    this.settings = loadSettings(store);
    // Session start only: one step above where Auto last settled, so it can recover.
    this.auto = new AutoGraphics(autoSessionStart(this.settings.autoSettled));
  }

  /** What the Graphics menu shows as selected. */
  get choice(): GraphicsChoice {
    return this.forced ?? this.settings.graphics;
  }

  /** The preset to render with now. */
  get active(): PresetId {
    if (this.forced) return this.forced;
    return this.settings.graphics === 'auto' ? this.auto.preset : this.settings.graphics;
  }

  /**
   * A menu pick. Picking a preset turns Auto off; picking Auto restarts it from autoSettled
   * itself (no session step). Anything that is not a graphics choice is ignored.
   */
  choose(choice: GraphicsChoice): void {
    if (!isChoice(choice)) return;
    this.forced = null;
    this.settings = { ...this.settings, graphics: choice };
    if (choice === 'auto') this.auto = new AutoGraphics(this.settings.autoSettled);
    saveSettings(this.store, this.settings);
  }

  /** The speed test's "Use recommended setting": saves the preset and turns Auto off. */
  useRecommended(preset: PresetId): void {
    this.choose(preset);
  }

  /**
   * Call with the fps of every frame rendered on the crawl screen. True when Auto stepped down
   * (re-apply the preset). Samples within the fps meter's window after interruptAuto are ignored.
   */
  updateAuto(nowMs: number, fps: number): boolean {
    if (this.forced || this.settings.graphics !== 'auto') return false;
    if (nowMs < this.feedFrom) return false;
    if (!this.auto.update(nowMs, fps)) return false;
    this.settings = { ...this.settings, autoSettled: this.auto.preset };
    saveSettings(this.store, this.settings);
    return true;
  }

  /**
   * Forget a slow streak (tab hidden, pause, a screen change, a preset applied) and ignore fps
   * until the meter's window holds only frames from after `nowMs`.
   */
  interruptAuto(nowMs: number): void {
    this.auto.interrupt();
    this.feedFrom = nowMs + FPS_WINDOW_MS;
  }
}
