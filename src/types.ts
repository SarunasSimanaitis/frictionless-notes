export type NoteType = 'text' | 'custom' | 'checklist' | 'shopping';
export type StoredNoteType = 'text' | 'checklist' | 'shopping';
export type NoteEditorMode = 'quick' | 'custom';
export type CustomNoteTemplateId = 'blank' | 'plan' | 'journal' | 'meeting' | 'weekly' | 'recipe';
export type NoteBackground =
  | 'warmWhite' | 'white' | 'cream' | 'pink' | 'green' | 'blue'
  | 'lavender' | 'sand' | 'graphite' | 'midnight';
export type PaperStyle = 'plain' | 'lined' | 'dotted' | 'grid';
export type NoteMargin = 'narrow' | 'comfortable' | 'wide';
export type NoteFont = 'sans' | 'serif' | 'mono';
export type NoteLineHeight = 'tight' | 'normal' | 'loose';
export type ThemePreference = 'system' | 'light' | 'dark';
export type NoteSortMode = 'updated' | 'created' | 'title';
export type NoteFilter = 'all' | 'notes' | 'lists' | 'pinned' | 'reminders' | 'locked';
export type NoteFontFamily = 'system' | 'arial' | 'serif' | 'monospace';
export type ParagraphSpacing = 'compact' | 'normal' | 'relaxed';

export interface NoteAppearance {
  background: NoteBackground;
  paper: PaperStyle;
  margin: NoteMargin;
  font: NoteFont;
  customBackgroundColor?: string;
  quickFontSize?: number;
  quickTextColor?: string;
  /** Base text size of a Custom Note page in CSS pixels. */
  baseFontSize?: number;
  lineHeight?: NoteLineHeight;
}

export interface ChecklistItem {
  id: string;
  noteId: string;
  text: string;
  checked: boolean;
  position: number;
}

export interface EmbeddedChecklistItem extends ChecklistItem {
  blockId: string;
}

export interface ParagraphBlock {
  id: string;
  type: 'paragraph';
  text: string;
  richHtml?: string;
  alignment?: 'left' | 'center' | 'right';
  spacing?: ParagraphSpacing;
}

export interface EmbeddedChecklistBlock {
  id: string;
  type: 'checklist';
  items: EmbeddedChecklistItem[];
}

export interface InlineImageBlock {
  id: string;
  type: 'image';
  uri: string;
  width: number;
  height: number;
  scale?: number;
  /** Horizontal image offset as a fraction of the note content width. */
  offsetX?: number;
  /** Vertical image offset as a fraction of the note content width. */
  offsetY?: number;
}

export type NoteBlock = ParagraphBlock | EmbeddedChecklistBlock | InlineImageBlock;

export interface Note {
  id: string;
  title: string;
  type: NoteType;
  body: string;
  blocks: NoteBlock[];
  appearance: NoteAppearance;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  isPinned: boolean;
  /** Locked notes hide their preview and ask for the device lock before opening. */
  isLocked: boolean;
  items: ChecklistItem[];
}

export interface Reminder {
  id: string;
  title: string;
  scheduledAt: number;
  enabled: boolean;
  noteId: string | null;
  checklistItemId: string | null;
  notificationId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AppPreferences {
  remindersEnabled: boolean;
  afterWorkTime: string;
  highlightPinnedNotes: boolean;
  themeMode: ThemePreference;
  quickNoteToolbarMode: 'simple' | 'advanced';
  /** Ask for the device lock (fingerprint, face or PIN) when the app opens. */
  appLockEnabled: boolean;
  /** Block screenshots and hide the app's content in the recent-apps view. */
  screenPrivacy: boolean;
  sortMode: NoteSortMode;
}
