import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from './theme';
import { MediaItem, mediaUri } from './metadata';

interface MediaViewerProps {
  item: MediaItem;
  onBack: () => void;
}

export default function MediaViewer({ item, onBack }: MediaViewerProps) {
  const insets = useSafeAreaInsets();
  const uri = mediaUri(item.file);
  const isVideo = item.type === 'video';

  const player = useVideoPlayer(isVideo ? uri : null, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <View style={styles.container}>
      {isVideo ? (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="contain"
          nativeControls
        />
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      )}

      <Pressable
        style={[styles.backButton, { top: insets.top + 8 }]}
        onPress={onBack}
      >
        <Text style={styles.backText}>‹ Gallery</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backButton: {
    position: 'absolute',
    left: 12,
    backgroundColor: colors.overlay,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  backText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
