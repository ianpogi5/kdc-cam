import { useEffect, useState } from 'react';
import { BackHandler, PermissionsAndroid, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';

import CameraScreen from './src/CameraScreen';
import GalleryScreen from './src/GalleryScreen';
import MediaViewer from './src/MediaViewer';
import { colors, radius } from './src/theme';
import { MediaItem } from './src/metadata';

type Screen = 'camera' | 'gallery' | 'viewer';

export default function App() {
  const [screen, setScreen] = useState<Screen>('camera');
  const [viewerItems, setViewerItems] = useState<MediaItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [libPerm, requestLib] = MediaLibrary.usePermissions();
  const [locGranted, setLocGranted] = useState<boolean | null>(null);
  // Camera + microphone (granted via the native PermissionsAndroid prompt, since
  // we own the camera with CameraX rather than expo-camera).
  const [camMicGranted, setCamMicGranted] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const cam = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      const mic = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      setCamMicGranted(cam && mic);
      const loc = await Location.getForegroundPermissionsAsync();
      setLocGranted(loc.granted);
    })();
  }, []);

  async function requestAll() {
    const res = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    setCamMicGranted(
      res[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
        res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED,
    );
    await requestLib();
    const loc = await Location.requestForegroundPermissionsAsync();
    setLocGranted(loc.granted);
  }

  // Map Android's hardware back button onto the in-app screen stack instead of
  // letting it exit the app. Only the camera (root) screen falls through to the
  // OS default.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'viewer') {
        setScreen('gallery');
        return true;
      }
      if (screen === 'gallery') {
        setScreen('camera');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  const ready = camMicGranted && libPerm?.granted && locGranted === true;

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.gate}>
          <StatusBar style="light" />
          <Text style={styles.gateIcon}>📸</Text>
          <Text style={styles.gateTitle}>KDC Cam</Text>
          <Text style={styles.gateBody}>
            To take location-stamped photos and videos, KDC Cam needs access to your
            camera, microphone, location, and photo library.
          </Text>
          <Pressable style={styles.gateButton} onPress={requestAll}>
            <Text style={styles.gateButtonText}>Grant permissions</Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen === 'camera' && (
        <CameraScreen
          onOpenGallery={() => setScreen('gallery')}
          onCaptured={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {screen === 'gallery' && (
        <GalleryScreen
          refreshKey={refreshKey}
          onBack={() => setScreen('camera')}
          onOpenItem={(items, index) => {
            setViewerItems(items);
            setViewerIndex(index);
            setScreen('viewer');
          }}
        />
      )}
      {screen === 'viewer' && viewerItems.length > 0 && (
        <MediaViewer
          items={viewerItems}
          initialIndex={viewerIndex}
          onBack={() => setScreen('gallery')}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  gateIcon: { fontSize: 56 },
  gateTitle: { color: colors.text, fontSize: 28, fontWeight: '800' },
  gateBody: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  gateButton: {
    marginTop: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  gateButtonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
