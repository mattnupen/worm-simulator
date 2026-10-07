import { describe, it, expect } from 'vitest';
import { VERSION, VERSION_LABEL, VERSION_META } from '../../src/version';

describe('version', () => {
  it('is V2 · Underground', () => {
    expect(VERSION).toEqual({ number: 2, name: 'Underground' });
    expect(VERSION_LABEL).toBe('V2 · Underground');
  });

  it('has a whole number from 1 and a short name of at most 4 words (docs/codev/README.md)', () => {
    expect(Number.isInteger(VERSION.number) && VERSION.number >= 1).toBe(true);
    // CLAUDE.md asks for 2 to 4 words; Matt named V2 "Underground" (one word) in the approved spec.
    const words = VERSION.name.trim().split(/\s+/);
    expect(words.length).toBeGreaterThanOrEqual(1);
    expect(words.length).toBeLessThanOrEqual(4);
  });

  it('has a name safe to put unescaped in the meta tag\'s attribute: letters, digits, spaces, \' and -', () => {
    expect(VERSION.name).toMatch(/^[A-Za-z0-9 '-]+$/);
  });

  it('stamps the build with a meta tag the release script reads', () => {
    expect(VERSION_META).toBe('<meta name="wormsim-version" content="V2 · Underground">');
  });
});
