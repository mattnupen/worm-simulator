import { isChoice, isPresetId, AUTO_ORDER, type GraphicsChoice, type PresetId } from '../render/graphics';
import { DEFAULT_SCALE, isScaleMode, type ScaleMode } from '../surface/worldScale';

// This key stays `version: 1` forever: older versions on the same origin read it, and one that
// sees any other version falls back to its defaults. A breaking change needs a new key.

/**
 * Player settings, one localStorage key (spec 3.2). Every read and write is guarded: missing,
 * corrupt, wrong-version or unreadable data gives the defaults, and a failed write (private
 * mode, blocked storage, full quota) just means the settings last for this session only.
 * The full save system (sub-project 5) will absorb this key later.
 *
 * Every version of the game runs on one origin and shares this key (CLAUDE.md): a missing or
 * unknown field reads as its default, and a write keeps fields this build does not know (a later
 * version's), so playing an older version never wipes a newer one's settings.
 *
 * The world scale is stored only once the player picks one. Until then it reads as DEFAULT_SCALE,
 * so when a class vote changes DEFAULT_SCALE in a later version, every device that never chose
 * follows the new default.
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

/** The settings a stored object (or none) reads as: valid fields kept, the rest defaulted. */
function resolve(o: Record<string, unknown> | null): Settings {
  if (!o) return { ...DEFAULT_SETTINGS };
  return {
    version: 1,
    graphics: isChoice(o.graphics) ? o.graphics : DEFAULT_SETTINGS.graphics,
    autoSettled: isPresetId(o.autoSettled) && AUTO_ORDER.includes(o.autoSettled) ? o.autoSettled : null,
    scale: isScaleMode(o.scale) ? o.scale : DEFAULT_SETTINGS.scale,
  };
}

export function loadSettings(store: KeyValueStore | null): Settings {
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    return resolve(storedObject(store));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * The world scale the player stored, or null when none is (they never picked one, or storage
 * is missing or unreadable). loadSettings fills in DEFAULT_SCALE instead.
 */
export function storedScale(store: KeyValueStore | null): ScaleMode | null {
  if (!store) return null;
  try {
    const s = storedObject(store)?.scale;
    return isScaleMode(s) ? s : null;
  } catch {
    return null;
  }
}

/** Writes `fields` over the stored object, keeping fields this build does not know. False if it failed. */
function write(store: KeyValueStore, kept: Record<string, unknown>, fields: Record<string, unknown>): boolean {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify({ ...kept, version: 1, ...fields }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes every field of `s`, scale included, keeping any stored fields this build does not know.
 * False when it could not be stored. For a player's change use updateSettings, which never stores
 * a scale the player did not pick.
 */
export function saveSettings(store: KeyValueStore | null, s: Settings): boolean {
  if (!store) return false;
  try {
    return write(store, storedObject(store) ?? {}, {
      graphics: s.graphics, autoSettled: s.autoSettled, scale: s.scale,
    });
  } catch {
    return false;
  }
}

/**
 * Changes some settings and keeps the rest as stored, so two owners (the Graphics menu and the
 * World scale panel) never overwrite each other's choice. Graphics and autoSettled are always
 * written (older builds read them); scale only when it is in `patch` or was already stored, so a
 * Graphics pick never pins the build's DEFAULT_SCALE. Returns the full settings as now saved,
 * default scale filled in (or as they would be, if storage failed).
 */
export function updateSettings(store: KeyValueStore | null, patch: Partial<Omit<Settings, 'version'>>): Settings {
  let kept: Record<string, unknown> | null;
  try {
    kept = store ? storedObject(store) : null;
  } catch {
    // Unreadable storage: never write blind (it could drop a later version's fields).
    return { ...DEFAULT_SETTINGS, ...patch, version: 1 };
  }
  const next: Settings = { ...resolve(kept), ...patch, version: 1 };
  if (!store) return next;
  const fields: Record<string, unknown> = { graphics: next.graphics, autoSettled: next.autoSettled };
  if (patch.scale !== undefined || isScaleMode(kept?.scale)) fields.scale = next.scale;
  write(store, kept ?? {}, fields);
  return next;
}
