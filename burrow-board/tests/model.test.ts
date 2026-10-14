import { describe, expect, it } from 'vitest';
import { areaOfCards, normalizeAnswer, suggestAreas, type Card } from '../shared/model.ts';
import { crc32 } from '../server/zip.ts';

const card = (id: number, choice: string, choiceOther = '', parentId: number | null = null): Card => ({
  id, parentId, kind: 'idea', period: 1, nickname: 'n', mine: false, choice, choiceOther, areaOverride: null,
  factRef: '', title: `c${id}`, does: '', notice: '', changed: '', twist: '', imageId: null, status: null,
  statusNote: '', hidden: false, x: null, y: null, created: 0, updated: 0,
});

describe('areas built from students\' answers (brief section 4)', () => {
  const choices = [{ id: 'birds', name: 'Birds' }, { id: 'mammals', name: 'Mammals' }, { id: 'bugs', name: 'Insects & bugs' }];

  it('matches "Something else" answers that mean the same thing', () => {
    expect(normalizeAnswer('People with a Shovel!')).toBe(normalizeAnswer('people with shovels'));
    expect(normalizeAnswer('Fish')).toBe(normalizeAnswer('fish'));
  });

  it('keeps picked choices, leaves out empty ones, and makes new areas from shared answers', () => {
    const roots = [card(1, 'birds'), card(2, 'birds'), card(3, 'other', 'Fish'), card(4, 'other', 'fish!'), card(5, 'other', 'Lava')];
    const areas = suggestAreas(choices, roots);
    expect(areas.map((a) => a.name)).toEqual(['Birds', 'Fish']);
    const where = areaOfCards(roots, areas);
    expect(where.get(1)).toBe('a-birds');
    expect(where.get(3)).toBe(where.get(4));
    expect(where.get(5)).toBe('other');
  });

  it('keeps a dig with the idea it came from, and follows a teacher move', () => {
    const cards = [card(1, 'birds'), card(2, 'birds', '', 1), card(3, 'mammals', '', 2)];
    const areas = suggestAreas(choices, cards.filter((c) => c.parentId == null));
    expect(areaOfCards(cards, areas).get(3)).toBe('a-birds');
    cards[0].areaOverride = 'other';
    expect(areaOfCards(cards, areas).get(3)).toBe('other');
  });
});

describe('zip export', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });
});
