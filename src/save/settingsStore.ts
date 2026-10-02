import { isChoice, isPresetId, AUTO_ORDER, type GraphicsChoice, type PresetId } from '../render/graphics';

/**
 * Player settings, one localStorage key (spec 3.2). Every read and write is guarded: missing,
 * corrupt, wrong-version or unreadable data gives the defaults, and a failed write (private
 * mode, blocked storage, full quota) just means the settings last for this session only.
 * The full save system (sub-project 5) will absorb this key later.
 */
export const SETTINGS_KEY = 'wormsim.settings';

export interface Settings {
  version: 1;
  graphics: GraphicsChoice;
  /** The preset Auto last settled on (never Ultra), or null. */
  autoSettled: PresetId | null;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1, graphics: 'auto', autoSettled: null,
});

/** The two Storage methods we use, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** window.localStorage, or null where even touching it throws (sandboxed or blocked). */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(store: KeyValueStore | null): Settings {
  const defaults: Settings = { ...DEFAULT_SETTINGS };
  if (!store) return defaults;
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (raw === null) return defaults;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return defaults;
    const o = v as Record<string, unknown>;
    if (o.version !== 1) return defaults;
    return {
      version: 1,
      graphics: isChoice(o.graphics) ? o.graphics : defaults.graphics,
      autoSettled: isPresetId(o.autoSettled) && AUTO_ORDER.includes(o.autoSettled) ? o.autoSettled : null,
    };
  } catch {
    return defaults;
  }
}

/** Returns false when the settings could not be stored. */
export function saveSettings(store: KeyValueStore | null, s: Settings): boolean {
  if (!store) return false;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, graphics: s.graphics, autoSettled: s.autoSettled }));
    return true;
  } catch {
    return false;
  }
}
