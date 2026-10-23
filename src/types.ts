export type NoteType = 'text' | 'custom' | 'checklist' | 'shopping';
export type StoredNoteType = 'text' | 'checklist' | 'shopping';
export type NoteEditorMode = 'quick' | 'custom';
export type CustomNoteTemplateId = 'blank' | 'plan' | 'journal';
export type NoteBackground = 'warmWhite' | 'white' | 'cream' | 'pink' | 'green' | 'blue';
export type PaperStyle = 'plain' | 'lined' | 'dotted' | 'grid';
export type NoteMargin = 'narrow' | 'comfortable' | 'wide';
export type NoteFont = 'sans' | 'serif';
export type NoteFontFamily = 'system' | 'arial' | 'serif' | 'monospace';
export type ParagraphSpacing = 'compact' | 'normal' | 'relaxed';

export interface NoteAppearance {
  background: NoteBackground;
  paper: PaperStyle;
  margin: NoteMargin;
  font: NoteFont;
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
}
