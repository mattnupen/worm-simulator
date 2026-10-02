import { describe, it, expect } from 'vitest';
import {
  PRESETS, PRESET_IDS, CHOICES, CHOICE_LABELS, CHOICE_DESCRIPTIONS, AUTO_ORDER, AutoGraphics,
  recommendedPreset, tierSpec, pixelRatioFor, isPresetId, isChoice, type PresetSpec,
} from '../../src/render/graphics';
import { TIERS } from '../../src/render/quality';

const FIELDS: (keyof PresetSpec)[] = [
  'id', 'resolution', 'maxDpr', 'litter', 'detail', 'hero', 'reaction', 'effects', 'extraEffects',
  'clutter', 'nearClutter', 'rim',
];

describe('PRESETS', () => {
  it('has every field on every preset, with its own id', () => {
    for (const id of PRESET_IDS) {
      for (const f of FIELDS) expect(PRESETS[id][f], `${id}.${f}`).toBeDefined();
      expect(PRESETS[id].id).toBe(id);
    }
  });

  it('matches the spec table', () => {
    expect(PRESETS.low).toMatchObject({ resolution: 0.6, litter: 1000, detail: 0, hero: 0, reaction: false, effects: false, clutter: 0.5, rim: false });
    expect(PRESETS.medium).toMatchObject({ resolution: 0.75, litter: 2500, detail: 800, hero: 12, reaction: true, effects: true, clutter: 1, rim: true });
    expect(PRESETS.high).toMatchObject({ resolution: 1, maxDpr: 1, litter: 4000, detail: 1500, hero: 24, extraEffects: false, nearClutter: false });
    expect(PRESETS.ultra).toMatchObject({ resolution: 1, maxDpr: 1.5, litter: 6000, detail: 2500, hero: 32, extraEffects: true, nearClutter: true });
  });

  it('never costs less going from Low up to Ultra, and costs more at every step', () => {
    const num = (s: PresetSpec) => [s.resolution * s.maxDpr, s.litter, s.detail, s.hero, s.clutter];
    const flag = (s: PresetSpec) => [s.reaction, s.effects, s.extraEffects, s.nearClutter, s.rim].map(Number);
    for (let i = 1; i < PRESET_IDS.length; i++) {
      const a = PRESETS[PRESET_IDS[i - 1]];
      const b = PRESETS[PRESET_IDS[i]];
      num(b).forEach((v, k) => expect(v).toBeGreaterThanOrEqual(num(a)[k]));
      flag(b).forEach((v, k) => expect(v).toBeGreaterThanOrEqual(flag(a)[k]));
      expect(b.litter + b.detail).toBeGreaterThan(a.litter + a.detail);
    }
  });

  it('has a label and a one-line description for every choice', () => {
    expect(CHOICES).toEqual(['auto', 'low', 'medium', 'high', 'ultra']);
    for (const c of CHOICES) {
      expect(CHOICE_LABELS[c].length).toBeGreaterThan(0);
      expect(CHOICE_DESCRIPTIONS[c]).toMatch(/\.$/);
    }
    expect(CHOICE_DESCRIPTIONS.auto).toBe('Starts on High and lowers detail if the game slows down.');
  });
});

describe('type guards', () => {
  it('accept only known ids', () => {
    expect(isPresetId('high')).toBe(true);
    expect(isPresetId('auto')).toBe(false);
    expect(isPresetId(3)).toBe(false);
    expect(isChoice('auto')).toBe(true);
    expect(isChoice('ULTRA')).toBe(false);
  });
});

describe('pixelRatioFor', () => {
  it('uses CSS pixels up to High and the device ratio (max 1.5) on Ultra', () => {
    expect(pixelRatioFor(PRESETS.low, 2)).toBeCloseTo(0.6);
    expect(pixelRatioFor(PRESETS.medium, 1)).toBeCloseTo(0.75);
    expect(pixelRatioFor(PRESETS.high, 2)).toBe(1);
    expect(pixelRatioFor(PRESETS.ultra, 2)).toBe(1.5);
    expect(pixelRatioFor(PRESETS.ultra, 1)).toBe(1);
    expect(pixelRatioFor(PRESETS.high, 0.5)).toBe(0.5);
  });
});

describe('AutoGraphics', () => {
  it('never chooses Ultra and steps High -> Medium -> Low', () => {
    expect(AUTO_ORDER).toEqual(['high', 'medium', 'low']);
    expect(AUTO_ORDER).not.toContain('ultra');
  });

  it('starts on High without a saved preset', () => {
    expect(new AutoGraphics(null).preset).toBe('high');
    expect(new AutoGraphics('ultra').preset).toBe('high');
  });

  it('starts at the saved autoSettled preset', () => {
    expect(new AutoGraphics('medium').preset).toBe('medium');
    expect(new AutoGraphics('low').preset).toBe('low');
  });

  it('steps down one preset after 2 s under 29 fps, then waits a 3 s cooldown', () => {
    const a = new AutoGraphics(null);
    expect(a.update(0, 20)).toBe(false);
    expect(a.update(1900, 20)).toBe(false);
    expect(a.update(2000, 20)).toBe(true);
    expect(a.preset).toBe('medium');
    a.update(2100, 20);
    expect(a.update(4900, 20)).toBe(false);
    expect(a.preset).toBe('medium');
  });

  it('holds at 29 fps and above', () => {
    const a = new AutoGraphics(null);
    for (let t = 0; t < 20_000; t += 100) expect(a.update(t, 29)).toBe(false);
    expect(a.preset).toBe('high');
  });

  it('never goes below Low and never steps up', () => {
    const a = new AutoGraphics(null);
    const seen: string[] = [];
    for (let t = 0; t < 60_000; t += 100) {
      a.update(t, t < 30_000 ? 5 : 60);
      if (seen[seen.length - 1] !== a.preset) seen.push(a.preset);
    }
    expect(seen).toEqual(['high', 'medium', 'low']);
  });

  it('interrupt() forgets a slow streak', () => {
    const a = new AutoGraphics(null);
    a.update(0, 20);
    a.update(1500, 20);
    a.interrupt();
    expect(a.update(2500, 20)).toBe(false);
    expect(a.preset).toBe('high');
  });
});

describe('recommendedPreset', () => {
  it('maps the speed test tiers 0..3 to High, Medium, Medium, Low', () => {
    expect([0, 1, 2, 3].map(recommendedPreset)).toEqual(['high', 'medium', 'medium', 'low']);
  });
  it('clamps out-of-range tiers', () => {
    expect(recommendedPreset(-1)).toBe('high');
    expect(recommendedPreset(9)).toBe('low');
  });
});

describe('tierSpec', () => {
  it('leaves the base preset alone at tier 0', () => {
    expect(tierSpec(PRESETS.high, TIERS[0])).toEqual(PRESETS.high);
  });
  it('lowers resolution, then rim and effects, then leaf counts, like the Step 0 tiers', () => {
    const t1 = tierSpec(PRESETS.high, TIERS[1]);
    expect(t1.resolution).toBeCloseTo(0.75);
    expect(t1.rim).toBe(true);
    const t2 = tierSpec(PRESETS.high, TIERS[2]);
    expect(t2.rim).toBe(false);
    expect(t2.effects).toBe(false);
    expect(t2.litter).toBe(PRESETS.high.litter);
    const t3 = tierSpec(PRESETS.high, TIERS[3]);
    expect(t3.resolution).toBeCloseTo(0.6);
    expect(t3.litter).toBe(PRESETS.high.litter / 2);
    expect(t3.detail).toBe(PRESETS.high.detail / 2);
    expect(t3.hero).toBe(PRESETS.high.hero / 2);
    expect(t3.clutter).toBe(0.5);
    expect(t3.id).toBe('high');
  });
});
