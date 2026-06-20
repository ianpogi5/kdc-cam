import { useCallback, useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from './theme';
import { deleteItem, loadItems, MediaItem, mediaUri } from './metadata';

interface GalleryScreenProps {
  onBack: () => void;
  onOpenItem: (items: MediaItem[], index: number) => void;
  /** Bumped by the parent whenever a new capture is saved. */
  refreshKey: number;
}

const GAP = 3;
const COLUMNS = 3;

export default function GalleryScreen({ onBack, onOpenItem, refreshKey }: GalleryScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<MediaItem[]>([]);

  const reload = useCallback(() => setItems(loadItems()), []);
  useEffect(reload, [reload, refreshKey]);

  const cell = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  function confirmDelete(item: MediaItem) {
    Alert.alert('Delete', 'Remove this item from KDC Cam?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteItem(item.file);
          reload();
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>‹ Camera</Text>
        </Pressable>
        <Text style={styles.title}>Gallery</Text>
        <View style={styles.backButton} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyText}>No photos or videos yet.</Text>
          <Text style={styles.emptySub}>Captures you take will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.file}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP, paddingBottom: insets.bottom + 12 }}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => onOpenItem(items, index)}
              onLongPress={() => confirmDelete(item)}
              style={[styles.cell, { width: cell, height: cell }]}
            >
              <Image source={{ uri: mediaUri(item.file) }} style={styles.thumb} />
              {item.type === 'video' && (
                <View style={styles.videoBadge}>
                  <Text style={styles.videoBadgeText}>▶</Text>
                </View>
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backButton: { minWidth: 90 },
  backText: { color: colors.accent, fontSize: 17 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  emptySub: { color: colors.textMuted, fontSize: 14 },
  cell: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadgeText: { color: colors.text, fontSize: 12, marginLeft: 2 },
});
