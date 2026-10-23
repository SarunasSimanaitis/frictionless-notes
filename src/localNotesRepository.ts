import * as database from './database';
import type { NotesRepository } from './repository';

export const localNotesRepository: NotesRepository = {
  loadNotes: database.loadNotes,
  insertNote: database.insertNote,
  updateNote: database.updateNote,
  deleteNote: database.deleteNote,
  addChecklistItem: database.addChecklistItem,
  saveChecklistItem: database.saveChecklistItem,
  deleteChecklistItem: database.deleteChecklistItem,
  saveItemOrder: database.saveItemOrder,
  loadReminders: database.loadReminders,
  saveReminder: database.saveReminder,
  setReminderNotificationId: database.setReminderNotificationId,
  removeReminder: database.removeReminder,
  loadPreferences: database.loadPreferences,
  savePreferences: database.savePreferences,
};
