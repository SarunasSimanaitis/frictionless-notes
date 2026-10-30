# Frictionless Notes

**An offline-first notes app for Android and iOS, built with React Native, Expo and TypeScript.**

Frictionless Notes focuses on making everyday notes, checklists and shopping lists quick to create and comfortable to use. Notes are stored locally on the device, with no account or cloud service required.

## Features

- **Quick Notes** — capture and edit everyday notes.
- **Checklists and shopping lists** — add, check off, edit and reorder items.
- **Custom Notes** — rich-text editing with formatting for fonts, sizes, emphasis, colors, headings, lists, alignment and paragraph spacing.
- **Embedded checklists** — mix checklist blocks with normal text in a single note.
- **Note appearance** — choose page backgrounds, paper styles, margins and templates.
- **Inline images** — add local photos to Custom Notes, then move, resize, replace or remove them.
- **Reminders** — schedule local reminders using the device's time zone.
- **Trash and recovery** — restore deleted notes during the 30-day retention period or permanently delete them.
- **Offline-first storage** — note data is stored locally with SQLite; copied note images are kept in the app's documents directory.

## Tech stack

- React Native 0.88
- Expo SDK 58
- TypeScript
- SQLite (`expo-sqlite`)
- Expo Notifications and Image Picker
- TenTap / Tiptap for the Custom Note editor
- React Native Gesture Handler, Reanimated and Draggable FlatList
- Vite for building the custom editor bundle

## Requirements

- Node.js **22.13 or newer** (the EAS build profiles use Node.js 22.23.3)
- npm
- Android Studio and Android SDK for local Android builds
- A physical Android device with USB debugging enabled, or an Android emulator

The complete Custom Note editor uses TenTap's advanced editor setup and a development build. Expo Go is suitable only for basic experiments; it does not provide the complete native app setup.

## Getting started

```bash
npm install
```

The `postinstall` script applies the version-checked compatibility patch for `react-native-draggable-flatlist` and builds the custom TenTap editor bundle.

Start the Expo development server:

```bash
npx expo start --dev-client
```

For the full app, first build and install the development client:

```bash
npx expo run:android
```

Then start Metro with `npx expo start --dev-client` and open the installed development build on your device or emulator.

## Build an installable Android APK

An internal preview profile is configured in `eas.json` and produces an APK:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

For a local Android build, make sure Android Studio and the Android SDK are installed and configured, then run:

```bash
npx expo run:android
```

The `production` EAS profile is configured for a production Android app bundle. Review app signing and store metadata before publishing to Google Play.

## Useful scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start Expo |
| `npm run android` | Build and run the Android app locally |
| `npm run typecheck` | Run the TypeScript type check |
| `npm test` | Run the Node.js test suite |
| `npm run editor:build` | Build the custom TenTap editor bundle |
| `npx expo install --check` | Check package versions against the Expo SDK |
| `npx expo-doctor` | Check Expo project configuration and dependencies |

## Project structure

```text
.
├── App.tsx                    # App startup, state and navigation
├── assets/                    # App icon, logo and splash artwork
├── editor-web/                # Custom TenTap editor and Vite build
├── scripts/                   # Dependency compatibility patch
├── src/
│   ├── editor/                # Custom Note editor and formatting UI
│   ├── lists/                 # Checklist components
│   ├── screens/               # Home and note editor screens
│   ├── database.ts            # SQLite database and migrations
│   ├── model.ts               # Note models and domain operations
│   ├── notifications.ts       # Local reminder scheduling
│   └── noteImages.ts          # Local image storage
├── tests/                     # Model, theme and UI contract tests
├── app.json                   # Expo app configuration
├── eas.json                   # EAS build profiles
└── package.json
```

## Data and privacy

Notes, checklist items, preferences, reminder metadata and document content are stored locally on the device. Note images are copied into the app's local documents storage. The project does not currently implement accounts, cloud synchronization, collaboration or a remote backend.

Uninstalling the app or clearing its data can remove locally stored notes and images. Back up important information before removing the app or resetting device data.

## Verification

Run the following checks before preparing a release:

```bash
npm run typecheck
npm test
npx expo install --check
npx expo-doctor
npx expo export --platform android --output-dir dist
```

Automated checks do not replace testing on a physical Android device. Verify keyboard behavior, checklist editing and reordering, reminder permissions and delivery, Custom Note formatting, image persistence, Trash recovery and note search/reopening on-device.

## Current limitations

- No account system or cloud backup/synchronization.
- No shared notes or real-time collaboration.
- Reminder delivery is subject to operating-system notification permissions and battery-management policies.
- Custom Notes are continuous scrolling documents; fixed-page pagination is not implemented.

## License

This project currently declares the **0BSD** license in `package.json`. See [LICENSE](./LICENSE) for the license text.
