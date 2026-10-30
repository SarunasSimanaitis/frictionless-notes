import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import {
  Alert,
  AppState,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCallback, useEffect, useRef, useState } from 'react';
import { localNotesRepository } from './src/localNotesRepository';
import {
  createId, createNote, defaultPreferences, isTrashExpired, normalizeNoteReminderGroups, sortNotes, TRASH_RETENTION_MS,
} from './src/model';
import { cancelReminderNotifications, checkNotificationPermission, requestNotificationPermission, syncReminderNotification } from './src/notifications';
import { removeNoteImages } from './src/noteImages';
import { HomeScreen } from './src/screens/HomeScreen';
import { NoteEditorScreen } from './src/screens/NoteEditorScreen';
import { palette, setThemeMode } from './src/theme';
import { styles } from './src/styles';
import type {
  AppPreferences, CustomNoteTemplateId, Note, NoteType, Reminder,
} from './src/types';
import type { NotificationPermission } from './src/notifications';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

async function purgeExpiredTrash(): Promise<void> {
  const trashedNotes = await localNotesRepository.loadTrashedNotes();
  for (const note of trashedNotes.filter((candidate) => isTrashExpired(candidate))) {
    const reminders = await localNotesRepository.loadReminders(note.id);
    const cancellations = await Promise.allSettled(reminders.map(cancelReminderNotifications));
    if (cancellations.some((result) => result.status === 'rejected')) {
      console.warn(`Could not cancel every reminder before expiring note ${note.id}; it will be retried.`);
      continue;
    }
    await localNotesRepository.permanentlyDeleteNote(note.id);
    await removeNoteImages(note);
  }
}
function AppContent() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [trashedNotes, setTrashedNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [permission, setPermission] = useState<NotificationPermission>({
    granted: false,
    canAskAgain: true,
    channelEnabled: null,
  });
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const handledNotificationResponse = useRef<string | null>(null);

  const refreshNotes = useCallback(async () => {
    try {
      setLoadError(false);
      await purgeExpiredTrash();
      const [loadedNotes, loadedTrashedNotes, loadedReminders, loadedPreferences, loadedPermission] = await Promise.all([
        localNotesRepository.loadNotes(),
        localNotesRepository.loadTrashedNotes(),
        localNotesRepository.loadReminders(),
        localNotesRepository.loadPreferences(),
        checkNotificationPermission(),
      ]);
      setNotes(sortNotes(loadedNotes));
      setTrashedNotes(loadedTrashedNotes);
      setThemeMode(loadedPreferences.themeMode);
      setPreferences(loadedPreferences);
      setPermission(loadedPermission);
      const trashedNoteIds = new Set(loadedTrashedNotes.map((note) => note.id));
      const normalizedReminders = normalizeNoteReminderGroups(loadedReminders);
      const reconciled = await Promise.allSettled(normalizedReminders.map(async (reminder) => {
        const original = loadedReminders.find((candidate) => candidate.id === reminder.id);
        if (original && original !== reminder) {
          if ((!reminder.enabled || reminder.notificationId === null) && original.notificationId) {
            await cancelReminderNotifications(original);
          }
          await localNotesRepository.saveReminder(reminder);
        }
        if (reminder.noteId && trashedNoteIds.has(reminder.noteId)) {
          await cancelReminderNotifications(reminder);
          if (reminder.notificationId) {
            await localNotesRepository.setReminderNotificationId(reminder.id, null);
          }
          return { ...reminder, notificationId: null };
        }
        const noteTitle = loadedNotes.find((note) => note.id === reminder.noteId)?.title;
        const notificationId = await syncReminderNotification(
          reminder,
          loadedPreferences.remindersEnabled,
          false,
          noteTitle,
        );
        if (notificationId !== reminder.notificationId) {
          await localNotesRepository.setReminderNotificationId(reminder.id, notificationId);
        }
        return { ...reminder, notificationId };
      }));
      setReminders(reconciled.map((result, index) =>
        result.status === 'fulfilled' ? result.value : normalizedReminders[index],
      ));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!lastNotificationResponse || lastNotificationResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = lastNotificationResponse.notification.request.content.data;
    const noteId = typeof data?.noteId === 'string' ? data.noteId : null;
    if (!noteId) return;
    const responseKey = `${lastNotificationResponse.notification.request.identifier}:${lastNotificationResponse.actionIdentifier}`;
    if (handledNotificationResponse.current === responseKey) return;
    handledNotificationResponse.current = responseKey;
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    void (async () => {
      try {
        const latestNotes = await localNotesRepository.loadNotes();
        const target = latestNotes.find((note) => note.id === noteId);
        if (!target) return;
        setNotes(sortNotes(latestNotes));
        setActiveNote(target);
      } catch {
        // A notification can outlive the note if it was removed on another screen.
      }
    })();
  }, [lastNotificationResponse]);

  useEffect(() => {
    void refreshNotes();
  }, [refreshNotes]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshNotes();
    });
    return () => subscription.remove();
  }, [refreshNotes]);
  useEffect(() => {
    if (trashedNotes.length === 0) return;
    const nextExpiry = Math.min(...trashedNotes.map((note) => (note.deletedAt ?? Date.now()) + TRASH_RETENTION_MS));
    const delay = Math.max(60_000, Math.min(nextExpiry - Date.now() + 50, 2_147_000_000));
    const timeout = setTimeout(() => void refreshNotes(), delay);
    return () => clearTimeout(timeout);
  }, [refreshNotes, trashedNotes]);

  const handleCreate = async (type: NoteType, templateId?: CustomNoteTemplateId) => {
    const note = createNote(type, Date.now(), undefined, templateId);
    try {
      await localNotesRepository.insertNote(note);
      setNotes((current) => sortNotes([note, ...current]));
      setActiveNote(note);
    } catch {
      Alert.alert('Could not create note', 'Please try again.');
    }
  };

  const handleOpen = (note: Note) => setActiveNote(note);

  const handleSaved = (savedNote: Note) => {
    setNotes((current) => {
      const exists = current.some((item) => item.id === savedNote.id);
      const next = exists
        ? current.map((item) => (item.id === savedNote.id ? savedNote : item))
        : [savedNote, ...current];
      return sortNotes(next);
    });
  };

  const handleTogglePin = async (note: Note) => {
    const updated = { ...note, isPinned: !note.isPinned, updatedAt: Date.now() };
    try {
      await localNotesRepository.updateNote(updated);
      setNotes((current) => sortNotes(current.map((candidate) => candidate.id === note.id ? updated : candidate)));
    } catch {
      Alert.alert('Could not update pin', 'Please try again.');
    }
  };

  const handleDelete = async (noteId: string, noteOverride?: Note) => {
    const noteBeingDeleted = noteOverride ??
      (activeNote?.id === noteId ? activeNote : notes.find((note) => note.id === noteId) ?? null);
    if (!noteBeingDeleted) return;
    const deletedAt = Date.now();
    try {
      await localNotesRepository.updateNote(noteBeingDeleted);
      await localNotesRepository.replaceChecklistItems(noteId, noteBeingDeleted.items, noteBeingDeleted.updatedAt);
      const noteReminders = await localNotesRepository.loadReminders(noteId);
      await localNotesRepository.moveNoteToTrash(noteId, deletedAt);
      const cancellations = await Promise.allSettled(noteReminders.map(async (reminder) => {
        await cancelReminderNotifications(reminder);
        if (reminder.notificationId) {
          await localNotesRepository.setReminderNotificationId(reminder.id, null);
        }
      }));
      const canceledReminderIds = new Set(noteReminders.filter((_, index) =>
        cancellations[index]?.status === 'fulfilled',
      ).map((reminder) => reminder.id));
      setNotes((current) => current.filter((note) => note.id !== noteId));
      setTrashedNotes((current) => [
        { ...noteBeingDeleted, deletedAt },
        ...current.filter((note) => note.id !== noteId),
      ].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)));
      setReminders((current) => current.map((reminder) =>
        reminder.noteId === noteId && canceledReminderIds.has(reminder.id)
          ? { ...reminder, notificationId: null }
          : reminder));
      setActiveNote(null);
      if (cancellations.some((result) => result.status === 'rejected')) {
        Alert.alert('Moved to Trash', 'A reminder could not be canceled yet. The app will retry when it refreshes.');
      }
    } catch {
      Alert.alert('Could not move note to Trash', 'Your note is still on this device. Please try again.');
    }
  };
  const handleRestore = async (trashedNote: Note) => {
    try {
      await localNotesRepository.restoreNote(trashedNote.id);
      const restored = { ...trashedNote, deletedAt: null };
      setTrashedNotes((current) => current.filter((note) => note.id !== restored.id));
      setNotes((current) => sortNotes([restored, ...current.filter((note) => note.id !== restored.id)]));
      const noteReminders = await localNotesRepository.loadReminders(restored.id);
      const results = await Promise.allSettled(noteReminders.map(async (reminder) => {
        const notificationId = await syncReminderNotification(
          reminder,
          preferences.remindersEnabled,
          true,
          restored.title,
        );
        await localNotesRepository.setReminderNotificationId(reminder.id, notificationId);
        return { ...reminder, notificationId };
      }));
      setReminders((current) => {
        const restoredReminders = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
        const restoredIds = new Set(noteReminders.map((reminder) => reminder.id));
        return [...current.filter((reminder) => !restoredIds.has(reminder.id)), ...restoredReminders];
      });
      if (results.some((result) => result.status === 'rejected')) {
        Alert.alert('Note restored', 'The note is back, but one of its reminders could not be rescheduled.');
      }
    } catch {
      Alert.alert('Could not restore note', 'Please try again.');
    }
  };

  const handlePermanentDelete = async (trashedNote: Note) => {
    try {
      const noteReminders = await localNotesRepository.loadReminders(trashedNote.id);
      const cancellations = await Promise.allSettled(noteReminders.map(cancelReminderNotifications));
      if (cancellations.some((result) => result.status === 'rejected')) {
        throw new Error('Some reminder notifications could not be canceled.');
      }
      await localNotesRepository.permanentlyDeleteNote(trashedNote.id);
      await removeNoteImages(trashedNote);
      setTrashedNotes((current) => current.filter((note) => note.id !== trashedNote.id));
      setReminders((current) => current.filter((reminder) => reminder.noteId !== trashedNote.id));
    } catch {
      Alert.alert('Could not permanently delete note', 'Please try again. The note is still in Trash.');
    }
  };

  const handleEmptyTrash = async () => {
    try {
      for (const trashedNote of trashedNotes) {
        const noteReminders = await localNotesRepository.loadReminders(trashedNote.id);
        const cancellations = await Promise.allSettled(noteReminders.map(cancelReminderNotifications));
        if (cancellations.some((result) => result.status === 'rejected')) {
          throw new Error(`Could not cancel reminders for note ${trashedNote.id}.`);
        }
        await localNotesRepository.permanentlyDeleteNote(trashedNote.id);
        await removeNoteImages(trashedNote);
      }
      setTrashedNotes([]);
      setReminders((current) => current.filter((reminder) => reminder.noteId === null));
    } catch {
      await refreshNotes();
      Alert.alert('Trash was only partly emptied', 'Some notes could not be removed. Any remaining notes are still in Trash.');
    }
  };
  const handlePreferencesChange = async (next: AppPreferences) => {
    try {
      await localNotesRepository.savePreferences(next);
      setThemeMode(next.themeMode);
      setPreferences(next);
      if (next.remindersEnabled !== preferences.remindersEnabled) {
        const allReminders = await localNotesRepository.loadReminders();
        const trashedNoteIds = new Set(trashedNotes.map((note) => note.id));
        const reconciliation = await Promise.allSettled(allReminders.map(async (reminder) => {
          if (reminder.noteId && trashedNoteIds.has(reminder.noteId)) {
            await cancelReminderNotifications(reminder);
            if (reminder.notificationId) {
              await localNotesRepository.setReminderNotificationId(reminder.id, null);
            }
            return;
          }
          const noteTitle = notes.find((note) => note.id === reminder.noteId)?.title;
          const notificationId = await syncReminderNotification(reminder, next.remindersEnabled, false, noteTitle);
          await localNotesRepository.setReminderNotificationId(reminder.id, notificationId);
        }));
        setReminders(await localNotesRepository.loadReminders());
        if (reconciliation.some((result) => result.status === 'rejected')) {
          Alert.alert('Settings saved', 'One or more reminders could not be updated on this device.');
        }
      }
    } catch {
      Alert.alert('Could not save settings', 'Please try again.');
    }
  };
  const handleGlobalReminderToggle = (enabled: boolean) => {
    const applySetting = async (allowRequest: boolean) => {
      if (allowRequest) setPermission(await requestNotificationPermission());
      await handlePreferencesChange({ ...preferences, remindersEnabled: enabled });
    };

    if (enabled && !permission.granted && permission.canAskAgain) {
      Alert.alert(
        'Allow reminder notifications?',
        'Frictionless Notes needs notification permission to alert you at the time you choose. You can still turn reminders on and allow notifications later.',
        [
          { text: 'Not now', onPress: () => void applySetting(false) },
          { text: 'Allow', onPress: () => void applySetting(true) },
        ],
      );
    } else {
      void applySetting(false);
    }
  };

  const handleReminderListChanged = async () => {
    try {
      setReminders(await localNotesRepository.loadReminders());
      setPermission(await checkNotificationPermission());
    } catch {
      // The reminder modal reports save failures where the user can act on them.
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (activeNote) {
    return (
      <NoteEditorScreen
        key={activeNote.id}
        note={activeNote}
        repository={localNotesRepository}
        reminders={reminders}
        preferences={preferences}
        permission={permission}
        onRemindersChanged={() => void handleReminderListChanged()}
        onPermissionChanged={setPermission}
        onBack={() => setActiveNote(null)}
        onSaved={handleSaved}
        onDelete={(note) => void handleDelete(note.id, note)}
      />
    );
  }

  return (
    <HomeScreen
      repository={localNotesRepository}
      notes={notes}
      loadError={loadError}
      preferences={preferences}
      permission={permission}
      reminders={reminders}
      onRemindersChanged={() => void handleReminderListChanged()}
      onPermissionChanged={setPermission}
      trashedNotes={trashedNotes}
      onRestore={handleRestore}
      onDeletePermanently={handlePermanentDelete}
      onEmptyTrash={handleEmptyTrash}
      onPreferencesChange={(next) => void handlePreferencesChange(next)}
      onReminderSettingChange={handleGlobalReminderToggle}
      onRetry={() => void refreshNotes()}
      onCreate={(type, templateId) => void handleCreate(type, templateId)}
      onOpen={handleOpen}
      onTogglePin={(note) => void handleTogglePin(note)}
      onDelete={(note) => {
        Alert.alert('Move to Trash?', 'This note will stay in Trash for 30 days before it is automatically deleted.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Move to Trash', style: 'destructive', onPress: () => void handleDelete(note.id) },
        ]);
      }}
    />
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.centeredScreen}>
      <StatusBar style="dark" />
      <Text style={styles.loadingBrand}>Frictionless</Text>
      <Text style={styles.mutedText}>Opening your notes…</Text>
    </SafeAreaView>
  );
}
