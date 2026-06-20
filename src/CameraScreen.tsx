import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, CameraType } from 'expo-camera';
import * as Location from 'expo-location';
// The top-level expo-media-library asset/album functions are deprecated in this
// SDK and throw at runtime; the `/legacy` entry provides the working impls.
import * as MediaLibrary from 'expo-media-library/legacy';
import { File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

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

export default function CameraScreen({ onOpenGallery, onCaptured }: CameraScreenProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [facing, setFacing] = useState<CameraType>('back');
  const [mode, setMode] = useState<MediaType>('photo');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [location, setLocation] = useState<LiveLocation>(EMPTY_LOCATION);

  const lastGeocodeKey = useRef<string | null>(null);

  // Off-screen "bake" stage used to burn the stamp into the saved photo.
  const [bakeJob, setBakeJob] = useState<
    null | { uri: string; w: number; h: number; loc: LiveLocation; ts: number }
  >(null);
  const bakeViewRef = useRef<View>(null);
  const bakeResolve = useRef<((uri: string) => void) | null>(null);
  const bakeDone = useRef(false);

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
    const ext = uri.split('.').pop() || (type === 'photo' ? 'jpg' : 'mov');
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

  /** Resolves the in-flight bake with a final URI and tears down the stage. */
  function finishBake(resultUri: string) {
    if (bakeDone.current) return;
    bakeDone.current = true;
    const resolve = bakeResolve.current;
    bakeResolve.current = null;
    setBakeJob(null);
    resolve?.(resultUri);
  }

  /** Captures the off-screen stage once its image has loaded. */
  async function runBakeCapture() {
    if (bakeDone.current || !bakeViewRef.current) return;
    const fallback = bakeJob?.uri ?? '';
    try {
      const out = await captureRef(bakeViewRef, { format: 'jpg', quality: 0.92 });
      console.log('[KDC] bake captured:', out);
      finishBake(out || fallback);
    } catch (e) {
      console.log('[KDC] bake FAILED, using original:', String(e));
      finishBake(fallback);
    }
  }

  /**
   * Renders the photo + location/timestamp stamp off-screen and captures it,
   * returning a new URI with the stamp burned into the pixels. Falls back to
   * the original photo if compositing fails.
   */
  function bakeStamp(uri: string, photoW: number, photoH: number, snap: CaptureSnapshot) {
    const BASE_W = 384;
    const aspect = photoW && photoH ? photoH / photoW : 4 / 3;
    return new Promise<string>((resolve) => {
      bakeDone.current = false;
      bakeResolve.current = resolve;
      setBakeJob({ uri, w: BASE_W, h: Math.round(BASE_W * aspect), loc: snap.loc, ts: snap.ts });
      // Safety net: if onLoad/capture never fires, keep the original photo.
      setTimeout(() => finishBake(uri), 4000);
    });
  }

  async function takePhoto() {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) return;
      console.log('[KDC] photo taken:', photo.width, 'x', photo.height, photo.uri);
      const snap: CaptureSnapshot = { loc: location, ts: Date.now() };
      const baked = await bakeStamp(photo.uri, photo.width, photo.height, snap);
      console.log('[KDC] bake result, fellBackToOriginal=', baked === photo.uri);
      await persistCapture(baked || photo.uri, 'photo', snap);
    } catch (e) {
      Alert.alert('Could not take photo', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (!cameraRef.current) return;

    if (recording) {
      cameraRef.current.stopRecording();
      return;
    }

    // Freeze location/time when recording starts; videos keep the overlay in
    // the viewer (the stamp is not burned into video frames).
    const snap: CaptureSnapshot = { loc: location, ts: Date.now() };
    setRecording(true);
    try {
      const video = await cameraRef.current.recordAsync();
      if (video?.uri) await persistCapture(video.uri, 'video', snap);
    } catch (e) {
      Alert.alert('Could not record video', String(e));
    } finally {
      setRecording(false);
    }
  }

  function onShutterPress() {
    if (mode === 'photo') takePhoto();
    else toggleRecording();
  }

  return (
    <View style={styles.container}>
      {/* Off-screen stage: the photo + stamp, rendered behind the camera and
          captured so the stamp is burned into the saved image. */}
      {bakeJob && (
        <View
          ref={bakeViewRef}
          collapsable={false}
          style={[styles.bakeStage, { width: bakeJob.w, height: bakeJob.h }]}
        >
          <Image
            source={{ uri: bakeJob.uri }}
            style={{ width: bakeJob.w, height: bakeJob.h }}
            resizeMode="cover"
            onLoad={runBakeCapture}
          />
          <View style={styles.bakeStamp}>
            <Stamp
              latitude={bakeJob.loc.latitude}
              longitude={bakeJob.loc.longitude}
              address={bakeJob.loc.address}
              timestamp={bakeJob.ts}
            />
          </View>
        </View>
      )}

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode={mode === 'photo' ? 'picture' : 'video'}
      />

      {/* Top bar: gallery + flip */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.iconButton} onPress={onOpenGallery} disabled={recording}>
          <Text style={styles.iconText}>🖼️</Text>
        </Pressable>
        {recording && (
          <View style={styles.recPill}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{formatDuration(elapsed)}</Text>
          </View>
        )}
        <Pressable
          style={styles.iconButton}
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          disabled={recording}
        >
          <Text style={styles.iconText}>🔄</Text>
        </Pressable>
      </View>

      {/* Bottom: location/timestamp stamp + controls */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
        <Stamp
          latitude={location.latitude}
          longitude={location.longitude}
          address={location.address}
          timestamp={now}
        />

        <View style={styles.modeRow}>
          <Pressable onPress={() => !recording && setMode('photo')}>
            <Text style={[styles.modeText, mode === 'photo' && styles.modeActive]}>PHOTO</Text>
          </Pressable>
          <Pressable onPress={() => !recording && setMode('video')}>
            <Text style={[styles.modeText, mode === 'video' && styles.modeActive]}>VIDEO</Text>
          </Pressable>
        </View>

        <View style={styles.controls}>
          <View style={styles.sideSlot} />
          <Pressable
            onPress={onShutterPress}
            disabled={busy}
            style={[
              styles.shutterOuter,
              mode === 'video' && styles.shutterOuterVideo,
            ]}
          >
            {busy ? (
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
  // Sits behind the camera preview so it renders (and is capturable) but is
  // never seen by the user.
  bakeStage: { position: 'absolute', top: 0, left: 0, backgroundColor: colors.bg },
  bakeStamp: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    paddingHorizontal: 16,
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
