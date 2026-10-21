import { describe, it, expect } from 'vitest';
import { SOURCES } from '../../src/content/sources';
import { TEXT, GAME_CHOICE_PREFIX, lineProblems, shown, type Line } from '../../src/content/text';

describe('content: science honesty', () => {
  it('every shown line is labelled, and every fact is sourced and verified', () => {
    expect(lineProblems(TEXT)).toEqual([]);
  });

  it('catches an unsourced or unverified fact, an empty line and a doubled prefix', () => {
    // As a later edit might slip past the types (a cast, a JSON import).
    const bad = {
      noSource: { kind: 'fact', text: 'Worms eat leaves.', source: 'my-blog', verified: true },
      unchecked: { kind: 'fact', text: 'Worms eat leaves.', source: 'wormwatch-ecogroups', verified: false },
      empty: { kind: 'ui', text: '  ' },
      twice: { kind: 'gameChoice', text: 'Game choice: worms fly.' },
      odd: { kind: 'rumour', text: 'Worms sing.' },
      shouting: { kind: 'gameChoice', text: 'GAME CHOICE: worms fly.' },
      missing: { kind: 'ui' },
    } as unknown as Record<string, Line>;
    expect(lineProblems(bad)).toEqual([
      'noSource: unknown source "my-blog"',
      'unchecked: not verified',
      'empty: empty',
      'twice: has the game-choice prefix twice',
      'odd: unknown kind',
      'shouting: has the game-choice prefix twice',
      'missing: empty',
    ]);
  });

  it('the types reject a fact without a verified source', () => {
    // @ts-expect-error a fact needs a source
    const a: Line = { kind: 'fact', text: 'x', verified: true };
    // @ts-expect-error a fact must be verified: true
    const b: Line = { kind: 'fact', text: 'x', source: 'mndnr-humus', verified: false };
    // @ts-expect-error a fact's source must be a known SourceId
    const c: Line = { kind: 'fact', text: 'x', source: 'my-blog', verified: true };
    expect([a, b, c]).toHaveLength(3);
  });

  it('every source has a title, publisher, https link and a checked date', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.title.length, id).toBeGreaterThan(0);
      expect(s.publisher.length, id).toBeGreaterThan(0);
      expect(s.url, id).toMatch(/^https:\/\/\S+$/);
      expect(s.checked, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(s.checked)), id).toBe(false);
    }
    expect(Object.keys(SOURCES)).toEqual(expect.arrayContaining(['wormwatch-ecogroups', 'mndnr-humus', 'wormwatch-forest']));
  });

  it('a game choice is shown labelled; other lines as written', () => {
    expect(shown(TEXT.burrowChoice)).toBe(
      'Game choice: In the game you can dig any way you like.',
    );
    expect(TEXT.burrowFact).toMatchObject({ kind: 'fact', source: 'wormwatch-ecogroups', verified: true });
    expect(shown(TEXT.burrowFact)).toBe('Real nightcrawlers dig one burrow that goes straight down, as deep as 2 meters.');
    expect(SOURCES['wormwatch-ecogroups'].checked).toBe('2026-10-21');
    expect(GAME_CHOICE_PREFIX).toBe('Game choice: ');
    expect(shown(TEXT.digDown)).toBe('Dig down');
  });

  it('has the words V2\'s screens use (the plans\' contract)', () => {
    const words = Object.fromEntries(Object.entries(TEXT).map(([k, l]) => [k, shown(l)]));
    expect(words).toMatchObject({
      digDown: 'Dig down',
      comeUp: 'Come up',
      viewWide: 'Wide view',
      viewClose: 'Close view',
      layerLitter: 'Leaf litter',
      layerOld: 'Old leaves',
      layerHumus: 'Humus',
      layerTopsoil: 'Topsoil',
      layerSubsoil: 'Subsoil',
      undergroundHint: 'Point the way to dig with the arrow keys, W A S D, or the joystick. Space: switch view, or come up near the top. Esc or P: pause.',
    });
    for (const k of ['digDown', 'comeUp', 'viewWide', 'viewClose', 'layerLitter', 'layerOld', 'layerHumus', 'layerTopsoil', 'layerSubsoil', 'undergroundHint'] as const) {
      expect(TEXT[k].kind).toBe('ui');
    }
    expect(TEXT.burrowChoice.kind).toBe('gameChoice');
  });
});
