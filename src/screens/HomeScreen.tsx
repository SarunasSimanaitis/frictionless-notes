import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, Text, TextInput, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReminderModal } from '../ReminderModal';
import { SettingsModal } from '../SettingsModal';
import { isDocumentNote, searchNotes } from '../model';
import { palette } from '../theme';
import { styles } from '../styles';
import { noteTypeLabels } from '../noteLabels';
import type { NotificationPermission } from '../notifications';
import type { NotesRepository } from '../repository';
import type { AppPreferences, CustomNoteTemplateId, Note, NoteType, Reminder } from '../types';
interface HomeScreenProps {
  repository: NotesRepository;
  notes: Note[];
  loadError: boolean;
  preferences: AppPreferences;
  permission: NotificationPermission;
  reminders: Reminder[];
  onRemindersChanged: () => void;
  onPermissionChanged: (permission: NotificationPermission) => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onReminderSettingChange: (enabled: boolean) => void;
  onRetry: () => void;
  onCreate: (type: NoteType, templateId?: CustomNoteTemplateId) => void;
  onOpen: (note: Note) => void;
  onDelete: (note: Note) => void;
}

export function HomeScreen({
  repository, notes, loadError, preferences, permission, reminders, onRemindersChanged, onPermissionChanged,
  onPreferencesChange, onReminderSettingChange,
  onRetry, onCreate, onOpen, onDelete,
}: HomeScreenProps) {
  const [query, setQuery] = useState('');
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickRemindersOpen, setQuickRemindersOpen] = useState(false);
  const filteredNotes = searchNotes(notes, query);

  const renderNote = ({ item }: ListRenderItemInfo<Note>) => (
    <NoteListRow note={item} onOpen={onOpen} onDelete={onDelete} />
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
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
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          >
            <Text style={styles.settingsGlyph}>◷</Text>
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

      {showCreateOptions ? (
        <View style={styles.createOptions}>
          <CreateOption label="Quick note" onPress={() => { setShowCreateOptions(false); onCreate('text'); }} />
          <CreateOption label="Checklist" onPress={() => { setShowCreateOptions(false); onCreate('checklist'); }} />
          <CreateOption label="Shopping list" onPress={() => { setShowCreateOptions(false); onCreate('shopping'); }} />
          <CreateOption label="Blank custom note" onPress={() => { setShowCreateOptions(false); onCreate('custom', 'blank'); }} />
          <CreateOption label="Plan template" onPress={() => { setShowCreateOptions(false); onCreate('custom', 'plan'); }} />
          <CreateOption label="Journal template" onPress={() => { setShowCreateOptions(false); onCreate('custom', 'journal'); }} />
        </View>
      ) : null}

      <View style={styles.searchBox}>
        <Text style={styles.searchGlyph} accessibilityElementsHidden>⌕</Text>
        <TextInput
          accessibilityLabel="Search notes"
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes and lists"
          placeholderTextColor={palette.faint}
          returnKeyType="search"
          style={styles.searchInput}
          clearButtonMode="while-editing"
        />
      </View>

      {loadError ? (
        <View style={styles.errorState}>
          <Text style={styles.sectionTitle}>Your notes did not load</Text>
          <Text style={styles.mutedText}>Your saved notes are still on this device. Try again.</Text>
          <Pressable onPress={onRetry} style={styles.secondaryButton} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={(note) => note.id}
          renderItem={renderNote}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={filteredNotes.length ? styles.noteList : styles.emptyList}
          ListHeaderComponent={filteredNotes.length ? <Text style={styles.listHeading}>RECENT</Text> : null}
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

function NoteListRow({
  note,
  onOpen,
  onDelete,
}: {
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
        accessibilityLabel={`Delete ${note.title || 'untitled note'}`}
        hitSlop={8}
        onPress={() => onDelete(note)}
        style={({ pressed }) => [styles.deleteRowButton, pressed && styles.pressed]}
      >
        <Text style={styles.deleteRowGlyph}>×</Text>
      </Pressable>
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
