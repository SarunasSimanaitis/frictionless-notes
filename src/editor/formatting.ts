export const DEFAULT_CUSTOM_NOTE_FONT_SIZE = 20;

export const CUSTOM_NOTE_FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36] as const;

export const CUSTOM_NOTE_FONTS = [
  { id: 'system', label: 'System', css: 'system-ui, -apple-system, sans-serif', preview: undefined },
  { id: 'arial', label: 'Arial', css: 'Arial, sans-serif', preview: 'Arial' },
  { id: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif', preview: 'Georgia' },
  { id: 'monospace', label: 'Mono', css: 'ui-monospace, "Courier New", monospace', preview: 'monospace' },
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

export function readFontSizeNumber(fontSize: string | undefined): number {
  if (!fontSize) return DEFAULT_CUSTOM_NOTE_FONT_SIZE;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(fontSize.trim());
  if (!match) return DEFAULT_CUSTOM_NOTE_FONT_SIZE;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 8 && parsed <= 96
    ? Math.round(parsed)
    : DEFAULT_CUSTOM_NOTE_FONT_SIZE;
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
