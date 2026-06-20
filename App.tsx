import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';
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
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [libPerm, requestLib] = MediaLibrary.usePermissions();
  const [locGranted, setLocGranted] = useState<boolean | null>(null);

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((p) => setLocGranted(p.granted));
  }, []);

  async function requestAll() {
    await requestCam();
    await requestMic();
    await requestLib();
    const loc = await Location.requestForegroundPermissionsAsync();
    setLocGranted(loc.granted);
  }

  const ready =
    camPerm?.granted && micPerm?.granted && libPerm?.granted && locGranted === true;

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
          onOpenItem={(item) => {
            setSelected(item);
            setScreen('viewer');
          }}
        />
      )}
      {screen === 'viewer' && selected && (
        <MediaViewer item={selected} onBack={() => setScreen('gallery')} />
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
