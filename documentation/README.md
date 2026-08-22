# Life Leaf

Life Leaf is a private, offline-first diary built for Android and the browser with Ionic Angular. It is designed around calm daily writing: rich pages, moods, calendar browsing, search, memories and gentle statistics, without an account, advertising, analytics or remote diary processing.

The canonical brand and Android artwork is [`src/assets/life-leaf.png`](src/assets/life-leaf.png).

## What is included

- Five-tab mobile navigation: Home, Calendar, Write, Memories and Settings
- Multiple diary entries on any date, with title, time, mood, location, weather, favourite and pin state
- Tiptap JSON rich text with bold, italic, underline, strike, highlight, headings, lists, checklist, quote, link, divider, alignment, undo and redo
- Debounced local draft autosave and recovery
- Monthly calendar, timeline, “On this day,” year chapters and favourites
- Debounced local search, sorting and indexed entry fields
- Built-in moods, writing prompts and editable rich-text templates
- Light, dark and automatic themes with reduced-motion and accessible focus behavior
- Optional PIN lock plus Android Keystore-backed strong-biometric unlock
- Android local reminder and optional screenshot protection hooks
- Photos/files in private app storage and encrypted, versioned backups that include attachments
- Android share target for text and images; shared content opens as an unsaved draft
- GitHub Actions debug APK, signed/unsigned release APK, AAB and GitHub Release automation

## Technology and local data

| Runtime | Diary storage                                |
| ------- | -------------------------------------------- |
| Android | SQLite through `@capacitor-community/sqlite` |
| Browser | Native IndexedDB                             |

Both implementations satisfy the same repository interface under `src/app/core/repositories`. Tiptap JSON is canonical rich content, while plain text is stored alongside it for fast local search. Indexed fields include entry date, update time, status, favourite and pinned state. Diary content is never stored in `localStorage` or `sessionStorage`.

The application currently targets Angular 22, Ionic Angular 9, Capacitor 8, TypeScript 6 and Node 24.16 or another version allowed by `package.json`.

## Setup (WSL2)

Install all declared dependencies and update the lock file:

```bash
npm install
```

Start the browser application:

```bash
npm run develop
```

The development server listens on `http://localhost:3035/`.

Useful checks:

```bash
npm run lint
npm test -- --configuration=ci
npm run build
```

## Android

Generate and synchronize the native project:

```bash
npm run android:add
npm run android:sync
npm run android:open
```

Android version commands:

```bash
npm run android:version
npm run android:version:patch
npm run android:version:minor
npm run android:version:major
```

See [`documentation/ANDROID.md`](documentation/ANDROID.md) for splash sizing, WSL2 commands, version bump behavior, CI triggers, signing, privacy details and troubleshooting.

## GitHub Actions and signing

`.github/workflows/android-build.yml` runs lint, tests and a production web build before generating the Android project.

- Pull requests and `main` produce `LifeLeaf-debug.apk`.
- `main-android`, manual release runs and `v*.*.*` tags build both APK and AAB.
- `main-android` auto-bumps `versionCode` and commits generated files to `releases/`.
- Tags create a GitHub Release.
- Release output also includes the exact R8 deobfuscation mapping used by that build.

Signed builds require these repository secrets:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Never commit signing files or secret values. Use `npm run generate-keystore` once on a trusted machine and retain a secure offline copy.

## Architecture

```text
Ionic pages and shared components
            ↓
       DiaryService
            ↓
    DiaryRepository API
       ↙           ↘
 IndexedDB       SQLite
 (browser)      (Android)
```

- `src/app/core/models` contains strict domain models.
- `src/app/core/repositories` contains the platform persistence implementations and schema migration.
- `src/app/core/services` coordinates signals, reminders and UI-facing state.
- `src/app/features` contains lazy-loaded calendar, editor, memories, search and settings pages.
- `scripts/patch-android.mjs` applies generated native behavior idempotently after each Capacitor sync.

## Backup and privacy

Life Leaf has no automatic cloud upload. Android Auto Backup is disabled by the native patch. The intended migration path is a user-initiated, versioned `.lifeleaf` export through the Android document picker, with optional authenticated encryption. An unencrypted export must be treated as private diary material.

Notifications use generic wording and contain no entry content. The share target consumes only content the user selected through Android’s share sheet. Screenshot blocking is opt-in and Android-only.

## Brand and accessibility

The interface uses the supplied Life Leaf artwork, a quiet green/cream visual system and large mobile touch targets. Ionic controls retain screen-reader names, focus is visible, mood state is expressed with text as well as colour, and reduced-motion preferences are respected.

## License

Private project. Add a project license before public distribution.
