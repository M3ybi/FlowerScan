# Android internal testing release

This runbook prepares Plantie for Google Play internal testing as package `com.plantie.app`.

## Current Android identity

- App name: `Plantie`
- Package/application ID: `com.plantie.app`
- Version name: `0.1.0`
- Version code: `3`
- Release artifact: Android App Bundle (`.aab`)

Real Google Play subscription products are not required for the first internal test upload. Keep purchases disabled or in the existing store-not-configured state until products exist.

## Required local tools

- Node.js and npm
- Android Studio
- Android SDK
- JDK 21 for Capacitor Android 8 release builds
- Google Play Console access

## NPM commands

```bash
npm run android:sync
npm run android:open
npm run android:build
npm run android:aab
```

`android:build` creates a debug APK for local QA. `android:aab` builds the signed release bundle for Google Play and requires release signing.

## Generate upload keystore

Run from the repository root:

```bash
keytool -genkeypair \
  -v \
  -keystore android/upload-keystore.jks \
  -storetype JKS \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias plantie-upload
```

Do not commit the keystore or passwords. The repository ignores `*.jks`, `*.keystore`, `key.properties`, and `android-signing.properties`.

## Configure release signing

Create `android/key.properties`:

```properties
storeFile=upload-keystore.jks
storePassword=REPLACE_WITH_LOCAL_PASSWORD
keyAlias=plantie-upload
keyPassword=REPLACE_WITH_LOCAL_PASSWORD
```

Alternative environment variables:

```bash
ANDROID_KEYSTORE_FILE=upload-keystore.jks
ANDROID_KEYSTORE_PASSWORD=...
ANDROID_KEY_ALIAS=plantie-upload
ANDROID_KEY_PASSWORD=...
```

The Gradle release task fails with a clear error if signing is missing. Debug builds do not require signing config.

## Build signed AAB

From the repository root:

```bash
npm install
npm run build
npm run android:sync
npm run android:aab
```

On this Windows workspace, the successful release build used:

```powershell
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-21.0.2.13-hotspot"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT="$env:LOCALAPPDATA\Android\Sdk"
cd android
.\gradlew.bat bundleRelease
```

Expected output:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## Android permissions

Current app permissions:

- `android.permission.INTERNET` for web app, Supabase, Netlify Functions, RevenueCat, and AI calls.
- `android.permission.CAMERA` for native plant and diagnosis photo capture.
- `android.permission.READ_MEDIA_IMAGES` for Android 13+ gallery image access.
- `android.permission.READ_EXTERNAL_STORAGE` with `maxSdkVersion=32` for older gallery access.

`POST_NOTIFICATIONS` is not declared because native push is not enabled yet.

## Google Play Console internal testing checklist

1. Create or open the Plantie app record.
2. Confirm app name: `Plantie`.
3. Confirm package: `com.plantie.app`.
4. Choose category: Lifestyle or Productivity, depending on final positioning.
5. Add contact email.
6. Add privacy policy URL: deployed `#/privacy` route.
7. Add terms URL: deployed `#/terms` route.
8. Add support URL: deployed `#/support` route.
9. Complete Data safety for account data, plant photos, diagnosis images, household sharing, purchases, and diagnostics. Email reports are not exposed in the mobile UI.
10. Complete content rating questionnaire.
11. Set target audience and content.
12. Create internal testing track.
13. Add tester email list or Google Group.
14. Upload `app-release.aab`.
15. Submit internal test release.
16. Configure subscription products later; do not enable real payments until Play products and RevenueCat offerings are ready.

## Android QA checklist

Run after installing from internal testing:

- App launches and shows Plantie.
- Login works with Supabase Auth.
- Legacy household import/migration works.
- Supabase source-of-truth feature flags behave as expected.
- AI diagnosis works with camera capture.
- AI diagnosis works with gallery image selection.
- Custom plant image capture works.
- QR labels open expected plant routes.
- RevenueCat unavailable or store-not-configured state does not grant Premium locally.
- Account deletion request page submits a manual-review request.
- Privacy, terms, support, subscription terms, release readiness, and health pages render.
- Web deployment still works after the Android release build.

## Rollback

- Keep the previous internal test release available in Play Console if possible.
- If the new AAB has a severe issue, stop the rollout for the internal track and upload a new versionCode with the fix.
- Do not reuse a versionCode once uploaded to Google Play.
- If signing credentials are exposed, rotate the upload key through Play App Signing.
- Web rollback remains independent through Netlify deploy rollback.

## Blockers before internal testing

- Google Play identity verification must be accepted before full publishing workflows are available.
- A private upload keystore must exist locally or in CI secrets.
- Store listing, data safety, content rating, support URL, terms URL, and privacy URL must be completed.
- Real subscription products remain a later step.
