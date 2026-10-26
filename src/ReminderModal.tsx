import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useRef, useState } from 'react';
import {
  Alert, Linking, Modal, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from './BackButton';
import type { NotesRepository } from './repository';
import { createReminder, dateAtTime, nextAfterWorkDate, selectPrimaryNoteReminder } from './model';
import { cancelReminderNotifications, checkNotificationPermission, requestNotificationPermission, syncReminderNotification } from './notifications';
import type { AppPreferences, Note, Reminder } from './types';
import type { NotificationPermission } from './notifications';

const palette = {
  background: '#F7F6F1', surface: '#FFFFFF', ink: '#242923', muted: '#74796F',
  faint: '#9A9D95', line: '#E7E7DF', accent: '#366A52', accentSoft: '#E8F0E9', danger: '#A0443A',
};

interface ReminderModalProps {
  repository: NotesRepository;
  visible: boolean;
  note: Note | null;
  reminders: Reminder[];
  preferences: AppPreferences;
  permission: NotificationPermission;
  onClose: () => void;
  onRemindersChanged: () => void;
  onPermissionChanged: (permission: NotificationPermission) => void;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function mergeDateTime(current: Date, chosen: Date, mode: 'date' | 'time'): Date {
  const next = new Date(current);
  if (mode === 'date') next.setFullYear(chosen.getFullYear(), chosen.getMonth(), chosen.getDate());
  else next.setHours(chosen.getHours(), chosen.getMinutes(), 0, 0);
  return next;
}

export function ReminderModal({
  repository, visible, note, reminders, preferences, permission,
  onClose, onRemindersChanged, onPermissionChanged,
}: ReminderModalProps) {
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => nextAfterWorkDate(new Date(), preferences.afterWorkTime) ?? new Date(Date.now() + 3_600_000));
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const listedReminders = useMemo(() => {
    if (note) {
      const primary = selectPrimaryNoteReminder(reminders, note.id);
      return primary ? [primary] : [];
    }
    return reminders
      .filter((reminder) => reminder.noteId === null)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
  }, [reminders, note]);

  const openNewReminder = () => {
    const initial = nextAfterWorkDate(new Date(), preferences.afterWorkTime) ?? new Date(Date.now() + 3_600_000);
    setEditingReminder(null);
    setTitle(note ? `Don't forget to check ${note.title}.` : '');
    setScheduledDate(initial);
    setCreating(true);
  };

  const openExistingReminder = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setTitle(reminder.title);
    setScheduledDate(new Date(reminder.scheduledAt));
    setCreating(true);
  };

  const closeComposer = () => {
    setCreating(false);
    setEditingReminder(null);
    setPickerMode(null);
  };

  const commitReminder = async (allowNotifications: boolean) => {
    if (busyRef.current) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Add a reminder message', 'Write what you want to remember.');
      return;
    }
    if (note && !editingReminder && listedReminders.length > 0) {
      Alert.alert('Reminder already set', 'This note already has a reminder. Edit or delete it first.');
      return;
    }
    if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
      Alert.alert('Choose a future time', 'This reminder time has already passed.');
      return;
    }

    busyRef.current = true;
    setBusy(true);
    let permissionState = permission;
    try {
      if (allowNotifications && preferences.remindersEnabled) {
        permissionState = await requestNotificationPermission();
        onPermissionChanged(permissionState);
      }
      const now = Date.now();
      const reminder: Reminder = editingReminder
        ? {
            ...editingReminder,
            title: trimmedTitle,
            scheduledAt: scheduledDate.getTime(),
            checklistItemId: note ? null : editingReminder.checklistItemId,
            updatedAt: now,
          }
        : createReminder(trimmedTitle, scheduledDate.getTime(), {
            noteId: note?.id ?? null,
            now,
          });

      await repository.saveReminder({ ...reminder, notificationId: null });
      let notificationId: string | null = null;
      try {
        notificationId = await syncReminderNotification(reminder, preferences.remindersEnabled, true, note?.title);
      } catch {
        notificationId = null;
      }
      await repository.saveReminder({ ...reminder, notificationId });
      onRemindersChanged();
      closeComposer();
      if (reminder.enabled && preferences.remindersEnabled && !notificationId) {
        const latestPermission = await checkNotificationPermission();
        onPermissionChanged(latestPermission);
        if (!latestPermission.granted) {
          Alert.alert(
            'Reminder saved without an alert',
            latestPermission.canAskAgain
              ? 'Allow notifications in Settings to receive this reminder.'
              : 'Notification permission is blocked. Open Settings to allow reminders.',
            latestPermission.canAskAgain
              ? [{ text: 'OK' }]
              : [{ text: 'Later', style: 'cancel' }, { text: 'Open settings', onPress: () => void Linking.openSettings() }],
          );
        } else {
          Alert.alert('Reminder saved', 'The reminder was saved, but the notification could not be scheduled on this device.');
        }
      }
    } catch {
      Alert.alert('Could not save reminder', 'Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const saveFromComposer = () => {
    if (busyRef.current) return;
    if (preferences.remindersEnabled && !permission.granted) {
      const allowAction = permission.canAskAgain
        ? { text: 'Allow notifications', onPress: () => void commitReminder(true) }
        : { text: 'Open settings', onPress: () => void Linking.openSettings() };
      Alert.alert(
        'Allow reminder notifications?',
        'Frictionless Notes needs notification permission to alert you at this time. You can save the reminder without alerts too.',
        [
          { text: 'Save without alerts', onPress: () => void commitReminder(false) },
          allowAction,
        ],
      );
    } else {
      void commitReminder(false);
    }
  };

  const applyReminderToggle = async (reminder: Reminder, enabled: boolean, requestPermission = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (requestPermission) onPermissionChanged(await requestNotificationPermission());
      const next = { ...reminder, enabled, updatedAt: Date.now() };
      await repository.saveReminder({ ...next, notificationId: enabled ? reminder.notificationId : null });
      const notificationId = await syncReminderNotification(next, preferences.remindersEnabled, enabled, note?.title);
      await repository.saveReminder({ ...next, notificationId });
      onRemindersChanged();
      if (enabled && preferences.remindersEnabled && !notificationId) {
        const nextPermission = await checkNotificationPermission();
        onPermissionChanged(nextPermission);
        Alert.alert(
          nextPermission.granted ? 'Could not schedule reminder' : 'Reminder enabled without an alert',
          nextPermission.granted
            ? 'The reminder is saved, but this device could not schedule the notification.'
            : 'Notification permission is unavailable. Allow it in system settings to receive alerts.',
          nextPermission.granted || nextPermission.canAskAgain
            ? [{ text: 'OK' }]
            : [{ text: 'Later', style: 'cancel' }, { text: 'Open settings', onPress: () => void Linking.openSettings() }],
        );
      }
    } catch {
      Alert.alert('Could not update reminder', 'Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const toggleReminder = (reminder: Reminder, enabled: boolean) => {
    if (enabled && preferences.remindersEnabled && !permission.granted) {
      const allowAction = permission.canAskAgain
        ? { text: 'Allow notifications', onPress: () => void applyReminderToggle(reminder, true, true) }
        : {
            text: 'Enable and open settings',
            onPress: () => void (async () => {
              await applyReminderToggle(reminder, true);
              await Linking.openSettings();
            })(),
          };
      Alert.alert(
        'Allow reminder notifications?',
        'Frictionless Notes needs notification permission to alert you at the reminder time. You can enable the saved reminder without alerts too.',
        [
          { text: 'Keep disabled', style: 'cancel' },
          { text: 'Enable without alerts', onPress: () => void applyReminderToggle(reminder, true) },
          allowAction,
        ],
      );
      return;
    }
    void applyReminderToggle(reminder, enabled);
  };

  const deleteReminder = (reminder: Reminder) => {
    Alert.alert('Delete reminder?', 'This will remove the saved reminder from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => void (async () => {
          try {
            const remindersToDelete = note
              ? reminders.filter((candidate) => candidate.noteId === note.id)
              : [reminder];
            await Promise.allSettled(remindersToDelete.map((candidate) => cancelReminderNotifications(candidate)));
            await Promise.all(remindersToDelete.map((candidate) => repository.removeReminder(candidate.id)));
            onRemindersChanged();
          } catch {
            Alert.alert('Could not delete reminder', 'Please try again.');
          }
        })(),
      },
    ]);
  };

  const choosePreset = (kind: 'later' | 'tomorrow' | 'after-work') => {
    const now = new Date();
    if (kind === 'after-work') {
      const next = nextAfterWorkDate(now, preferences.afterWorkTime);
      if (next) setScheduledDate(next);
      return;
    }
    if (kind === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const atAfterWork = dateAtTime(tomorrow, preferences.afterWorkTime);
      if (atAfterWork) setScheduledDate(atAfterWork);
      return;
    }
    const afterWorkToday = dateAtTime(now, preferences.afterWorkTime);
    setScheduledDate(afterWorkToday && afterWorkToday.getTime() > now.getTime() + 60_000
      ? afterWorkToday
      : new Date(now.getTime() + 60 * 60_000));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={creating ? closeComposer : onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <BackButton
            label={creating ? 'Reminders' : 'Note'}
            accessibilityLabel={creating ? 'Back to reminders' : 'Back to note'}
            onPress={creating ? closeComposer : onClose}
            style={styles.headerAction}
          />
          <Text style={styles.headerTitle}>{creating ? 'Reminder' : 'Reminders'}</Text>
          {creating ? (
            <Pressable accessibilityRole="button" onPress={saveFromComposer} disabled={busy} style={styles.headerActionRight}>
              <Text style={[styles.headerActionText, busy && styles.dimmed]}>{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          ) : <View style={styles.headerActionRight} />}
        </View>

        {creating ? (
          <ScrollView contentContainerStyle={styles.composer} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>{note ? 'NOTE REMINDER' : 'QUICK REMINDER'}</Text>
            <TextInput
              accessibilityLabel="Reminder message"
              value={title}
              onChangeText={setTitle}
              placeholder="What should you remember?"
              placeholderTextColor={palette.faint}
              returnKeyType="done"
              style={styles.messageInput}
              maxLength={180}
            />
            <Text style={styles.sectionTitle}>Quick time</Text>
            <View style={styles.presetRow}>
              <PresetButton title="Later today" onPress={() => choosePreset('later')} />
              <PresetButton title="Tomorrow" onPress={() => choosePreset('tomorrow')} />
            </View>
            <PresetButton title={`After work · ${preferences.afterWorkTime}`} onPress={() => choosePreset('after-work')} wide />

            <Text style={styles.sectionTitle}>Date and time</Text>
            <View style={styles.dateTimeRow}>
              <Pressable accessibilityRole="button" onPress={() => setPickerMode('date')} style={styles.dateTimeButton}>
                <Text style={styles.dateTimeCaption}>DATE</Text>
                <Text style={styles.dateTimeValue}>{formatDate(scheduledDate)}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setPickerMode('time')} style={styles.dateTimeButton}>
                <Text style={styles.dateTimeCaption}>TIME</Text>
                <Text style={styles.dateTimeValue}>{formatTime(scheduledDate)}</Text>
              </Pressable>
            </View>
            {pickerMode ? (
              <DateTimePicker
                value={scheduledDate}
                mode={pickerMode}
                display="default"
                minimumDate={pickerMode === 'date' ? new Date() : undefined}
                onChange={(_, chosen) => {
                  const mode = pickerMode;
                  setPickerMode(null);
                  if (chosen && mode) setScheduledDate((current) => mergeDateTime(current, chosen, mode));
                }}
              />
            ) : null}
            <Text style={styles.scheduleHint}>Uses your device’s local time. Notifications can be delayed by Android battery settings.</Text>
            {editingReminder ? (
              <View style={styles.enableRow}>
                <View style={styles.enableCopy}>
                  <Text style={styles.sectionTitle}>Reminder enabled</Text>
                  <Text style={styles.scheduleHint}>Turn this off to keep the reminder without scheduling an alert.</Text>
                </View>
                <Switch
                  accessibilityLabel="Enable this reminder"
                  value={editingReminder.enabled}
                  onValueChange={(enabled) => setEditingReminder({ ...editingReminder, enabled })}
                  trackColor={{ false: '#D7D9D2', true: '#AFC8B7' }}
                  thumbColor={editingReminder.enabled ? palette.accent : '#FFFFFF'}
                />
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <View style={styles.manager}>
            <Text style={styles.contextTitle}>{note?.title || 'Quick reminders'}</Text>
            <Text style={styles.contextDescription}>
              {listedReminders.length ? 'Saved on this device.' : 'Add a reminder when you want a nudge.'}
            </Text>
            {(!permission.granted || permission.channelEnabled === false) && preferences.remindersEnabled && listedReminders.some((reminder) => reminder.enabled) ? (
              <View style={styles.permissionBanner}>
                <Text style={styles.permissionBannerText}>
                  {!permission.granted
                    ? 'Notifications are not allowed, so enabled reminders cannot alert you.'
                    : 'Notifications are blocked for the Reminders channel in Android settings, so enabled reminders cannot alert you.'}
                </Text>
                {!permission.canAskAgain || permission.channelEnabled === false ? (
                  <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
                    <Text style={styles.permissionLink}>Open system settings</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {!preferences.remindersEnabled ? (
              <View style={styles.permissionBanner}>
                <Text style={styles.permissionBannerText}>Reminder notifications are disabled in Settings.</Text>
              </View>
            ) : null}
            <ScrollView style={styles.reminderList} contentContainerStyle={listedReminders.length ? styles.reminderListContent : styles.reminderEmptyContent}>
              {listedReminders.map((reminder) => {
                const expired = reminder.scheduledAt <= Date.now();
                const stateLabel = !reminder.enabled
                  ? 'Disabled'
                  : !preferences.remindersEnabled
                    ? 'Global reminders are off'
                    : !permission.granted
                      ? 'Permission needed'
                    : permission.channelEnabled === false
                      ? 'Blocked in Android settings'
                      : expired
                        ? 'Past time — edit to reschedule'
                        : 'Enabled';
                return (
                  <View key={reminder.id} style={styles.reminderCard}>
                    <View style={styles.reminderCardTop}>
                      <Pressable accessibilityRole="button" onPress={() => openExistingReminder(reminder)} style={styles.reminderCopy}>
                        <Text style={styles.reminderTitle}>{reminder.title}</Text>
                        <Text style={styles.reminderDate}>{formatDateTime(reminder.scheduledAt)}</Text>
                        <Text style={[styles.reminderStatus, !reminder.enabled && styles.disabledStatus]}>{stateLabel}</Text>
                      </Pressable>
                      <Switch
                        accessibilityLabel={`${reminder.enabled ? 'Disable' : 'Enable'} reminder ${reminder.title}`}
                        value={reminder.enabled}
                        onValueChange={(enabled) => void toggleReminder(reminder, enabled)}
                        disabled={busy}
                        trackColor={{ false: '#D7D9D2', true: '#AFC8B7' }}
                        thumbColor={reminder.enabled ? palette.accent : '#FFFFFF'}
                      />
                    </View>
                    <View style={styles.reminderActions}>
                      <Pressable accessibilityRole="button" onPress={() => openExistingReminder(reminder)} style={styles.reminderAction}>
                        <Text style={styles.reminderActionText}>Edit</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => deleteReminder(reminder)} style={styles.reminderAction}>
                        <Text style={styles.deleteActionText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              {!listedReminders.length ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No reminders yet</Text>
                  <Text style={styles.contextDescription}>Your note and list items stay exactly as they are until you add one.</Text>
                </View>
              ) : null}
            </ScrollView>
            {!note || listedReminders.length === 0 ? (
              <Pressable accessibilityRole="button" onPress={openNewReminder} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                <Text style={styles.addButtonText}>＋ Add reminder</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function PresetButton({ title, onPress, wide = false }: { title: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.presetButton, wide && styles.presetButtonWide, pressed && styles.pressed]}>
      <Text style={styles.presetButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  header: { minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerAction: { minWidth: 88, minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  headerActionRight: { minWidth: 88, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
  headerActionText: { color: palette.accent, fontSize: 15, fontWeight: '700' },
  headerTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  manager: { flex: 1, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 18 },
  contextTitle: { color: palette.ink, fontSize: 19, fontWeight: '700' },
  contextDescription: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  permissionBanner: { padding: 13, marginTop: 14, borderRadius: 13, backgroundColor: '#F4EBDD' },
  permissionBannerText: { color: '#77572D', fontSize: 13, lineHeight: 19 },
  permissionLink: { color: palette.accent, fontSize: 13, fontWeight: '700', marginTop: 8 },
  reminderList: { flex: 1, marginTop: 14 },
  reminderListContent: { paddingBottom: 16 },
  reminderEmptyContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 18 },
  reminderCard: { padding: 15, marginBottom: 10, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  reminderCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminderCopy: { flex: 1, minHeight: 54, justifyContent: 'center' },
  reminderTitle: { color: palette.ink, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  reminderDate: { color: palette.muted, fontSize: 12, marginTop: 4 },
  reminderStatus: { color: palette.accent, fontSize: 11, fontWeight: '700', marginTop: 6 },
  disabledStatus: { color: palette.muted },
  reminderActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 5 },
  reminderAction: { minWidth: 62, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  reminderActionText: { color: palette.accent, fontSize: 13, fontWeight: '700' },
  deleteActionText: { color: palette.danger, fontSize: 13, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingHorizontal: 18 },
  emptyTitle: { color: palette.ink, fontSize: 17, fontWeight: '700', marginBottom: 3 },
  addButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: palette.accent },
  addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  composer: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 36 },
  eyebrow: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginBottom: 8 },
  messageInput: { minHeight: 52, color: palette.ink, fontSize: 18, paddingHorizontal: 13, borderRadius: 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  sectionTitle: { color: palette.ink, fontSize: 14, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  presetRow: { flexDirection: 'row', gap: 9, marginBottom: 9 },
  presetButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderRadius: 13, backgroundColor: palette.accentSoft },
  presetButtonWide: { flex: 0, alignSelf: 'stretch', marginBottom: 3 },
  presetButtonText: { color: palette.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  dateTimeRow: { flexDirection: 'row', gap: 9 },
  dateTimeButton: { flex: 1, minHeight: 65, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  dateTimeCaption: { color: palette.faint, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  dateTimeValue: { color: palette.ink, fontSize: 15, fontWeight: '600', marginTop: 5 },
  scheduleHint: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 11 },
  enableRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22, gap: 12 },
  enableCopy: { flex: 1 },
  dimmed: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
