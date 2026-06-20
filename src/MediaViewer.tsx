import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from './theme';
import { deleteItem, MediaItem, mediaUri } from './metadata';

interface MediaViewerProps {
  items: MediaItem[];
  initialIndex: number;
  onBack: () => void;
  /** Called after a delete so the parent can refresh the gallery. */
  onChanged: () => void;
}

/**
 * The active video page. Mounted only while its page is current, so exactly one
 * ExoPlayer/decoder exists at a time — mounting one per list item exhausts the
 * heap and crashes once a few videos are adjacent.
 */
function VideoPage({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="contain"
      nativeControls
    />
  );
}

function MediaPage({
  item,
  width,
  active,
}: {
  item: MediaItem;
  width: number;
  active: boolean;
}) {
  const uri = mediaUri(item.file);
  const isVideo = item.type === 'video';

  return (
    <View style={[styles.page, { width }]}>
      {isVideo ? (
        active ? (
          <VideoPage uri={uri} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.videoPlaceholder]}>
            <Text style={styles.playGlyph}>▶</Text>
          </View>
        )
      ) : (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          resizeMethod="resize"
        />
      )}
    </View>
  );
}

export default function MediaViewer({
  items: initialItems,
  initialIndex,
  onBack,
  onChanged,
}: MediaViewerProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState(initialItems);
  const [current, setCurrent] = useState(initialIndex);
  const lastWidth = useRef(width);

  // Keep the active page centered if the viewport width changes (e.g. rotation).
  const listRef = useRef<FlatList<MediaItem>>(null);
  useEffect(() => {
    if (lastWidth.current !== width) {
      lastWidth.current = width;
      listRef.current?.scrollToOffset({ offset: current * width, animated: false });
    }
  }, [width, current]);

  function confirmDelete() {
    const item = items[current];
    if (!item) return;
    Alert.alert('Delete', `Delete this ${item.type}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDelete(item) },
    ]);
  }

  function doDelete(item: MediaItem) {
    deleteItem(item.file);
    onChanged();
    const next = items.filter((i) => i.file !== item.file);
    if (next.length === 0) {
      onBack();
      return;
    }
    const newIndex = Math.min(current, next.length - 1);
    setItems(next);
    setCurrent(newIndex);
    // The deleted page is gone; realign the viewport on the new current item.
    requestAnimationFrame(() =>
      listRef.current?.scrollToOffset({ offset: newIndex * width, animated: false }),
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.file}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        windowSize={3}
        removeClippedSubviews
        onMomentumScrollEnd={(e) =>
          setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item, index }) => (
          <MediaPage item={item} width={width} active={index === current} />
        )}
      />

      <Pressable style={[styles.backButton, { top: insets.top + 8 }]} onPress={onBack}>
        <Text style={styles.backText}>‹ Gallery</Text>
      </Pressable>

      <Pressable style={[styles.deleteButton, { top: insets.top + 8 }]} onPress={confirmDelete}>
        <Text style={styles.deleteText}>🗑</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  videoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  playGlyph: { color: colors.textMuted, fontSize: 48 },
  backButton: {
    position: 'absolute',
    left: 12,
    backgroundColor: colors.overlay,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  backText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  deleteButton: {
    position: 'absolute',
    right: 12,
    backgroundColor: colors.overlay,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 18 },
});
