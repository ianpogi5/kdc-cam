# KDC Cam

A simple camera app built with Expo / React Native. **Android only** — the
camera is implemented natively with CameraX (the iOS view is an unimplemented
stub).

- 📷 Take **photos** and record **videos**
- 📍 Live **GPS location** (reverse-geocoded address + coordinates) and a **timestamp** stamped across the bottom of the screen
- 🔥 The stamp is **burned into both photos and videos in real time** (CameraX), so it survives sharing/export — videos save instantly with no re-encode
- 🖼️ Built-in **gallery** to browse, play, and delete what you've captured
- Captures are also saved to your device's photo library

> **Just want to install it?** See **[INSTALL.md](INSTALL.md)** and grab the
> latest APK from the [Releases page](https://github.com/ianpogi5/kdc-cam/releases/latest).
> (Android only.)

## Requirements

- [Node.js](https://nodejs.org/) 18+
- For **Android**: a JDK (17+) and the Android SDK (API 36 + build-tools 36)
- For **iOS**: a Mac with Xcode, **or** an [Expo](https://expo.dev) account for
  cloud (EAS) builds
- A physical device is recommended — simulators/emulators have no camera or GPS

This app uses a **development build** (`expo-dev-client`) — its own installable
app — instead of the shared Expo Go app, so it isn't tied to Expo Go's SDK
range.

## Run it

### Android (local build)

```bash
npm install
npx expo run:android        # builds the dev-client APK, installs, starts Metro
```

Subsequent runs (after the app is installed) only need the dev server:

```bash
npx expo start --dev-client
```

> The prebuilt APK lives at
> `android/app/build/outputs/apk/debug/app-debug.apk` — you can `adb install` it
> onto any connected device.

### iOS (local build, requires a Mac)

```bash
npm install
npx expo run:ios
```

### Cloud builds with EAS (no local native toolchain needed)

Works for both platforms — iOS builds this way without a Mac:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android   # or ios
```

Install the resulting build on your device, then run `npx expo start --dev-client`.

On first launch, grant the camera, microphone, location, and photo-library
permissions.

> `expo-camera`, `expo-location`, and `expo-media-library` need real hardware —
> they will not function on the web target or in a simulator without a camera.

## Releasing a shareable APK

Releases are built and published automatically by GitHub Actions
([`.github/workflows/release.yml`](.github/workflows/release.yml)): on every
`v*` tag it runs `expo prebuild`, builds a **signed release APK**, and publishes
a GitHub Release with the APK attached and notes pulled from `CHANGELOG.md`.

To cut a release:

```bash
node scripts/release.mjs 1.1.0   # bumps app.json version + versionCode, updates CHANGELOG
# edit CHANGELOG.md to describe what changed, then:
git add app.json CHANGELOG.md
git commit -m "Release 1.1.0"
git tag v1.1.0
git push origin main v1.1.0      # the tag triggers the build + release
```

Friends then install/update from the [Releases page](https://github.com/ianpogi5/kdc-cam/releases/latest)
— see **[INSTALL.md](INSTALL.md)**.

### Signing

The APK is signed with a release keystore so updates install over older
versions. CI reads it from four repo secrets: `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
(injected into Gradle by the [`withReleaseSigning`](plugins/withReleaseSigning.js)
config plugin). **Keep a backup of the keystore** — losing it means friends must
uninstall before they can install future updates.

### Local release build (for testing)

```bash
npx expo prebuild --clean -p android
( cd android && ./gradlew assembleRelease )   # unsigned without the keystore props
# → android/app/build/outputs/apk/release/app-release.apk
```

## How it works

- `App.tsx` — permission gate + simple screen navigation (Camera / Gallery / Viewer)
- `modules/stamp-camera/` — a local Expo **CameraX** view module that owns the
  camera and burns the stamp into photos and video as they're captured (via
  `OverlayEffect` for video and a native composite for photos)
- `src/CameraScreen.tsx` — the camera UI: live GPS via `expo-location`,
  photo/video capture driving the native view, and rendering the stamp PNG
  (off-screen via `react-native-view-shot`) that gets burned in
- `src/GalleryScreen.tsx` — grid of captured items
- `src/MediaViewer.tsx` — full-screen photo / video (`expo-video`) playback with
  the saved location + timestamp overlay
- `src/Stamp.tsx` — the reusable bottom location + timestamp overlay
- `src/metadata.ts` — stores each capture's file + location/time in an app-owned
  `media/` directory and a `media-meta.json` sidecar (via `expo-file-system`)
