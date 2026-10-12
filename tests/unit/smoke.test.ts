import { describe, it, expect } from 'vitest';
import { CSP } from '../../vite.config';

describe('build config', () => {
  it('blocks all network connections', () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).toContain("base-uri 'none'");
    expect(CSP).toContain("form-action 'none'");
  });

  it('frames only YouTube\'s no-cookie player, for lesson videos', () => {
    const frames = CSP.split('; ').filter((d) => d.startsWith('frame-src') || d.startsWith('child-src'));
    expect(frames).toEqual(['frame-src https://www.youtube-nocookie.com']);
  });
});
