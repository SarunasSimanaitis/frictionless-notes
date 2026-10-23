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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { EditorBridge } from '@10play/tentap-editor';
import type { NotesRepository } from '../repository';
import {
  isDocumentNote,
  updateNoteDraft,
} from '../model';
import { ReminderModal } from '../ReminderModal';
import { removeNoteImage } from '../noteImages';
import { TextDocumentEditor } from '../editor/DocumentEditor';
import { ChecklistEditor } from '../lists/ChecklistEditor';
import { palette } from '../theme';
import { styles } from '../styles';
import { noteTypeLabels } from '../noteLabels';
import type { NotificationPermission } from '../notifications';
import type { AppPreferences, Note, NoteBlock, Reminder } from '../types';
interface NoteEditorProps {
  note: Note;
  repository: NotesRepository;
  reminders: Reminder[];
  preferences: AppPreferences;
  permission: NotificationPermission;
  onRemindersChanged: () => void;
  onPermissionChanged: (permission: NotificationPermission) => void;
  onBack: () => void;
  onSaved: (note: Note) => void;
  onDelete: (note: Note) => void;
}

export function NoteEditorScreen({
  note: initialNote, repository, reminders, preferences, permission, onRemindersChanged,
  onPermissionChanged, onBack, onSaved, onDelete,
}: NoteEditorProps) {
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const pendingListSaves = useRef(0);
  const pendingTextSaves = useRef(0);
  const listSaveWaiters = useRef<Array<() => void>>([]);

  const [remindersOpen, setRemindersOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSave = () => pendingListSaves.current > 0 || pendingTextSaves.current > 0 || saveTimer.current !== null;
  const waitForListSaves = useCallback(() => new Promise<void>((resolve) => {
    if (pendingListSaves.current === 0) resolve();
    else listSaveWaiters.current.push(resolve);
  }), []);
  const noteRef = useRef(initialNote);
  const appState = useRef(AppState.currentState);
  const bodyRef = useRef<TextInput>(null);
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

  const updateDraft = useCallback((changes: Partial<Pick<Note, 'title' | 'body' | 'blocks' | 'appearance'>>) => {
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
    if (pending === 0) {
      for (const resolve of listSaveWaiters.current.splice(0)) resolve();
    }
    if (persistedNote) {
      const current = noteRef.current;
      const merged = {
        ...persistedNote,
        title: current.title,
        body: current.body,
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
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void (async () => {
        await waitForListSaves();
        await persistCurrent();
        Keyboard.dismiss();
        onBack();
      })();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, persistCurrent, waitForListSaves]);

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
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const leaveEditor = async () => {
    await waitForListSaves();
    await persistCurrent();
    Keyboard.dismiss();
    onBack();
  };

  const confirmDelete = () => {
    Alert.alert('Delete this note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(noteRef.current) },
    ]);
  };

  const openReminders = () => {
    setRemindersOpen(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardFrame}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
    >
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.editorHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to notes" onPress={() => void leaveEditor()} style={styles.headerAction}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.headerActionText}>Notes</Text>
          </Pressable>
          <Text style={styles.saveState}>{saving ? 'Saving…' : saveFailed ? 'Not saved' : 'Saved'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage reminders for this note"
            onPress={() => openReminders()}
            style={({ pressed }) => [styles.reminderHeaderButton, pressed && styles.pressed]}
          >
            <Text style={styles.reminderHeaderGlyph}>◷</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete note" onPress={confirmDelete} style={styles.headerActionRight}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>

        <View style={styles.editorContent}>
          <Text style={styles.editorType}>{noteTypeLabels[note.type]}</Text>
          <TextInput
            accessibilityLabel="Note title"
            value={note.title}
            onChangeText={(title) => updateDraft({ title })}
            placeholder={note.type === 'shopping' ? 'Shopping list' : note.type === 'custom' ? 'Custom note' : 'Title'}
            placeholderTextColor={palette.faint}
            returnKeyType="next"
            blurOnSubmit={false}
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
