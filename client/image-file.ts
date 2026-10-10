import { useEffect, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { imageRpc, isImagePath } from "../shared/image-rpc";

export { isImagePath };

/** What the daemon side could tell the client about one image file. */
export interface ImageFile {
  dataUri: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  error: string | null;
}

type ImageCall = (input: { cwd: string; path: string }) => Promise<ImageFile>;

// A virtualized row remounts as it scrolls back into view, and each read can be
// megabytes, so the last few images stay here. Map order is the LRU order.
const CACHE_LIMIT = 16;
const cache = new Map<string, ImageFile>();
const inFlight = new Map<string, Promise<ImageFile>>();

function keyOf(cwd: string, path: string): string {
  return `${cwd}\u0000${path}`;
}

function remember(key: string, file: ImageFile): void {
  cache.delete(key);
  cache.set(key, file);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** The cached image for this path, without touching its recency. */
export function peekImageFile(cwd: string, path: string): ImageFile | undefined {
  return cache.get(keyOf(cwd, path));
}

// One read per key: a second mount joins the call in flight. Only a drawable
// image is kept, so a file that was missing, or a call made while the host was
// away, is asked for again on the next mount.
export function loadImageFile(load: ImageCall, cwd: string, path: string): Promise<ImageFile> {
  const key = keyOf(cwd, path);
  const hit = cache.get(key);
  if (hit) {
    remember(key, hit);
    return Promise.resolve(hit);
  }
  const pending = inFlight.get(key);
  if (pending) return pending;

  const started = load({ cwd, path })
    .then(
      (result): ImageFile => ({
        dataUri: result.dataUri,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        error: result.error,
      }),
      (error: unknown): ImageFile => ({
        dataUri: null,
        width: null,
        height: null,
        bytes: null,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    .then((file) => {
      if (file.dataUri !== null) remember(key, file);
      return file;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, started);
  return started;
}

// Null while the read is in flight. A failure resolves to a record carrying the
// reason rather than throwing, so the card shows the message.
export function useImageFile(path: string | undefined, cwd: string | null): ImageFile | null {
  const load = useRpc(imageRpc);
  const base = cwd ?? "";
  const wanted = path !== undefined && isImagePath(path);
  const key = wanted ? keyOf(base, path) : null;
  const [loaded, setLoaded] = useState<{ key: string; file: ImageFile } | null>(null);

  useEffect(() => {
    if (key === null || path === undefined) return;
    let cancelled = false;
    void loadImageFile(load, base, path).then((file) => {
      if (!cancelled) setLoaded({ key, file });
    });
    return () => {
      cancelled = true;
    };
  }, [load, key, base, path]);

  if (key === null || path === undefined) return null;
  // The cache answers during render, so a remounted row draws with no flash.
  if (loaded?.key === key) return loaded.file;
  return peekImageFile(base, path) ?? null;
}
