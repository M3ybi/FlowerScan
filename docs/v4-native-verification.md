# V4 native verification

Release code candidate: `9399257`. The acquisition fixture was built from `c3af7c7`; shared native acquisition code is unchanged, and the later fix only corrects release metadata hashing. Windows host. No physical device, macOS, Xcode, store account, signed release or real provider environment was used.

## Executed matrix

| Environment | Actual evidence | Status / remaining scope |
| --- | --- | --- |
| Desktop Chromium | 275 real image checks; 11 actual-App workflow groups, including ten repeated additions | PASS for offline browser fixtures; no hosted Auth/Storage/provider acceptance |
| Desktop WebKit | 275 real image checks; 11 actual-App workflow groups | PASS for desktop WebKit only; not an iPhone or Safari hardware test |
| Android debug compilation | `JAVA_HOME` = Android Studio JBR; `npm run android:build`; BUILD SUCCESSFUL, 152 tasks | PASS for debug compilation; no signed AAB/Play acceptance |
| Android emulator | Fresh `PlantieV4Offline` data/config; x86_64 Android 37.2 Google APIs Play Store 16 KiB image; port 5580; WHPX; no-window/no-snapshot | PASS for boot and isolated fixture only; existing Medium_Phone AVD not modified |
| Native Android gallery acquisition | Actual Camera plugin and shared `captureImage`/normalizer: ten Add-like + ten Diagnosis-like JPEG selections, then cancel | PASS for isolated acquisition/normalization; [recorded evidence](v4-native-selection-evidence.json); no Auth/AI/upload/database, HEIC or camera hardware claim |
| Physical Android app | Not attached | BLOCKED: full upload, lifecycle, permission, camera, restore and repeated selections |
| Android Chrome on physical phone | Not available | BLOCKED: gallery/Files/provider behavior matching the original web report |
| iOS source/config/sync | `npx cap sync ios`; portable Swift path normalization; ten native-auth/config tests | PASS for source/sync only |
| iOS simulator / physical app | Windows cannot compile Xcode | BLOCKED |
| iOS Safari on physical phone | Not available | BLOCKED; desktop WebKit is insufficient |

The original intermittent gallery defect remains an **unresolved physical-platform release gate**. The emulator fixture exercises a useful subset; it neither reproduces the affected person's browser/provider nor proves successful plant creation in Supabase.

## Offline emulator reproduction

The fixture source is `tests/fixtures/native-image-selection.ts`; build assets with `node scripts/build-native-image-fixture.mjs`. It imports the actual native acquisition/normalization code. It contains no account, AI, billing or database client, and its CSP permits app-local image reads while denying external service destinations. It reports safe counts/codes, never image bytes or tokens.

For the recorded run, a copy of the compiled debug APK had **only its web assets** replaced by those fixture assets, then was zip-aligned and signed using the standard local Android debug keystore. The original application APK/source was preserved. Twelve synthetic 640×480 JPEGs were generated locally, pushed to the fresh emulator's Pictures directory and indexed. The APK was installed only on `emulator-5580`; no production application or store was deployed. WebView CDP was forwarded to loopback port 9229. The test selected actual Photo Picker items, confirmed Done, awaited actual normalization, and verified counters/errors. The fixture screen was visually inspected. Its debug status text layout is not a product UI acceptance test.

On an equivalently isolated fixture installation:

```powershell
$env:ANDROID_HOME = '<installed Android SDK directory>'
$env:PLANTIE_TEST_ADB_SERIAL = 'emulator-5580'
$env:PLANTIE_TEST_CDP_URL = 'http://127.0.0.1:9229'
node scripts/test-native-image-selection.mjs
```

The runner refuses physical-device serials and remote CDP. It assumes the offline fixture is already installed, running and has indexed synthetic photos; it does not install/reset a device. Reload the fixture to zero its counters before a fresh run; counters are cumulative and the runner can resume a partial run. In the recorded run the first Add-like selection was performed manually during picker setup and the automation completed the remaining nine plus ten Diagnosis-like selections and cancellation. Create a new disposable AVD/data directory for reproduction. Never wipe/reuse someone's existing AVD or install this fixture on a production user's phone. The recorded emulator and forwarding were stopped afterward.

Automatic approval review rejected removal of `%TEMP%/plantie-v4-avd-20261019` with “blocked by policy.” The stopped emulator's temporary files remain. No alternate deletion method was attempted.

## Android release checklist

Source currently uses Capacitor Android/Core 8.5.3, compile/target SDK 36, min SDK 24, namespace/application ID `com.plantie.app`, versionCode 3/versionName 0.1.0. Plugins include Camera, App, Browser and RevenueCat. Manifest declares camera, internet, modern photo access and old storage access capped at API 32; callback/confirm/recovery deep links are present. These are source facts, not proof of Play Console acceptance.

1. In an authorized environment, sync the reviewed bundle and run debug/device tests. Recheck gallery/Files and denied/limited permissions, cancel/reopen/replacement, background/foreground, low memory and lost network. Use the exact Camera plugin/runtime versions from the lockfile.
2. Verify application ID, products, store linkage, current Play target/API and 16 KiB native-library requirements against the actual release channel. Check all packaged native libraries, including HEIC dependencies. A 16 KiB emulator acquisition pass does not validate every ABI/library path.
3. Set a valid monotonically increasing versionCode based on the actual Play release history (UNKNOWN here); do not guess from local version 3.
4. Use approved signing credentials via ignored `key.properties`/`android-signing.properties` or `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Release Gradle intentionally fails when these are missing. Do not use the debug key for a release.
5. Build the release AAB using the repository's `android:aab` command with production release guard/platform settings; verify signature, upload to the authorized test track, and test real store sandbox purchases/restores. No AAB/signing/publication was executed here.

## macOS / iOS steps — not executed

1. Check out the reviewed revision, `npm ci`, and configure the explicitly authorized backend/public keys. For shipping builds set `PLANTIE_RELEASE_ENV=production`, `PLANTIE_RELEASE_PLATFORM=ios`, approved production origin and the `appl_` public key. For a local native store-sandbox test against an authorized test backend, use an explicitly local test build in production Vite mode with the platform key; verify its backend separately and never publish that `environment: local` artifact. `mobile:test-store` instead selects RevenueCat Test Store, which does not establish StoreKit sandbox acceptance.
2. `npm run build`, `npx cap sync ios`. On macOS confirm SPM package paths use `/` and resolve the exact Capacitor 8.5.3 package and installed plugins.
3. Open `ios/App/App.xcodeproj`; verify bundle `com.plantie.app`, iOS 15 deployment target, URL schemes, Camera/Photos usage descriptions, team, provisioning, version/build and StoreKit products. Do not replace signed callback schemes with broad arbitrary URL handlers.
4. `xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App`; then `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' -derivedDataPath .tmp-ios-build CODE_SIGNING_ALLOWED=NO build`. Record actual Xcode/SDK/simulator versions and output.
5. Run simulator and physical iPhone tests, archive/sign through approved credentials, test TestFlight/App Review sandbox routing, then review submission separately. Source sync on Windows does not satisfy any of these steps.

## Physical image acceptance — required

Use a test household/account with authorized quota/entitlement; do not change production plan limits. On each intended release platform authenticate, add ten different gallery photos with successful save/readback, reopen between every addition, then perform ten analogous diagnosis selections. Include JPEG/PNG/HEIC/HEIF, large iPhone originals, EXIF orientation, local Files, cloud-only iCloud/Google Photos, limited photo library, invalid/corrupt files and slow provider reads. Original limit is 15 MiB; normalized JPEG hard limit is 2 MiB, longest edge at most 1600 px and usual target under 1 MiB.

Cancel/reopen/replace, close/reopen modal, switch household, logout mid-selection, background/foreground, disconnect/reconnect, provider timeout, expired receipt and interrupted upload. Record exact stage: native-picker, photo-acquisition, blob-read, MIME detection, HEIC/image decode, compression, validation, receipt verification, Storage, database write/readback or cleanup. Preserve only request ID, safe code/stage, runtime and coarse sizes; never image payloads, signed URLs or auth tokens. Close the original incident only after the affected physical/browser path is reproduced and verified.
