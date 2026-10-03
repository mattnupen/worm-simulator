export interface ReleaseArgs { version: number; emergencyFix: boolean }
export function parseReleaseArgs(argv: readonly string[]): ReleaseArgs;
export function parseVersionLabel(html: string): { number: number; name: string } | null;
export function releasePath(n: number): string;
export function checkTarget(n: number, exists: boolean, emergencyFix: boolean): string | null;
export function checkBuild(html: string, n: number): string | null;
