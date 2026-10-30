export const databaseSchema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'checklist', 'shopping')),
    editor_mode TEXT NOT NULL DEFAULT 'quick',
    body TEXT NOT NULL DEFAULT '',
    blocks_json TEXT,
    appearance_json TEXT,
    deleted_at INTEGER,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY NOT NULL,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    checked INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes(updated_at DESC);
  CREATE INDEX IF NOT EXISTS checklist_items_note_position_idx
    ON checklist_items(note_id, position);
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    checklist_item_id TEXT REFERENCES checklist_items(id) ON DELETE CASCADE,
    notification_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reminders_note_schedule_idx
    ON reminders(note_id, scheduled_at);
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

interface SchemaDatabase {
  getAllAsync<T>(source: string): Promise<T[]>;
  execAsync(source: string): Promise<void>;
}

export async function runDatabaseMigrations(database: SchemaDatabase): Promise<void> {
  const noteColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(notes)');
  if (!noteColumns.some((column) => column.name === 'blocks_json')) {
    await database.execAsync('ALTER TABLE notes ADD COLUMN blocks_json TEXT');
  }
  if (!noteColumns.some((column) => column.name === 'editor_mode')) {
    await database.execAsync("ALTER TABLE notes ADD COLUMN editor_mode TEXT NOT NULL DEFAULT 'quick'");
  }
  if (!noteColumns.some((column) => column.name === 'appearance_json')) {
    await database.execAsync('ALTER TABLE notes ADD COLUMN appearance_json TEXT');
  }
  if (!noteColumns.some((column) => column.name === 'deleted_at')) {
    await database.execAsync('ALTER TABLE notes ADD COLUMN deleted_at INTEGER');
  }
  if (!noteColumns.some((column) => column.name === 'is_pinned')) {
    await database.execAsync('ALTER TABLE notes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
  }
  await database.execAsync('CREATE INDEX IF NOT EXISTS notes_deleted_at_idx ON notes(deleted_at)');
}
