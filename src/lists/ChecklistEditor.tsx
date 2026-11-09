import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, Text, TextInput, View, type TextInputInstance } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import type { FlatList as GestureHandlerFlatList } from 'react-native-gesture-handler';
import type { NotesRepository } from '../repository';
import {
  appendChecklistItem,
  canAddChecklistItem,
  createChecklistItem,
  editChecklistItemText,
  nextChecklistItemPosition,
  normalizeItemPositions,
  removeChecklistItem,
  reorderItem,
  toggleItem,
} from '../model';
import { cancelReminderNotifications } from '../notifications';
import { palette } from '../theme';
import { styles } from '../styles';
import type { ChecklistItem, Note } from '../types';
import { ChecklistItemLabel } from './ChecklistItemLabel';
export function ChecklistEditor({ note, repository, onNoteChange, onListSaveComplete, onRemindersChanged }: {
  note: Note;
  repository: NotesRepository;
  onNoteChange: (note: Note) => void;
  onListSaveComplete: (note: Note | null, success: boolean) => void;
  onRemindersChanged: () => void;
}) {
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const listRef = useRef<GestureHandlerFlatList<ChecklistItem>>(null);
  const addingRef = useRef(false);
  const toggleLocks = useRef(new Set<string>());
  const noteRef = useRef(note);
  noteRef.current = note;
  // Keyboard visibility is tracked in a ref, not state: toggling list padding on
  // every keyboard show/hide resized the content mid-scroll and made it jump.
  const keyboardVisibleRef = useRef(false);
  // Scroll to the item being edited exactly once per edit, never on later focus
  // or keyboard-height changes, so manual scrolling while editing is respected.
  const pendingRevealId = useRef<string | null>(null);

  const scrollToItem = useCallback((itemId: string) => {
    const index = noteRef.current.items.findIndex((candidate) => candidate.id === itemId);
    if (index < 0) return;
    requestAnimationFrame(() => {
      try { listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.28 }); }
      catch { listRef.current?.scrollToEnd({ animated: true }); }
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisibleRef.current = true;
      const itemId = pendingRevealId.current;
      if (!itemId) return;
      pendingRevealId.current = null;
      scrollToItem(itemId);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardVisibleRef.current = false; });
    return () => { show.remove(); hide.remove(); };
  }, [scrollToItem]);

  const revealEditingItem = (itemId: string) => {
    if (keyboardVisibleRef.current) {
      // Keyboard already open (e.g. coming from the add bar): no keyboardDidShow
      // will fire, so scroll once the edit row has laid out.
      pendingRevealId.current = null;
      setTimeout(() => scrollToItem(itemId), 60);
    } else {
      pendingRevealId.current = itemId;
    }
  };

  const readPersistedNote = async (): Promise<Note | null> => {
    try {
      return (await repository.loadNotes()).find((candidate) => candidate.id === note.id) ?? null;
    } catch {
      return null;
    }
  };

  const toggle = async (itemId: string) => {
    if (toggleLocks.current.has(itemId)) return;
    toggleLocks.current.add(itemId);
    const current = noteRef.current;
    const items = toggleItem(current.items, itemId);
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) {
      toggleLocks.current.delete(itemId);
      return;
    }
    const next: Note = { ...current, items, updatedAt: Date.now() };
    noteRef.current = next;
    onNoteChange(next);
    try {
      await repository.saveChecklistItem(item, next.updatedAt);
      onListSaveComplete(next, true);
    } catch {
      onListSaveComplete(await readPersistedNote(), false);
      Alert.alert('Could not update item', 'Please try again.');
    } finally {
      toggleLocks.current.delete(itemId);
    }
  };

  const addItem = async (submittedText: string) => {
    const text = submittedText;
    if (!canAddChecklistItem(text, addingRef.current)) return;
    addingRef.current = true;
    setAdding(true);
    let staged = false;
    try {
      const current = noteRef.current;
      const item = createChecklistItem(note.id, text, nextChecklistItemPosition(current.items));
      if (!item) return;
      const next = appendChecklistItem(current, item, Date.now());
      noteRef.current = next;
      onNoteChange(next);
      staged = true;
      await repository.addChecklistItem(item, next.updatedAt);
      onListSaveComplete(next, true);
      setNewItemText('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    } catch (error) {
      if (staged) onListSaveComplete(await readPersistedNote(), false);
      const message = error instanceof Error && error.message ? error.message : 'Please try again.';
      Alert.alert('Could not add item', message);
    } finally {
      addingRef.current = false;
      setAdding(false);
      inputRef.current?.focus();
    }
  };

  const beginEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    revealEditingItem(item.id);
  };

  const cancelEdit = () => {
    pendingRevealId.current = null;
    setEditingId(null);
    Keyboard.dismiss();
  };

  const saveItemEdit = async (item: ChecklistItem, editedText: string) => {
    const current = noteRef.current;
    const updatedItem = { ...item, text: editedText.trim() };
    const next: Note = {
      ...current,
      items: editChecklistItemText(current.items, item.id, updatedItem.text),
      updatedAt: Date.now(),
    };
    noteRef.current = next;
    onNoteChange(next);
    pendingRevealId.current = null;
    setEditingId(null);
    Keyboard.dismiss();
    try {
      await repository.saveChecklistItem(updatedItem, next.updatedAt);
      onListSaveComplete(next, true);
    } catch {
      onListSaveComplete(await readPersistedNote(), false);
      Alert.alert('Could not save item', 'Please try again.');
    }
  };

  const remove = async (item: ChecklistItem) => {
    const current = noteRef.current;
    const next: Note = {
      ...current,
      items: removeChecklistItem(current.items, item.id),
      updatedAt: Date.now(),
    };
    noteRef.current = next;
    onNoteChange(next);
    pendingRevealId.current = null;
    setEditingId(null);
    Keyboard.dismiss();
    try {
      const remindersForItem = (await repository.loadReminders(note.id)).filter((reminder) => reminder.checklistItemId === item.id);
      await Promise.allSettled(remindersForItem.map((reminder) => cancelReminderNotifications(reminder)));
      await repository.deleteChecklistItem(item.id, note.id, next.updatedAt);
      onListSaveComplete(next, true);
      onRemindersChanged();
    } catch {
      onListSaveComplete(await readPersistedNote(), false);
      Alert.alert('Could not remove item', 'Please try again.');
    }
  };

  const persistOrder = async (items: ChecklistItem[]) => {
    const ordered = normalizeItemPositions(items);
    const current = noteRef.current;
    if (ordered.every((item, index) => item.id === current.items[index]?.id)) return;
    Keyboard.dismiss();
    const updatedAt = Date.now();
    const next: Note = { ...current, items: ordered, updatedAt };
    noteRef.current = next;
    onNoteChange(next);
    try {
      await repository.saveItemOrder(note.id, ordered, updatedAt);
      onListSaveComplete(next, true);
    } catch {
      onListSaveComplete(await readPersistedNote(), false);
      Alert.alert('Could not save item order', 'Your list order may not have been saved. Please try again.');
    }
  };

  const moveByAccessibilityAction = (itemId: string, actionName: string) => {
    if (actionName !== 'moveUp' && actionName !== 'moveDown') return;
    const currentItems = noteRef.current.items;
    const currentIndex = currentItems.findIndex((candidate) => candidate.id === itemId);
    const delta = actionName === 'moveUp' ? -1 : 1;
    if (currentIndex < 0 || currentIndex + delta < 0 || currentIndex + delta >= currentItems.length) return;
    void persistOrder(reorderItem(currentItems, itemId, currentIndex + delta));
  };

  // Handlers live in a ref so memoized rows always call the latest version
  // without every keystroke or save re-rendering the whole list.
  const actions = useRef<RowActions>(null as unknown as RowActions);
  actions.current = { toggle, beginEdit, cancelEdit, saveItemEdit, remove, moveByAccessibilityAction };

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<ChecklistItem>) => (
    editingId === item.id
      ? <EditingChecklistRow item={item} actions={actions} />
      : <ChecklistRow item={item} drag={drag} isActive={isActive} actions={actions} />
  ), [editingId]);

  return (
    <View style={styles.listEditor}>
      <DraggableFlatList
        ref={listRef}
        data={note.items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => void persistOrder(data)}
        autoscrollThreshold={48}
        autoscrollSpeed={72}
        renderPlaceholder={({ item }) => (
          <View pointerEvents="none" style={[styles.checklistRow, styles.checklistPlaceholder]}>
            <View style={styles.checkbox} />
            <Text style={styles.checklistText}>{item.text || 'Empty item'}</Text>
            <View style={styles.editItemButton} />
          </View>
        )}
        extraData={editingId}
        keyboardShouldPersistTaps="always"
        // Scrolling while an item is being edited must not close the keyboard.
        keyboardDismissMode={editingId ? 'none' : 'on-drag'}
        // Android detaches off-screen rows by default, which blurs a focused
        // input that scrolls out of view and drops the keyboard.
        removeClippedSubviews={false}
        style={styles.itemsScroll}
        containerStyle={styles.itemsScroll}
        contentContainerStyle={[styles.itemsContent, editingId !== null && styles.itemsContentEditing]}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index - 120), animated: true });
        }}
        ListHeaderComponent={
          <Text style={styles.listHint}>Tap to check off. Hold an item to reorder; use Edit to change its text.</Text>
        }
        ListEmptyComponent={
          <View style={styles.listEmptyState}>
            <Text style={styles.listEmptyTitle}>Your list is ready</Text>
            <Text style={styles.mutedText}>Add the first item below.</Text>
          </View>
        }
      />
      <View style={styles.addItemBar}>
        <TextInput
          ref={inputRef}
          accessibilityLabel="New list item"
          value={newItemText}
          onChangeText={setNewItemText}
          onSubmitEditing={({ nativeEvent }) => void addItem(nativeEvent.text ?? newItemText)}
          submitBehavior="submit"
          placeholder="Add an item"
          placeholderTextColor={palette.faint}
          returnKeyType="done"
          style={styles.newItemInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add item"
          disabled={!canAddChecklistItem(newItemText, adding)}
          onPress={() => void addItem(newItemText)}
          style={({ pressed }) => [styles.addItemButton, pressed && styles.pressed, !canAddChecklistItem(newItemText, adding) && styles.addItemDisabled]}
        >
          <Text style={styles.addItemButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

type RowActions = {
  toggle: (itemId: string) => Promise<void>;
  beginEdit: (item: ChecklistItem) => void;
  cancelEdit: () => void;
  saveItemEdit: (item: ChecklistItem, editedText: string) => Promise<void>;
  remove: (item: ChecklistItem) => Promise<void>;
  moveByAccessibilityAction: (itemId: string, actionName: string) => void;
};

/** Holds its own draft text so typing re-renders only this row, not the list. */
const EditingChecklistRow = memo(function EditingChecklistRow({ item, actions }: {
  item: ChecklistItem;
  actions: { current: RowActions };
}) {
  const [editingText, setEditingText] = useState(item.text);
  return (
    <View style={styles.editingItem}>
      <TextInput
        accessibilityLabel={`Edit ${item.text || 'list item'}`}
        value={editingText}
        onChangeText={setEditingText}
        autoFocus
        multiline
        textAlignVertical="top"
        placeholder="List item"
        placeholderTextColor={palette.faint}
        style={styles.itemEditInput}
        selectionColor={palette.accent}
      />
      <View style={styles.itemEditActions}>
        <Pressable accessibilityRole="button" onPress={() => void actions.current.remove(item)} style={styles.itemActionButton}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => actions.current.cancelEdit()} style={styles.itemActionButton}>
          <Text style={styles.mutedActionText}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void actions.current.saveItemEdit(item, editingText)} style={[styles.itemActionButton, styles.itemSaveButton]}>
          <Text style={styles.itemSaveText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
});

const ChecklistRow = memo(function ChecklistRow({ item, drag, isActive, actions }: {
  item: ChecklistItem;
  drag: () => void;
  isActive: boolean;
  actions: { current: RowActions };
}) {
  const toggle = (itemId: string) => actions.current.toggle(itemId);
  const beginEdit = (target: ChecklistItem) => actions.current.beginEdit(target);
  const moveByAccessibilityAction = (itemId: string, actionName: string) => actions.current.moveByAccessibilityAction(itemId, actionName);
  return (
    <View style={[styles.checklistRow, isActive && styles.checklistRowActive]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={`${item.text || 'Empty item'}, ${item.checked ? 'completed' : 'not completed'}`}
        accessibilityActions={[
          { name: 'moveUp', label: 'Move item up' },
          { name: 'moveDown', label: 'Move item down' },
        ]}
        onAccessibilityAction={(event) => moveByAccessibilityAction(item.id, event.nativeEvent.actionName)}
        onLongPress={drag}
        delayLongPress={700}
        onPress={() => void toggle(item.id)}
        style={({ pressed }) => [styles.checklistToggleArea, pressed && styles.rowPressed]}
      >
        <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
          {item.checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <ChecklistItemLabel text={item.text} checked={item.checked} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.text || 'list item'}`}
        onPress={() => beginEdit(item)}
        style={({ pressed }) => [styles.editItemButton, pressed && styles.pressed]}
      >
        <Text style={styles.editItemGlyph}>✎</Text>
      </Pressable>
    </View>
  );
});
