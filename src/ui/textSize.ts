/**
 * Text size (Settings, Matt 2026-10-22). Every menu, HUD and lesson text size is in rem, so one
 * attribute on <html> scales them all (theme.css). Normal is the default and is a little larger
 * than before; nothing goes smaller, so text stays 18px+ (parent spec section 7).
 */
export type TextSize = 'normal' | 'big' | 'bigger';

export const TEXT_SIZES: readonly TextSize[] = ['normal', 'big', 'bigger'];
export const DEFAULT_TEXT_SIZE: TextSize = 'normal';
export const TEXT_SIZE_LABELS: Readonly<Record<TextSize, string>> = { normal: 'Normal', big: 'Big', bigger: 'Bigger' };

export function isTextSize(v: unknown): v is TextSize {
  return v === 'normal' || v === 'big' || v === 'bigger';
}

/** Sets the size on the page: Normal is theme.css's plain `html` rule, so it removes the attribute. */
export function applyTextSize(size: TextSize, root: HTMLElement = document.documentElement): void {
  if (size === DEFAULT_TEXT_SIZE) root.removeAttribute('data-text-size');
  else root.dataset.textSize = size;
}
