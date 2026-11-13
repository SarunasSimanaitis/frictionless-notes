import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as ScreenCapture from 'expo-screen-capture';
import * as SystemUI from 'expo-system-ui';
import {
  Alert,
  AppState,
  Modal,
  Platform,
  Share,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_NAME } from './src/brand';
import { localNotesRepository } from './src/localNotesRepository';
import {
  createNote, defaultPreferences, duplicateNote, isDocumentNote, isTrashExpired, normalizeNoteReminderGroups,
  noteToShareText, sortNotes, TRASH_RETENTION_MS,
} from './src/model';
import { cancelReminderNotifications, checkNotificationPermission, requestNotificationPermission, syncReminderNotification } from './src/notifications';
import { removeNoteImages } from './src/noteImages';
import { HomeScreen } from './src/screens/HomeScreen';
import { NoteEditorScreen } from './src/screens/NoteEditorScreen';
import {
  APP_LOCK_GRACE_MS, authenticate, isAppLockSuppressed, isDeviceLockAvailable, runWithoutAppLock, wasRecentlyAuthenticated,
} from './src/security/deviceAuth';
import { LockScreen } from './src/security/LockScreen';
import { palette, resolveThemeMode, setThemeMode } from './src/theme';
import { styles } from './src/styles';
import { Toast, type ToastMessage } from './src/ui/Toast';
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
  const [locked, setLocked] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const insets = useSafeAreaInsets();
  const lockInitialised = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  // The palette is read while rendering, so the mode has to be set before any child draws.
  const themeMode = resolveThemeMode(preferences.themeMode, useColorScheme());
  setThemeMode(themeMode);

  const showToast = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    setToast({ id: Date.now(), message, actionLabel, onAction });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

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
      setNotes(sortNotes(loadedNotes, loadedPreferences.sortMode));
      setTrashedNotes(loadedTrashedNotes);
      setPreferences(loadedPreferences);
      setPermission(loadedPermission);
      if (!lockInitialised.current) {
        lockInitialised.current = true;
        if (loadedPreferences.appLockEnabled) setLocked(true);
      }
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
        setNotes(sortNotes(latestNotes, preferencesRef.current.sortMode));
        await openNote(target);
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
      if (state !== 'active') {
        // Leaving for the photo picker, share sheet or unlock prompt is not "leaving the app".
        if (backgroundedAt.current === null && !isAppLockSuppressed()) backgroundedAt.current = Date.now();
        return;
      }
      const awaySince = backgroundedAt.current;
      backgroundedAt.current = null;
      if (preferencesRef.current.appLockEnabled && awaySince !== null && Date.now() - awaySince >= APP_LOCK_GRACE_MS) {
        setLocked(true);
      }
      void refreshNotes();
    });
    return () => subscription.remove();
  }, [refreshNotes]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (preferences.screenPrivacy
      ? ScreenCapture.preventScreenCaptureAsync()
      : ScreenCapture.allowScreenCaptureAsync()).catch(() => undefined);
  }, [preferences.screenPrivacy]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void SystemUI.setBackgroundColorAsync(palette.background).catch(() => undefined);
  }, [themeMode]);
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
      setNotes((current) => sortNotes([note, ...current], preferences.sortMode));
      setActiveNote(note);
    } catch {
      Alert.alert('Could not create note', 'Please try again.');
    }
  };

  /** Opens a note, asking for the device lock first when the note is locked. */
  async function openNote(target: Note): Promise<void> {
    if (target.isLocked && !wasRecentlyAuthenticated()) {
      const outcome = await authenticate('Open locked note');
      if (outcome === 'cancelled') return;
      if (outcome === 'unavailable') {
        Alert.alert('No screen lock on this device', 'Locked notes are only protected while your phone has a screen lock. Set one up in system settings to protect this note again.');
      }
    }
    setActiveNote(target);
  }

  const handleOpen = (note: Note) => void openNote(note);

  const handleSaved = (savedNote: Note) => {
    setNotes((current) => {
      const exists = current.some((item) => item.id === savedNote.id);
      const next = exists
        ? current.map((item) => (item.id === savedNote.id ? savedNote : item))
        : [savedNote, ...current];
      return sortNotes(next, preferencesRef.current.sortMode);
    });
  };

  const handleTogglePin = async (note: Note) => {
    const updated = { ...note, isPinned: !note.isPinned, updatedAt: Date.now() };
    try {
      await localNotesRepository.updateNote(updated);
      setNotes((current) => sortNotes(current.map((candidate) => candidate.id === note.id ? updated : candidate), preferences.sortMode));
    } catch {
      Alert.alert('Could not update pin', 'Please try again.');
    }
  };

  const handleToggleLock = async (note: Note) => {
    if (!(await isDeviceLockAvailable())) {
      Alert.alert('Set up a screen lock first', 'Locked notes use your phone’s fingerprint, face or PIN. Add a screen lock in system settings, then try again.');
      return;
    }
    if ((await authenticate(note.isLocked ? 'Remove the lock from this note' : 'Lock this note')) !== 'success') return;
    const updated = { ...note, isLocked: !note.isLocked };
    try {
      await localNotesRepository.updateNote(updated);
      setNotes((current) => current.map((candidate) => candidate.id === note.id ? updated : candidate));
      showToast(updated.isLocked ? 'Note locked' : 'Lock removed');
    } catch {
      Alert.alert('Could not update the lock', 'Please try again.');
    }
  };

  const handleDuplicate = async (note: Note) => {
    const copy = duplicateNote(note);
    try {
      await localNotesRepository.insertNote(copy);
      if (!isDocumentNote(copy.type)) {
        await localNotesRepository.replaceChecklistItems(copy.id, copy.items, copy.updatedAt);
      }
      setNotes((current) => sortNotes([copy, ...current], preferences.sortMode));
      const skippedImages = note.blocks.some((block) => block.type === 'image');
      showToast(skippedImages ? 'Copy created without its images' : 'Copy created', 'Open', () => setActiveNote(copy));
    } catch {
      Alert.alert('Could not duplicate note', 'Please try again.');
    }
  };

  const handleShare = (note: Note) => {
    const message = noteToShareText(note);
    if (!message) {
      showToast('This note is empty');
      return;
    }
    void runWithoutAppLock(() => Share.share({ message, title: note.title.trim() || undefined })).catch(() => undefined);
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
      } else {
        showToast('Moved to Trash', 'Undo', () => void handleRestore({ ...noteBeingDeleted, deletedAt }));
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
      setNotes((current) => sortNotes([restored, ...current.filter((note) => note.id !== restored.id)], preferences.sortMode));
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
      setPreferences(next);
      if (next.sortMode !== preferences.sortMode) setNotes((current) => sortNotes(current, next.sortMode));
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
        `${APP_NAME} needs notification permission to alert you at the time you choose. You can still turn reminders on and allow notifications later.`,
        [
          { text: 'Not now', onPress: () => void applySetting(false) },
          { text: 'Allow', onPress: () => void applySetting(true) },
        ],
      );
    } else {
      void applySetting(false);
    }
  };

  const handleAppLockChange = async (enabled: boolean) => {
    if (enabled && !(await isDeviceLockAvailable())) {
      Alert.alert('Set up a screen lock first', 'App lock uses your phone’s fingerprint, face or PIN. Add a screen lock in system settings, then turn this on.');
      return;
    }
    // Confirming once before either change means the switch cannot be flipped by someone else.
    if ((await authenticate(enabled ? `Turn on ${APP_NAME} lock` : `Turn off ${APP_NAME} lock`)) !== 'success') return;
    await handlePreferencesChange({
      ...preferences,
      appLockEnabled: enabled,
      screenPrivacy: enabled ? true : preferences.screenPrivacy,
    });
  };

  const handleDeviceLockRemoved = () => {
    setLocked(false);
    void handlePreferencesChange({ ...preferences, appLockEnabled: false });
    Alert.alert('App lock turned off', 'This phone no longer has a screen lock, so there is nothing to unlock with. Add a screen lock and turn App lock on again in Settings.');
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

  return (
    <View style={styles.gestureRoot}>
      {activeNote ? (
        <NoteEditorScreen
          key={activeNote.id}
          note={activeNote}
          repository={localNotesRepository}
          reminders={reminders}
          preferences={preferences}
          themeMode={themeMode}
          permission={permission}
          onRemindersChanged={() => void handleReminderListChanged()}
          onPermissionChanged={setPermission}
          onBack={() => setActiveNote(null)}
          onSaved={handleSaved}
          onDelete={(note) => void handleDelete(note.id, note)}
          onDuplicate={(note) => void handleDuplicate(note)}
          onShare={handleShare}
        />
      ) : (
        <HomeScreen
          repository={localNotesRepository}
          notes={notes}
          loadError={loadError}
          preferences={preferences}
          themeMode={themeMode}
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
          onAppLockChange={(enabled) => void handleAppLockChange(enabled)}
          onRetry={() => void refreshNotes()}
          onCreate={(type, templateId) => void handleCreate(type, templateId)}
          onOpen={handleOpen}
          onTogglePin={(note) => void handleTogglePin(note)}
          onToggleLock={(note) => void handleToggleLock(note)}
          onDuplicate={(note) => void handleDuplicate(note)}
          onShare={handleShare}
          onDelete={(note) => void handleDelete(note.id)}
        />
      )}
      <Toast toast={toast} bottom={insets.bottom + (activeNote ? 16 : 70)} onDismiss={dismissToast} />
      {/* A modal sits above every other window, including Settings or a menu left open before locking. */}
      <Modal visible={locked} animationType="none" onRequestClose={() => undefined}>
        <LockScreen onUnlocked={() => setLocked(false)} onUnavailable={handleDeviceLockRemoved} />
      </Modal>
    </View>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.centeredScreen}>
      <StatusBar style="auto" />
      <Text style={styles.loadingBrand}>{APP_NAME}</Text>
      <Text style={styles.mutedText}>Opening your notes…</Text>
    </SafeAreaView>
  );
}
