/** Formats epoch milliseconds as e.g. "Jun 20, 2026 · 2:45 PM". */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

/** Formats coordinates as e.g. "37.7749° N, 122.4194° W". */
export function formatCoords(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return 'Locating…';
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

/** Formats elapsed seconds as M:SS for the recording timer. */
export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
