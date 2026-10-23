import type { AppPreferences, ChecklistItem, Note, Reminder } from './types';

export interface NotesRepository {
  loadNotes(): Promise<Note[]>;
  insertNote(note: Note): Promise<void>;
  updateNote(note: Note): Promise<void>;
  deleteNote(noteId: string): Promise<void>;
  addChecklistItem(item: ChecklistItem, updatedAt: number): Promise<void>;
  saveChecklistItem(item: ChecklistItem, updatedAt: number): Promise<void>;
  deleteChecklistItem(itemId: string, noteId: string, updatedAt: number): Promise<void>;
  saveItemOrder(noteId: string, items: ChecklistItem[], updatedAt: number): Promise<void>;
  loadReminders(noteId?: string): Promise<Reminder[]>;
  saveReminder(reminder: Reminder): Promise<void>;
  setReminderNotificationId(reminderId: string, notificationId: string | null): Promise<void>;
  removeReminder(reminderId: string): Promise<void>;
  loadPreferences(): Promise<AppPreferences>;
  savePreferences(preferences: AppPreferences): Promise<void>;
}
