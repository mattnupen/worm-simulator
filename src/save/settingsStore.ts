import { isChoice, isPresetId, AUTO_ORDER, type GraphicsChoice, type PresetId } from '../render/graphics';

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
 * A setting with a class-vote default is stored only once the player picks it, so a later default
 * reaches every device that never chose (CLAUDE.md). V1 stored its World scale pick as `scale`;
 * V2 has no World scale (real size only), so a stored `scale` is ignored but kept on every write
 * (V1, frozen at /v1/, still reads it). Never reuse the `scale` key.
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
 * Writes every field of `s`, keeping any stored fields this build does not know (V1's `scale`, a
 * later version's). False when it could not be stored. For a player's change use updateSettings.
 */
export function saveSettings(store: KeyValueStore | null, s: Settings): boolean {
  if (!store) return false;
  try {
    return write(store, storedObject(store) ?? {}, {
      graphics: s.graphics, autoSettled: s.autoSettled,
    });
  } catch {
    return false;
  }
}

/**
 * Changes some settings and keeps the rest as stored, so two owners (the Graphics menu and, from
 * V2, the underground camera) never overwrite each other's choice. `fields` is what gets written:
 * graphics and autoSettled always (older builds read them). A field with a class-vote default
 * (Plan B adds undergroundView) joins `fields` only when it is in `patch` (the player picked it) or
 * was already stored. Fields this build does not know are kept. Returns the full settings as now
 * saved (or as they would be, if storage failed).
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
  write(store, kept ?? {}, fields);
  return next;
}
