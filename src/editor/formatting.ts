import type { NoteFont, NoteLineHeight } from '../types';

export const DEFAULT_CUSTOM_NOTE_FONT_SIZE = 20;

export const CUSTOM_NOTE_FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36] as const;

export const CUSTOM_NOTE_FONTS = [
  { id: 'system', label: 'System', css: 'system-ui, -apple-system, sans-serif', preview: undefined },
  { id: 'arial', label: 'Arial', css: 'Arial, sans-serif', preview: 'Arial' },
  { id: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif', preview: 'serif' },
  { id: 'condensed', label: 'Condensed', css: '"sans-serif-condensed", "Arial Narrow", sans-serif', preview: 'sans-serif-condensed' },
  { id: 'monospace', label: 'Mono', css: 'ui-monospace, "Courier New", monospace', preview: 'monospace' },
  { id: 'script', label: 'Script', css: '"Dancing Script", cursive', preview: 'cursive' },
] as const;

/** The CSS font stack for a whole page, chosen in Page style. */
export const NOTE_PAGE_FONT_CSS: Record<NoteFont, string> = {
  sans: 'system-ui, -apple-system, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Courier New", monospace',
};

export const NOTE_LINE_HEIGHTS: Record<NoteLineHeight, number> = { tight: 1.35, normal: 1.55, loose: 1.8 };

export const TEXT_COLORS = [
  { label: 'Default', color: null },
  { label: 'Slate', color: '#5F6672' },
  { label: 'Blue', color: '#3B5BFF' },
  { label: 'Sky', color: '#0E8FD6' },
  { label: 'Teal', color: '#0F9D8A' },
  { label: 'Green', color: '#2E9E52' },
  { label: 'Amber', color: '#C98A0B' },
  { label: 'Orange', color: '#E0662A' },
  { label: 'Red', color: '#D93A3A' },
  { label: 'Pink', color: '#D6409F' },
  { label: 'Violet', color: '#7C4DDB' },
] as const;

export const HIGHLIGHT_COLORS = [
  { label: 'None', color: null },
  { label: 'Butter', color: '#FFF1A8' },
  { label: 'Peach', color: '#FFE0C2' },
  { label: 'Blush', color: '#FBDDE4' },
  { label: 'Lilac', color: '#E8DEFB' },
  { label: 'Sky', color: '#D8EAFD' },
  { label: 'Mint', color: '#D5F2E3' },
  { label: 'Lime', color: '#E6F4B8' },
  { label: 'Smoke', color: '#E6E8EB' },
] as const;

export type FontSizeSelection = { from: number; to: number };

/** Keeps a real cursor or selection range intact; invalid ranges never widen to the document. */
export function preserveFormattingSelection(selection: FontSizeSelection | null | undefined): FontSizeSelection | null {
  if (!selection || !Number.isSafeInteger(selection.from) || !Number.isSafeInteger(selection.to)) return null;
  if (selection.from < 0 || selection.to < 0) return null;
  return {
    from: Math.min(selection.from, selection.to),
    to: Math.max(selection.from, selection.to),
  };
}

export function readFontSizeNumber(fontSize: string | undefined, fallback = DEFAULT_CUSTOM_NOTE_FONT_SIZE): number {
  if (!fontSize) return fallback;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(fontSize.trim());
  if (!match) return fallback;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 8 && parsed <= 96
    ? Math.round(parsed)
    : fallback;
}

export function parseCustomFontSize(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d{1,2}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return parsed >= 8 && parsed <= 96 ? parsed : null;
}

export function toFontSizeCss(size: number): string {
  const normalized = Number.isFinite(size) ? Math.max(8, Math.min(96, Math.round(size))) : DEFAULT_CUSTOM_NOTE_FONT_SIZE;
  return `${normalized}px`;
}
