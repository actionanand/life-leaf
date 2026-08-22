# Life Leaf Android build guide

Life Leaf uses Capacitor 8 and GitHub Actions to package the Angular/Ionic application as Android APK and AAB artifacts. The generated `android/` directory is intentionally not committed; it is recreated from the web application and the idempotent native patch.

## Build files

| File                                  | Purpose                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `capacitor.config.ts`                 | App ID/name, Angular output, notification icon and splash behavior                                                      |
| `android-version.json`                | Monotonic Android `versionCode` and public `versionName`                                                                |
| `scripts/bump-android-version.js`     | Increments the code and optionally semantic version                                                                     |
| `scripts/patch-android.mjs`           | Adds the 168dp launch overlay, notification permission/channel, share target, screenshot control and system-bar styling |
| `scripts/generate-keystore.mjs`       | Creates a long-lived PKCS12 release keystore                                                                            |
| `.github/workflows/android-build.yml` | Checks, generates, builds, signs, verifies, uploads and releases APK/AAB files                                          |
| `src/assets/life-leaf.png`            | Canonical launcher, splash, notification and Play Store artwork source                                                  |

## Required packages

Install dependencies from WSL2 before the first Android build:

```bash
npm install
```

The Android-specific packages are `@capacitor/android`, `@capacitor-community/sqlite`, `@capacitor/local-notifications` and `@capacitor/splash-screen`. Running `npm install` also updates `package-lock.json`, which is required because CI uses `npm ci`.

## Local WSL2 workflow

```bash
npm run android:add
npm run android:sync
```

`android:sync` builds the web application, syncs Capacitor plugins and reapplies the native patch. Open the generated project from an environment with Android Studio:

```bash
npm run android:open
```

When `android/` does not exist, a direct `npx cap sync android` will report a missing platform. Run `npm run android:add` first.

## Splash and launcher sizing

The source brand artwork has meaningful detail near its edges. CI therefore scales the art to 70% of each launcher canvas before centering it, preventing adaptive-icon masks from clipping the leaves or pen. The Android activity displays a centered `168dp × 168dp` launch image over `#f4f6f0` for at least 1.1 seconds, with a short fade. The Play Store icon uses a 420px composition centered on a transparent 512px canvas.

After changing `src/assets/life-leaf.png`, run `npm run android:sync`. CI always regenerates every launcher density, splash drawable, notification artwork and `releases/playstore-icon.png` from that file.

## Versioning

```bash
npm run android:version
npm run android:version:patch
npm run android:version:minor
npm run android:version:major
```

The plain command increments only `versionCode`. The other commands also update `versionName`. Google Play requires a greater `versionCode` for every uploaded release.

The `main-android` workflow automatically increments `versionCode`, commits it with `[skip ci]`, and then builds using the checked-in `versionName`.

## CI behavior and release files

The workflow builds Android only from the `main-android` branch:

- A push to `main-android` starts the workflow.
- Manual dispatch is supported only when the selected workflow branch is `main-android`; the build job is explicitly guarded against every other ref.
- Pull requests, other branches, and tags do not build Android artifacts.
- Every build creates both a release APK and Google Play AAB.
- Signed output is named `releases/LifeLeaf-<version>.apk` and `releases/LifeLeaf-<version>.aab`.
- If signing secrets are absent or signing fails, output is clearly named `LifeLeaf-<version>-unsigned.*`.
- `main-android` commits generated release files under `releases/`.
- Every run uploads its `releases/` directory as a 30-day Actions artifact.
- Release builds enable R8/resource shrinking and include `LifeLeaf-<version>-mapping.txt`; retain that exact file for Play Console deobfuscation.
- The Actions summary labels successful signed files with `✅ Signed APK` / `✅ Signed AAB` and fallbacks with `⚠️ Unsigned APK` / `⚠️ Unsigned AAB`.

CI uses Node 24.16, Java 21, minimum SDK 24 and target SDK 36.

## Signing secrets

Configure these in **Repository Settings → Secrets and variables → Actions**:

| Secret              | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `KEYSTORE_BASE64`   | Base64 text of the complete release keystore               |
| `KEYSTORE_PASSWORD` | Keystore password                                          |
| `KEY_ALIAS`         | Signing-key alias; the included generator uses `lifeleaf`  |
| `KEY_PASSWORD`      | Private-key password; for PKCS12 use the keystore password |

Generate and encode the keystore once on a trusted WSL/Linux machine:

```bash
npm run generate-keystore
test -s release-keystore.jks
base64 -w 0 release-keystore.jks > keystore.b64.txt
npm run keystore:type
```

To provide the password non-interactively from a trusted local shell:

```bash
npm run generate-keystore -- --password 'YOUR_STRONG_PASSWORD'
```

The generator also accepts `KEYSTORE_PASSWORD` from the environment. Avoid putting a real password on a shared terminal, in shell history, CI logs, or source-controlled files.

Never commit `.jks`, `.keystore`, Base64 key text or passwords. Keep a secure offline backup of the release key; losing it can prevent future Play Store updates.

## Storage and privacy

Android diary records are stored through `@capacitor-community/sqlite`. Browser records use IndexedDB. The manifest disables Android Auto Backup so the WebView database, PIN-related state and attachment references are not silently copied to cloud or restored after the user intentionally clears app data. Life Leaf backup/export is the explicit migration path.

The Android share target accepts only content the user explicitly shares (`text/plain` or `image/*`). It does not request broad storage access. The shared content opens an unsaved draft and is not committed until the user taps Save.

Screenshot protection is off by default. Enabling it calls the native bridge to set Android `FLAG_SECURE`; browsers correctly show the control as unavailable.

The app lock stores only a PBKDF2-SHA-256 salted PIN verifier in private IndexedDB. On Android, optional biometric unlock wraps the PIN with AES-GCM using a non-exportable, authentication-bound Android Keystore key. A biometric enrollment change invalidates that key; the PIN remains the fallback and disabling/changing the PIN removes the wrapped biometric secret.

Daily reminders use local notifications with generic text and never reveal diary content. When a user enables reminders, Life Leaf first explains the permission, then shows Android's system prompt. The setting is enabled only after permission is granted and the schedule succeeds.

## Troubleshooting

- **`npm ci` reports lock mismatch:** run `npm install` in WSL2 and commit the updated `package-lock.json`.
- **Missing Android platform:** run `npm run android:add`, then `npm run android:sync`.
- **Brand changes are absent:** rerun `npm run android:sync`; the patch copies the canonical icon into the generated drawable tree.
- **Unsigned release:** verify `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, and `KEY_ALIAS`; also verify `KEY_PASSWORD` for a non-PKCS12 keystore. Ensure the Base64 text has no truncation.
- **AAB rejected for version code:** increment with `npm run android:version` before rebuilding locally.
