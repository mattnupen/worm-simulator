import { isChoice, isPresetId, AUTO_ORDER, type GraphicsChoice, type PresetId } from '../render/graphics';
import { DEFAULT_SCALE, isScaleMode, type ScaleMode } from '../surface/worldScale';

/**
 * Player settings, one localStorage key (spec 3.2). Every read and write is guarded: missing,
 * corrupt, wrong-version or unreadable data gives the defaults, and a failed write (private
 * mode, blocked storage, full quota) just means the settings last for this session only.
 * The full save system (sub-project 5) will absorb this key later.
 *
 * Every version of the game runs on one origin and shares this key (CLAUDE.md): a missing or
 * unknown field reads as its default, and a write keeps fields this build does not know (a later
 * version's), so playing an older version never wipes a newer one's settings.
 */
export const SETTINGS_KEY = 'wormsim.settings';

export interface Settings {
  version: 1;
  graphics: GraphicsChoice;
  /** The preset Auto last settled on (never Ultra), or null. */
  autoSettled: PresetId | null;
  /** World scale (Step 1b spec 4.3). Added in V1; older saves have none and read as the default. */
  scale: ScaleMode;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1, graphics: 'auto', autoSettled: null, scale: DEFAULT_SCALE,
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

/** The stored version-1 object as it is (unknown fields included), or null. Throws if storage does. */
function storedObject(store: KeyValueStore): Record<string, unknown> | null {
  const raw = store.getItem(SETTINGS_KEY);
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    return o.version === 1 ? o : null;
  } catch {
    return null;
  }
}

export function loadSettings(store: KeyValueStore | null): Settings {
  const defaults: Settings = { ...DEFAULT_SETTINGS };
  if (!store) return defaults;
  try {
    const o = storedObject(store);
    if (!o) return defaults;
    return {
      version: 1,
      graphics: isChoice(o.graphics) ? o.graphics : defaults.graphics,
      autoSettled: isPresetId(o.autoSettled) && AUTO_ORDER.includes(o.autoSettled) ? o.autoSettled : null,
      scale: isScaleMode(o.scale) ? o.scale : defaults.scale,
    };
  } catch {
    return defaults;
  }
}

/** Writes `s`, keeping any stored fields this build does not know. False when it could not be stored. */
export function saveSettings(store: KeyValueStore | null, s: Settings): boolean {
  if (!store) return false;
  try {
    const kept = storedObject(store) ?? {};
    store.setItem(SETTINGS_KEY, JSON.stringify({
      ...kept, version: 1, graphics: s.graphics, autoSettled: s.autoSettled, scale: s.scale,
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Changes some settings and keeps the rest as stored, so two owners (the Graphics menu and the
 * World scale panel) never overwrite each other's choice. Returns the settings as now saved (or as
 * they would be, if storage failed).
 */
export function updateSettings(store: KeyValueStore | null, patch: Partial<Omit<Settings, 'version'>>): Settings {
  const next: Settings = { ...loadSettings(store), ...patch, version: 1 };
  saveSettings(store, next);
  return next;
}
