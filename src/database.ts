import * as SQLite from 'expo-sqlite';
import type { AppPreferences, ChecklistItem, Note, Reminder, StoredNoteType } from './types';
import { databaseSchema, runDatabaseMigrations } from './schema';
import {
  decodeNoteType, defaultPreferences, encodeNoteType, flattenNoteBlocks,
  isDocumentNote, readNoteAppearance, readNoteBlocks,
} from './model';

interface NoteRow {
  id: string;
  title: string;
  type: StoredNoteType;
  editor_mode: string;
  body: string;
  blocks_json: string | null;
  appearance_json: string | null;
  deleted_at: number | null;
  is_pinned: number;
  created_at: number;
  updated_at: number;
}

interface ItemRow {
  id: string;
  note_id: string;
  text: string;
  checked: number;
  position: number;
}

interface ReminderRow {
  id: string;
  title: string;
  scheduled_at: number;
  enabled: number;
  note_id: string | null;
  checklist_item_id: string | null;
  notification_id: string | null;
  created_at: number;
  updated_at: number;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync('frictionless-notes.db');
      await database.execAsync(databaseSchema);
      await runDatabaseMigrations(database);
      return database;
    })();
  }

  return databasePromise;
}

async function loadNotesByTrashState(trashed: boolean): Promise<Note[]> {
  const database = await getDatabase();
  const noteRows = await database.getAllAsync<NoteRow>(
    `SELECT id, title, type, editor_mode, body, blocks_json, appearance_json, deleted_at, is_pinned, created_at, updated_at
     FROM notes WHERE deleted_at IS ${trashed ? 'NOT NULL' : 'NULL'} ORDER BY ${trashed ? 'deleted_at DESC' : 'updated_at DESC'}`,
  );
  const itemRows = await database.getAllAsync<ItemRow>(
    'SELECT id, note_id, text, checked, position FROM checklist_items ORDER BY position ASC',
  );
  const itemsByNote = new Map<string, ChecklistItem[]>();

  for (const row of itemRows) {
    const items = itemsByNote.get(row.note_id) ?? [];
    items.push({
      id: row.id,
      noteId: row.note_id,
      text: row.text,
      checked: row.checked === 1,
      position: row.position,
    });
    itemsByNote.set(row.note_id, items);
  }

  return noteRows.map((row) => {
    const type = decodeNoteType(row.type, row.editor_mode);
    return {
      id: row.id,
      title: row.title,
      type,
      body: row.body,
      blocks: isDocumentNote(type) ? readNoteBlocks(row.blocks_json, row.body, row.id) : [],
      appearance: readNoteAppearance(row.appearance_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      isPinned: row.is_pinned === 1,
      items: itemsByNote.get(row.id) ?? [],
    };
  });
}

export function loadNotes(): Promise<Note[]> {
  return loadNotesByTrashState(false);
}

export function loadTrashedNotes(): Promise<Note[]> {
  return loadNotesByTrashState(true);
}

export async function insertNote(note: Note): Promise<void> {
  const database = await getDatabase();
  const { storedType, editorMode } = encodeNoteType(note.type);
  await database.runAsync(
    'INSERT INTO notes (id, title, type, editor_mode, body, blocks_json, appearance_json, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    note.id,
    note.title,
    storedType,
    editorMode,
    isDocumentNote(note.type) ? flattenNoteBlocks(note.blocks) : note.body,
    isDocumentNote(note.type) ? JSON.stringify(note.blocks) : null,
    JSON.stringify(note.appearance),
    note.isPinned ? 1 : 0,
    note.createdAt,
    note.updatedAt,
  );
}

export async function updateNote(note: Note): Promise<void> {
  const database = await getDatabase();
  const { storedType, editorMode } = encodeNoteType(note.type);
  await database.runAsync(
    'UPDATE notes SET title = ?, type = ?, editor_mode = ?, body = ?, blocks_json = ?, appearance_json = ?, is_pinned = ?, updated_at = ? WHERE id = ?',
    note.title,
    storedType,
    editorMode,
    isDocumentNote(note.type) ? flattenNoteBlocks(note.blocks) : note.body,
    isDocumentNote(note.type) ? JSON.stringify(note.blocks) : null,
    JSON.stringify(note.appearance),
    note.isPinned ? 1 : 0,
    note.updatedAt,
    note.id,
  );
}

export async function moveNoteToTrash(noteId: string, deletedAt: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
    deletedAt,
    noteId,
  );
}

export async function restoreNote(noteId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE notes SET deleted_at = NULL WHERE id = ?', noteId);
}

export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM notes WHERE id = ?', noteId);
}

export async function addChecklistItem(item: ChecklistItem, updatedAt: number): Promise<void> {
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      'INSERT INTO checklist_items (id, note_id, text, checked, position) VALUES (?, ?, ?, ?, ?)',
      item.id,
      item.noteId,
      item.text,
      item.checked ? 1 : 0,
      item.position,
    );
    await transaction.runAsync('UPDATE notes SET updated_at = ? WHERE id = ?', updatedAt, item.noteId);
  });
}

export async function saveChecklistItem(item: ChecklistItem, updatedAt: number): Promise<void> {
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      'UPDATE checklist_items SET text = ?, checked = ?, position = ? WHERE id = ? AND note_id = ?',
      item.text,
      item.checked ? 1 : 0,
      item.position,
      item.id,
      item.noteId,
    );
    await transaction.runAsync('UPDATE notes SET updated_at = ? WHERE id = ?', updatedAt, item.noteId);
  });
}

export async function deleteChecklistItem(itemId: string, noteId: string, updatedAt: number): Promise<void> {
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM checklist_items WHERE id = ? AND note_id = ?', itemId, noteId);
    await transaction.runAsync('UPDATE notes SET updated_at = ? WHERE id = ?', updatedAt, noteId);
  });
}

export async function saveItemOrder(noteId: string, items: ChecklistItem[], updatedAt: number): Promise<void> {
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const [position, item] of items.entries()) {
      await transaction.runAsync(
        'UPDATE checklist_items SET position = ? WHERE id = ? AND note_id = ?',
        position,
        item.id,
        noteId,
      );
    }
    await transaction.runAsync('UPDATE notes SET updated_at = ? WHERE id = ?', updatedAt, noteId);
  });
}

/** Replace a note's checklist rows from the latest editor snapshot atomically.
 * This is used before moving an actively edited list to Trash so a pending add
 * cannot leave the stored note snapshot out of sync with its child rows.
 */
export async function replaceChecklistItems(noteId: string, items: ChecklistItem[], updatedAt: number): Promise<void> {
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM checklist_items WHERE note_id = ?', noteId);
    for (const [position, item] of items.entries()) {
      await transaction.runAsync(
        'INSERT INTO checklist_items (id, note_id, text, checked, position) VALUES (?, ?, ?, ?, ?)',
        item.id,
        noteId,
        item.text,
        item.checked ? 1 : 0,
        position,
      );
    }
    await transaction.runAsync('UPDATE notes SET updated_at = ? WHERE id = ?', updatedAt, noteId);
  });
}

function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    enabled: row.enabled === 1,
    noteId: row.note_id,
    checklistItemId: row.checklist_item_id,
    notificationId: row.notification_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadReminders(noteId?: string): Promise<Reminder[]> {
  const database = await getDatabase();
  const rows = noteId
    ? await database.getAllAsync<ReminderRow>(
        'SELECT * FROM reminders WHERE note_id = ? ORDER BY scheduled_at ASC',
        noteId,
      )
    : await database.getAllAsync<ReminderRow>('SELECT * FROM reminders ORDER BY scheduled_at ASC');
  return rows.map(mapReminder);
}

export async function saveReminder(reminder: Reminder): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO reminders (
      id, title, scheduled_at, enabled, note_id, checklist_item_id,
      notification_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      scheduled_at = excluded.scheduled_at,
      enabled = excluded.enabled,
      note_id = excluded.note_id,
      checklist_item_id = excluded.checklist_item_id,
      notification_id = excluded.notification_id,
      updated_at = excluded.updated_at`,
    reminder.id,
    reminder.title,
    reminder.scheduledAt,
    reminder.enabled ? 1 : 0,
    reminder.noteId,
    reminder.checklistItemId,
    reminder.notificationId,
    reminder.createdAt,
    reminder.updatedAt,
  );
}

export async function setReminderNotificationId(reminderId: string, notificationId: string | null): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE reminders SET notification_id = ? WHERE id = ?',
    notificationId,
    reminderId,
  );
}

export async function removeReminder(reminderId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM reminders WHERE id = ?', reminderId);
}

export async function loadPreferences(): Promise<AppPreferences> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?, ?)',
    'remindersEnabled',
    'afterWorkTime',
    'highlightPinnedNotes',
    'themeMode',
    'quickNoteToolbarMode',
  );
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return {
    remindersEnabled: stored.get('remindersEnabled') === undefined
      ? defaultPreferences.remindersEnabled
      : stored.get('remindersEnabled') === 'true',
    afterWorkTime: stored.get('afterWorkTime') ?? defaultPreferences.afterWorkTime,
    highlightPinnedNotes: stored.get('highlightPinnedNotes') === undefined
      ? defaultPreferences.highlightPinnedNotes
      : stored.get('highlightPinnedNotes') === 'true',
    themeMode: stored.get('themeMode') === 'dark' ? 'dark' : 'light',
    quickNoteToolbarMode: stored.get('quickNoteToolbarMode') === 'advanced' ? 'advanced' : 'simple',
  };
}

export async function savePreferences(preferences: AppPreferences): Promise<void> {
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'remindersEnabled',
      String(preferences.remindersEnabled),
    );
    await transaction.runAsync(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'afterWorkTime',
      preferences.afterWorkTime,
    );
    await transaction.runAsync(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'highlightPinnedNotes',
      String(preferences.highlightPinnedNotes),
    );
    await transaction.runAsync(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'themeMode',
      preferences.themeMode,
    );
    await transaction.runAsync(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'quickNoteToolbarMode',
      preferences.quickNoteToolbarMode,
    );
  });
}
