import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from './theme';
import { formatCoords, formatTimestamp } from './format';

interface StampProps {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  /** Epoch milliseconds. */
  timestamp: number;
}

/**
 * The location + timestamp overlay shown at the bottom of the screen on the
 * camera preview and over saved photos/videos in the viewer.
 */
export default function Stamp({ latitude, longitude, address, timestamp }: StampProps) {
  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.address} numberOfLines={2}>
        📍 {address ?? 'Locating address…'}
      </Text>
      <View style={styles.row}>
        <Text style={styles.coords}>{formatCoords(latitude, longitude)}</Text>
        <Text style={styles.time}>{formatTimestamp(timestamp)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.overlay,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 4,
  },
  address: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  coords: {
    color: colors.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  time: {
    color: colors.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
