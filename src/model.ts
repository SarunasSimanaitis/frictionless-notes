import type {
  AppPreferences, ChecklistItem, CustomNoteTemplateId, EmbeddedChecklistBlock,
  EmbeddedChecklistItem, Note, NoteBlock, NoteEditorMode, NoteType, ParagraphBlock,
  Reminder, StoredNoteType, NoteAppearance, NoteBackground, PaperStyle, NoteMargin, ParagraphSpacing,
  NoteFilter, NoteLineHeight, NoteSortMode,
} from './types';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const defaultNoteAppearance: NoteAppearance = {
  background: 'warmWhite',
  paper: 'plain',
  margin: 'comfortable',
  font: 'sans',
};

export const noteBackgrounds: NoteBackground[] = [
  'warmWhite', 'white', 'cream', 'sand', 'pink', 'lavender', 'blue', 'green', 'graphite', 'midnight',
];
const paperStyles: PaperStyle[] = ['plain', 'lined', 'dotted', 'grid'];
const noteMargins: NoteMargin[] = ['narrow', 'comfortable', 'wide'];
const paragraphSpacings: ParagraphSpacing[] = ['compact', 'normal', 'relaxed'];
const noteLineHeights: NoteLineHeight[] = ['tight', 'normal', 'loose'];
export const NOTE_BASE_FONT_SIZES = [16, 18, 20, 22] as const;

export const defaultPreferences: AppPreferences = {
  remindersEnabled: true,
  afterWorkTime: '17:30',
  highlightPinnedNotes: true,
  themeMode: 'system',
  quickNoteToolbarMode: 'simple',
  appLockEnabled: false,
  screenPrivacy: false,
  sortMode: 'updated',
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
  const template = type === 'custom' ? customNoteTemplates[templateId] : undefined;
  const blocks: NoteBlock[] = isDocumentNote(type)
    ? (template?.blocks ?? ['']).map((block): NoteBlock => {
        const blockId = createId(now);
        if (typeof block === 'string') return { id: blockId, type: 'paragraph', text: block };
        if (block.kind === 'checklist') return { id: blockId, type: 'checklist', items: [] };
        return { id: blockId, type: 'paragraph', text: richHtmlToPlainText(block.html), richHtml: block.html };
      })
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
    isPinned: false,
    isLocked: false,
    items: [],
  };
}

type TemplateBlock = string | { kind: 'rich'; html: string } | { kind: 'checklist' };

/** Starter documents for Custom Notes. Plain strings are editable paragraphs; rich blocks carry headings and lists. */
export const customNoteTemplates: Partial<Record<CustomNoteTemplateId, { title: string; label: string; blocks: TemplateBlock[] }>> = {
  plan: { title: 'Personal plan', label: 'Plan', blocks: ['What I want to achieve', 'Next steps', 'Notes'] },
  journal: { title: 'Journal entry', label: 'Journal', blocks: ['Today', 'What is on my mind', 'What I want to remember'] },
  meeting: {
    title: 'Meeting notes',
    label: 'Meeting',
    blocks: [
      { kind: 'rich', html: '<h2>Agenda</h2><ul><li><p>First topic</p></li></ul><h2>Notes</h2><p></p><h2>Action items</h2>' },
      { kind: 'checklist' },
      '',
    ],
  },
  weekly: {
    title: 'Weekly plan',
    label: 'Week',
    blocks: [
      { kind: 'rich', html: '<h2>Top priorities</h2><ol><li><p>The one thing that matters most</p></li></ol><h2>Schedule</h2><p><strong>Mon</strong> </p><p><strong>Tue</strong> </p><p><strong>Wed</strong> </p><p><strong>Thu</strong> </p><p><strong>Fri</strong> </p><h2>To do</h2>' },
      { kind: 'checklist' },
      '',
    ],
  },
  recipe: {
    title: 'Recipe',
    label: 'Recipe',
    blocks: [
      { kind: 'rich', html: '<p>Serves 2 · 30 min</p><h2>Ingredients</h2>' },
      { kind: 'checklist' },
      { kind: 'rich', html: '<h2>Method</h2><ol><li><p>First step</p></li></ol><h2>Notes</h2><p></p>' },
    ],
  },
};

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

/** The HTML the rich editor shows, and reports back, for text that has no formatting. */
export function plainTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br>') || '<br>'}</p>`;
}

/**
 * True when the editor's report for a never-formatted paragraph is just its text again.
 * The editor reports its content as soon as it loads, and that first report is not an edit.
 */
export function isUnchangedPlainParagraph(block: Pick<ParagraphBlock, 'text' | 'richHtml'>, html: string): boolean {
  return block.richHtml === undefined && html === plainTextToHtml(block.text);
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
      font: parsed.font === 'serif' || parsed.font === 'mono' ? parsed.font : defaultNoteAppearance.font,
      ...(typeof parsed.customBackgroundColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.customBackgroundColor)
        ? { customBackgroundColor: parsed.customBackgroundColor } : {}),
      ...(Number.isFinite(Number(parsed.quickFontSize)) && Number(parsed.quickFontSize) >= 12 && Number(parsed.quickFontSize) <= 32
        ? { quickFontSize: Math.round(Number(parsed.quickFontSize)) } : {}),
      ...(typeof parsed.quickTextColor === 'string' && /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(parsed.quickTextColor)
        ? { quickTextColor: parsed.quickTextColor } : {}),
      ...(Number.isFinite(Number(parsed.baseFontSize)) && Number(parsed.baseFontSize) >= 12 && Number(parsed.baseFontSize) <= 28
        ? { baseFontSize: Math.round(Number(parsed.baseFontSize)) } : {}),
      ...(noteLineHeights.includes(parsed.lineHeight as NoteLineHeight)
        ? { lineHeight: parsed.lineHeight as NoteLineHeight } : {}),
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
  changes: Partial<Pick<Note, 'title' | 'body' | 'blocks' | 'appearance' | 'isPinned' | 'isLocked'>>,
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

/** Pinned notes always lead; the chosen order applies within each group. */
export function sortNotes(notes: Note[], mode: NoteSortMode = 'updated'): Note[] {
  const byMode = (a: Note, b: Note): number => {
    if (mode === 'created') return b.createdAt - a.createdAt;
    if (mode === 'title') {
      return a.title.trim().localeCompare(b.title.trim(), undefined, { sensitivity: 'base' }) || b.updatedAt - a.updatedAt;
    }
    return b.updatedAt - a.updatedAt;
  };
  return [...notes].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || byMode(a, b));
}

/** Search covers titles, text and list items. A locked note only ever matches by its title. */
export function searchNotes(notes: Note[], query: string, mode: NoteSortMode = 'updated'): Note[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return sortNotes(notes, mode);

  return sortNotes(notes, mode).filter((note) => {
    const searchableText = (note.isLocked
      ? [note.title]
      : [note.title, note.body, ...note.items.map((item) => item.text)])
      .join('\n')
      .toLocaleLowerCase();

    return searchableText.includes(normalized);
  });
}

export function filterNotes(notes: Note[], filter: NoteFilter, noteIdsWithReminders: ReadonlySet<string> = new Set()): Note[] {
  switch (filter) {
    case 'notes': return notes.filter((note) => isDocumentNote(note.type));
    case 'lists': return notes.filter((note) => !isDocumentNote(note.type));
    case 'pinned': return notes.filter((note) => note.isPinned);
    case 'reminders': return notes.filter((note) => noteIdsWithReminders.has(note.id));
    case 'locked': return notes.filter((note) => note.isLocked);
    default: return notes;
  }
}

export function checklistProgress(items: Array<{ checked: boolean }>): { done: number; total: number } {
  return { done: items.filter((item) => item.checked).length, total: items.length };
}

export function uncheckAllItems<T extends ChecklistItem>(items: T[]): T[] {
  return items.map((item) => item.checked ? { ...item, checked: false } : item);
}

export function clearCheckedItems<T extends ChecklistItem>(items: T[]): T[] {
  return normalizeItemPositions(items.filter((item) => !item.checked));
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** A plain-text version of a note for the system share sheet. */
export function noteToShareText(note: Note): string {
  const title = note.title.trim();
  const checklistLine = (item: { text: string; checked: boolean }) => `${item.checked ? '[x]' : '[ ]'} ${item.text}`;
  const content = isDocumentNote(note.type)
    ? note.blocks.map((block) => block.type === 'paragraph'
        ? (block.richHtml === undefined ? block.text : richHtmlToPlainText(block.richHtml))
        : block.type === 'checklist' ? block.items.map(checklistLine).join('\n') : '')
        .filter((text) => text.length > 0).join('\n\n')
    : note.items.map(checklistLine).join('\n');
  return [title, content].filter((part) => part.length > 0).join('\n\n');
}

/**
 * An independent copy of a note with fresh IDs throughout. Images are left out because
 * each image file belongs to exactly one note. Copies are never pinned or locked.
 */
export function duplicateNote(note: Note, now = Date.now(), id = createId(now)): Note {
  const blocks: NoteBlock[] = note.blocks.flatMap((block): NoteBlock[] => {
    if (block.type === 'image') return [];
    const blockId = createId();
    if (block.type === 'checklist') {
      return [{ ...block, id: blockId, items: block.items.map((item) => ({ ...item, id: createId(), noteId: id, blockId })) }];
    }
    return [{ ...block, id: blockId }];
  });
  const safeBlocks = isDocumentNote(note.type) && !blocks.some((block) => block.type === 'paragraph')
    ? [...blocks, { id: createId(), type: 'paragraph' as const, text: '' }]
    : blocks;
  const title = note.title.trim();
  return {
    ...note,
    id,
    title: title ? `${title} (copy)` : 'Copy',
    blocks: safeBlocks,
    body: isDocumentNote(note.type) ? flattenNoteBlocks(safeBlocks) : note.body,
    appearance: { ...note.appearance },
    items: note.items.map((item, position) => ({ ...item, id: createId(), noteId: id, position })),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    isPinned: false,
    isLocked: false,
  };
}

export function selectionForDocument(text: string, requestedOffset: number): number {
  if (text.length === 0) return 0;
  return Math.max(0, Math.min(requestedOffset, text.length));
}
