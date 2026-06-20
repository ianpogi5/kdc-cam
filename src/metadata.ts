import { Directory, File, Paths } from 'expo-file-system';

export type MediaType = 'photo' | 'video';

export interface MediaItem {
  /** File name inside the app media directory. */
  file: string;
  type: MediaType;
  /** Epoch milliseconds the capture was taken. */
  timestamp: number;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  /** Human readable reverse-geocoded address, if available. */
  address: string | null;
}

const META_FILE = 'media-meta.json';
const MEDIA_DIR = 'media';

function metaFile(): File {
  return new File(Paths.document, META_FILE);
}

function mediaDir(): Directory {
  return new Directory(Paths.document, MEDIA_DIR);
}

/** Ensures the media directory exists and returns it. */
export function ensureMediaDir(): Directory {
  const dir = mediaDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

/** Absolute file:// URI for a media file name. */
export function mediaUri(fileName: string): string {
  return new File(mediaDir(), fileName).uri;
}

/** Loads all stored items, newest first. */
export function loadItems(): MediaItem[] {
  const f = metaFile();
  if (!f.exists) return [];
  try {
    const raw = f.textSync();
    const parsed = JSON.parse(raw) as { items?: MediaItem[] };
    const items = parsed.items ?? [];
    return [...items].sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

function saveItems(items: MediaItem[]): void {
  const f = metaFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify({ items }));
}

/** Adds a new item to the store. */
export function addItem(item: MediaItem): void {
  const items = loadItems();
  items.unshift(item);
  saveItems(items);
}

/** Removes an item and its underlying media file. */
export function deleteItem(fileName: string): void {
  const items = loadItems().filter((i) => i.file !== fileName);
  saveItems(items);
  const media = new File(mediaDir(), fileName);
  if (media.exists) media.delete();
}
