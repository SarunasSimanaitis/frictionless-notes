import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View, type ListRenderItemInfo } from 'react-native';
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
  onDelete: (note: Note) => void;
}

export function HomeScreen({
  repository, notes, trashedNotes, loadError, preferences, permission, reminders, onRemindersChanged,
  onPermissionChanged, onRestore, onDeletePermanently, onEmptyTrash, onPreferencesChange,
  onReminderSettingChange, onRetry, onCreate, onOpen, onDelete,
}: HomeScreenProps) {
  const [query, setQuery] = useState('');
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickRemindersOpen, setQuickRemindersOpen] = useState(false);
  const filteredNotes = searchNotes(notes, query);
  const filteredTrash = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return trashedNotes;
    return trashedNotes.filter((note) => [note.title, note.body, ...note.items.map((item) => item.text)]
      .join('\n').toLocaleLowerCase().includes(normalized));
  }, [query, trashedNotes]);

  const renderNote = ({ item }: ListRenderItemInfo<Note>) => (
    <NoteListRow note={item} onOpen={onOpen} onDelete={onDelete} />
  );
  const renderTrashedNote = ({ item }: ListRenderItemInfo<Note>) => (
    <TrashNoteRow note={item} onRestore={onRestore} onDeletePermanently={onDeletePermanently} />
  );

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
      <StatusBar style="dark" />
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
              onPress={() => setShowCreateOptions((visible) => !visible)}
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

function NoteListRow({ note, onOpen, onDelete }: {
  note: Note;
  onOpen: (note: Note) => void;
  onDelete: (note: Note) => void;
}) {
  return (
    <View style={styles.noteRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${note.title || 'untitled note'}, ${noteTypeLabels[note.type].toLowerCase()}`}
        onPress={() => onOpen(note)}
        style={({ pressed }) => [styles.noteRowMain, pressed && styles.rowPressed]}
      >
        <View style={styles.noteRowTop}>
          <Text style={styles.noteTitle} numberOfLines={1}>{note.title.trim() || 'Untitled note'}</Text>
          <Text style={styles.noteType}>{noteTypeLabels[note.type]}</Text>
        </View>
        <Text style={styles.notePreview} numberOfLines={2}>{previewForNote(note)}</Text>
        <Text style={styles.noteDate}>{formatDate(note.updatedAt)}</Text>
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
}

function TrashNoteRow({ note, onRestore, onDeletePermanently }: {
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
}

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