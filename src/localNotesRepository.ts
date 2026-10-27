import * as database from './database';
import type { NotesRepository } from './repository';

export const localNotesRepository: NotesRepository = {
  loadNotes: database.loadNotes,
  loadTrashedNotes: database.loadTrashedNotes,
  insertNote: database.insertNote,
  updateNote: database.updateNote,
  moveNoteToTrash: database.moveNoteToTrash,
  restoreNote: database.restoreNote,
  permanentlyDeleteNote: database.permanentlyDeleteNote,
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
