import { Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from './BackButton';
import type { AppPreferences } from './types';
import { getThemeMode, palette, setThemeMode } from './theme';
import type { NotificationPermission } from './notifications';

interface SettingsModalProps {
  visible: boolean;
  preferences: AppPreferences;
  permission: NotificationPermission;
  onClose: () => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onReminderSettingChange: (enabled: boolean) => void;
}

export function SettingsModal({
  visible,
  preferences,
  permission,
  onClose,
  onPreferencesChange,
  onReminderSettingChange,
}: SettingsModalProps) {

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
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerAction} />
        </View>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>APPEARANCE</Text>
          <Text style={styles.preferenceTitle}>App theme</Text>
          <Text style={styles.preferenceDescription}>Choose a consistent light or dark look across the app.</Text>
          <View style={styles.themeChoices}>
            {(['light', 'dark'] as const).map((mode) => (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected: preferences.themeMode === mode }}
                onPress={() => onPreferencesChange({ ...preferences, themeMode: mode })}
                style={[styles.themeChoice, preferences.themeMode === mode && styles.themeChoiceSelected]}
              >
                <Text style={[styles.themeChoiceText, preferences.themeMode === mode && styles.themeChoiceTextSelected]}>
                  {mode === 'light' ? '☀  Light' : '☾  Dark'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.sectionRule} />
          <Text style={styles.eyebrow}>REMINDERS</Text>
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
            <Switch
              accessibilityLabel="Enable reminder notifications"
              value={preferences.remindersEnabled}
              onValueChange={onReminderSettingChange}
              trackColor={{ false: palette.line, true: palette.accentSoft }}
              thumbColor={preferences.remindersEnabled ? palette.accent : '#FFFFFF'}
            />
          </View>
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Notification permission</Text>
            <Text style={styles.permissionDescription}>
                {!permission.granted
                  ? permission.canAskAgain
                    ? 'Not allowed yet. You can allow it when saving a reminder.'
                    : 'Blocked by Android or iOS settings. Reminders will not alert you until permission is restored.'
                  : permission.channelEnabled === false
                    ? 'Blocked for the Reminders channel in Android notification settings.'
                    : 'Allowed on this device.'}
            </Text>
            {!permission.granted || permission.channelEnabled === false ? (
              <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.systemSettingsButton}>
                <Text style={styles.systemSettingsText}>Open system settings</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.sectionRule} />
          <Text style={styles.eyebrow}>NOTES</Text>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Highlight pinned notes</Text>
              <Text style={styles.preferenceDescription}>Give pinned notes a subtle accent on the home screen.</Text>
            </View>
            <Switch
              accessibilityLabel="Highlight pinned notes"
              value={preferences.highlightPinnedNotes}
              onValueChange={(highlightPinnedNotes) => onPreferencesChange({ ...preferences, highlightPinnedNotes })}
              trackColor={{ false: palette.line, true: palette.accentSoft }}
              thumbColor={preferences.highlightPinnedNotes ? palette.accent : '#FFFFFF'}
            />
          </View>

          <View style={styles.sectionRule} />
          <Text style={styles.eyebrow}>EDITOR</Text>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Show formatting toolbar</Text>
              <Text style={styles.preferenceDescription}>Show font, size, text style, colour, checklist and image controls in Quick and Custom Notes.</Text>
            </View>
            <Switch
              accessibilityLabel="Show formatting toolbar in notes"
              value={preferences.quickNoteToolbarMode === 'advanced'}
              onValueChange={(enabled) => onPreferencesChange({
                ...preferences,
                quickNoteToolbarMode: enabled ? 'advanced' : 'simple',
              })}
              trackColor={{ false: palette.line, true: palette.accentSoft }}
              thumbColor={preferences.quickNoteToolbarMode === 'advanced' ? palette.accent : palette.surface}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  header: { minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerAction: { minWidth: 88, minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: palette.ink, fontSize: 19, fontWeight: '700' },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 36, gap: 0 },
  eyebrow: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginBottom: 13 },
  preferenceRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14 },
  preferenceCopy: { flex: 1 },
  themeChoices: { flexDirection: 'row', gap: 10, marginTop: 12 },
  themeChoice: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  themeChoiceSelected: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  themeChoiceText: { color: palette.muted, fontSize: 14, fontWeight: '600' },
  themeChoiceTextSelected: { color: palette.accent, fontWeight: '700' },
  preferenceTitle: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  preferenceDescription: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  permissionCard: { padding: 15, marginTop: 12, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  permissionTitle: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  permissionDescription: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  systemSettingsButton: { alignSelf: 'flex-start', minHeight: 48, marginTop: 12, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 11, backgroundColor: palette.accentSoft },
  systemSettingsText: { color: palette.accent, fontSize: 13, fontWeight: '700' },
  sectionRule: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginTop: 24, marginBottom: 24 },
  timeButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, marginTop: 12, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  timeButtonText: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  timeButtonHint: { color: palette.accent, fontSize: 13, fontWeight: '600' },
  smallNote: { color: palette.faint, fontSize: 12, marginTop: 10 },
  pressed: { opacity: 0.72 },
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
