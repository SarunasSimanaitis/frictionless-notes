import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { findDuplicateReminderNotificationIds, findMappedReminderNotification, shouldScheduleReminder } from './model';
import type { Reminder } from './types';

export interface NotificationPermission {
  granted: boolean;
  canAskAgain: boolean;
  /** Android users can block the app's reminder channel without revoking app permission. */
  channelEnabled: boolean | null;
}

const reminderOperationQueues = new Map<string, Promise<unknown>>();

function enqueueReminderOperation<T>(reminderId: string, operation: () => Promise<T>): Promise<T> {
  const previous = reminderOperationQueues.get(reminderId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  reminderOperationQueues.set(reminderId, current);
  void current.then(
    () => { if (reminderOperationQueues.get(reminderId) === current) reminderOperationQueues.delete(reminderId); },
    () => { if (reminderOperationQueues.get(reminderId) === current) reminderOperationQueues.delete(reminderId); },
  );
  return current;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180],
    lightColor: '#366A52',
  });
}

export async function checkNotificationPermission(): Promise<NotificationPermission> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    let channelEnabled: boolean | null = null;
    if (Platform.OS === 'android') {
      try {
        const channel = await Notifications.getNotificationChannelAsync('reminders');
        if (channel) channelEnabled = channel.importance !== Notifications.AndroidImportance.NONE;
      } catch {
        // Keep the app-level permission result when channel inspection is unavailable.
      }
    }
    return { granted: permission.granted, canAskAgain: permission.canAskAgain, channelEnabled };
  } catch {
    return { granted: false, canAskAgain: false, channelEnabled: null };
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  try {
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    }
    return await checkNotificationPermission();
  } catch {
    return { granted: false, canAskAgain: false, channelEnabled: null };
  }
}

async function cancelReminderNotificationsNow(reminder: Reminder): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ids = new Set<string>();
  if (reminder.notificationId) ids.add(reminder.notificationId);
  for (const notification of scheduled) {
    if (notification.content.data?.reminderId === reminder.id) ids.add(notification.identifier);
  }
  await Promise.all([...ids].map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

export function cancelReminderNotifications(reminder: Reminder): Promise<void> {
  return enqueueReminderOperation(reminder.id, () => cancelReminderNotificationsNow(reminder));
}

async function syncReminderNotificationNow(
  reminder: Reminder,
  globallyEnabled: boolean,
  forceReschedule = false,
  noteTitle?: string,
): Promise<string | null> {
  const shouldSchedule = shouldScheduleReminder(reminder, globallyEnabled, true);
  if (!shouldSchedule) {
    await cancelReminderNotificationsNow(reminder);
    return null;
  }

  const permission = await checkNotificationPermission();
  if (!permission.granted) {
    await cancelReminderNotificationsNow(reminder);
    return null;
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const notificationTitle = reminder.noteId && noteTitle ? noteTitle : 'Frictionless Notes';
  const mappedNotificationId = findMappedReminderNotification(reminder, scheduled.map((notification) => ({
    identifier: notification.identifier,
    reminderId: typeof notification.content.data?.reminderId === 'string'
      ? notification.content.data.reminderId
      : null,
    title: notification.content.title ?? '',
    body: notification.content.body ?? '',
  })), { title: notificationTitle, body: reminder.title });

  if (!forceReschedule && mappedNotificationId) {
    const duplicateIds = findDuplicateReminderNotificationIds(reminder.id, scheduled.map((notification) => ({
      identifier: notification.identifier,
      reminderId: typeof notification.content.data?.reminderId === 'string'
        ? notification.content.data.reminderId
        : null,
    })), mappedNotificationId);
    await Promise.all(duplicateIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    return mappedNotificationId;
  }
  await cancelReminderNotificationsNow(reminder);
  await ensureAndroidChannel();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: notificationTitle,
      body: reminder.title,
      sound: true,
      data: { reminderId: reminder.id, noteId: reminder.noteId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.scheduledAt,
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  });
}

export function syncReminderNotification(
  reminder: Reminder,
  globallyEnabled: boolean,
  forceReschedule = false,
  noteTitle?: string,
): Promise<string | null> {
  return enqueueReminderOperation(reminder.id, () =>
    syncReminderNotificationNow(reminder, globallyEnabled, forceReschedule, noteTitle),
  );
}
