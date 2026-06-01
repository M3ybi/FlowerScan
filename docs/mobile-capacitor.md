# Plantie Capacitor mobile wrapper

Plantie remains a React + Vite web app. Capacitor wraps the existing `dist` output for native iOS and Android shells.

## Commands

Run web app locally:

```bash
npm install
npm run dev
```

Build web app:

```bash
npm run build
```

Sync web assets and native projects:

```bash
npm run mobile:sync
```

Build and sync in one step:

```bash
npm run mobile:build
```

Open iOS project:

```bash
npm run mobile:ios
```

Open Android project:

```bash
npm run mobile:android
```

## Local tools

iOS:

- macOS is required.
- Xcode is required.
- CocoaPods may be required by future native plugins.
- Run `npm run mobile:ios`, then build/run from Xcode.

Android:

- Android Studio is required.
- Android SDK and a configured emulator or device are required.
- Run `npm run mobile:android`, then build/run from Android Studio.

General:

- Node.js and npm are required.
- Run `npm run build` before `npm run mobile:sync` when web code changes.

## Capacitor config

Configured in `capacitor.config.ts`:

- `appId`: `com.plantie.app`
- `appName`: `Plantie`
- `webDir`: `dist`

Hash routing is already used by the app, so routes such as `#/flower/:id` work inside the native WebView.

## Native camera and photo permissions

`@capacitor/camera` is wired for native iOS and Android image capture. The web app still uses the browser file input fallback.

Camera:

- iOS `NSCameraUsageDescription`
- Android `android.permission.CAMERA`

Photo library:

- iOS `NSPhotoLibraryUsageDescription`
- Android `READ_MEDIA_IMAGES` for modern Android, or storage/photo picker permissions depending on target SDK and Camera plugin behavior.

Permission prompts are requested only when the user chooses camera or gallery actions. Denied permissions should surface as a non-blocking image error and leave existing local data untouched.

Push notifications:

- iOS push notification entitlement and APNs setup.
- Android notification permission for Android 13+.
- Native push provider integration is not implemented yet.

## Billing and push status

- RevenueCat SDK is installed for native runtime only.
- App Store / Google Play products are not configured yet.
- Native push notifications are not implemented.
- Existing web push and Netlify functions are unchanged.

## Image testing

Manual mobile smoke test:

1. Run `npm run build`.
2. Run `npm run mobile:sync`.
3. Open iOS or Android from the commands above.
4. In the add-plant modal, capture a camera photo and choose a gallery photo.
5. In diagnosis, capture a camera photo and choose a gallery photo.
6. Deny camera permission once and confirm the app shows an error without changing existing plant data.
7. With Supabase source-of-truth enabled and a migrated authenticated household, confirm uploads use the private storage paths documented in `docs/supabase-storage-buckets.md`.

## Mobile assets

Placeholders are documented in `mobile-assets/README.md`.

Before store submission, prepare:

- App icon source image.
- Splash screen source image.
- iPhone screenshots.
- iPad screenshots if supported.
- Android phone screenshots.
- Android tablet screenshots if supported.
