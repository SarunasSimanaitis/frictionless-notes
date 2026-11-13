import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, BackHandler, FlatList, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View, type ListRenderItemInfo,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '../brand';
import { ReminderIcon } from '../ReminderIcon';
import { ReminderModal } from '../ReminderModal';
import { SettingsModal } from '../SettingsModal';
import { countWords, customNoteTemplates, filterNotes, isDocumentNote, searchNotes, trashDaysRemaining } from '../model';
import { palette, type ThemeMode } from '../theme';
import { styles } from '../styles';
import { noteTypeIcons, noteTypeLabels } from '../noteLabels';
import type { NotificationPermission } from '../notifications';
import type { NotesRepository } from '../repository';
import type { AppPreferences, CustomNoteTemplateId, Note, NoteFilter, NoteSortMode, NoteType, Reminder } from '../types';
import { Icon, type IconName } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Sheet, SheetAction } from '../ui/Sheet';

interface HomeScreenProps {
  repository: NotesRepository;
  notes: Note[];
  trashedNotes: Note[];
  loadError: boolean;
  preferences: AppPreferences;
  themeMode: ThemeMode;
  permission: NotificationPermission;
  reminders: Reminder[];
  onRemindersChanged: () => void;
  onPermissionChanged: (permission: NotificationPermission) => void;
  onRestore: (note: Note) => void;
  onDeletePermanently: (note: Note) => void;
  onEmptyTrash: () => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onReminderSettingChange: (enabled: boolean) => void;
  onAppLockChange: (enabled: boolean) => void;
  onRetry: () => void;
  onCreate: (type: NoteType, templateId?: CustomNoteTemplateId) => void;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onToggleLock: (note: Note) => void;
  onDuplicate: (note: Note) => void;
  onShare: (note: Note) => void;
  onDelete: (note: Note) => void;
}

const sortLabels: Record<NoteSortMode, string> = {
  updated: 'Last edited',
  created: 'Date created',
  title: 'Title (A–Z)',
};

const templateIds: CustomNoteTemplateId[] = ['plan', 'journal', 'meeting', 'weekly', 'recipe'];

export function HomeScreen({
  repository, notes, trashedNotes, loadError, preferences, themeMode, permission, reminders, onRemindersChanged,
  onPermissionChanged, onRestore, onDeletePermanently, onEmptyTrash, onPreferencesChange,
  onReminderSettingChange, onAppLockChange, onRetry, onCreate, onOpen, onTogglePin, onToggleLock,
  onDuplicate, onShare, onDelete,
}: HomeScreenProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickRemindersOpen, setQuickRemindersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [menuNote, setMenuNote] = useState<Note | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const lastNewTapAt = useRef(0);
  const insets = useSafeAreaInsets();

  // Trash and the create menu are in-screen states, not navigation routes. Consume Android's
  // back gesture while either is open so the OS does not exit the app.
  useEffect(() => {
    if (!showTrash && !showCreateOptions) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showCreateOptions) {
        setShowCreateOptions(false);
        return true;
      }
      setQuery('');
      setShowTrash(false);
      return true;
    });
    return () => subscription.remove();
  }, [showCreateOptions, showTrash]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
  const hasLockedNotes = useMemo(() => notes.some((note) => note.isLocked), [notes]);
  const activeFilter: NoteFilter = filter === 'locked' && !hasLockedNotes ? 'all' : filter;
  const filteredNotes = useMemo(
    () => searchNotes(filterNotes(notes, activeFilter, new Set(remindersByNote.keys())), query, preferences.sortMode),
    [activeFilter, notes, preferences.sortMode, query, remindersByNote],
  );
  const filteredTrash = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return trashedNotes;
    return trashedNotes.filter((note) => (note.isLocked
      ? [note.title]
      : [note.title, note.body, ...note.items.map((item) => item.text)])
      .join('\n').toLocaleLowerCase().includes(normalized));
  }, [query, trashedNotes]);

  const renderNote = useCallback(({ item }: ListRenderItemInfo<Note>) => (
    <NoteListRow note={item} reminders={remindersByNote.get(item.id) ?? EMPTY_REMINDERS} onOpen={onOpen} onMore={setMenuNote} highlightPinned={preferences.highlightPinnedNotes} themeMode={themeMode} />
  ), [remindersByNote, onOpen, preferences.highlightPinnedNotes, themeMode]);
  const renderTrashedNote = useCallback(({ item }: ListRenderItemInfo<Note>) => (
    <TrashNoteRow note={item} onRestore={onRestore} onDeletePermanently={onDeletePermanently} themeMode={themeMode} />
  ), [onRestore, onDeletePermanently, themeMode]);

  const openTrash = () => {
    setQuery('');
    setShowCreateOptions(false);
    setShowTrash(true);
  };
  const returnToNotes = () => {
    setQuery('');
    setShowCreateOptions(false);
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
  const handleNewPress = () => {
    const now = Date.now();
    // A quick second tap skips the menu and starts a plain note straight away.
    if (now - lastNewTapAt.current <= 350) {
      lastNewTapAt.current = 0;
      setShowCreateOptions(false);
      setShowTrash(false);
      onCreate('text');
      return;
    }
    lastNewTapAt.current = now;
    Keyboard.dismiss();
    setShowCreateOptions((visible) => !visible);
  };
  const create = (type: NoteType, templateId?: CustomNoteTemplateId) => {
    setShowCreateOptions(false);
    setShowTrash(false);
    onCreate(type, templateId);
  };
  const runNoteAction = (action: (note: Note) => void) => {
    const note = menuNote;
    setMenuNote(null);
    if (note) action(note);
  };

  const filters: Array<{ id: NoteFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'notes', label: 'Notes' },
    { id: 'lists', label: 'Lists' },
    { id: 'pinned', label: 'Pinned' },
    { id: 'reminders', label: 'Reminders' },
    ...(hasLockedNotes ? [{ id: 'locked' as const, label: 'Locked' }] : []),
  ];
  const isFiltering = query.trim().length > 0 || activeFilter !== 'all';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.screenBody}>
        {showTrash ? (
          <View style={styles.topBar}>
            <Text style={styles.topBarTitle} accessibilityRole="header">Trash</Text>
            {trashedNotes.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Empty Trash"
                onPress={confirmEmptyTrash}
                style={({ pressed }) => [styles.topBarTextAction, pressed && styles.pressed]}
              >
                <Text style={styles.topBarTextActionLabel}>Empty</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.topBar}>
            <Text style={styles.wordmark} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{APP_NAME}</Text>
            <View style={styles.topBarActions}>
              <IconButton icon="sort" label={`Sort notes, currently by ${sortLabels[preferences.sortMode].toLowerCase()}`} onPress={() => setSortOpen(true)} />
            </View>
          </View>
        )}

        {showTrash ? (
          <Text style={styles.trashHeaderCopy}>Notes are automatically deleted 30 days after moving to Trash.</Text>
        ) : null}
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={palette.faint} />
          <TextInput
            accessibilityLabel={showTrash ? 'Search trashed notes' : 'Search notes'}
            value={query}
            onChangeText={setQuery}
            placeholder={showTrash ? 'Search in Trash' : 'Search'}
            placeholderTextColor={palette.faint}
            returnKeyType="search"
            style={styles.searchInput}
            selectionColor={palette.accent}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => setQuery('')}>
              <Icon name="close" size={16} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>

        {!showTrash ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
          >
            {filters.map((option) => {
              const selected = activeFilter === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${option.label.toLowerCase()}`}
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(option.id)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
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
                <View style={styles.emptyMark}><Icon name="trash" size={30} /></View>
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
            ItemSeparatorComponent={NoteSeparator}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={filteredNotes.length ? styles.noteList : styles.emptyList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyMark}><Icon name={isFiltering ? 'search' : 'pen'} size={30} /></View>
                <Text style={styles.emptyTitle}>{isFiltering ? 'Nothing here' : 'Start with one small note'}</Text>
                <Text style={styles.emptyCopy}>
                  {isFiltering ? 'Try another search or filter.' : 'Keep a thought, a plan, or a list here. It stays on this device.'}
                </Text>
                {!isFiltering ? (
                  <Pressable onPress={() => setShowCreateOptions(true)} style={[styles.primaryButton, { marginTop: 20 }]} accessibilityRole="button">
                    <Text style={styles.primaryButtonText}>Create your first note</Text>
                  </Pressable>
                ) : null}
              </View>
            }
          />
        )}

        {showCreateOptions ? (
          <View style={styles.createLayer}>
            <Pressable style={{ flex: 1 }} accessibilityLabel="Close the new note menu" onPress={() => setShowCreateOptions(false)} />
            <View style={styles.createPanel}>
              <View style={styles.sheetGrabber} />
              <Text style={styles.createTitle}>New</Text>
              <View style={styles.createOptions}>
                <CreateOption icon="note" label="Quick note" hint="Plain and fast" onPress={() => create('text')} />
                <CreateOption icon="checklist" label="Checklist" hint="Tap to tick off" onPress={() => create('checklist')} />
                <CreateOption icon="cart" label="Shopping list" hint="For the store" onPress={() => create('shopping')} />
                <CreateOption icon="pen" label="Blank custom note" hint="Styled pages" onPress={() => create('custom', 'blank')} />
              </View>
              <Text style={styles.createSubhead}>Start from a template</Text>
              <View style={styles.templateRow}>
                {templateIds.map((templateId) => (
                  <Pressable
                    key={templateId}
                    accessibilityRole="button"
                    accessibilityLabel={`${customNoteTemplates[templateId]?.label} template`}
                    onPress={() => create('custom', templateId)}
                    style={({ pressed }) => [styles.templateChip, pressed && styles.pressed]}
                  >
                    <Text style={styles.templateChipText}>{customNoteTemplates[templateId]?.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.createTip}>Tip: double-tap + to start a quick note straight away.</Text>
            </View>
          </View>
        ) : null}
      </View>

      {keyboardVisible ? null : (
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist">
          <TabItem icon="note" label="Notes" selected={!showTrash} onPress={returnToNotes} />
          <TabItem icon="bell" label="Manage reminders" onPress={() => { setShowCreateOptions(false); setQuickRemindersOpen(true); }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a note"
            accessibilityHint="Opens the new note menu. Double-tap quickly to start a quick note."
            accessibilityState={{ expanded: showCreateOptions }}
            onPress={handleNewPress}
            style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}
          >
            <View style={styles.tabCreate}>
              <Icon name={showCreateOptions ? 'close' : 'plus'} size={22} color={palette.onAccent} strokeWidth={2.2} />
            </View>
          </Pressable>
          <TabItem icon="trash" label={`Open Trash, ${trashedNotes.length} notes`} selected={showTrash} badge={trashedNotes.length} onPress={openTrash} />
          <TabItem icon="settings" label="Settings" onPress={() => { setShowCreateOptions(false); setSettingsOpen(true); }} />
        </View>
      )}

      <Sheet visible={sortOpen} title="Sort notes" subtitle="Pinned notes always stay on top." onClose={() => setSortOpen(false)}>
        {(Object.keys(sortLabels) as NoteSortMode[]).map((mode) => (
          <SheetAction
            key={mode}
            label={sortLabels[mode]}
            selected={preferences.sortMode === mode}
            onPress={() => {
              setSortOpen(false);
              if (preferences.sortMode !== mode) onPreferencesChange({ ...preferences, sortMode: mode });
            }}
          />
        ))}
      </Sheet>

      <Sheet
        visible={menuNote !== null}
        title={menuNote ? menuNote.title.trim() || 'Untitled note' : undefined}
        subtitle={menuNote ? noteDetails(menuNote) : undefined}
        onClose={() => setMenuNote(null)}
      >
        {menuNote ? (
          <>
            <SheetAction icon="pin" label={menuNote.isPinned ? 'Unpin' : 'Pin to top'} onPress={() => runNoteAction(onTogglePin)} />
            <SheetAction
              icon={menuNote.isLocked ? 'unlock' : 'lock'}
              label={menuNote.isLocked ? 'Remove lock' : 'Lock note'}
              detail={menuNote.isLocked ? undefined : 'Hide the preview and ask for your fingerprint or PIN to open'}
              onPress={() => runNoteAction(onToggleLock)}
            />
            {!menuNote.isLocked ? (
              <>
                <SheetAction icon="share" label="Share as text" onPress={() => runNoteAction(onShare)} />
                <SheetAction icon="copy" label="Duplicate" onPress={() => runNoteAction(onDuplicate)} />
              </>
            ) : null}
            <SheetAction icon="trash" label="Move to Trash" danger onPress={() => runNoteAction(onDelete)} />
          </>
        ) : null}
      </Sheet>

      <SettingsModal
        visible={settingsOpen}
        preferences={preferences}
        permission={permission}
        onClose={() => setSettingsOpen(false)}
        onPreferencesChange={onPreferencesChange}
        onReminderSettingChange={onReminderSettingChange}
        onAppLockChange={onAppLockChange}
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

function CreateOption({ icon, label, hint, onPress }: { icon: IconName; label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.createOption, pressed && styles.pressed]}
    >
      <Icon name={icon} size={22} />
      <View style={styles.createOptionCopy}>
        <Text style={styles.createOptionText} numberOfLines={1}>{label}</Text>
        <Text style={styles.createOptionHint} numberOfLines={1}>{hint}</Text>
      </View>
    </Pressable>
  );
}

function TabItem({ icon, label, selected = false, badge = 0, onPress }: {
  icon: IconName;
  label: string;
  selected?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}
    >
      <Icon name={icon} size={26} color={selected ? palette.ink : palette.muted} strokeWidth={selected ? 2.3 : 1.7} />
      {badge > 0 ? (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function NoteSeparator() {
  return <View style={styles.noteSeparator} />;
}

const EMPTY_REMINDERS: Reminder[] = [];

const NoteListRow = memo(function NoteListRow({ note, reminders, onOpen, onMore, highlightPinned }: {
  note: Note;
  reminders: Reminder[];
  onOpen: (note: Note) => void;
  onMore: (note: Note) => void;
  highlightPinned: boolean;
  /** Not read directly: a new value re-renders the memoised row in the new colours. */
  themeMode: ThemeMode;
}) {
  const highlighted = note.isPinned && highlightPinned;
  const title = note.title.trim() || 'Untitled note';
  return (
    <View style={[styles.noteRow, highlighted && styles.noteRowPinned]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}, ${noteTypeLabels[note.type].toLowerCase()}${note.isPinned ? ', pinned' : ''}${note.isLocked ? ', locked' : ''}`}
        accessibilityHint="Hold for more actions"
        onPress={() => onOpen(note)}
        onLongPress={() => onMore(note)}
        delayLongPress={350}
        style={({ pressed }) => [styles.noteRowMain, pressed && styles.pressed]}
      >
        <View style={[styles.noteIconTile, highlighted && styles.noteIconTilePinned]}>
          <Icon name={note.isLocked ? 'lock' : noteTypeIcons[note.type]} size={22} color={highlighted ? palette.accent : palette.ink} />
        </View>
        <View style={styles.noteRowBody}>
          <View style={styles.noteRowTop}>
            <Text style={styles.noteTitle} numberOfLines={1}>{title}</Text>
            {note.isPinned ? <Icon name="pin" size={14} color={palette.accent} /> : null}
            {reminders.length ? <ReminderIcon size={14} color={reminders.some((reminder) => reminder.enabled) ? palette.accent : palette.faint} /> : null}
            <Text style={styles.noteTime}>{formatDate(note.updatedAt)}</Text>
          </View>
          <Text style={styles.notePreview} numberOfLines={note.isLocked ? 1 : 2}>{previewForNote(note)}</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${title}`}
        hitSlop={4}
        onPress={() => onMore(note)}
        style={({ pressed }) => [styles.noteMoreButton, pressed && styles.pressed]}
      >
        <Icon name="more" size={20} color={palette.faint} />
      </Pressable>
    </View>
  );
});

const TrashNoteRow = memo(function TrashNoteRow({ note, onRestore, onDeletePermanently }: {
  note: Note;
  onRestore: (note: Note) => void;
  onDeletePermanently: (note: Note) => void;
  themeMode: ThemeMode;
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
          {capitalize(noteTypeLabels[note.type])} · Deletes in {daysLeft} day{daysLeft === 1 ? '' : 's'}
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

function capitalize(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

function previewForNote(note: Note): string {
  if (note.isLocked) return 'Locked';
  if (isDocumentNote(note.type)) return note.body.trim().replace(/\s*\n+\s*/g, ' · ') || 'No text yet';
  const done = note.items.filter((item) => item.checked).length;
  const firstItems = note.items.filter((item) => !item.checked).slice(0, 3).map((item) => item.text.trim()).filter(Boolean);
  if (!note.items.length) return 'An empty list, ready when you are';
  if (done === note.items.length) return `All ${done} done`;
  return `${done}/${note.items.length} done${firstItems.length ? ` · ${firstItems.join(', ')}` : ''}`;
}

function noteDetails(note: Note): string {
  const created = new Date(note.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const size = note.isLocked
    ? 'Locked'
    : isDocumentNote(note.type)
      ? `${countWords(note.body)} words`
      : `${note.items.length} item${note.items.length === 1 ? '' : 's'}`;
  return `${capitalize(noteTypeLabels[note.type])} · ${size} · Created ${created}`;
}

function formatDate(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
