import { isChoice, isPresetId, AUTO_ORDER, type GraphicsChoice, type PresetId } from '../render/graphics';
import { DEFAULT_UNDERGROUND_VIEW, type UndergroundView } from '../underground/modeMachine';
import { DEFAULT_TEXT_SIZE, isTextSize, type TextSize } from '../ui/textSize';

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
 *
 * The underground view (V2) follows the same rule: no key is written until the player switches
 * the view, and a missing or unknown value reads as DEFAULT_UNDERGROUND_VIEW. Careful: a player
 * who has switched the view has a stored pick, and a later class vote that changes the default
 * will not reach that device. When a vote needs to, store the default in effect with each pick and
 * ignore a pick made under an older default (not built: V2 has no such vote yet).
 *
 * Sound (V3, Settings) is stored the same way: only once the player switches it. So is Text size
 * (`textSize`, Matt 2026-10-22), so a later change to its default reaches every device that never chose.
 */
export const SETTINGS_KEY = 'wormsim.settings';

export interface Settings {
  version: 1;
  graphics: GraphicsChoice;
  /** The preset Auto last settled on (never Ultra), or null. */
  autoSettled: PresetId | null;
  /** The underground camera (V2 spec 7). Stored only once the player switches it. */
  undergroundView: UndergroundView;
  /** Sound effects on or off (Settings, Matt 2026-10-12). Stored only once the player switches it. */
  sound: boolean;
  /** Menu, HUD and lesson text size (Settings, Matt 2026-10-22). Stored only once the player picks it. */
  textSize: TextSize;
}

export function isUndergroundView(v: unknown): v is UndergroundView {
  return v === 'wide' || v === 'close';
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1, graphics: 'auto', autoSettled: null, undergroundView: DEFAULT_UNDERGROUND_VIEW, sound: true,
  textSize: DEFAULT_TEXT_SIZE,
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
    undergroundView: isUndergroundView(o.undergroundView) ? o.undergroundView : DEFAULT_UNDERGROUND_VIEW,
    sound: typeof o.sound === 'boolean' ? o.sound : DEFAULT_SETTINGS.sound,
    textSize: isTextSize(o.textSize) ? o.textSize : DEFAULT_TEXT_SIZE,
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
    const kept = storedObject(store);
    const fields: Record<string, unknown> = { graphics: s.graphics, autoSettled: s.autoSettled };
    // Same rule as updateSettings: the view is written only once it is a real pick.
    if (isUndergroundView(kept?.undergroundView) || s.undergroundView !== DEFAULT_UNDERGROUND_VIEW) {
      fields.undergroundView = s.undergroundView;
    }
    if (typeof kept?.sound === 'boolean' || s.sound !== DEFAULT_SETTINGS.sound) fields.sound = s.sound;
    if (isTextSize(kept?.textSize) || s.textSize !== DEFAULT_TEXT_SIZE) fields.textSize = s.textSize;
    return write(store, kept ?? {}, fields);
  } catch {
    return false;
  }
}

/** The patch without its undefined fields: `{ graphics: undefined }` changes nothing (and never
 *  spreads an undefined over a stored value, so the result keeps the Settings type). */
function defined(patch: Partial<Omit<Settings, 'version'>>): Partial<Omit<Settings, 'version'>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out as Partial<Omit<Settings, 'version'>>;
}

/**
 * Changes some settings and keeps the rest as stored, so two owners (the Graphics menu and, from
 * V2, the underground camera) never overwrite each other's choice. `fields` is what gets written:
 * graphics and autoSettled always (older builds read them). A field with a class-vote default
 * (undergroundView) joins `fields` only when it is in `patch` (the player picked it) or was already
 * stored. Fields this build does not know are kept. Returns the full settings as now
 * saved (or as they would be, if storage failed).
 */
export function updateSettings(store: KeyValueStore | null, patch: Partial<Omit<Settings, 'version'>>): Settings {
  let kept: Record<string, unknown> | null;
  try {
    kept = store ? storedObject(store) : null;
  } catch {
    // Unreadable storage: never write blind (it could drop a later version's fields).
    return { ...DEFAULT_SETTINGS, ...defined(patch), version: 1 };
  }
  const next: Settings = { ...resolve(kept), ...defined(patch), version: 1 };
  if (!store) return next;
  const fields: Record<string, unknown> = { graphics: next.graphics, autoSettled: next.autoSettled };
  if (patch.undergroundView !== undefined || isUndergroundView(kept?.undergroundView)) {
    fields.undergroundView = next.undergroundView;
  }
  if (patch.sound !== undefined || typeof kept?.sound === 'boolean') fields.sound = next.sound;
  if (patch.textSize !== undefined || isTextSize(kept?.textSize)) fields.textSize = next.textSize;
  write(store, kept ?? {}, fields);
  return next;
}
