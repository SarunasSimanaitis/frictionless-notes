# Frictionless Notes

An offline-first notes app for Android and iPhone, with Quick Notes, formatted Custom Notes, embedded checklists, shopping lists, and local reminders.

## Run it on Android

The Custom Note editor uses TenTap's advanced custom editor bundle. That setup requires a development build, so Expo Go is not the supported runtime for this editor. See [TenTap advanced setup](https://10play.github.io/10tap-editor/docs/setup/advancedSetup) and [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/).

1. Install Node.js 22.13 or newer, Android Studio/Android SDK, and enable USB debugging on a physical phone (or start an Android emulator).
2. From this folder, run `npm install`. The postinstall script applies the version-checked DraggableFlatList compatibility patch and builds the custom TenTap editor bundle.
3. Build and install the development client with `npx expo run:android`.
4. Start Metro with `npx expo start --dev-client`, then open the installed development build on the phone or emulator.

Use a development build from EAS if you do not have the Android SDK locally. The app uses Expo SDK 57. Local reminders remain on-device; exact alert delivery depends on system permissions and battery policies.

## Installable Android APK

An internal APK profile is defined in `eas.json`. From the project folder:

```sh
npm install
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

On first setup, EAS may ask you to create an Expo project and an Android signing keystore. Choose the existing Expo project if one has already been linked; otherwise create one under your Expo account and keep the generated keystore on EAS. When the build completes, open the install URL from the EAS build page on your Android phone and approve installation from that source. The preview profile produces an APK for direct installation; the production profile keeps the default Play Store app bundle format.

## Features

- Notes, checklists, shopping lists, reminders, preferences, and photo copies are stored locally in SQLite or the app's documents directory.
- Checklist entry stays in the editor's flex layout while the list scrolls independently. `KeyboardAvoidingView` applies bottom padding on Android and iOS; the Android app config also requests `resize` for native builds.
- Add list entries with the keyboard Done action or the Add button while keeping the keyboard open. Tap an item to check it off, edit its text, or hold it for about 700 ms to reorder. Screen readers can move items up and down.
- Plain text notes can include embedded checklists between paragraphs. In Custom Notes, the compact toolbar supports font family and size, bold, italic, underline, text and highlight colors, headings, lists, alignment, and paragraph spacing. The toolbar stays above the document and away from the keyboard.
- Custom Notes include blank, plan, and journal starters; six backgrounds; plain, lined, dotted, or grid paper; three margins; and offline inline photos that can be dragged, repositioned, resized, replaced, or removed.
- Existing plain text notes remain readable. Additive `editor_mode`, `blocks_json`, and `appearance_json` columns store editor mode, document blocks, and page style without resetting the SQLite database.
- Reminder times use the device's local time zone. “After work” defaults to 17:30 and is configurable. Android settings report app permission separately from a blocked Reminders notification channel.

## Architecture

- `App.tsx` coordinates startup, app state, notification responses, and screen navigation.
- `src/screens/` contains the home and note editor screens; checklist and shopping-list editing stays within the note editor screen.
- Screens and reminder UI use the `NotesRepository` contract. `localNotesRepository` adapts that contract to `src/database.ts`, which owns SQLite queries and additive migrations.
- `src/model.ts` owns document serialization, stable IDs, validation, and note/list operations. Reminder scheduling lives in `src/notifications.ts`; image copies live in `src/noteImages.ts`.
- `src/editor/` contains the Custom Note document editor, formatting toolbar, font bridge, and styling helpers. UI selection and toolbar menu state stay separate from the serializable note blocks.

## Future shared notes

Sharing, authentication, cloud synchronization, and billing are not implemented. Notes remain fully usable offline. Before sharing is built, the product will need authentication, invitations, view-only and edit permissions, server-side authorization, synchronization, concurrent-edit handling, offline change/conflict resolution, notification delivery, and subscription entitlements if sharing becomes paid. No cloud service or speculative sync layer is currently connected.

## Pagination decision

Custom Notes remain continuous, vertically scrolling documents. Paragraph, checklist, and image blocks share one scroll container. The current document model has no page boundaries, so fixed-height sheets could split mixed content unpredictably. Reliable pagination needs a separate design for measuring and moving those blocks while preserving selection and scroll position; it is deferred.

## Checks

- `npm run typecheck` checks the strict TypeScript project.
- `npm test` covers checklist entry/edit/toggle/delete/reordering, reminders, mixed-content insertion and persistence, rich Custom Note formatting storage, image and appearance storage, keyboard layout, and UI architecture contracts.
- `npx expo install --check` checks installed package versions against the Expo SDK.
- `npx expo-doctor` checks Expo project health.
- `npx expo export --platform android --output-dir dist` builds the Android JavaScript bundle.
- No lint script is configured.

## Physical Android checks

The source and bundle checks do not verify the phone UI. On a development build, verify Gboard placement and item entry; checklist reorder and persistence; reminder delivery and permission states; embedded checklists; Custom Note selection and formatting; image persistence; and note reopen/search behavior.
