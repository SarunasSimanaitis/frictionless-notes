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
  createId, createNote, defaultPreferences, normalizeNoteReminderGroups,
} from './src/model';
import { cancelReminderNotifications, checkNotificationPermission, requestNotificationPermission, syncReminderNotification } from './src/notifications';
import { removeNoteImages } from './src/noteImages';
import { HomeScreen } from './src/screens/HomeScreen';
import { NoteEditorScreen } from './src/screens/NoteEditorScreen';
import { palette } from './src/theme';
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

function AppContent() {
  const [notes, setNotes] = useState<Note[]>([]);
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
      const [loadedNotes, loadedReminders, loadedPreferences, loadedPermission] = await Promise.all([
        localNotesRepository.loadNotes(),
        localNotesRepository.loadReminders(),
        localNotesRepository.loadPreferences(),
        checkNotificationPermission(),
      ]);
      setNotes(loadedNotes);
      setPreferences(loadedPreferences);
      setPermission(loadedPermission);
      const normalizedReminders = normalizeNoteReminderGroups(loadedReminders);
      const reconciled = await Promise.allSettled(normalizedReminders.map(async (reminder) => {
        const original = loadedReminders.find((candidate) => candidate.id === reminder.id);
        if (original && original !== reminder) {
          if ((!reminder.enabled || reminder.notificationId === null) && original.notificationId) {
            await cancelReminderNotifications(original);
          }
          await localNotesRepository.saveReminder(reminder);
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
        setNotes(latestNotes);
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

  const handleCreate = async (type: NoteType, templateId?: CustomNoteTemplateId) => {
    const note = createNote(type, Date.now(), undefined, templateId);
    try {
      await localNotesRepository.insertNote(note);
      setNotes((current) => [note, ...current]);
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
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  };

  const handleDelete = async (noteId: string, noteOverride?: Note) => {
    try {
      const noteBeingDeleted = noteOverride ??
        (activeNote?.id === noteId ? activeNote : notes.find((note) => note.id === noteId) ?? null);
      const noteReminders = await localNotesRepository.loadReminders(noteId);
      await Promise.allSettled(noteReminders.map((reminder) => cancelReminderNotifications(reminder)));
      await localNotesRepository.deleteNote(noteId);
      if (noteBeingDeleted) await removeNoteImages(noteBeingDeleted);
      setNotes((current) => current.filter((note) => note.id !== noteId));
      setReminders((current) => current.filter((reminder) => reminder.noteId !== noteId));
      setActiveNote(null);
    } catch {
      Alert.alert('Could not delete note', 'Please try again.');
    }
  };

  const handlePreferencesChange = async (next: AppPreferences) => {
    try {
      await localNotesRepository.savePreferences(next);
      setPreferences(next);
      if (next.remindersEnabled !== preferences.remindersEnabled) {
        const allReminders = await localNotesRepository.loadReminders();
        const reconciliation = await Promise.allSettled(allReminders.map(async (reminder) => {
          const noteTitle = notes.find((note) => note.id === reminder.noteId)?.title;
          const notificationId = await syncReminderNotification(reminder, next.remindersEnabled, false, noteTitle);
          await localNotesRepository.setReminderNotificationId(reminder.id, notificationId);
        }));
        setReminders(await localNotesRepository.loadReminders());
        if (reconciliation.some((result) => result.status === 'rejected')) {
          Alert.alert('Settings saved', 'One or more reminders could not be rescheduled on this device.');
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
      onPreferencesChange={(next) => void handlePreferencesChange(next)}
      onReminderSettingChange={handleGlobalReminderToggle}
      onRetry={() => void refreshNotes()}
      onCreate={(type, templateId) => void handleCreate(type, templateId)}
      onOpen={handleOpen}
      onDelete={(note) => {
        Alert.alert('Delete this note?', 'This cannot be undone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void handleDelete(note.id) },
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
