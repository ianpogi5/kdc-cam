# KDC Cam

A simple cross-platform (Android + iOS) camera app built with Expo / React Native.

- 📷 Take **photos** and record **videos**
- 📍 Live **GPS location** (reverse-geocoded address + coordinates) and a **timestamp** stamped across the bottom of the screen
- 🔥 The stamp is **burned into saved photos** (so it survives sharing/export); videos keep the overlay in the in-app viewer
- 🖼️ Built-in **gallery** to browse, play, and delete what you've captured
- Captures are also saved to your device's photo library

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

## Release builds

### Android — local release APK

```bash
npx expo prebuild --clean -p android
( cd android && ./gradlew assembleRelease )
# → android/app/build/outputs/apk/release/app-release.apk
```

> The template signs `release` with the **debug key**, which is fine for
> sideloading to testers. For the **Play Store** you need your own keystore —
> the simplest path is EAS-managed credentials (below), which generates and
> stores the keystore for you and produces an `.aab`.

### Play Store / App Store via EAS (managed signing)

```bash
npm install -g eas-cli
eas login
eas init                                   # links the project (creates projectId)
eas build -p android --profile production   # signed .aab for Play Store
eas build -p ios --profile production        # needs an Apple Developer account
```

`eas.json` already defines `development`, `preview`, and `production` profiles.

## How it works

- `App.tsx` — permission gate + simple screen navigation (Camera / Gallery / Viewer)
- `src/CameraScreen.tsx` — `expo-camera` preview, live GPS via `expo-location`,
  photo/video capture, and burning the stamp into photos (off-screen capture
  via `react-native-view-shot`)
- `src/GalleryScreen.tsx` — grid of captured items
- `src/MediaViewer.tsx` — full-screen photo / video (`expo-video`) playback with
  the saved location + timestamp overlay
- `src/Stamp.tsx` — the reusable bottom location + timestamp overlay
- `src/metadata.ts` — stores each capture's file + location/time in an app-owned
  `media/` directory and a `media-meta.json` sidecar (via `expo-file-system`)
