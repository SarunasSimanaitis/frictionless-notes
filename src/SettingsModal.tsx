import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import appConfig from '../app.json';
import { BackButton } from './BackButton';
import { APP_NAME } from './brand';
import { dateAtTime } from './model';
import type { AppPreferences, ThemePreference } from './types';
import { getThemeMode, palette, setThemeMode } from './theme';
import type { NotificationPermission } from './notifications';
import { Icon } from './ui/Icon';
import { ThemedSwitch } from './ui/ThemedSwitch';

interface SettingsModalProps {
  visible: boolean;
  preferences: AppPreferences;
  permission: NotificationPermission;
  onClose: () => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onReminderSettingChange: (enabled: boolean) => void;
  /** Turning App lock on or off is confirmed with the device lock first. */
  onAppLockChange: (enabled: boolean) => void;
}

const themeLabels: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function SettingsModal({
  visible,
  preferences,
  permission,
  onClose,
  onPreferencesChange,
  onReminderSettingChange,
  onAppLockChange,
}: SettingsModalProps) {
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const afterWorkDate = dateAtTime(new Date(), preferences.afterWorkTime) ?? new Date();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <BackButton
            label="Notes"
            accessibilityLabel="Back to notes"
            onPress={onClose}
            style={styles.headerAction}
          />
          <Text style={styles.headerTitle} accessibilityRole="header">Settings</Text>
          <View style={styles.headerAction} />
        </View>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>Appearance</Text>
          <Text style={styles.preferenceTitle}>Theme</Text>
          <View style={styles.themeChoices} accessibilityRole="radiogroup">
            {(Object.keys(themeLabels) as ThemePreference[]).map((mode) => (
              <Pressable
                key={mode}
                accessibilityRole="radio"
                accessibilityLabel={`${themeLabels[mode]} theme`}
                accessibilityState={{ selected: preferences.themeMode === mode }}
                onPress={() => onPreferencesChange({ ...preferences, themeMode: mode })}
                style={[styles.themeChoice, preferences.themeMode === mode && styles.themeChoiceSelected]}
              >
                <Text style={[styles.themeChoiceText, preferences.themeMode === mode && styles.themeChoiceTextSelected]}>
                  {themeLabels[mode]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.preferenceDescription}>System follows your phone’s light or dark mode.</Text>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Highlight pinned notes</Text>
              <Text style={styles.preferenceDescription}>Give pinned notes a soft tint on the home screen.</Text>
            </View>
            <ThemedSwitch
              label="Highlight pinned notes"
              value={preferences.highlightPinnedNotes}
              onValueChange={(highlightPinnedNotes) => onPreferencesChange({ ...preferences, highlightPinnedNotes })}
            />
          </View>

          <View style={styles.sectionRule} />
          <Text style={styles.sectionLabel}>Privacy and security</Text>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>App lock</Text>
              <Text style={styles.preferenceDescription}>Ask for your fingerprint, face or phone PIN when {APP_NAME} opens.</Text>
            </View>
            <ThemedSwitch label="App lock" value={preferences.appLockEnabled} onValueChange={onAppLockChange} />
          </View>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Hide notes outside the app</Text>
              <Text style={styles.preferenceDescription}>Block screenshots and blank the preview in the recent-apps view.</Text>
            </View>
            <ThemedSwitch
              label="Hide notes outside the app"
              value={preferences.screenPrivacy}
              onValueChange={(screenPrivacy) => onPreferencesChange({ ...preferences, screenPrivacy })}
            />
          </View>
          <View style={styles.infoCard}>
            <Icon name="lock" size={18} color={palette.muted} />
            <Text style={styles.infoCardText}>
              To lock a single note, open its ⋯ menu and choose Lock note. Notes are stored on this phone. There is no account, and the app never sends them anywhere.
            </Text>
          </View>

          <View style={styles.sectionRule} />
          <Text style={styles.sectionLabel}>Editor</Text>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Formatting in quick notes</Text>
              <Text style={styles.preferenceDescription}>Show the toolbar for fonts, colours, lists, checklists and images in quick notes. Custom notes always have it.</Text>
            </View>
            <ThemedSwitch
              label="Show formatting toolbar in quick notes"
              value={preferences.quickNoteToolbarMode === 'advanced'}
              onValueChange={(enabled) => onPreferencesChange({
                ...preferences,
                quickNoteToolbarMode: enabled ? 'advanced' : 'simple',
              })}
            />
          </View>

          <View style={styles.sectionRule} />
          <Text style={styles.sectionLabel}>Reminders</Text>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Reminder notifications</Text>
              <Text style={styles.preferenceDescription}>
                {!permission.granted
                  ? 'Saved reminders stay here; notifications need permission.'
                  : permission.channelEnabled === false
                    ? 'Reminders are enabled, but the Reminders channel is blocked in Android settings.'
                    : 'Upcoming reminders can notify you.'}
              </Text>
            </View>
            <ThemedSwitch
              label="Enable reminder notifications"
              value={preferences.remindersEnabled}
              onValueChange={onReminderSettingChange}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`After work time, ${preferences.afterWorkTime}. Change`}
            onPress={() => setTimePickerOpen(true)}
            style={({ pressed }) => [styles.preferenceRow, pressed && styles.pressed]}
          >
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>After work</Text>
              <Text style={styles.preferenceDescription}>The time used by the “After work” reminder shortcut.</Text>
            </View>
            <Text style={styles.valueText}>{preferences.afterWorkTime}</Text>
            <Icon name="chevronRight" size={18} color={palette.faint} />
          </Pressable>
          {timePickerOpen ? (
            <DateTimePicker
              value={afterWorkDate}
              mode="time"
              display="spinner"
              onValueChange={(_, chosen) => {
                setTimePickerOpen(false);
                if (!chosen) return;
                const afterWorkTime = `${String(chosen.getHours()).padStart(2, '0')}:${String(chosen.getMinutes()).padStart(2, '0')}`;
                if (afterWorkTime !== preferences.afterWorkTime) onPreferencesChange({ ...preferences, afterWorkTime });
              }}
              onDismiss={() => setTimePickerOpen(false)}
            />
          ) : null}
          <View style={styles.infoCard}>
            <Icon name="bell" size={18} color={palette.muted} />
            <View style={styles.preferenceCopy}>
              <Text style={styles.infoCardText}>
                {!permission.granted
                  ? permission.canAskAgain
                    ? 'Notification permission: not allowed yet. You can allow it when saving a reminder.'
                    : 'Notification permission: blocked by Android or iOS settings. Reminders will not alert you until permission is restored.'
                  : permission.channelEnabled === false
                    ? 'Blocked for the Reminders channel in Android notification settings.'
                    : 'Notification permission: allowed on this device.'}
              </Text>
              {!permission.granted || permission.channelEnabled === false ? (
                <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.systemSettingsButton}>
                  <Text style={styles.systemSettingsText}>Open system settings</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.sectionRule} />
          <Text style={styles.aboutText}>{APP_NAME} {appConfig.expo.version}</Text>
          <Text style={styles.aboutText}>Works offline. No account, no ads, no tracking.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  header: { minHeight: 52, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  headerAction: { minWidth: 88, minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },
  sectionLabel: { color: palette.muted, fontSize: 13, fontWeight: '600', marginBottom: 12 },
  preferenceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  preferenceCopy: { flex: 1 },
  themeChoices: { flexDirection: 'row', gap: 4, marginTop: 10, padding: 4, borderRadius: 12, backgroundColor: palette.field },
  themeChoice: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  themeChoiceSelected: { backgroundColor: palette.background },
  themeChoiceText: { color: palette.muted, fontSize: 14, fontWeight: '600' },
  themeChoiceTextSelected: { color: palette.ink, fontWeight: '700' },
  preferenceTitle: { color: palette.ink, fontSize: 16, fontWeight: '500' },
  preferenceDescription: { color: palette.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  valueText: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  infoCard: { flexDirection: 'row', gap: 10, padding: 14, marginTop: 8, borderRadius: 12, backgroundColor: palette.field },
  infoCardText: { flex: 1, color: palette.muted, fontSize: 13, lineHeight: 19 },
  systemSettingsButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  systemSettingsText: { color: palette.accent, fontSize: 14, fontWeight: '700' },
  sectionRule: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginTop: 20, marginBottom: 20, marginHorizontal: -16 },
  aboutText: { color: palette.faint, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.6 },
});

const originalThemeMode = getThemeMode();
setThemeMode('light');
const lightStyles = createStyles();
setThemeMode('dark');
const darkStyles = createStyles();
setThemeMode(originalThemeMode);
const styles = new Proxy(lightStyles, {
  get(_target, property) {
    return Reflect.get(getThemeMode() === 'dark' ? darkStyles : lightStyles, property);
  },
}) as typeof lightStyles;
