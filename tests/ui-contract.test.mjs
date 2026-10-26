import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const homeScreenSource = readFileSync(new URL('../src/screens/HomeScreen.tsx', import.meta.url), 'utf8');
const noteEditorSource = readFileSync(new URL('../src/screens/NoteEditorScreen.tsx', import.meta.url), 'utf8');
const backButtonSource = readFileSync(new URL('../src/BackButton.tsx', import.meta.url), 'utf8');
const checklistEditorSource = readFileSync(new URL('../src/lists/ChecklistEditor.tsx', import.meta.url), 'utf8');
const noteLabelsSource = readFileSync(new URL('../src/noteLabels.ts', import.meta.url), 'utf8');
const repositorySource = readFileSync(new URL('../src/repository.ts', import.meta.url), 'utf8');
const localRepositorySource = readFileSync(new URL('../src/localNotesRepository.ts', import.meta.url), 'utf8');
const documentEditorSource = readFileSync(new URL('../src/editor/DocumentEditor.tsx', import.meta.url), 'utf8');
const textDocumentSource = documentEditorSource;
const embeddedChecklistSource = documentEditorSource.slice(documentEditorSource.indexOf('function EmbeddedChecklistEditor'));
const stylesSource = readFileSync(new URL('../src/styles.ts', import.meta.url), 'utf8');
const customNoteCssSource = readFileSync(new URL('../src/editor/customNoteCss.ts', import.meta.url), 'utf8');
const reminderSource = readFileSync(new URL('../src/ReminderModal.tsx', import.meta.url), 'utf8');
const notificationSource = readFileSync(new URL('../src/notifications.ts', import.meta.url), 'utf8');
const databaseSource = readFileSync(new URL('../src/database.ts', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8');
const metroSource = readFileSync(new URL('../metro.config.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const logBoxSource = readFileSync(new URL('../src/logbox.ts', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/SettingsModal.tsx', import.meta.url), 'utf8');
const reminderModalSource = readFileSync(new URL('../src/ReminderModal.tsx', import.meta.url), 'utf8');
const topicShimSource = readFileSync(new URL('../src/shims/TopicSubscriptionModule.android.ts', import.meta.url), 'utf8');
const topicSubscriptionSource = readFileSync(new URL('../node_modules/expo-notifications/src/topicSubscription.ts', import.meta.url), 'utf8');
const appConfig = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const easConfig = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
const imageStorageSource = readFileSync(new URL('../src/noteImages.ts', import.meta.url), 'utf8');
const formattingToolbarSource = readFileSync(new URL('../src/editor/FormattingToolbar.tsx', import.meta.url), 'utf8');
const fontFormattingBridgeSource = readFileSync(new URL('../src/editor/fontFormattingBridge.ts', import.meta.url), 'utf8');
const editorViteConfigSource = readFileSync(new URL('../editor-web/vite.config.ts', import.meta.url), 'utf8');

test('the checklist input stays in a keyboard-aware flex layout below its independently scrolling list', () => {
  assert.equal(appConfig.expo.android.softwareKeyboardLayoutMode, 'resize');
  assert.match(noteEditorSource, /behavior=\{Platform\.OS === 'web' \? undefined : 'padding'\}/);
  assert.match(checklistEditorSource, /<DraggableFlatList[\s\S]*?data=\{note\.items\}[\s\S]*?style=\{styles\.itemsScroll\}/);
  assert.match(checklistEditorSource, /<Text style=\{\[styles\.checklistText,[\s\S]*?\{item\.text \|\| 'Empty item'\}/);
  assert.match(stylesSource, /itemsContent:\s*\{\s*flexGrow:\s*1/);
  assert.match(appSource, /<GestureHandlerRootView style=\{styles\.gestureRoot\}>/);
  assert.match(stylesSource, /gestureRoot:\s*\{\s*flex:\s*1/);
  assert.match(checklistEditorSource, /<View style=\{styles\.addItemBar\}>[\s\S]*?accessibilityLabel="New list item"/);
  assert.match(stylesSource, /itemsScroll:\s*\{\s*flex:\s*1/);
  assert.doesNotMatch(stylesSource, /addItemBar:\s*\{[^}]*position:\s*'absolute'/s);
  assert.doesNotMatch(noteEditorSource, /keyboardHeight|keyboardHeightOffset|keyboardDidShow/);
});

test('item submission keeps the input focused and accepts taps while the keyboard is open', () => {
  assert.match(checklistEditorSource, /keyboardShouldPersistTaps="always"/);
  assert.match(checklistEditorSource, /value=\{newItemText\}[\s\S]*?onChangeText=\{setNewItemText\}/);
  assert.match(checklistEditorSource, /onSubmitEditing=\{\(\{ nativeEvent \}\) => void addItem\(nativeEvent\.text \?\? newItemText\)\}[\s\S]*?submitBehavior="submit"/);
  assert.match(checklistEditorSource, /disabled=\{!canAddChecklistItem\(newItemText, adding\)\}/);
  assert.match(checklistEditorSource, /onPress=\{\(\) => void addItem\(newItemText\)\}/);
  assert.match(checklistEditorSource, /inputRef\.current\?\.focus\(\)/);
  assert.match(checklistEditorSource, /if \(!canAddChecklistItem\(text, addingRef\.current\)\) return/);
  assert.match(checklistEditorSource, /const item = createChecklistItem\(note\.id, text, nextChecklistItemPosition\(current\.items\)\)/);
  assert.match(checklistEditorSource, /await repository\.addChecklistItem\(item, next\.updatedAt\)/);
  assert.match(checklistEditorSource, /setNewItemText\(''\)/);
  const addRoutine = checklistEditorSource.slice(checklistEditorSource.indexOf('const addItem = async'));
  assert.ok(addRoutine.indexOf('onNoteChange(next)') < addRoutine.indexOf('await repository.addChecklistItem(item, next.updatedAt)'));
  assert.doesNotMatch(addRoutine.slice(0, addRoutine.indexOf('await repository.addChecklistItem(item, next.updatedAt)')), /await /);
});

test('checklists and shopping lists use the same item editor and row checks never enter text editing', () => {
  assert.match(noteEditorSource, /isDocumentNote\(note\.type\) \? \([\s\S]*?: \([\s\S]*?<ChecklistEditor/);
  assert.match(checklistEditorSource, /onPress=\{\(\) => void toggle\(item\.id\)\}/);
  assert.match(checklistEditorSource, /accessibilityLabel=\{`Edit \$\{item\.text \|\| 'list item'\}`\}[\s\S]*?onPress=\{\(\) => beginEdit\(item\)\}/);
});

test('standalone and embedded item edits and deletes preserve stable item identities', () => {
  assert.match(checklistEditorSource, /items: editChecklistItemText\(current\.items, item\.id, updatedItem\.text\)/);
  assert.match(checklistEditorSource, /items: removeChecklistItem\(current\.items, item\.id\)/);
  assert.match(checklistEditorSource, /await repository\.saveChecklistItem\(updatedItem, next\.updatedAt\)/);
  assert.match(checklistEditorSource, /await repository\.deleteChecklistItem\(item\.id, note\.id, next\.updatedAt\)/);
  assert.match(embeddedChecklistSource, /onItemsChange\(editChecklistItemText\(block\.items, item\.id, editingText\)\)/);
  assert.match(embeddedChecklistSource, /normalizeItemPositions\(removeChecklistItem\(block\.items, item\.id\)\)/);
});

test('Quick and Custom Notes stay distinct while sharing the structured offline document editor', () => {
  assert.match(noteLabelsSource, /custom: 'CUSTOM NOTE'/);
  assert.match(homeScreenSource, /label="Quick note"[\s\S]*?onCreate\('text'\)/);
  assert.match(homeScreenSource, /label="Blank custom note"[\s\S]*?onCreate\('custom', 'blank'\)/);
  assert.match(homeScreenSource, /label="Plan template"[\s\S]*?onCreate\('custom', 'plan'\)/);
  assert.match(homeScreenSource, /label="Journal template"[\s\S]*?onCreate\('custom', 'journal'\)/);
  assert.match(noteEditorSource, /isDocumentNote\(note\.type\) \? \(/);
  assert.match(noteEditorSource, /<TextDocumentEditor[\s\S]*?firstParagraphInputRef=\{bodyRef\}/);
  assert.match(schemaSource, /type TEXT NOT NULL CHECK \(type IN \('text', 'checklist', 'shopping'\)\)/);
  assert.match(schemaSource, /editor_mode TEXT NOT NULL DEFAULT 'quick'/);
  assert.match(schemaSource, /ALTER TABLE notes ADD COLUMN editor_mode TEXT NOT NULL DEFAULT 'quick'/);
  assert.match(databaseSource, /decodeNoteType\(row\.type, row\.editor_mode\)/);
  assert.match(databaseSource, /encodeNoteType\(note\.type\)/);
});

test('ordinary notes insert a checklist at the focused cursor and retain text as ordered blocks', () => {
  assert.match(noteEditorSource, /<TextDocumentEditor[\s\S]*?onBlocksChange=\{\(blocks\) => updateDraft\(\{ blocks \}\)\}/);
  assert.match(textDocumentSource, /accessibilityLabel="Insert checklist at the cursor"/);
  assert.match(formattingToolbarSource, /ActionOption label="Checklist" onPress=\{\(\) => \{ onInsertChecklist\(\)/);
  assert.match(textDocumentSource, /onSelectionChange=\{\(\{ nativeEvent \}\) =>/);
  assert.match(textDocumentSource, /insertChecklistBlockAtSelection\([\s\S]*?createId\(\),[\s\S]*?createId\(\),/);
  assert.match(textDocumentSource, /focusAfterInsert\.current = result\.focusParagraphId/);
  assert.match(textDocumentSource, /<NestableScrollContainer[\s\S]*?keyboardShouldPersistTaps="always"/);
  assert.match(textDocumentSource, /<EmbeddedChecklistEditor[\s\S]*?onItemsChange=/);
  assert.match(embeddedChecklistSource, /<NestableDraggableFlatList[\s\S]*?keyExtractor=\{\(item\) => item\.id\}/);
  assert.match(embeddedChecklistSource, /onLongPress=\{drag\}[\s\S]*?delayLongPress=\{700\}/);
  assert.match(embeddedChecklistSource, /onPress=\{\(\) => onItemsChange\(toggleItem\(block\.items, item\.id\)\)\}/);
  assert.match(embeddedChecklistSource, /accessibilityLabel=\{`Edit \$\{item\.text \|\| 'list item'\}`\}/);
  assert.match(schemaSource, /blocks_json TEXT/);
  assert.match(databaseSource, /readNoteBlocks\(row\.blocks_json, row\.body, row\.id\)/);
  assert.match(databaseSource, /JSON\.stringify\(note\.blocks\)/);
});

test('Custom Notes use a custom TenTap bundle for rich text and keep style and image assets in structured local storage', () => {
  assert.equal(packageJson.dependencies['@10play/tentap-editor'], '^1.1.0');
  assert.equal(packageJson.dependencies['react-native-webview'], '13.16.1');
  assert.match(documentEditorSource, /import \{[\s\S]*RichText, useBridgeState, useEditorBridge,[\s\S]*\} from '@10play\/tentap-editor'/);
  assert.match(textDocumentSource, /isCustom \? \([\s\S]*?<RichParagraphEditor/);
  assert.match(textDocumentSource, /<FormattingToolbar/);
  assert.match(textDocumentSource, /customSource: editorHtml/);
  assert.match(textDocumentSource, /PageStyleModal/);
  assert.match(textDocumentSource, /onChange=\{onAppearanceChange\}/);
  assert.match(textDocumentSource, /<InlineNoteImage/);
  assert.match(formattingToolbarSource, /label="Font family and style"/);
  assert.match(formattingToolbarSource, /editor\.setFontFamily\(fontFamily\)/);
  assert.match(formattingToolbarSource, /editor\.setFontSize\(toFontSizeCss\(size\)\)/);
  assert.match(formattingToolbarSource, /editor\.setColor\(color\)/);
  assert.match(formattingToolbarSource, /editor\.setHighlight\(color\)/);
  assert.match(formattingToolbarSource, /active\.editor\.setSelection\(selection\.from, selection\.to\)/);
  assert.match(formattingToolbarSource, /onAlignmentChange\(active\.blockId, alignment\)/);
  assert.match(fontFormattingBridgeSource, /tiptapExtensionDeps: \[FontSize, TextStyle\]/);
  assert.match(fontFormattingBridgeSource, /editor\.chain\(\)\.focus\(\)/);
  assert.match(editorViteConfigSource, /replacement: '@10play\/tentap-editor\/web'/);
  assert.match(customNoteCssSource, /font-size:20px/);
  assert.doesNotMatch(textDocumentSource, /<Toolbar(?:\s|>)/);
  assert.match(textDocumentSource, /Make image smaller/);
  assert.match(textDocumentSource, /Make image larger/);
  assert.doesNotMatch(textDocumentSource, /inlineImageMoveControls|inlineImageMoveGlyph/);
  assert.match(backButtonSource, /appStyles\.backArrow/);
  for (const source of [noteEditorSource, settingsSource, reminderSource]) {
    assert.match(source, /<BackButton/);
  }
  assert.match(stylesSource, /backArrow:\s*\{\s*width: 18,[\s\S]*?fontSize: 22/);
  assert.match(settingsSource, /headerAction: \{ minWidth: 88, minHeight: 48/);
  assert.match(reminderSource, /headerAction: \{ minWidth: 88, minHeight: 48/);
  assert.match(reminderSource, /headerActionRight: \{ minWidth: 88, minHeight: 48/);
  assert.match(formattingToolbarSource, /button:\s*\{\s*minWidth: 48,\s*minHeight: 48/);
  assert.match(formattingToolbarSource, /actionOption:\s*\{\s*minHeight: 44/);
  assert.match(stylesSource, /documentInsertButton:\s*\{\s*minHeight: 44/);
  assert.match(reminderSource, /reminderAction: \{ minWidth: 62, minHeight: 48/);
  assert.match(settingsSource, /systemSettingsButton: \{ alignSelf: 'flex-start', minHeight: 48/);
  assert.match(textDocumentSource, /imageScale >= 1\.5/);
  assert.match(textDocumentSource, /PanResponder\.create/);
  assert.match(textDocumentSource, /offsetX: next\.x, offsetY: next\.y/);
  assert.match(textDocumentSource, /accessibilityLabel="Drag to reposition this image"/);
  assert.match(stylesSource, /inlineImageDragHandle:/);
  assert.equal(easConfig.build.preview.distribution, 'internal');
  assert.equal(easConfig.build.preview.android.buildType, 'apk');
  assert.match(textDocumentSource, /onError=\{\(\) => setImageUnavailable\(true\)\}/);
  assert.match(textDocumentSource, /Image unavailable on this device/);
  assert.match(textDocumentSource, /accessibilityLabel="Image unavailable on this device\. Replace or remove it\."/);
  assert.match(schemaSource, /appearance_json TEXT/);
  assert.match(schemaSource, /ALTER TABLE notes ADD COLUMN appearance_json TEXT/);
  assert.match(databaseSource, /JSON\.stringify\(note\.appearance\)/);
  assert.match(imageStorageSource, /expo-file-system\/legacy/);
  assert.match(imageStorageSource, /FileSystem\.copyAsync\(\{ from: asset\.uri, to: uri \}\)/);
  assert.match(imageStorageSource, /FileSystem\.documentDirectory/);
  assert.match(imageStorageSource, /expo-image-picker/);
});

test('Custom Notes keep continuous scrolling as the default while pagination is deferred', () => {
  assert.match(textDocumentSource, /<NestableScrollContainer[\s\S]*?note\.blocks\.map\(\(block\)/);
  assert.match(textDocumentSource, /block\.type === 'checklist'[\s\S]*?<EmbeddedChecklistEditor[\s\S]*?<InlineNoteImage/);
  assert.match(stylesSource, /documentScroll:\s*\{\s*flex:\s*1,\s*minHeight:\s*0,?\s*\}/);
  assert.match(stylesSource, /documentContent:\s*\{\s*flexGrow:\s*1,[^}]*\}/);
  assert.match(documentEditorSource, /dynamicHeight:\s*true/);
});

test('reminders are note-level, unique per note, and carry note context into notifications', () => {
  assert.match(reminderSource, /selectPrimaryNoteReminder\(reminders, note\.id\)/);
  assert.match(reminderSource, /checklistItemId: note \? null : editingReminder\.checklistItemId/);
  assert.doesNotMatch(reminderSource, /ChecklistItem|item\?\.id|item\?\.text/);
  assert.match(reminderSource, /note && !editingReminder && listedReminders\.length > 0/);
  assert.match(reminderSource, /syncReminderNotification\(reminder, preferences\.remindersEnabled, true, note\?\.title\)/);
  assert.match(appSource, /useLastNotificationResponse\(\)/);
  assert.match(appSource, /setActiveNote\(target\)/);
});

test('Android reminder-channel blocks are detected and explained separately from app permission', () => {
  assert.match(notificationSource, /getNotificationChannelAsync\('reminders'\)/);
  assert.match(notificationSource, /channel\.importance !== Notifications\.AndroidImportance\.NONE/);
  assert.match(settingsSource, /the Reminders channel is blocked in Android settings/);
  assert.match(settingsSource, /Blocked for the Reminders channel in Android notification settings/);
  assert.match(reminderModalSource, /Notifications are blocked for the Reminders channel in Android settings/);
  assert.match(reminderModalSource, /permission\.channelEnabled === false\s*\? 'Blocked in Android settings'/);
});

test('Expo Go Android topic-push import resolves through the optional-module shim', () => {
  assert.match(topicSubscriptionSource, /from '\.\/TopicSubscriptionModule'/);
  assert.match(metroSource, /expo-notifications\/build\/topicSubscription\.js/);
  assert.match(metroSource, /src\/shims\/TopicSubscriptionModule\.android\.ts/);
  assert.match(topicShimSource, /requireOptionalNativeModule/);
  assert.match(topicShimSource, /'ExpoTopicSubscriptionModule'/);
  assert.match(notificationSource, /scheduleNotificationAsync/);
  assert.doesNotMatch(notificationSource, /subscribeToTopicAsync|unsubscribeFromTopicAsync/);
});

test('checklist rows support long-press drag reordering and preserve the active placeholder', () => {
  assert.match(checklistEditorSource, /<DraggableFlatList[\s\S]*?data=\{note\.items\}/);
  assert.match(checklistEditorSource, /keyExtractor=\{\(item\) => item\.id\}/);
  assert.match(checklistEditorSource, /onLongPress=\{drag\}[\s\S]*?delayLongPress=\{700\}/);
  assert.match(checklistEditorSource, /onDragEnd=\{\(\{ data \}\) => void persistOrder\(data\)\}/);
  assert.match(checklistEditorSource, /autoscrollThreshold=\{48\}/);
  assert.match(checklistEditorSource, /autoscrollSpeed=\{72\}/);
  assert.match(checklistEditorSource, /renderPlaceholder=\{\(\{ item \}\) =>/);
  assert.match(checklistEditorSource, /checklistRowActive/);
  assert.match(indexSource, /import '\.\/src\/logbox'/);
  assert.match(logBoxSource, /expo-notifications.*functionality is not fully supported/);
  assert.match(settingsSource, /SafeAreaView.*from 'react-native-safe-area-context'/);
  assert.doesNotMatch(settingsSource, /SafeAreaView.*from 'react-native'/);
});

test('all modal safe areas use react-native-safe-area-context', () => {
  assert.match(settingsSource, /SafeAreaView.*from 'react-native-safe-area-context'/);
  assert.match(reminderModalSource, /SafeAreaView.*from 'react-native-safe-area-context'/);
  assert.doesNotMatch(reminderModalSource, /SafeAreaView.*from 'react-native'/);
});

test('checklist order persistence remains available to accessibility actions', () => {
  assert.match(checklistEditorSource, /name: 'moveUp', label: 'Move item up'/);
  assert.match(checklistEditorSource, /name: 'moveDown', label: 'Move item down'/);
  assert.match(checklistEditorSource, /onAccessibilityAction=\{\(event\) => moveByAccessibilityAction/);
  assert.match(checklistEditorSource, /reorderItem\(currentItems, itemId, currentIndex \+ delta\)/);
  assert.match(checklistEditorSource, /await repository\.saveItemOrder\(note\.id, ordered, updatedAt\)/);
  assert.match(checklistEditorSource, /onDragEnd=\{\(\{ data \}\) => void persistOrder\(data\)\}/);
  assert.match(checklistEditorSource, /delayLongPress=\{700\}/);
});

test('screen and reminder UI depend on the typed repository boundary, not SQLite', () => {
  for (const source of [appSource, homeScreenSource, noteEditorSource, checklistEditorSource, reminderModalSource]) {
    assert.doesNotMatch(source, /from ['"].*database['"]/);
  }
  assert.match(repositorySource, /export interface NotesRepository/);
  assert.match(repositorySource, /saveItemOrder\(noteId: string, items: ChecklistItem\[\], updatedAt: number\)/);
  assert.match(localRepositorySource, /import \* as database from '\.\/database'/);
  assert.match(localRepositorySource, /saveReminder: database\.saveReminder/);
});
