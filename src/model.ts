import type {
  AppPreferences, ChecklistItem, CustomNoteTemplateId, EmbeddedChecklistBlock,
  EmbeddedChecklistItem, Note, NoteBlock, NoteEditorMode, NoteType, ParagraphBlock,
  Reminder, StoredNoteType, NoteAppearance, NoteBackground, PaperStyle, NoteMargin, ParagraphSpacing,
} from './types';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const defaultNoteAppearance: NoteAppearance = {
  background: 'warmWhite',
  paper: 'plain',
  margin: 'comfortable',
  font: 'sans',
};

const noteBackgrounds: NoteBackground[] = ['warmWhite', 'white', 'cream', 'pink', 'green', 'blue'];
const paperStyles: PaperStyle[] = ['plain', 'lined', 'dotted', 'grid'];
const noteMargins: NoteMargin[] = ['narrow', 'comfortable', 'wide'];
const paragraphSpacings: ParagraphSpacing[] = ['compact', 'normal', 'relaxed'];

export const defaultPreferences: AppPreferences = {
  remindersEnabled: true,
  afterWorkTime: '17:30',
};

export function createId(now = Date.now(), random = Math.random()): string {
  return `${now.toString(36)}-${random.toString(36).slice(2, 10)}`;
}

export function isDocumentNote(type: NoteType): type is 'text' | 'custom' {
  return type === 'text' || type === 'custom';
}

export function encodeNoteType(type: NoteType): { storedType: StoredNoteType; editorMode: NoteEditorMode } {
  if (type === 'custom') return { storedType: 'text', editorMode: 'custom' };
  return { storedType: type, editorMode: 'quick' };
}

export function decodeNoteType(type: StoredNoteType, editorMode: string): NoteType {
  return type === 'text' && editorMode === 'custom' ? 'custom' : type;
}

export function createNote(
  type: NoteType,
  now = Date.now(),
  id = createId(now),
  templateId: CustomNoteTemplateId = 'blank',
): Note {
  const labels: Record<NoteType, string> = {
    text: 'New note',
    custom: 'New custom note',
    checklist: 'New checklist',
    shopping: 'Shopping list',
  };
  const customTemplates: Partial<Record<CustomNoteTemplateId, { title: string; paragraphs: string[] }>> = {
    plan: { title: 'Personal plan', paragraphs: ['What I want to achieve', 'Next steps', 'Notes'] },
    journal: { title: 'Journal entry', paragraphs: ['Today', 'What is on my mind', 'What I want to remember'] },
  };
  const template = type === 'custom' ? customTemplates[templateId] : undefined;
  const blocks: NoteBlock[] = isDocumentNote(type)
    ? (template?.paragraphs ?? ['']).map((text) => ({ id: createId(now), type: 'paragraph', text }))
    : [];

  return {
    id,
    title: template?.title ?? labels[type],
    type,
    body: flattenNoteBlocks(blocks),
    blocks,
    appearance: { ...defaultNoteAppearance },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    items: [],
  };
}

export function createEmbeddedChecklistBlock(id = createId()): EmbeddedChecklistBlock {
  return { id, type: 'checklist', items: [] };
}

export function createEmbeddedChecklistItem(
  noteId: string,
  blockId: string,
  text: string,
  position: number,
  now = Date.now(),
  id = createId(now),
): EmbeddedChecklistItem | null {
  const normalizedText = text.trim();
  if (!normalizedText) return null;
  return { id, noteId, blockId, text: normalizedText, checked: false, position };
}

export function richHtmlToPlainText(html: string): string {
  return html
    .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function flattenNoteBlocks(blocks: NoteBlock[]): string {
  return blocks.map((block) => block.type === 'paragraph'
    ? (block.richHtml === undefined ? block.text : richHtmlToPlainText(block.richHtml))
    : block.type === 'checklist'
      ? block.items.map((item) => item.text).join('\n')
      : '')
    .filter((text) => text.length > 0)
    .join('\n');
}

export function readNoteAppearance(serialized: string | null): NoteAppearance {
  if (!serialized) return { ...defaultNoteAppearance };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) return { ...defaultNoteAppearance };
    return {
      background: noteBackgrounds.includes(parsed.background as NoteBackground)
        ? parsed.background as NoteBackground : defaultNoteAppearance.background,
      paper: paperStyles.includes(parsed.paper as PaperStyle)
        ? parsed.paper as PaperStyle : defaultNoteAppearance.paper,
      margin: noteMargins.includes(parsed.margin as NoteMargin)
        ? parsed.margin as NoteMargin : defaultNoteAppearance.margin,
      font: parsed.font === 'serif' ? 'serif' : defaultNoteAppearance.font,
    };
  } catch {
    return { ...defaultNoteAppearance };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readNoteBlocks(serialized: string | null, legacyBody: string, noteId: string): NoteBlock[] {
  if (serialized) {
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (Array.isArray(parsed)) {
        const blocks: NoteBlock[] = [];
        for (const [index, value] of parsed.entries()) {
          if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) continue;
          if (value.type === 'paragraph' && typeof value.text === 'string') {
            blocks.push({
              id: value.id,
              type: 'paragraph',
              text: typeof value.richHtml === 'string' ? richHtmlToPlainText(value.richHtml) : value.text,
              ...(typeof value.richHtml === 'string' ? { richHtml: value.richHtml } : {}),
              ...(value.alignment === 'center' || value.alignment === 'right'
                ? { alignment: value.alignment }
                : {}),
              ...(paragraphSpacings.includes(value.spacing as ParagraphSpacing)
                ? { spacing: value.spacing as ParagraphSpacing }
                : {}),
            });
            continue;
          }
          if (value.type === 'checklist' && Array.isArray(value.items)) {
            const items: EmbeddedChecklistItem[] = value.items.flatMap((item, itemIndex) => {
              if (!isRecord(item) || typeof item.id !== 'string' || typeof item.text !== 'string') return [];
              const position = Number.isInteger(item.position) ? Number(item.position) : itemIndex;
              return [{
                id: item.id,
                noteId,
                blockId: value.id as string,
                text: item.text,
                checked: item.checked === true,
                position,
              }];
            }).sort((a, b) => a.position - b.position)
              .map((item, itemIndex) => ({ ...item, position: itemIndex }));
            blocks.push({ id: value.id, type: 'checklist', items });
            continue;
          }
          if (value.type === 'image' && typeof value.uri === 'string' && value.uri.length > 0) {
            const width = Number(value.width);
            const height = Number(value.height);
            blocks.push({
              id: value.id,
              type: 'image',
              uri: value.uri,
              width: Number.isFinite(width) && width > 0 ? width : 1,
              height: Number.isFinite(height) && height > 0 ? height : 1,
              ...(Number.isFinite(Number(value.scale))
                ? { scale: Math.max(0.2, Math.min(1.5, Number(value.scale))) }
                : {}),
              ...(Number.isFinite(Number(value.offsetX))
                ? { offsetX: Math.max(-0.5, Math.min(0.5, Number(value.offsetX))) }
                : {}),
              ...(Number.isFinite(Number(value.offsetY))
                ? { offsetY: Math.max(-1, Math.min(1, Number(value.offsetY))) }
                : {}),
            });
          }
        }
        if (blocks.length > 0) {
          if (!blocks.some((block) => block.type === 'paragraph')) {
            blocks.push({ id: `legacy-paragraph-${noteId}`, type: 'paragraph', text: '' });
          }
          return blocks;
        }
      }
    } catch {
      // A malformed or older document payload falls back to the preserved plain-text body.
    }
  }

  return [{ id: `legacy-paragraph-${noteId}`, type: 'paragraph', text: legacyBody }];
}

export function insertChecklistBlockAtSelection(
  blocks: NoteBlock[],
  paragraphId: string | null,
  selection: { start: number; end: number } | null,
  checklistBlockId: string,
  continuationParagraphId: string,
): { blocks: NoteBlock[]; focusParagraphId: string } {
  const paragraphIndex = paragraphId === null
    ? -1
    : blocks.findIndex((block) => block.id === paragraphId && block.type === 'paragraph');
  const fallbackIndex = paragraphIndex >= 0
    ? paragraphIndex
    : blocks.at(-1)?.type === 'paragraph' ? blocks.length - 1 : -1;

  if (fallbackIndex < 0) {
    const emptyParagraph: ParagraphBlock = {
      id: continuationParagraphId,
      type: 'paragraph',
      text: '',
    };
    return {
      blocks: [...blocks, createEmbeddedChecklistBlock(checklistBlockId), emptyParagraph],
      focusParagraphId: emptyParagraph.id,
    };
  }

  const paragraph = blocks[fallbackIndex];
  if (paragraph.type !== 'paragraph') {
    return { blocks, focusParagraphId: paragraphId ?? paragraph.id };
  }
  const offset = selection
    ? Math.max(0, Math.min(Math.max(selection.start, selection.end), paragraph.text.length))
    : paragraph.text.length;
  const prefix = { ...paragraph, text: paragraph.text.slice(0, offset) };
  const continuation: ParagraphBlock = {
    id: continuationParagraphId,
    type: 'paragraph',
    text: paragraph.text.slice(offset),
  };
  const checklist = createEmbeddedChecklistBlock(checklistBlockId);
  const nextBlocks = [...blocks];
  nextBlocks.splice(fallbackIndex, 1, prefix, checklist, continuation);
  return { blocks: nextBlocks, focusParagraphId: continuation.id };
}

export function canAddChecklistItem(text: string, adding = false): boolean {
  return !adding && text.trim().length > 0;
}

export function createChecklistItem(
  noteId: string,
  text: string,
  position: number,
  now = Date.now(),
  id = createId(now),
): ChecklistItem | null {
  const normalizedText = text.trim();
  if (!normalizedText) return null;

  return { id, noteId, text: normalizedText, checked: false, position };
}

export function appendChecklistItem(
  note: Note,
  item: ChecklistItem,
  updatedAt = Date.now(),
): Note {
  return { ...note, items: [...note.items, item], updatedAt };
}

export function nextChecklistItemPosition(items: ChecklistItem[]): number {
  return items.reduce((next, item) => Math.max(next, item.position + 1), 0);
}

export function toggleItem<T extends ChecklistItem>(items: T[], itemId: string): T[] {
  return items.map((item) =>
    item.id === itemId ? { ...item, checked: !item.checked } : item,
  );
}

export function editChecklistItemText<T extends ChecklistItem>(items: T[], itemId: string, text: string): T[] {
  return items.map((item) => item.id === itemId ? { ...item, text: text.trim() } : item);
}

export function removeChecklistItem<T extends ChecklistItem>(items: T[], itemId: string): T[] {
  return items.filter((item) => item.id !== itemId);
}

export function reorderItem<T extends ChecklistItem>(
  items: T[],
  itemId: string,
  targetIndex: number,
): T[] {
  const fromIndex = items.findIndex((item) => item.id === itemId);
  if (fromIndex < 0 || items.length < 2) return items;
  const destination = Math.max(0, Math.min(targetIndex, items.length - 1));
  if (fromIndex === destination) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(destination, 0, moved);
  return next.map((item, position) => ({ ...item, position }));
}

export function normalizeItemPositions<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, position) => ({ ...item, position }));
}

export function createReminder(
  title: string,
  scheduledAt: number,
  options: { id?: string; noteId?: string | null; now?: number } = {},
): Reminder {
  const now = options.now ?? Date.now();
  return {
    id: options.id ?? createId(now),
    title: title.trim(),
    scheduledAt,
    enabled: true,
    noteId: options.noteId ?? null,
    checklistItemId: null,
    notificationId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function dateAtTime(date: Date, time: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function nextAfterWorkDate(now: Date, time: string): Date | null {
  const today = dateAtTime(now, time);
  if (!today) return null;
  if (today.getTime() > now.getTime() + 60_000) return today;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateAtTime(tomorrow, time);
}

export function shouldScheduleReminder(
  reminder: Reminder,
  globallyEnabled: boolean,
  permissionGranted: boolean,
  now = Date.now(),
): boolean {
  return reminder.enabled && globallyEnabled && permissionGranted &&
    Number.isFinite(reminder.scheduledAt) && reminder.scheduledAt > now;
}

export function findMappedReminderNotification(
  reminder: Reminder,
  scheduled: Array<{ identifier: string; reminderId: string | null; title?: string; body?: string }>,
  expectedContent?: { title: string; body: string },
): string | null {
  if (!reminder.notificationId) return null;
  return scheduled.find((notification) =>
    notification.identifier === reminder.notificationId && notification.reminderId === reminder.id &&
    (!expectedContent || (notification.title === expectedContent.title && notification.body === expectedContent.body)),
  )?.identifier ?? null;
}

export function findDuplicateReminderNotificationIds(
  reminderId: string,
  scheduled: Array<{ identifier: string; reminderId: string | null }>,
  keepIdentifier: string,
): string[] {
  return scheduled
    .filter((notification) => notification.reminderId === reminderId && notification.identifier !== keepIdentifier)
    .map((notification) => notification.identifier);
}

export function selectPrimaryNoteReminder(reminders: Reminder[], noteId: string): Reminder | null {
  return reminders
    .filter((reminder) => reminder.noteId === noteId && reminder.checklistItemId === null)
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) ||
      b.updatedAt - a.updatedAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null;
}

export function normalizeNoteReminderGroups(reminders: Reminder[], now = Date.now()): Reminder[] {
  const byNote = new Map<string, Reminder[]>();
  for (const reminder of reminders) {
    if (reminder.noteId === null) continue;
    const group = byNote.get(reminder.noteId) ?? [];
    group.push(reminder);
    byNote.set(reminder.noteId, group);
  }

  const changed = new Map<string, Reminder>();
  for (const [noteId, group] of byNote) {
    const primary = selectPrimaryNoteReminder(group, noteId) ?? group
      .filter((reminder) => reminder.checklistItemId !== null && reminder.enabled)
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) ||
        b.updatedAt - a.updatedAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null;
    if (!primary) continue;
    const extras = group.filter((reminder) => reminder.id !== primary.id);
    const needsNormalization = primary.checklistItemId !== null ||
      extras.some((reminder) => reminder.enabled || reminder.notificationId !== null);
    if (!needsNormalization) continue;

    changed.set(primary.id, {
      ...primary,
      checklistItemId: null,
      updatedAt: Math.max(now, ...group.map((reminder) => reminder.updatedAt)) + 1,
    });
    for (const extra of extras) {
      if (extra.enabled || extra.notificationId !== null) {
        changed.set(extra.id, { ...extra, enabled: false, notificationId: null });
      }
    }
  }

  return reminders.map((reminder) => changed.get(reminder.id) ?? reminder);
}

export function updateNoteDraft(
  note: Note,
  changes: Partial<Pick<Note, 'title' | 'body' | 'blocks' | 'appearance'>>,
  updatedAt = Date.now(),
): Note {
  if (changes.blocks) {
    return { ...note, ...changes, body: flattenNoteBlocks(changes.blocks), updatedAt };
  }
  if (changes.body !== undefined && isDocumentNote(note.type)) {
    const paragraph = note.blocks.find((block) => block.type === 'paragraph');
    const blocks: NoteBlock[] = [{
      id: paragraph?.id ?? `legacy-paragraph-${note.id}`,
      type: 'paragraph',
      text: changes.body,
    }];
    return { ...note, ...changes, blocks, updatedAt };
  }
  return { ...note, ...changes, updatedAt };
}

export function isTrashExpired(note: Pick<Note, 'deletedAt'>, now = Date.now()): boolean {
  return note.deletedAt !== null && Number.isFinite(note.deletedAt) &&
    note.deletedAt <= now - TRASH_RETENTION_MS;
}

export function trashDaysRemaining(deletedAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deletedAt + TRASH_RETENTION_MS - now) / MS_PER_DAY));
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function searchNotes(notes: Note[], query: string): Note[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return sortNotes(notes);

  return sortNotes(notes).filter((note) => {
    const searchableText = [
      note.title,
      note.body,
      ...note.items.map((item) => item.text),
    ]
      .join('\n')
      .toLocaleLowerCase();

    return searchableText.includes(normalized);
  });
}

export function selectionForDocument(text: string, requestedOffset: number): number {
  if (text.length === 0) return 0;
  return Math.max(0, Math.min(requestedOffset, text.length));
}
