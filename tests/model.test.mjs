import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createNote,
  isTrashExpired,
  trashDaysRemaining,
  TRASH_RETENTION_MS,
  createChecklistItem,
  createEmbeddedChecklistItem,
  createReminder,
  appendChecklistItem,
  canAddChecklistItem,
  dateAtTime,
  decodeNoteType,
  editChecklistItemText,
  encodeNoteType,
  flattenNoteBlocks,
  findDuplicateReminderNotificationIds,
  findMappedReminderNotification,
  insertChecklistBlockAtSelection,
  normalizeNoteReminderGroups,
  nextChecklistItemPosition,
  nextAfterWorkDate,
  reorderItem,
  readNoteAppearance,
  readNoteBlocks,
  removeChecklistItem,
  richHtmlToPlainText,
  searchNotes,
  selectionForDocument,
  selectPrimaryNoteReminder,
  sortNotes,
  shouldScheduleReminder,
  toggleItem,
  updateNoteDraft,
} from '../src/model.ts';
import { databaseSchema, runDatabaseMigrations } from '../src/schema.ts';
import {
  CUSTOM_NOTE_FONT_SIZES,
  DEFAULT_CUSTOM_NOTE_FONT_SIZE,
  parseCustomFontSize,
  preserveFormattingSelection,
  readFontSizeNumber,
  toFontSizeCss,
} from '../src/editor/formatting.ts';


test('custom page colors and quick-note formatting preferences survive appearance parsing', () => {
  const appearance = readNoteAppearance(JSON.stringify({
    background: 'warmWhite', paper: 'plain', margin: 'comfortable', font: 'serif',
    customBackgroundColor: '#243B53', quickFontSize: 22, quickTextColor: '#2F6D9E',
  }));
  assert.equal(appearance.customBackgroundColor, '#243B53');
  assert.equal(appearance.quickFontSize, 22);
  assert.equal(appearance.quickTextColor, '#2F6D9E');
});

test('new notes have stable IDs and begin with genuinely empty content', () => {
  const note = createNote('text', 10, 'note-1');
  assert.equal(note.id, 'note-1');
  assert.equal(note.body, '');
  assert.equal(note.createdAt, 10);
  assert.equal(selectionForDocument(note.body, 50), 0);
});

test('Custom Note font sizes use CSS pixels with a 20px default and bounded custom input', () => {
  assert.equal(DEFAULT_CUSTOM_NOTE_FONT_SIZE, 20);
  assert.equal(readFontSizeNumber(undefined), 20);
  assert.equal(readFontSizeNumber('24px'), 24);
  assert.equal(readFontSizeNumber('140px'), 20);
  assert.deepEqual(CUSTOM_NOTE_FONT_SIZES, [12, 14, 16, 18, 20, 22, 24, 28, 32, 36]);
  assert.equal(parseCustomFontSize('27'), 27);
  assert.equal(parseCustomFontSize('7'), null);
  assert.equal(parseCustomFontSize('100'), null);
  assert.equal(parseCustomFontSize('20px'), null);
  assert.equal(toFontSizeCss(27), '27px');
});

test('formatting restores only the saved text range or insertion cursor', () => {
  assert.deepEqual(preserveFormattingSelection({ from: 8, to: 3 }), { from: 3, to: 8 });
  assert.deepEqual(preserveFormattingSelection({ from: 12, to: 12 }), { from: 12, to: 12 });
  assert.equal(preserveFormattingSelection({ from: -1, to: 4 }), null);
  assert.equal(preserveFormattingSelection(null), null);
});

test('custom notes offer a blank document and starter templates using editable paragraph blocks', () => {
  const blank = createNote('custom', 10, 'blank-custom');
  const plan = createNote('custom', 10, 'plan-custom', 'plan');
  const journal = createNote('custom', 10, 'journal-custom', 'journal');
  assert.equal(blank.type, 'custom');
  assert.equal(blank.body, '');
  assert.deepEqual(blank.blocks.map((block) => block.text), ['']);
  assert.equal(plan.title, 'Personal plan');
  assert.deepEqual(plan.blocks.map((block) => block.text), ['What I want to achieve', 'Next steps', 'Notes']);
  assert.equal(journal.title, 'Journal entry');
  assert.deepEqual(journal.blocks.map((block) => block.text), ['Today', 'What is on my mind', 'What I want to remember']);
  const searchable = updateNoteDraft(blank, {
    blocks: blank.blocks.map((block) => ({ ...block, text: 'Plan the next trip' })),
  }, 20);
  assert.deepEqual(searchNotes([searchable], 'trip').map((note) => note.id), ['blank-custom']);
  assert.equal(decodeNoteType('text', encodeNoteType('custom').editorMode), 'custom');
  assert.equal(decodeNoteType('text', 'quick'), 'text');
  assert.deepEqual(encodeNoteType('shopping'), { storedType: 'shopping', editorMode: 'quick' });
});

test('custom note styling and rich blocks restore while text remains searchable', () => {
  const html = '<h2>Trip</h2><p>Pack <strong>light</strong> &amp; bring a map.</p>';
  const blocks = [
    { id: 'rich-1', type: 'paragraph', text: 'Trip\nPack light & bring a map.', richHtml: html, alignment: 'center' },
    { id: 'photo-1', type: 'image', uri: 'file:///app/note-images/trip.jpg', width: 1600, height: 900, scale: 0.75 },
    { id: 'checklist-1', type: 'checklist', items: [
      { id: 'task-1', noteId: 'custom-1', blockId: 'checklist-1', text: 'Book a room', checked: true, position: 0 },
    ] },
  ];
  const restored = readNoteBlocks(JSON.stringify(blocks), '', 'custom-1');
  assert.deepEqual(restored, blocks);
  assert.equal(flattenNoteBlocks(restored), 'Trip\nPack light & bring a map.\nBook a room');
  assert.equal(richHtmlToPlainText('<p>One<br>two</p>'), 'One\ntwo');
  assert.deepEqual(readNoteAppearance(JSON.stringify({ background: 'blue', paper: 'grid', margin: 'wide' })), {
    background: 'blue', paper: 'grid', margin: 'wide', font: 'sans',
  });
  assert.deepEqual(readNoteAppearance(JSON.stringify({ font: 'serif' })), {
    background: 'warmWhite', paper: 'plain', margin: 'comfortable', font: 'serif',
  });
  assert.deepEqual(readNoteAppearance('{invalid'), {
    background: 'warmWhite', paper: 'plain', margin: 'comfortable', font: 'sans',
  });
});

test('custom note image placement and expanded size persist with bounded legacy-safe values', () => {
  const image = {
    id: 'movable-image', type: 'image', uri: 'file:///app/note-images/photo.jpg',
    width: 1200, height: 800, scale: 1.4, offsetX: 0.35, offsetY: -0.6,
  };
  assert.deepEqual(readNoteBlocks(JSON.stringify([image]), '', 'note-1')[0], image);

  const bounded = readNoteBlocks(JSON.stringify([{
    ...image, scale: 9, offsetX: -4, offsetY: 4,
  }]), '', 'note-1')[0];
  assert.equal(bounded.scale, 1.5);
  assert.equal(bounded.offsetX, -0.5);
  assert.equal(bounded.offsetY, 1);
});

test('updating a draft preserves its ID and advances the modification time', () => {
  const note = createNote('text', 10, 'note-1');
  const updated = updateNoteDraft(note, { title: 'Ideas', body: 'One thought' }, 20);
  assert.equal(updated.id, note.id);
  assert.equal(updated.title, 'Ideas');
  assert.equal(updated.body, 'One thought');
  assert.equal(updated.updatedAt, 20);
});

test('ordinary note blocks flatten into searchable text without changing block order', () => {
  const note = createNote('text', 10, 'mixed-note');
  const embeddedItem = createEmbeddedChecklistItem('mixed-note', 'checklist-1', 'Buy oat milk', 0, 11, 'item-1');
  const blocks = [
    { id: 'paragraph-1', type: 'paragraph', text: 'Before the shop' },
    { id: 'checklist-1', type: 'checklist', items: [embeddedItem] },
    { id: 'paragraph-2', type: 'paragraph', text: 'After the shop' },
  ];
  const updated = updateNoteDraft(note, { blocks }, 20);
  assert.equal(updated.body, 'Before the shop\nBuy oat milk\nAfter the shop');
  assert.deepEqual(updated.blocks.map((block) => block.id), ['paragraph-1', 'checklist-1', 'paragraph-2']);
  assert.deepEqual(searchNotes([updated], 'oat').map((candidate) => candidate.id), ['mixed-note']);
  assert.equal(flattenNoteBlocks(blocks), updated.body);
});

test('inserting a checklist at the cursor splits only the active paragraph and keeps following blocks', () => {
  const blocks = [
    { id: 'before', type: 'paragraph', text: 'Hello world' },
    { id: 'following', type: 'paragraph', text: 'Next thought' },
  ];
  const result = insertChecklistBlockAtSelection(blocks, 'before', { start: 5, end: 5 }, 'list', 'continue');
  assert.deepEqual(result.blocks.map((block) => [block.id, block.type, block.text]), [
    ['before', 'paragraph', 'Hello'],
    ['list', 'checklist', undefined],
    ['continue', 'paragraph', ' world'],
    ['following', 'paragraph', 'Next thought'],
  ]);
  assert.equal(result.focusParagraphId, 'continue');
  assert.equal(blocks[0].text, 'Hello world');
});

test('legacy plain-text notes and malformed block payloads retain their original text', () => {
  assert.deepEqual(readNoteBlocks(null, 'Keep every old line\nwith its spacing.', 'old-note'), [
    { id: 'legacy-paragraph-old-note', type: 'paragraph', text: 'Keep every old line\nwith its spacing.' },
  ]);
  assert.deepEqual(readNoteBlocks('{not json', 'Still preserved', 'old-note')[0].text, 'Still preserved');
});

test('embedded checklist reordering preserves stable IDs, text, and checked state', () => {
  const items = [
    createEmbeddedChecklistItem('note', 'block', 'Milk', 0, 1, 'milk'),
    { ...createEmbeddedChecklistItem('note', 'block', 'Bread', 1, 2, 'bread'), checked: true },
  ];
  const reordered = reorderItem(items, 'bread', 0);
  assert.deepEqual(reordered.map((item) => [item.id, item.text, item.checked, item.position]), [
    ['bread', 'Bread', true, 0],
    ['milk', 'Milk', false, 1],
  ]);
});

test('toggling a checklist item changes only the selected item', () => {
  const items = [
    { id: 'first', noteId: 'note', text: 'Milk', checked: false, position: 0 },
    { id: 'second', noteId: 'note', text: 'Bread', checked: true, position: 1 },
  ];
  const updated = toggleItem(items, 'first');
  assert.deepEqual(updated.map((item) => item.checked), [true, true]);
  assert.deepEqual(items.map((item) => item.checked), [false, true]);
});

test('editing an item trims its text and preserves its ID, order, completion, and other items', () => {
  const items = [
    { id: 'milk', noteId: 'note', text: 'Milk', checked: false, position: 0 },
    { id: 'bread', noteId: 'note', text: 'Bread', checked: true, position: 1 },
  ];
  const updated = editChecklistItemText(items, 'bread', '  Rye bread  ');
  assert.deepEqual(updated, [
    items[0],
    { id: 'bread', noteId: 'note', text: 'Rye bread', checked: true, position: 1 },
  ]);
  assert.deepEqual(items.map((item) => item.text), ['Milk', 'Bread']);
});

test('deleting an item removes only the selected stable ID without mutating the source list', () => {
  const items = [
    { id: 'milk', noteId: 'note', text: 'Milk', checked: false, position: 0 },
    { id: 'bread', noteId: 'note', text: 'Bread', checked: true, position: 1 },
  ];
  assert.deepEqual(removeChecklistItem(items, 'milk'), [items[1]]);
  assert.deepEqual(items.map((item) => item.id), ['milk', 'bread']);
});

test('checklist and shopping-list item entry trims input and appends a renderable item', () => {
  assert.equal(canAddChecklistItem('', false), false);
  assert.equal(canAddChecklistItem('   ', false), false);
  assert.equal(canAddChecklistItem('Milk', true), false);
  assert.equal(canAddChecklistItem(' Milk ', false), true);
  for (const type of ['checklist', 'shopping']) {
    const note = createNote(type, 10, `${type}-note`);
    const item = createChecklistItem(note.id, ' Milk ', 0, 20, `${type}-milk`);
    assert.deepEqual(item, {
      id: `${type}-milk`, noteId: `${type}-note`, text: 'Milk', checked: false, position: 0,
    });
    assert.equal(createChecklistItem(note.id, '   ', 0, 20), null);
    const updated = appendChecklistItem(note, item, 30);
    assert.deepEqual(updated.items.map((entry) => entry.text), ['Milk']);
    assert.equal(updated.updatedAt, 30);
    assert.deepEqual(note.items, []);
    assert.equal(nextChecklistItemPosition(updated.items), 1);
  }
  assert.equal(nextChecklistItemPosition([
    { id: 'one', noteId: 'note', text: 'One', checked: false, position: 0 },
    { id: 'three', noteId: 'note', text: 'Three', checked: false, position: 3 },
  ]), 4);
});

test('reordering uses stable IDs and preserves text and checked state', () => {
  const items = [
    { id: 'milk', noteId: 'note', text: 'Milk', checked: true, position: 0 },
    { id: 'bread', noteId: 'note', text: 'Bread', checked: false, position: 1 },
    { id: 'eggs', noteId: 'note', text: 'Eggs', checked: true, position: 2 },
  ];
  const reordered = reorderItem(items, 'eggs', 0);
  assert.deepEqual(reordered.map((item) => [item.id, item.text, item.checked, item.position]), [
    ['eggs', 'Eggs', true, 0],
    ['milk', 'Milk', true, 1],
    ['bread', 'Bread', false, 2],
  ]);
  assert.deepEqual(items.map((item) => item.id), ['milk', 'bread', 'eggs']);
  assert.equal(reorderItem(reordered, 'missing', 0), reordered);
});

test('after-work presets use device-local time and roll to tomorrow after the chosen time', () => {
  const now = new Date(2026, 9, 20, 16, 0, 0, 0);
  assert.equal(dateAtTime(now, '17:30').getTime(), new Date(2026, 9, 20, 17, 30).getTime());
  assert.equal(nextAfterWorkDate(now, '17:30').getTime(), new Date(2026, 9, 20, 17, 30).getTime());
  assert.equal(nextAfterWorkDate(new Date(2026, 9, 20, 18, 0), '17:30').getTime(), new Date(2026, 9, 21, 17, 30).getTime());
  assert.equal(dateAtTime(now, '25:00'), null);
});

test('new reminders are local note-level records with stable IDs', () => {
  const reminder = createReminder('Buy milk', 100_000, {
    id: 'reminder-1', noteId: 'note-1', now: 50_000,
  });
  assert.equal(reminder.id, 'reminder-1');
  assert.equal(reminder.title, 'Buy milk');
  assert.equal(reminder.noteId, 'note-1');
  assert.equal(reminder.checklistItemId, null);
  assert.equal(reminder.notificationId, null);
  assert.equal(reminder.createdAt, 50_000);
  assert.equal(reminder.updatedAt, 50_000);
  assert.equal(createReminder('Quick reminder', 100_000, { now: 50_000 }).noteId, null);
});

test('notification reconciliation keeps a mapped schedule once and rejects disabled, denied, or past reminders', () => {
  const reminder = {
    ...createReminder('Buy milk', 10_000, { id: 'reminder-1', now: 1 }),
    notificationId: 'native-1',
  };
  assert.equal(shouldScheduleReminder(reminder, true, true, 5_000), true);
  assert.equal(shouldScheduleReminder({ ...reminder, enabled: false }, true, true, 5_000), false);
  assert.equal(shouldScheduleReminder(reminder, false, true, 5_000), false);
  assert.equal(shouldScheduleReminder(reminder, true, false, 5_000), false);
  assert.equal(shouldScheduleReminder(reminder, true, true, 10_000), false);
  const scheduled = [
    { identifier: 'native-1', reminderId: 'reminder-1' },
    { identifier: 'stale', reminderId: 'reminder-1' },
  ];
  assert.equal(findMappedReminderNotification(reminder, scheduled), 'native-1');
  assert.equal(findMappedReminderNotification({ ...reminder, notificationId: null }, scheduled), null);
  assert.equal(findMappedReminderNotification({ ...reminder, notificationId: 'missing' }, scheduled), null);
  assert.equal(findMappedReminderNotification(reminder, [{ identifier: 'native-1', reminderId: 'different-reminder' }]), null);
  assert.equal(findMappedReminderNotification(reminder, [
    { identifier: 'native-1', reminderId: 'reminder-1', title: 'Groceries', body: 'Pick up milk' },
  ], { title: 'Groceries', body: 'Pick up milk' }), 'native-1');
  assert.equal(findMappedReminderNotification(reminder, [
    { identifier: 'native-1', reminderId: 'reminder-1', title: 'Old title', body: 'Pick up milk' },
  ], { title: 'Groceries', body: 'Pick up milk' }), null);
  assert.deepEqual(findDuplicateReminderNotificationIds('reminder-1', scheduled, 'native-1'), ['stale']);
});

test('note reminders collapse to one note-level reminder without deleting legacy records', () => {
  const noteReminder = createReminder('Check groceries', 10_000, {
    id: 'note-reminder', noteId: 'note-1', now: 100,
  });
  const itemReminder = {
    ...createReminder('Buy milk', 11_000, {
      id: 'item-reminder', noteId: 'note-1', now: 200,
    }),
    checklistItemId: 'item-1',
    notificationId: 'native-duplicate',
  };
  const normalized = normalizeNoteReminderGroups([itemReminder, noteReminder], 500);
  assert.equal(selectPrimaryNoteReminder(normalized, 'note-1').id, 'note-reminder');
  assert.equal(normalized.find((reminder) => reminder.id === 'note-reminder').checklistItemId, null);
  assert.equal(normalized.find((reminder) => reminder.id === 'item-reminder').enabled, false);
  assert.equal(normalized.find((reminder) => reminder.id === 'item-reminder').checklistItemId, 'item-1');
  assert.equal(normalized.find((reminder) => reminder.id === 'item-reminder').notificationId, null);
  assert.ok(normalized.find((reminder) => reminder.id === 'note-reminder').updatedAt > 200);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalizeNoteReminderGroups(normalized, 900), normalized);
  assert.equal(normalizeNoteReminderGroups(normalized, 900)[0], normalized[0]);

  const disabledLegacyReminder = {
    ...createReminder('Old item reminder', 12_000, { id: 'disabled-item', noteId: 'note-2', now: 300 }),
    checklistItemId: 'item-2',
    enabled: false,
  };
  assert.equal(selectPrimaryNoteReminder([disabledLegacyReminder], 'note-2'), null);
  assert.equal(normalizeNoteReminderGroups([disabledLegacyReminder], 900)[0], disabledLegacyReminder);
});

test('notes sort newest first and search matches titles, body, and item text', () => {
  const older = { ...createNote('text', 10, 'older'), title: 'Old note', body: 'Read later' };
  const newer = {
    ...createNote('shopping', 20, 'newer'),
    title: 'Groceries',
    items: [{ id: 'item', noteId: 'newer', text: 'Oat milk', checked: false, position: 0 }],
  };
  assert.deepEqual(sortNotes([older, newer]).map((note) => note.id), ['newer', 'older']);
  assert.deepEqual(searchNotes([older, newer], 'oat').map((note) => note.id), ['newer']);
  assert.deepEqual(searchNotes([older, newer], 'READ').map((note) => note.id), ['older']);
});

test('pinned notes sort ahead of recent notes and the setting defaults to highlighting them', () => {
  const olderPinned = { ...createNote('text', 5, 'pinned'), isPinned: true };
  const recent = createNote('text', 50, 'recent');
  const newerPinned = { ...createNote('text', 10, 'pinned-newer'), isPinned: true };
  assert.deepEqual(sortNotes([recent, olderPinned, newerPinned]).map((note) => note.id), ['pinned-newer', 'pinned', 'recent']);
});

test('trash notes expire at 30 days and show an accurate remaining lifetime', () => {
  const now = 100 * 24 * 60 * 60 * 1000;
  assert.equal(isTrashExpired({ deletedAt: now - TRASH_RETENTION_MS + 1 }, now), false);
  assert.equal(isTrashExpired({ deletedAt: now - TRASH_RETENTION_MS }, now), true);
  assert.equal(isTrashExpired({ deletedAt: null }, now), false);
  assert.equal(trashDaysRemaining(now, now), 30);
  assert.equal(trashDaysRemaining(now, now + 29 * 24 * 60 * 60 * 1000), 1);
  assert.equal(trashDaysRemaining(now, now + 30 * 24 * 60 * 60 * 1000), 0);
});
test('cursor selections stay within content and resolve empty content to offset zero', () => {
  assert.equal(selectionForDocument('', 100), 0);
  assert.equal(selectionForDocument('hello', 20), 5);
  assert.equal(selectionForDocument('hello', -1), 0);
});

test('SQLite saves and restores note text and ordered checklist state', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(databaseSchema);
  database.prepare(
    'INSERT INTO notes (id, title, type, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('note-1', 'Groceries', 'shopping', '', 10, 20);
  database.prepare(
    'INSERT INTO checklist_items (id, note_id, text, checked, position) VALUES (?, ?, ?, ?, ?)',
  ).run('item-1', 'note-1', 'Oat milk', 1, 0);
  database.prepare(
    'INSERT INTO checklist_items (id, note_id, text, checked, position) VALUES (?, ?, ?, ?, ?)',
  ).run('item-2', 'note-1', 'Apples', 0, 1);
  database.prepare('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?').run('Remember oat milk', 30, 'note-1');

  const restoredNote = database.prepare('SELECT * FROM notes WHERE id = ?').get('note-1');
  const restoredItems = database.prepare(
    'SELECT id, text, checked, position FROM checklist_items WHERE note_id = ? ORDER BY position ASC',
  ).all('note-1');

  assert.equal(restoredNote.body, 'Remember oat milk');
  assert.equal(restoredNote.updated_at, 30);
  assert.deepEqual(restoredItems.map((item) => [item.text, item.checked, item.position]), [
    ['Oat milk', 1, 0],
    ['Apples', 0, 1],
  ]);
  database.close();
});

test('the additive database upgrade keeps old notes and items and adds document storage safely', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'frictionless-notes-test-'));
  const path = join(directory, 'upgrade.db');
  try {
    const database = new DatabaseSync(path);
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE notes (
        id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('text', 'checklist', 'shopping')),
        body TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE checklist_items (
        id TEXT PRIMARY KEY NOT NULL,
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        text TEXT NOT NULL DEFAULT '', checked INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
      );
    `);
    database.prepare(
      'INSERT INTO notes (id, title, type, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('old-note', 'Groceries', 'shopping', '', 1, 2);
    database.prepare(
      'INSERT INTO notes (id, title, type, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('old-text', 'Old text', 'text', 'Keep this paragraph.', 1, 2);
    database.prepare(
      'INSERT INTO checklist_items (id, note_id, text, checked, position) VALUES (?, ?, ?, ?, ?)',
    ).run('old-item', 'old-note', 'Milk', 1, 0);

    database.exec(databaseSchema);
    await runDatabaseMigrations({
      getAllAsync: async (source) => database.prepare(source).all(),
      execAsync: async (source) => database.exec(source),
    });
    assert.equal(database.prepare('SELECT title FROM notes WHERE id = ?').get('old-note').title, 'Groceries');
    const oldList = database.prepare('SELECT body, blocks_json, editor_mode FROM notes WHERE id = ?').get('old-note');
    assert.equal(oldList.body, '');
    assert.equal(oldList.blocks_json, null);
    assert.equal(oldList.editor_mode, 'quick');
    const migratedColumns = database.prepare('PRAGMA table_info(notes)').all().map((column) => column.name);
    assert.equal(migratedColumns.includes('blocks_json'), true);
    assert.equal(migratedColumns.includes('appearance_json'), true);
    assert.equal(migratedColumns.includes('deleted_at'), true);
    assert.deepEqual(readNoteAppearance(database.prepare('SELECT appearance_json FROM notes WHERE id = ?').get('old-note').appearance_json), {
      background: 'warmWhite', paper: 'plain', margin: 'comfortable', font: 'sans',
    });
    const legacyText = database.prepare('SELECT body, blocks_json, editor_mode FROM notes WHERE id = ?').get('old-text');
    assert.equal(legacyText.body, 'Keep this paragraph.');
    assert.equal(legacyText.blocks_json, null);
    assert.equal(legacyText.editor_mode, 'quick');
    assert.deepEqual(readNoteBlocks(legacyText.blocks_json, legacyText.body, 'old-text'), [
      { id: 'legacy-paragraph-old-text', type: 'paragraph', text: 'Keep this paragraph.' },
    ]);
    assert.deepEqual(
      database.prepare('SELECT id, text, checked, position FROM checklist_items WHERE note_id = ?').all('old-note')
        .map((row) => [row.id, row.text, row.checked, row.position]),
      [['old-item', 'Milk', 1, 0]],
    );

    database.prepare(`
      INSERT INTO reminders (
        id, title, scheduled_at, enabled, note_id, checklist_item_id,
        notification_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('reminder-1', 'Buy milk after work', 5_000, 1, 'old-note', 'old-item', 'native-1', 3, 4);
    database.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('afterWorkTime', '17:30');
    database.prepare(
      'INSERT INTO checklist_items (id, note_id, text, checked, position) VALUES (?, ?, ?, ?, ?)',
    ).run('new-item', 'old-note', 'Bread', 0, 1);
    database.prepare('UPDATE checklist_items SET position = ? WHERE id = ? AND note_id = ?').run(1, 'old-item', 'old-note');
    database.prepare('UPDATE checklist_items SET position = ? WHERE id = ? AND note_id = ?').run(0, 'new-item', 'old-note');
    database.close();

    const reopened = new DatabaseSync(path);
    reopened.exec('PRAGMA foreign_keys = ON');
    assert.deepEqual(
      reopened.prepare('SELECT id, text, checked, position FROM checklist_items WHERE note_id = ? ORDER BY position').all('old-note')
        .map((row) => [row.id, row.text, row.checked, row.position]),
      [['new-item', 'Bread', 0, 0], ['old-item', 'Milk', 1, 1]],
    );
    const reminder = reopened.prepare('SELECT * FROM reminders WHERE id = ?').get('reminder-1');
    assert.equal(reminder.title, 'Buy milk after work');
    assert.equal(reminder.notification_id, 'native-1');
    assert.equal(reopened.prepare('SELECT value FROM app_settings WHERE key = ?').get('afterWorkTime').value, '17:30');
    reopened.prepare('UPDATE reminders SET title = ?, scheduled_at = ? WHERE id = ?')
      .run('Pick up milk', 6_000, 'reminder-1');
    reopened.prepare('UPDATE reminders SET enabled = 0, notification_id = NULL WHERE id = ?').run('reminder-1');
    let changedReminder = reopened.prepare('SELECT * FROM reminders WHERE id = ?').get('reminder-1');
    assert.equal(changedReminder.title, 'Pick up milk');
    assert.equal(changedReminder.scheduled_at, 6_000);
    assert.equal(changedReminder.enabled, 0);
    assert.equal(changedReminder.notification_id, null);
    reopened.prepare('UPDATE reminders SET enabled = 1, notification_id = ? WHERE id = ?').run('native-2', 'reminder-1');
    changedReminder = reopened.prepare('SELECT * FROM reminders WHERE id = ?').get('reminder-1');
    assert.equal(changedReminder.enabled, 1);
    assert.equal(changedReminder.notification_id, 'native-2');
    reopened.prepare('DELETE FROM reminders WHERE id = ?').run('reminder-1');
    assert.equal(reopened.prepare('SELECT count(*) AS total FROM reminders').get().total, 0);
    reopened.prepare(`
      INSERT INTO reminders (
        id, title, scheduled_at, enabled, note_id, checklist_item_id,
        notification_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('reminder-2', 'Remember bread', 7_000, 1, 'old-note', 'new-item', null, 5, 6);
    reopened.prepare('DELETE FROM notes WHERE id = ?').run('old-note');
    assert.equal(reopened.prepare('SELECT count(*) AS total FROM reminders').get().total, 0);
    reopened.close();
  } finally {
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
    rmSync(path, { force: true });
    rmdirSync(directory);
  }
});

test('SQLite reopens mixed Custom Note blocks with formatting, images, appearance, and checklist state intact', () => {
  const directory = mkdtempSync(join(tmpdir(), 'frictionless-notes-document-'));
  const path = join(directory, 'document.db');
  try {
    const database = new DatabaseSync(path);
    database.exec(databaseSchema);
    const blocks = [
      {
        id: 'paragraph-1', type: 'paragraph', text: 'Before the tasks',
        richHtml: '<p>Before the <span style="font-family:Georgia;font-size:24px"><strong><u>tasks</u></strong></span></p>',
        alignment: 'center', spacing: 'relaxed',
      },
      { id: 'image-1', type: 'image', uri: 'file:///app/note-images/plan.jpg', width: 1200, height: 800, scale: 0.8 },
      {
        id: 'checklist-1',
        type: 'checklist',
        items: [
          createEmbeddedChecklistItem('mixed-note', 'checklist-1', 'Milk', 0, 10, 'milk'),
          { ...createEmbeddedChecklistItem('mixed-note', 'checklist-1', 'Bread', 1, 11, 'bread'), checked: true },
        ],
      },
      { id: 'paragraph-2', type: 'paragraph', text: 'After the tasks' },
    ];
    const appearance = { background: 'cream', paper: 'dotted', margin: 'wide', font: 'serif' };
    const body = flattenNoteBlocks(blocks);
    database.prepare(
      'INSERT INTO notes (id, title, type, editor_mode, body, blocks_json, appearance_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('mixed-note', 'Plan', 'text', 'custom', body, JSON.stringify(blocks), JSON.stringify(appearance), 1, 2);
    database.close();

    const reopenedDatabase = new DatabaseSync(path);
    const reopened = reopenedDatabase.prepare('SELECT type, editor_mode, body, blocks_json, appearance_json FROM notes WHERE id = ?').get('mixed-note');
    const restoredBlocks = readNoteBlocks(reopened.blocks_json, reopened.body, 'mixed-note');
    assert.equal(decodeNoteType(reopened.type, reopened.editor_mode), 'custom');
    assert.equal(reopened.body, 'Before the tasks\nMilk\nBread\nAfter the tasks');
    assert.deepEqual(restoredBlocks.map((block) => [block.id, block.type]), [
      ['paragraph-1', 'paragraph'],
      ['image-1', 'image'],
      ['checklist-1', 'checklist'],
      ['paragraph-2', 'paragraph'],
    ]);
    assert.equal(restoredBlocks[0].richHtml, '<p>Before the <span style="font-family:Georgia;font-size:24px"><strong><u>tasks</u></strong></span></p>');
    assert.equal(restoredBlocks[0].alignment, 'center');
    assert.equal(restoredBlocks[0].spacing, 'relaxed');
    assert.deepEqual(restoredBlocks[1], blocks[1]);
    assert.deepEqual(restoredBlocks[2].items.map((item) => [item.id, item.text, item.checked, item.position]), [
      ['milk', 'Milk', false, 0],
      ['bread', 'Bread', true, 1],
    ]);
    assert.deepEqual(readNoteAppearance(reopened.appearance_json), appearance);
    reopenedDatabase.close();
  } finally {
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
    rmSync(path, { force: true });
    rmdirSync(directory);
  }
});

test('SQLite stores custom-note mode without changing the legacy constrained note type', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(databaseSchema);
  const note = createNote('custom', 10, 'custom-note');
  const identity = encodeNoteType(note.type);
  database.prepare(
    'INSERT INTO notes (id, title, type, editor_mode, body, blocks_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    note.id,
    note.title,
    identity.storedType,
    identity.editorMode,
    note.body,
    JSON.stringify(note.blocks),
    note.createdAt,
    note.updatedAt,
  );
  const saved = database.prepare('SELECT type, editor_mode, body, blocks_json FROM notes WHERE id = ?').get(note.id);
  assert.equal(saved.type, 'text');
  assert.equal(decodeNoteType(saved.type, saved.editor_mode), 'custom');
  assert.equal(readNoteBlocks(saved.blocks_json, saved.body, note.id)[0].text, '');
  database.close();
});
