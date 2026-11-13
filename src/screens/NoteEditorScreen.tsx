import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { EditorBridge } from '@10play/tentap-editor';
import type { NotesRepository } from '../repository';
import {
  checklistProgress,
  countWords,
  isDocumentNote,
  updateNoteDraft,
} from '../model';
import { ReminderModal } from '../ReminderModal';
import { removeNoteImage } from '../noteImages';
import { TextDocumentEditor } from '../editor/DocumentEditor';
import { ChecklistEditor } from '../lists/ChecklistEditor';
import { palette, type ThemeMode } from '../theme';
import { styles } from '../styles';
import { BackButton } from '../BackButton';
import { noteTypeLabels } from '../noteLabels';
import { authenticate, isDeviceLockAvailable } from '../security/deviceAuth';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Sheet, SheetAction } from '../ui/Sheet';
import type { NotificationPermission } from '../notifications';
import type { AppPreferences, Note, NoteBlock, Reminder } from '../types';
interface NoteEditorProps {
  note: Note;
  repository: NotesRepository;
  reminders: Reminder[];
  preferences: AppPreferences;
  themeMode: ThemeMode;
  permission: NotificationPermission;
  onRemindersChanged: () => void;
  onPermissionChanged: (permission: NotificationPermission) => void;
  onBack: () => void;
  onSaved: (note: Note) => void;
  onDelete: (note: Note) => void;
  onDuplicate: (note: Note) => void;
  onShare: (note: Note) => void;
}

export function NoteEditorScreen({
  note: initialNote, repository, reminders, preferences, themeMode, permission, onRemindersChanged,
  onPermissionChanged, onBack, onSaved, onDelete, onDuplicate, onShare,
}: NoteEditorProps) {
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const pendingListSaves = useRef(0);
  const pendingTextSaves = useRef(0);

  const [remindersOpen, setRemindersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSave = () => pendingListSaves.current > 0 || pendingTextSaves.current > 0 || saveTimer.current !== null;
  const noteRef = useRef(initialNote);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const appState = useRef(AppState.currentState);
  const bodyRef = useRef<TextInputInstance>(null);
  const firstRichEditorRef = useRef<EditorBridge | null>(null);
  const persistCurrent = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const current = noteRef.current;
    pendingTextSaves.current += 1;
    setSaving(true);
    setSaveFailed(false);
    try {
      await repository.updateNote(current);
      onSaved(current);
    } catch {
      setSaveFailed(true);
      Alert.alert('Could not save note', 'Your latest edit may not have been saved. Please try again.');
    } finally {
      pendingTextSaves.current = Math.max(0, pendingTextSaves.current - 1);
      setSaving(hasPendingSave());
    }
  }, [onSaved, repository]);

  const updateDraft = useCallback((changes: Partial<Pick<Note, 'title' | 'body' | 'blocks' | 'appearance' | 'isPinned' | 'isLocked'>>) => {
    const next = updateNoteDraft(noteRef.current, changes);
    noteRef.current = next;
    setNote(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    setSaveFailed(false);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      pendingTextSaves.current += 1;
      setSaving(true);
      void repository.updateNote(next)
        .then(() => { setSaveFailed(false); onSaved(next); })
        .catch(() => { setSaveFailed(true); Alert.alert('Could not save note', 'Your latest edit may not have been saved.'); })
        .finally(() => {
          pendingTextSaves.current = Math.max(0, pendingTextSaves.current - 1);
          setSaving(hasPendingSave());
        });
    }, 350);
  }, [onSaved, repository]);

  const persistBlocksImmediately = useCallback(async (
    blocks: NoteBlock[],
    obsoleteImageUris: string[] = [],
  ): Promise<boolean> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const next = updateNoteDraft(noteRef.current, { blocks });
    noteRef.current = next;
    setNote(next);
    pendingTextSaves.current += 1;
    setSaving(true);
    setSaveFailed(false);
    try {
      await repository.updateNote(next);
      onSaved(next);
      await Promise.allSettled(obsoleteImageUris.map((uri) => removeNoteImage(uri)));
      return true;
    } catch {
      setSaveFailed(true);
      Alert.alert('Could not save note', 'Your latest edit may not have been saved. Please try again.');
      return false;
    } finally {
      pendingTextSaves.current = Math.max(0, pendingTextSaves.current - 1);
      setSaving(hasPendingSave());
    }
  }, [onSaved, repository]);

  const updateListDraft = useCallback((next: Note) => {
    pendingListSaves.current += 1;
    noteRef.current = next;
    setNote(next);
    setSaving(true);
    setSaveFailed(false);
  }, []);

  const finishListSave = useCallback((persistedNote: Note | null, success: boolean) => {
    const pending = Math.max(0, pendingListSaves.current - 1);
    pendingListSaves.current = pending;
    if (persistedNote) {
      const current = noteRef.current;
      const merged = {
        ...persistedNote,
        title: current.title,
        body: current.body,
        isPinned: current.isPinned,
        isLocked: current.isLocked,
        items: success ? current.items : persistedNote.items,
      };
      noteRef.current = merged;
      setNote(merged);
      onSaved(merged);
    }
    if (success) setSaveFailed(false);
    else setSaveFailed(true);
    setSaving(pending > 0 || pendingTextSaves.current > 0 || saveTimer.current !== null);
  }, [onSaved]);

  useEffect(() => {
    let leaving = false;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (leaving) return true;
      leaving = true;
      // Never hold Android back hostage to a checklist write or debounced save.
      // Start a best-effort flush first, then leave immediately; the repository
      // persists checklist rows independently and SQLite serializes its writes.
      void persistCurrent();
      Keyboard.dismiss();
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, persistCurrent]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;
      if (previousState === 'active' && nextState !== 'active') {
        void persistCurrent();
      }
    });
    return () => subscription.remove();
  }, [persistCurrent]);

  useEffect(() => {
    return () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      // The editor can close without the back button (a reminder opens another note, a toast
      // opens a copy). Save the edit that was still waiting instead of dropping it.
      const latest = noteRef.current;
      void repository.updateNote(latest).then(() => onSavedRef.current(latest)).catch(() => undefined);
    };
  }, [repository]);

  const leaveEditor = () => {
    // Navigation must stay responsive even if a native SQLite operation stalls.
    // persistCurrent synchronously captures the latest draft before its first await.
    void persistCurrent();
    Keyboard.dismiss();
    onBack();
  };

  const moveToTrash = () => {
    // App-level deletion persists the latest note snapshot before moving it, and offers
    // an Undo afterwards. Do not await pending checklist saves here: a stalled save must
    // not trap the user inside a note or make the Trash action appear unresponsive.
    setMenuOpen(false);
    Keyboard.dismiss();
    onDelete(noteRef.current);
  };

  const toggleLock = async () => {
    setMenuOpen(false);
    const current = noteRef.current;
    if (!current.isLocked && !(await isDeviceLockAvailable())) {
      Alert.alert('Set up a screen lock first', 'Locked notes use your phone’s fingerprint, face or PIN. Add a screen lock in system settings, then try again.');
      return;
    }
    if ((await authenticate(current.isLocked ? 'Remove the lock from this note' : 'Lock this note')) !== 'success') return;
    updateDraft({ isLocked: !current.isLocked });
  };

  const duplicate = () => {
    setMenuOpen(false);
    void persistCurrent();
    onDuplicate(noteRef.current);
  };

  const openReminders = () => {
    setRemindersOpen(true);
  };

  const hasActiveReminder = reminders.some((reminder) => reminder.noteId === note.id && reminder.enabled);
  const progress = checklistProgress(note.items);
  const details = `${isDocumentNote(note.type)
    ? `${countWords(note.body)} words`
    : `${progress.done} of ${progress.total} done`} · Created ${new Date(note.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardFrame}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
    >
      <SafeAreaView style={styles.screen}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <View style={styles.editorHeader}>
          <BackButton
            label="Notes"
            accessibilityLabel="Back to notes"
            onPress={() => void leaveEditor()}
            style={styles.headerAction}
          />
          <Text style={[styles.saveState, saveFailed && !saving && styles.saveStateFailed]} accessibilityLiveRegion="polite">
            {saving ? 'Saving…' : saveFailed ? 'Not saved' : 'Saved'}
          </Text>
          <View style={styles.editorHeaderActions}>
            <View>
              <IconButton icon="bell" label="Manage reminders for this note" onPress={openReminders} />
              {hasActiveReminder ? <View pointerEvents="none" style={styles.reminderDot} /> : null}
            </View>
            <IconButton icon="more" label="More note actions" onPress={() => { Keyboard.dismiss(); setMenuOpen(true); }} />
          </View>
        </View>

        <View style={[styles.editorContent, note.type === 'custom' && styles.editorContentFlush]}>
          <View style={styles.editorMeta}>
            <Text style={styles.editorType}>{noteTypeLabels[note.type]}</Text>
            {note.isPinned ? <Icon name="pin" size={13} color={palette.accent} /> : null}
            {note.isLocked ? <Icon name="lock" size={13} color={palette.muted} /> : null}
          </View>
          <TextInput
            accessibilityLabel="Note title"
            value={note.title}
            onChangeText={(title) => updateDraft({ title })}
            placeholder={note.type === 'shopping' ? 'Shopping list' : note.type === 'custom' ? 'Custom note' : 'Title'}
            placeholderTextColor={palette.faint}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => {
              if (note.type === 'custom') firstRichEditorRef.current?.focus('end');
              else if (isDocumentNote(note.type)) bodyRef.current?.focus();
            }}
            style={styles.titleInput}
            selectionColor={palette.accent}
          />
          <View style={styles.editorRule} />

          {isDocumentNote(note.type) ? (
            <TextDocumentEditor
              note={note}
              firstParagraphInputRef={bodyRef}
              firstRichEditorRef={firstRichEditorRef}
              onBlocksChange={(blocks) => updateDraft({ blocks })}
              onBlocksCommit={persistBlocksImmediately}
              onAppearanceChange={(appearance) => updateDraft({ appearance })}
              quickNoteToolbarMode={preferences.quickNoteToolbarMode}
              themeMode={themeMode}
            />
          ) : (
            <ChecklistEditor
              note={note}
              repository={repository}
              onNoteChange={updateListDraft}
              onListSaveComplete={finishListSave}
              onRemindersChanged={onRemindersChanged}
            />
          )}
        </View>
      </SafeAreaView>
      <Sheet
        visible={menuOpen}
        title={note.title.trim() || 'Untitled note'}
        subtitle={details}
        onClose={() => setMenuOpen(false)}
      >
        <SheetAction
          icon="pin"
          label={note.isPinned ? 'Unpin' : 'Pin to top'}
          onPress={() => { setMenuOpen(false); updateDraft({ isPinned: !noteRef.current.isPinned }); }}
        />
        <SheetAction
          icon={note.isLocked ? 'unlock' : 'lock'}
          label={note.isLocked ? 'Remove lock' : 'Lock note'}
          detail={note.isLocked ? undefined : 'Hide the preview and ask for your fingerprint or PIN to open'}
          onPress={() => void toggleLock()}
        />
        <SheetAction icon="share" label="Share as text" onPress={() => { setMenuOpen(false); onShare(noteRef.current); }} />
        <SheetAction icon="copy" label="Duplicate" onPress={duplicate} />
        <SheetAction icon="trash" label="Move to Trash" danger onPress={moveToTrash} />
      </Sheet>
      <ReminderModal
        repository={repository}
        visible={remindersOpen}
        note={note}
        reminders={reminders}
        preferences={preferences}
        permission={permission}
        onClose={() => setRemindersOpen(false)}
        onRemindersChanged={onRemindersChanged}
        onPermissionChanged={onPermissionChanged}
      />
    </KeyboardAvoidingView>
  );
}
