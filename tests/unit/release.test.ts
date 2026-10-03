import { describe, it, expect } from 'vitest';
import {
  parseReleaseArgs, parseVersionLabel, checkTarget, checkBuild, releasePath,
} from '../../scripts/releaseLib.mjs';
import { VERSION, VERSION_META } from '../../src/version';

const page = (meta: string) => `<!doctype html><html><head>\n    ${meta}\n</head><body></body></html>`;

describe('parseReleaseArgs', () => {
  it('reads the version number and the emergency flag', () => {
    expect(parseReleaseArgs(['1'])).toEqual({ version: 1, emergencyFix: false });
    expect(parseReleaseArgs(['12', '--emergency-fix'])).toEqual({ version: 12, emergencyFix: true });
    expect(parseReleaseArgs(['--emergency-fix', '3'])).toEqual({ version: 3, emergencyFix: true });
  });
  it('rejects a missing, non-whole, zero or extra argument with the usage line', () => {
    for (const bad of [[], ['v1'], ['1.5'], ['0'], ['-2'], ['1', '2'], ['1', '--force']]) {
      expect(() => parseReleaseArgs(bad)).toThrow(/Usage: npm run release -- <N>/);
    }
  });
});

describe('parseVersionLabel', () => {
  it('reads back what the build stamps (src/version.ts)', () => {
    expect(parseVersionLabel(page(VERSION_META))).toEqual({ number: VERSION.number, name: VERSION.name });
  });
  it('is null without the tag, or with a malformed one', () => {
    expect(parseVersionLabel(page(''))).toBeNull();
    expect(parseVersionLabel(page('<meta name="wormsim-version" content="1 True Size">'))).toBeNull();
    expect(parseVersionLabel(page('<meta name="wormsim-version" content="V0 · Zero">'))).toBeNull();
  });
});

describe('checkTarget: released versions are frozen', () => {
  it('allows a new version', () => {
    expect(checkTarget(2, false, false)).toBeNull();
  });
  it('refuses to overwrite an existing release', () => {
    expect(checkTarget(1, true, false)).toMatch(/releases\/v1\/ already exists.*frozen.*--emergency-fix/s);
  });
  it('overwrites only with --emergency-fix', () => {
    expect(checkTarget(1, true, true)).toBeNull();
  });
});

describe('checkBuild', () => {
  it('accepts a build labelled with the version being released', () => {
    expect(checkBuild(page('<meta name="wormsim-version" content="V3 · Racing the Frost">'), 3)).toBeNull();
  });
  it('refuses a build labelled with another version, or none', () => {
    expect(checkBuild(page('<meta name="wormsim-version" content="V2 · First Bite">'), 3))
      .toMatch(/labelled V2 · First Bite, not V3.*src\/version\.ts/s);
    expect(checkBuild(page(''), 3)).toMatch(/no version label/);
  });
});

describe('releasePath', () => {
  it('is releases/vN/index.html', () => {
    expect(releasePath(4)).toBe('releases/v4/index.html');
  });
});
