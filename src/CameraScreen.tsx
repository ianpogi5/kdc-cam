import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Brightness from 'expo-brightness';
// The top-level expo-media-library asset/album functions are deprecated in this
// SDK and throw at runtime; the `/legacy` entry provides the working impls.
import * as MediaLibrary from 'expo-media-library/legacy';
import { File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { useKeepAwake } from 'expo-keep-awake';

import {
  StampCameraView,
  type CaptureErrorEvent,
  type PhotoCapturedEvent,
  type RecordingFinishedEvent,
} from '../modules/stamp-camera';
import Stamp from './Stamp';
import { colors } from './theme';
import { formatDuration } from './format';
import { addItem, ensureMediaDir, MediaType } from './metadata';

interface CameraScreenProps {
  onOpenGallery: () => void;
  onCaptured: () => void;
}

interface LiveLocation {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string | null;
}

const EMPTY_LOCATION: LiveLocation = {
  latitude: null,
  longitude: null,
  accuracy: null,
  address: null,
};

const waitFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export default function CameraScreen({ onOpenGallery, onCaptured }: CameraScreenProps) {
  const insets = useSafeAreaInsets();
  // The stamp stage is captured at the window's width so the burned-in stamp
  // keeps the same on-screen scale in portrait and landscape.
  const { width: windowWidth } = useWindowDimensions();

  // Keep the screen awake while the camera is open (e.g. during recording).
  useKeepAwake();

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [mode, setMode] = useState<MediaType>('photo');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  // True while a finished recording is being saved; keeps the shutter disabled
  // and shows a "Saving…" state. With live burn-in this is now brief.
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [location, setLocation] = useState<LiveLocation>(EMPTY_LOCATION);

  // The stamp PNG burned into the next capture, and a counter that triggers a
  // native photo when bumped. Both are props on <StampCameraView>.
  const [overlayUri, setOverlayUri] = useState<string | null>(null);
  const [photoRequestId, setPhotoRequestId] = useState(0);

  const lastGeocodeKey = useRef<string | null>(null);

  // Shutter feedback: a brief white flash over the preview when a photo is
  // taken, so there's visible confirmation of the capture.
  const flashOpacity = useRef(new Animated.Value(0)).current;
  function flashShutter() {
    flashOpacity.setValue(0.85);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }

  // Off-screen "overlay" stage: the stamp on a transparent background, captured
  // as a PNG that the native camera burns into the photo/video as it records.
  const [overlayJob, setOverlayJob] = useState<null | { loc: LiveLocation; ts: number }>(null);
  const overlayViewRef = useRef<View>(null);
  const overlayResolve = useRef<((uri: string | null) => void) | null>(null);
  const overlayDone = useRef(false);

  // Pending native-photo promises keyed by request id, and the snapshot frozen
  // when the current recording started.
  const photoIdRef = useRef(0);
  const photoResolvers = useRef(
    new Map<number, { resolve: (uri: string) => void; reject: (e: Error) => void }>(),
  );
  const recordingSnap = useRef<CaptureSnapshot | null>(null);

  // Keep the on-screen clock current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Tick the recording timer.
  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Watch GPS and reverse-geocode a friendly address (throttled by location).
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;

    const applyPosition = async (pos: Location.LocationObject) => {
      if (cancelled) return;
      const { latitude, longitude, accuracy } = pos.coords;
      setLocation((prev) => ({ ...prev, latitude, longitude, accuracy }));

      const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
      if (key === lastGeocodeKey.current) return;
      lastGeocodeKey.current = key;
      try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (cancelled || results.length === 0) return;
        const a = results[0];
        const line = [a.name || a.street, a.city || a.subregion, a.region]
          .filter(Boolean)
          .join(', ');
        setLocation((prev) => ({ ...prev, address: line || null }));
      } catch {
        // Reverse geocoding is best-effort; keep showing coordinates.
      }
    };

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Show an instant approximate fix from cache while a precise one loads.
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) applyPosition(last);
      } catch {
        // No cached position yet; the watcher below will deliver one.
      }

      // Balanced accuracy uses Wi-Fi/cell as well as GPS, so it locks quickly
      // and works indoors (pure GPS can take minutes or never fix inside).
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 5, timeInterval: 3000 },
        applyPosition,
      );
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  interface CaptureSnapshot {
    loc: LiveLocation;
    ts: number;
  }

  /** Saves a freshly captured file to the app gallery and the phone's gallery. */
  async function persistCapture(uri: string, type: MediaType, snap: CaptureSnapshot) {
    // 1) Copy into the app-owned gallery (primary source of truth; always works).
    ensureMediaDir();
    const ext = uri.split('.').pop() || (type === 'photo' ? 'jpg' : 'mp4');
    const name = `${snap.ts}.${ext}`;
    const dest = new File(Paths.document, 'media', name);
    try {
      if (dest.exists) dest.delete();
      await new File(uri).copy(dest);
    } catch (e) {
      console.log('[KDC] app-gallery copy failed:', String(e));
      return;
    }

    addItem({
      file: name,
      type,
      timestamp: snap.ts,
      latitude: snap.loc.latitude,
      longitude: snap.loc.longitude,
      accuracy: snap.loc.accuracy,
      address: snap.loc.address,
    });
    onCaptured();

    // 2) Also save it to the phone's gallery (default location, no album).
    try {
      await MediaLibrary.saveToLibraryAsync(uri);
    } catch (e) {
      console.log('[KDC] phone-gallery save failed:', String(e));
    }
  }

  /** Resolves the in-flight overlay capture and tears down the stage. */
  function finishOverlay(resultUri: string | null) {
    if (overlayDone.current) return;
    overlayDone.current = true;
    const resolve = overlayResolve.current;
    overlayResolve.current = null;
    setOverlayJob(null);
    resolve?.(resultUri);
  }

  /** Captures the off-screen overlay stage as a transparent PNG. */
  async function captureOverlay() {
    if (overlayDone.current || !overlayViewRef.current) return;
    try {
      const out = await captureRef(overlayViewRef, { format: 'png', quality: 1, result: 'tmpfile' });
      finishOverlay(out || null);
    } catch (e) {
      console.log('[KDC] overlay capture failed:', String(e));
      finishOverlay(null);
    }
  }

  /**
   * Renders the stamp on a transparent background off-screen and captures it,
   * returning a PNG URI for the native camera to burn in (or null on failure).
   */
  function renderStampPng(snap: CaptureSnapshot) {
    return new Promise<string | null>((resolve) => {
      overlayDone.current = false;
      overlayResolve.current = resolve;
      setOverlayJob({ loc: snap.loc, ts: snap.ts });
      // Safety net: if onLayout/capture never fires, skip the overlay.
      setTimeout(() => finishOverlay(null), 4000);
    });
  }

  /** Triggers a native photo and resolves with its file URI. */
  function capturePhoto(): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = photoIdRef.current + 1;
      photoIdRef.current = id;
      photoResolvers.current.set(id, { resolve, reject });
      setPhotoRequestId(id);
      setTimeout(() => {
        const entry = photoResolvers.current.get(id);
        if (entry) {
          photoResolvers.current.delete(id);
          entry.reject(new Error('photo timed out'));
        }
      }, 8000);
    });
  }

  async function takePhoto() {
    if (busy || processing) return;
    setBusy(true);
    flashShutter();
    try {
      const snap: CaptureSnapshot = { loc: location, ts: Date.now() };
      // Stage the stamp, let the prop flush to native, then capture.
      const overlay = await renderStampPng(snap);
      setOverlayUri(overlay);
      await waitFrame();
      const uri = await capturePhoto();
      await persistCapture(uri, 'photo', snap);
    } catch (e) {
      Alert.alert('Could not take photo', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      // Reflect the stop right away; native finalises and fires
      // onRecordingFinished, which persists the file and clears "Saving…".
      setRecording(false);
      setProcessing(true);
      return;
    }

    // Freeze location/time when recording starts so the burned-in stamp matches
    // the moment the recording began.
    const snap: CaptureSnapshot = { loc: location, ts: Date.now() };
    recordingSnap.current = snap;

    // Pin the window brightness at its current level so One UI can't dim the
    // screen mid-recording (FLAG_KEEP_SCREEN_ON alone doesn't stop the dim).
    try {
      const level = await Brightness.getBrightnessAsync();
      await Brightness.setBrightnessAsync(level);
    } catch (e) {
      console.log('[KDC] brightness pin failed:', String(e));
    }

    // Stage the stamp, let the prop flush to native, then start recording.
    const overlay = await renderStampPng(snap);
    setOverlayUri(overlay);
    await waitFrame();
    setRecording(true);
  }

  function handlePhotoCaptured(e: PhotoCapturedEvent) {
    const { uri, requestId } = e.nativeEvent;
    const entry = photoResolvers.current.get(requestId);
    if (entry) {
      photoResolvers.current.delete(requestId);
      entry.resolve(uri);
    }
  }

  async function handleRecordingFinished(e: RecordingFinishedEvent) {
    const uri = e.nativeEvent.uri;
    const snap = recordingSnap.current;
    recordingSnap.current = null;
    try {
      if (uri && snap) await persistCapture(uri, 'video', snap);
    } catch (err) {
      console.log('[KDC] persist video failed:', String(err));
    } finally {
      setProcessing(false);
      try {
        await Brightness.restoreSystemBrightnessAsync();
      } catch {
        // Best-effort.
      }
    }
  }

  function handleCaptureError(e: CaptureErrorEvent) {
    const { message, requestId } = e.nativeEvent;
    console.log('[KDC] capture error:', message);
    if (requestId != null) {
      // A photo failed — reject its pending promise.
      const entry = photoResolvers.current.get(requestId);
      if (entry) {
        photoResolvers.current.delete(requestId);
        entry.reject(new Error(message));
      }
      return;
    }
    // A recording/bind error — reset the recording UI and restore brightness.
    setRecording(false);
    setProcessing(false);
    recordingSnap.current = null;
    Brightness.restoreSystemBrightnessAsync().catch(() => {});
  }

  function onShutterPress() {
    if (mode === 'photo') takePhoto();
    else toggleRecording();
  }

  return (
    <View style={styles.container}>
      {/* Off-screen stage: the stamp on a transparent background, captured as a
          PNG and burned into captures by the native camera. */}
      {overlayJob && (
        <View
          ref={overlayViewRef}
          collapsable={false}
          style={[styles.overlayStage, { width: windowWidth }]}
          onLayout={captureOverlay}
        >
          <Stamp
            latitude={overlayJob.loc.latitude}
            longitude={overlayJob.loc.longitude}
            address={overlayJob.loc.address}
            timestamp={overlayJob.ts}
          />
        </View>
      )}

      <StampCameraView
        style={StyleSheet.absoluteFill}
        facing={facing}
        overlayUri={overlayUri}
        recording={recording}
        photoRequestId={photoRequestId}
        onPhotoCaptured={handlePhotoCaptured}
        onRecordingFinished={handleRecordingFinished}
        onCaptureError={handleCaptureError}
      />

      {/* Shutter flash overlay. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.flash, { opacity: flashOpacity }]}
      />

      {/* Top bar: just the recording timer / saving indicator. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="none">
        {recording && (
          <View style={styles.recPill}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{formatDuration(elapsed)}</Text>
          </View>
        )}
        {processing && (
          <View style={styles.recPill}>
            <ActivityIndicator color={colors.text} size="small" />
            <Text style={styles.recText}>Saving…</Text>
          </View>
        )}
      </View>

      {/* Bottom: location/timestamp stamp + controls */}
      <View
        style={[
          styles.bottom,
          {
            paddingBottom: insets.bottom + 14,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
          },
        ]}
      >
        <Stamp
          latitude={location.latitude}
          longitude={location.longitude}
          address={location.address}
          timestamp={now}
        />

        <View style={styles.modeRow}>
          <Pressable onPress={() => !recording && !processing && setMode('photo')}>
            <Text style={[styles.modeText, mode === 'photo' && styles.modeActive]}>PHOTO</Text>
          </Pressable>
          <Pressable onPress={() => !recording && !processing && setMode('video')}>
            <Text style={[styles.modeText, mode === 'video' && styles.modeActive]}>VIDEO</Text>
          </Pressable>
        </View>

        <View style={styles.controls}>
          <View style={styles.sideSlot}>
            <Pressable
              style={styles.galleryButton}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              disabled={recording}
            >
              <Text style={styles.iconText}>🔄</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={onShutterPress}
            disabled={busy || processing}
            style={[
              styles.shutterOuter,
              mode === 'video' && styles.shutterOuterVideo,
            ]}
          >
            {busy || processing ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <View
                style={[
                  styles.shutterInner,
                  mode === 'video' && styles.shutterInnerVideo,
                  recording && styles.shutterInnerRecording,
                ]}
              />
            )}
          </Pressable>
          <View style={styles.sideSlot}>
            <Pressable style={styles.galleryButton} onPress={onOpenGallery} disabled={recording}>
              <Text style={styles.iconText}>🖼️</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flash: { backgroundColor: '#fff' },
  // Transparent stage behind the camera; the native camera anchors this PNG
  // full-width at the bottom of the frame, so bake in the side/bottom insets.
  // Width is set inline to the current window width.
  overlayStage: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 20 },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.overlay,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  recText: { color: colors.text, fontVariant: ['tabular-nums'], fontWeight: '600' },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    gap: 14,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
  },
  modeText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  modeActive: { color: colors.accent },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSlot: { width: 64, alignItems: 'center' },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterVideo: { borderColor: colors.accent },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.text,
  },
  shutterInnerVideo: { backgroundColor: colors.accent },
  shutterInnerRecording: {
    width: 30,
    height: 30,
    borderRadius: 6,
  },
});
