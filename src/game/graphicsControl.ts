import { AutoGraphics, type GraphicsChoice, type PresetId } from '../render/graphics';
import { loadSettings, saveSettings, type KeyValueStore, type Settings } from '../save/settingsStore';

/**
 * Which preset is active: a forced `?preset=` (benchmarks, never saved), the player's menu
 * choice, or Auto. Saves every change. Pure apart from the injected store.
 */
export class GraphicsControl {
  private settings: Settings;
  private auto: AutoGraphics;

  constructor(private readonly store: KeyValueStore | null, private forced: PresetId | null) {
    this.settings = loadSettings(store);
    this.auto = new AutoGraphics(this.settings.autoSettled);
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

  /** A menu pick. Picking a preset turns Auto off; picking Auto restarts it from autoSettled. */
  choose(choice: GraphicsChoice): void {
    this.forced = null;
    this.settings = { ...this.settings, graphics: choice };
    if (choice === 'auto') this.auto = new AutoGraphics(this.settings.autoSettled);
    saveSettings(this.store, this.settings);
  }

  /** The speed test's "Use recommended setting": saves the preset and turns Auto off. */
  useRecommended(preset: PresetId): void {
    this.choose(preset);
  }

  /** Call every rendered frame while crawling. True when Auto stepped down (re-apply the preset). */
  updateAuto(nowMs: number, fps: number): boolean {
    if (this.forced || this.settings.graphics !== 'auto') return false;
    if (!this.auto.update(nowMs, fps)) return false;
    this.settings = { ...this.settings, autoSettled: this.auto.preset };
    saveSettings(this.store, this.settings);
    return true;
  }

  /** Forget a slow streak (tab hidden, pause, a screen change). */
  interruptAuto(): void {
    this.auto.interrupt();
  }
}
