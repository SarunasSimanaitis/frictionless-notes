import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, Text, TextInput, View, type TextInputInstance } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import type { FlatList as GestureHandlerFlatList } from 'react-native-gesture-handler';
import type { NotesRepository } from '../repository';
import {
  appendChecklistItem,
  canAddChecklistItem,
  checklistProgress,
  clearCheckedItems,
  createChecklistItem,
  editChecklistItemText,
  nextChecklistItemPosition,
  normalizeItemPositions,
  removeChecklistItem,
  reorderItem,
  toggleItem,
  uncheckAllItems,
} from '../model';
import { cancelReminderNotifications } from '../notifications';
import { palette } from '../theme';
import { styles } from '../styles';
import type { ChecklistItem, Note } from '../types';
import { Icon } from '../ui/Icon';
import { ProgressBar } from '../ui/ProgressBar';
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
  const [editingText, setEditingText] = useState('');
  const [adding, setAdding] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const listRef = useRef<GestureHandlerFlatList<ChecklistItem>>(null);
  const addingRef = useRef(false);
  const toggleLocks = useRef(new Set<string>());
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      const index = noteRef.current.items.findIndex((item) => item.id === editingId);
      if (index >= 0) {
        requestAnimationFrame(() => {
          try { listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.28 }); }
          catch { listRef.current?.scrollToEnd({ animated: true }); }
        });
      }
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, [editingId]);

  const revealEditingItem = (itemId: string) => {
    const index = noteRef.current.items.findIndex((candidate) => candidate.id === itemId);
    if (index < 0) return;
    requestAnimationFrame(() => {
      try { listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.28 }); }
      catch { listRef.current?.scrollToEnd({ animated: true }); }
    });
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
    setEditingText(item.text);
    revealEditingItem(item.id);
  };

  const cancelEdit = () => {
    setKeyboardVisible(false);
    setEditingId(null);
    setEditingText('');
    Keyboard.dismiss();
  };

  const saveItemEdit = async (item: ChecklistItem) => {
    const current = noteRef.current;
    const updatedItem = { ...item, text: editingText.trim() };
    const next: Note = {
      ...current,
      items: editChecklistItemText(current.items, item.id, updatedItem.text),
      updatedAt: Date.now(),
    };
    noteRef.current = next;
    onNoteChange(next);
    setKeyboardVisible(false);
    setEditingId(null);
    setEditingText('');
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
    setKeyboardVisible(false);
    setEditingId(null);
    setEditingText('');
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

  /** Starts the list again without retyping it: handy for a weekly shop. */
  const uncheckAll = async () => {
    const current = noteRef.current;
    const changed = current.items.filter((item) => item.checked).map((item) => ({ ...item, checked: false }));
    if (!changed.length) return;
    const next: Note = { ...current, items: uncheckAllItems(current.items), updatedAt: Date.now() };
    noteRef.current = next;
    onNoteChange(next);
    try {
      for (const item of changed) await repository.saveChecklistItem(item, next.updatedAt);
      onListSaveComplete(next, true);
    } catch {
      onListSaveComplete(await readPersistedNote(), false);
      Alert.alert('Could not update the list', 'Please try again.');
    }
  };

  const clearChecked = async () => {
    const current = noteRef.current;
    const removed = current.items.filter((item) => item.checked);
    if (!removed.length) return;
    const remaining = clearCheckedItems(current.items);
    const next: Note = { ...current, items: remaining, updatedAt: Date.now() };
    noteRef.current = next;
    onNoteChange(next);
    try {
      for (const item of removed) await repository.deleteChecklistItem(item.id, note.id, next.updatedAt);
      await repository.saveItemOrder(note.id, remaining, next.updatedAt);
      onListSaveComplete(next, true);
      onRemindersChanged();
    } catch {
      onListSaveComplete(await readPersistedNote(), false);
      Alert.alert('Could not remove completed items', 'Please try again.');
    }
  };

  const confirmClearChecked = () => {
    const { done } = checklistProgress(noteRef.current.items);
    Alert.alert(
      `Remove ${done} completed item${done === 1 ? '' : 's'}?`,
      'Items you have ticked off will be deleted from this list.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void clearChecked() },
      ],
    );
  };

  const moveByAccessibilityAction = (itemId: string, actionName: string) => {
    if (actionName !== 'moveUp' && actionName !== 'moveDown') return;
    const currentItems = noteRef.current.items;
    const currentIndex = currentItems.findIndex((candidate) => candidate.id === itemId);
    const delta = actionName === 'moveUp' ? -1 : 1;
    if (currentIndex < 0 || currentIndex + delta < 0 || currentIndex + delta >= currentItems.length) return;
    void persistOrder(reorderItem(currentItems, itemId, currentIndex + delta));
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<ChecklistItem>) => {
    if (editingId === item.id) {
      return (
        <View style={styles.editingItem}>
          <TextInput
            accessibilityLabel={`Edit ${item.text || 'list item'}`}
            value={editingText}
            onChangeText={setEditingText}
            autoFocus
            onFocus={() => { setKeyboardVisible(true); revealEditingItem(item.id); }}
            multiline
            textAlignVertical="top"
            placeholder="List item"
            placeholderTextColor={palette.faint}
            style={styles.itemEditInput}
            selectionColor={palette.accent}
          />
          <View style={styles.itemEditActions}>
            <Pressable accessibilityRole="button" onPress={() => void remove(item)} style={styles.itemActionButton}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={cancelEdit} style={styles.itemActionButton}>
              <Text style={styles.mutedActionText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void saveItemEdit(item)} style={[styles.itemActionButton, styles.itemSaveButton]}>
              <Text style={styles.itemSaveText}>Done</Text>
            </Pressable>
          </View>
        </View>
      );
    }

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
            {item.checked ? <Icon name="check" size={15} color={palette.onAccent} strokeWidth={2.8} /> : null}
          </View>
          <ChecklistItemLabel text={item.text} checked={item.checked} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.text || 'list item'}`}
          onPress={() => beginEdit(item)}
          style={({ pressed }) => [styles.editItemButton, pressed && styles.pressed]}
        >
          <Icon name="pen" size={18} color={palette.faint} />
        </Pressable>
      </View>
    );
  };

  const { done, total } = checklistProgress(note.items);

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
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        style={styles.itemsScroll}
        containerStyle={styles.itemsScroll}
        contentContainerStyle={[styles.itemsContent, keyboardVisible && styles.itemsContentKeyboard]}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index - 120), animated: true });
        }}
        ListHeaderComponent={total > 0 ? (
          <View style={styles.listProgress}>
            <View style={styles.listProgressTop}>
              <Text style={styles.listProgressText} accessibilityLabel={`${done} of ${total} items done`}>
                {done === total ? `All ${total} done` : `${done} of ${total} done`}
              </Text>
              {done > 0 ? (
                <>
                  <Pressable accessibilityRole="button" accessibilityLabel="Uncheck all items" onPress={() => void uncheckAll()} style={({ pressed }) => [styles.listProgressAction, pressed && styles.pressed]}>
                    <Text style={styles.listProgressActionText}>Uncheck all</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Remove completed items" onPress={confirmClearChecked} style={({ pressed }) => [styles.listProgressAction, pressed && styles.pressed]}>
                    <Text style={styles.listProgressActionText}>Clear done</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
            <ProgressBar value={done / total} />
            {total < 4 ? (
              <Text style={styles.listHint}>Tap an item to tick it off. Hold to reorder. Use the pencil to edit.</Text>
            ) : null}
          </View>
        ) : undefined}
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
