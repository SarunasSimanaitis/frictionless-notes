import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Platform, Pressable, Text, TextInput, View, type ListRenderItemInfo } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../BackButton';
import { ReminderIcon } from '../ReminderIcon';
import { ReminderModal } from '../ReminderModal';
import { SettingsModal } from '../SettingsModal';
import { isDocumentNote, searchNotes, trashDaysRemaining } from '../model';
import { palette } from '../theme';
import { styles } from '../styles';
import { noteTypeLabels } from '../noteLabels';
import type { NotificationPermission } from '../notifications';
import type { NotesRepository } from '../repository';
import type { AppPreferences, CustomNoteTemplateId, Note, NoteType, Reminder } from '../types';

interface HomeScreenProps {
  repository: NotesRepository;
  notes: Note[];
  trashedNotes: Note[];
  loadError: boolean;
  preferences: AppPreferences;
  permission: NotificationPermission;
  reminders: Reminder[];
  onRemindersChanged: () => void;
  onPermissionChanged: (permission: NotificationPermission) => void;
  onRestore: (note: Note) => void;
  onDeletePermanently: (note: Note) => void;
  onEmptyTrash: () => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onReminderSettingChange: (enabled: boolean) => void;
  onRetry: () => void;
  onCreate: (type: NoteType, templateId?: CustomNoteTemplateId) => void;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onDelete: (note: Note) => void;
}

export function HomeScreen({
  repository, notes, trashedNotes, loadError, preferences, permission, reminders, onRemindersChanged,
  onPermissionChanged, onRestore, onDeletePermanently, onEmptyTrash, onPreferencesChange,
  onReminderSettingChange, onRetry, onCreate, onOpen, onTogglePin, onDelete,
}: HomeScreenProps) {
  const [query, setQuery] = useState('');
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickRemindersOpen, setQuickRemindersOpen] = useState(false);
  const lastNewTapAt = useRef(0);

  // Trash is an in-screen state, not a separate navigation route. Consume Android's
  // back gesture while it is open so the OS does not exit the app.
  useEffect(() => {
    if (!showTrash) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setQuery('');
      setShowTrash(false);
      return true;
    });
    return () => subscription.remove();
  }, [showTrash]);
  const filteredNotes = useMemo(() => searchNotes(notes, query), [notes, query]);
  const remindersByNote = useMemo(() => {
    const grouped = new Map<string, Reminder[]>();
    for (const reminder of reminders) {
      // Some reminders are not attached to a note; don't use null as a Map key.
      if (!reminder.noteId) continue;
      const existing = grouped.get(reminder.noteId);
      if (existing) existing.push(reminder);
      else grouped.set(reminder.noteId, [reminder]);
    }
    return grouped;
  }, [reminders]);
  const filteredTrash = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return trashedNotes;
    return trashedNotes.filter((note) => [note.title, note.body, ...note.items.map((item) => item.text)]
      .join('\n').toLocaleLowerCase().includes(normalized));
  }, [query, trashedNotes]);

  const renderNote = useCallback(({ item }: ListRenderItemInfo<Note>) => (
    <NoteListRow note={item} reminders={remindersByNote.get(item.id) ?? EMPTY_REMINDERS} onOpen={onOpen} onTogglePin={onTogglePin} onDelete={onDelete} highlightPinned={preferences.highlightPinnedNotes} themeMode={preferences.themeMode} />
  ), [remindersByNote, onOpen, onTogglePin, onDelete, preferences.highlightPinnedNotes, preferences.themeMode]);
  const renderTrashedNote = useCallback(({ item }: ListRenderItemInfo<Note>) => (
    <TrashNoteRow note={item} onRestore={onRestore} onDeletePermanently={onDeletePermanently} />
  ), [onRestore, onDeletePermanently]);

  const openTrash = () => {
    setQuery('');
    setShowTrash(true);
  };
  const returnToNotes = () => {
    setQuery('');
    setShowTrash(false);
  };
  const confirmEmptyTrash = () => Alert.alert(
    'Empty Trash?',
    'This permanently deletes every note in Trash. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: onEmptyTrash },
    ],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={preferences.themeMode === 'dark' ? 'light' : 'dark'} />
      {showTrash ? (
        <View style={styles.trashHeader}>
          <BackButton label="Notes" accessibilityLabel="Back to notes" onPress={returnToNotes} />
          <Text style={styles.trashHeaderTitle}>Trash</Text>
          {trashedNotes.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Empty Trash"
              onPress={confirmEmptyTrash}
              style={({ pressed }) => [styles.trashHeaderAction, pressed && styles.pressed]}
            >
              <Text style={styles.trashHeaderActionText}>Empty</Text>
            </Pressable>
          ) : <View style={styles.trashHeaderAction} />}
        </View>
      ) : (
        <View style={styles.homeHeader}>
          <View>
            <Text style={styles.eyebrow}>FRICTIONLESS NOTES</Text>
            <Text style={styles.homeTitle}>Notes</Text>
          </View>
          <View style={styles.homeHeaderActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage reminders"
              onPress={() => setQuickRemindersOpen(true)}
              style={({ pressed }) => [styles.reminderHomeButton, pressed && styles.pressed]}
            >
              <ReminderIcon size={18} />
              <Text style={styles.reminderHomeLabel}>Reminders</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => setSettingsOpen(true)}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
            >
              <Text style={styles.settingsGlyph}>⚙</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a note"
              onPress={() => {
                const now = Date.now();
                if (now - lastNewTapAt.current <= 350) {
                  lastNewTapAt.current = 0;
                  setShowCreateOptions(false);
                  onCreate('text');
                  return;
                }
                lastNewTapAt.current = now;
                setShowCreateOptions((visible) => !visible);
              }}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>+ New</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!showTrash && showCreateOptions ? (
        <View style={styles.createOptions}>
          <CreateOption label="Quick note" onPress={() => { setShowCreateOptions(false); onCreate('text'); }} />
          <CreateOption label="Checklist" onPress={() => { setShowCreateOptions(false); onCreate('checklist'); }} />
          <CreateOption label="Shopping list" onPress={() => { setShowCreateOptions(false); onCreate('shopping'); }} />
          <CreateOption label="Blank custom note" onPress={() => { setShowCreateOptions(false); onCreate('custom', 'blank'); }} />
          <CreateOption label="Plan template" onPress={() => { setShowCreateOptions(false); onCreate('custom', 'plan'); }} />
          <CreateOption label="Journal template" onPress={() => { setShowCreateOptions(false); onCreate('custom', 'journal'); }} />
        </View>
      ) : null}

      {showTrash ? (
        <Text style={styles.trashHeaderCopy}>Notes are automatically deleted 30 days after moving to Trash.</Text>
      ) : null}
      <View style={styles.searchBox}>
        <Text style={styles.searchGlyph} accessibilityElementsHidden>⌕</Text>
        <TextInput
          accessibilityLabel={showTrash ? 'Search trashed notes' : 'Search notes'}
          value={query}
          onChangeText={setQuery}
          placeholder={showTrash ? 'Search in Trash' : 'Search notes and lists'}
          placeholderTextColor={palette.faint}
          returnKeyType="search"
          style={styles.searchInput}
          clearButtonMode="while-editing"
        />
      </View>

      {!showTrash ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open Trash, ${trashedNotes.length} notes`}
          onPress={openTrash}
          style={({ pressed }) => [styles.trashShortcut, pressed && styles.rowPressed]}
        >
          <Text style={styles.trashShortcutText}>Trash</Text>
          <Text style={styles.trashShortcutCount}>{trashedNotes.length}</Text>
          <Text style={styles.trashShortcutArrow}>›</Text>
        </Pressable>
      ) : null}

      {loadError && !showTrash ? (
        <View style={styles.errorState}>
          <Text style={styles.sectionTitle}>Your notes did not load</Text>
          <Text style={styles.mutedText}>Your saved notes are still on this device. Try again.</Text>
          <Pressable onPress={onRetry} style={styles.secondaryButton} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : showTrash ? (
        <FlatList
          data={filteredTrash}
          keyExtractor={(note) => note.id}
          renderItem={renderTrashedNote}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={filteredTrash.length ? styles.noteList : styles.emptyList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>✓</Text></View>
              <Text style={styles.emptyTitle}>{query ? 'No matching notes' : 'Trash is empty'}</Text>
              <Text style={styles.emptyCopy}>{query ? 'Try another search.' : 'Deleted notes will stay here for 30 days.'}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={(note) => note.id}
          renderItem={renderNote}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={filteredNotes.length ? styles.noteList : styles.emptyList}
          ListHeaderComponent={filteredNotes.length ? <Text style={styles.listHeading}>RECENT</Text> : undefined}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>✳</Text></View>
              <Text style={styles.emptyTitle}>{query ? 'No matching notes' : 'Start with one small note'}</Text>
              <Text style={styles.emptyCopy}>
                {query ? 'Try another search.' : 'Keep a thought, a plan, or a list here. It stays on this device.'}
              </Text>
              {!query ? (
                <Pressable onPress={() => setShowCreateOptions(true)} style={styles.secondaryButton} accessibilityRole="button">
                  <Text style={styles.secondaryButtonText}>Create your first note</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}

      <SettingsModal
        visible={settingsOpen}
        preferences={preferences}
        permission={permission}
        onClose={() => setSettingsOpen(false)}
        onPreferencesChange={onPreferencesChange}
        onReminderSettingChange={onReminderSettingChange}
      />
      <ReminderModal
        repository={repository}
        visible={quickRemindersOpen}
        note={null}
        notes={notes}
        reminders={reminders}
        preferences={preferences}
        permission={permission}
        onClose={() => setQuickRemindersOpen(false)}
        onRemindersChanged={onRemindersChanged}
        onPermissionChanged={onPermissionChanged}
      />
    </SafeAreaView>
  );
}

function CreateOption({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.createOption, pressed && styles.pressed]}
    >
      <Text style={styles.createOptionText}>{label}</Text>
    </Pressable>
  );
}

const EMPTY_REMINDERS: Reminder[] = [];

const NoteListRow = memo(function NoteListRow({ note, reminders, onOpen, onTogglePin, onDelete, highlightPinned, themeMode }: {
  note: Note;
  reminders: Reminder[];
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onDelete: (note: Note) => void;
  highlightPinned: boolean;
  themeMode: 'light' | 'dark';
}) {
  return (
    <View style={[styles.noteRow, note.isPinned && highlightPinned && styles.noteRowPinned, note.isPinned && highlightPinned && { backgroundColor: palette.accentSoft, shadowColor: palette.accent, shadowOpacity: themeMode === 'dark' ? 0.26 : 0.16, shadowRadius: themeMode === 'dark' ? 14 : 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${note.title || 'untitled note'}, ${noteTypeLabels[note.type].toLowerCase()}`}
        onPress={() => onOpen(note)}
        style={({ pressed }) => [styles.noteRowMain, pressed && styles.rowPressed]}
      >
        <View style={styles.noteRowTop}>
          <View style={styles.noteTitleWithReminder}>
            <Text style={styles.noteTitle} numberOfLines={1}>{note.title.trim() || 'Untitled note'}</Text>
            {reminders.length ? <ReminderIcon size={15} color={reminders.some((reminder) => reminder.enabled) ? palette.accent : palette.faint} /> : null}
          </View>
          <Text style={styles.noteType}>{noteTypeLabels[note.type]}</Text>
        </View>
        <Text style={styles.notePreview} numberOfLines={2}>{previewForNote(note)}</Text>
        <Text style={styles.noteDate}>{formatDate(note.updatedAt)}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${note.isPinned ? 'Unpin' : 'Pin'} ${note.title || 'untitled note'}`}
        hitSlop={8}
        onPress={() => onTogglePin(note)}
        style={({ pressed }) => [styles.pinRowButton, pressed && styles.pressed]}
      >
        <Text style={[styles.pinRowGlyph, note.isPinned && styles.pinRowGlyphActive]}>{note.isPinned ? 'Pinned' : 'Pin'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Move ${note.title || 'untitled note'} to Trash`}
        hitSlop={8}
        onPress={() => onDelete(note)}
        style={({ pressed }) => [styles.deleteRowButton, pressed && styles.pressed]}
      >
        <Text style={styles.deleteRowGlyph}>×</Text>
      </Pressable>
    </View>
  );
});

const TrashNoteRow = memo(function TrashNoteRow({ note, onRestore, onDeletePermanently }: {
  note: Note;
  onRestore: (note: Note) => void;
  onDeletePermanently: (note: Note) => void;
}) {
  const deletedAt = note.deletedAt ?? Date.now();
  const daysLeft = trashDaysRemaining(deletedAt);
  const confirmDelete = () => Alert.alert(
    'Delete permanently?',
    `“${note.title.trim() || 'Untitled note'}” will be removed from this device. This cannot be undone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete permanently', style: 'destructive', onPress: () => onDeletePermanently(note) },
    ],
  );
  return (
    <View style={styles.trashNoteRow}>
      <View style={styles.trashNoteMain}>
        <Text style={styles.trashNoteTitle} numberOfLines={1}>{note.title.trim() || 'Untitled note'}</Text>
        <Text style={styles.trashNoteMeta} numberOfLines={2}>
          {noteTypeLabels[note.type]} · Deletes in {daysLeft} day{daysLeft === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.trashRowActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Restore ${note.title || 'untitled note'}`}
          onPress={() => onRestore(note)}
          style={({ pressed }) => [styles.trashRestoreButton, pressed && styles.pressed]}
        >
          <Text style={styles.trashRestoreText}>Restore</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${note.title || 'untitled note'} permanently`}
          onPress={confirmDelete}
          style={({ pressed }) => [styles.trashPermanentButton, pressed && styles.pressed]}
        >
          <Text style={styles.trashPermanentText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
});

function previewForNote(note: Note): string {
  if (isDocumentNote(note.type)) return note.body.trim() || 'No text yet';
  const done = note.items.filter((item) => item.checked).length;
  const firstItems = note.items.slice(0, 2).map((item) => item.text.trim()).filter(Boolean);
  if (firstItems.length) return `${done}/${note.items.length} done · ${firstItems.join(' · ')}`;
  return note.items.length ? `${done}/${note.items.length} items done` : 'An empty list, ready when you are';
}

function formatDate(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}