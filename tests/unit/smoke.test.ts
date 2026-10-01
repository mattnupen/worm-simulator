import { describe, it, expect } from 'vitest';
import { CSP } from '../../vite.config';

describe('build config', () => {
  it('blocks all network connections', () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("default-src 'none'");
  });
});
