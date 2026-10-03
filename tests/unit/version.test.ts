import { describe, it, expect } from 'vitest';
import { VERSION, VERSION_LABEL, VERSION_META } from '../../src/version';

describe('version', () => {
  it('is V1 · True Size', () => {
    expect(VERSION).toEqual({ number: 1, name: 'True Size' });
    expect(VERSION_LABEL).toBe('V1 · True Size');
  });

  it('has a whole number from 1 and a 2 to 4 word name (docs/codev/README.md)', () => {
    expect(Number.isInteger(VERSION.number) && VERSION.number >= 1).toBe(true);
    const words = VERSION.name.trim().split(/\s+/);
    expect(words.length).toBeGreaterThanOrEqual(2);
    expect(words.length).toBeLessThanOrEqual(4);
  });

  it('stamps the build with a meta tag the release script reads', () => {
    expect(VERSION_META).toBe('<meta name="wormsim-version" content="V1 · True Size">');
  });
});
