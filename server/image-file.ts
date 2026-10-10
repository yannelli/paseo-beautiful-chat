import { open, stat, type FileHandle } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { stripSelector } from "../shared/file-rpc";
import { IMAGE_MIMES, imageRpc, pathExtension } from "../shared/image-rpc";
import { KIND_MIMES, readImageSize, sniffImageKind } from "./image-header";

type ImageInput = RpcInput<typeof imageRpc>;
type ImageOutput = RpcOutput<typeof imageRpc>;

// A data URI travels as base64 in a JSON string, about a third above the file
// itself. Past this the thumbnail is not worth the message, and the card
// reports the size instead of drawing it.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** How much of an over-limit file is read for its size: room for a phone's EXIF and ICC. */
const HEAD_BYTES = 256 * 1024;

const EMPTY: ImageOutput = {
  dataUri: null,
  mime: null,
  width: null,
  height: null,
  bytes: null,
  error: null,
};

function failure(error: string): ImageOutput {
  return { ...EMPTY, error };
}

// Resolves the requested path, or says why it cannot. A relative path needs
// the agent's directory: the daemon's own would read the wrong file.
export function resolveImagePath(cwd: string, path: string): string | { error: string } {
  const requested = stripSelector(path);
  if (!requested) return { error: "No path" };
  if (isAbsolute(requested)) return requested;
  if (!isAbsolute(cwd)) return { error: "No working directory to resolve the path against" };
  return resolve(cwd, requested);
}

// The extension picks what to ask for, and the bytes decide what comes back:
// a file whose header is not an image is refused, whatever it is called and
// wherever it points.
export async function readImageFile(input: ImageInput): Promise<ImageOutput> {
  const extension = pathExtension(input.path);
  if (!IMAGE_MIMES.has(extension)) return failure(`Not an image: .${extension}`);

  const target = resolveImagePath(input.cwd, input.path);
  if (typeof target !== "string") return failure(target.error);

  let handle: FileHandle | null = null;
  try {
    const entry = await stat(target);
    if (!entry.isFile()) return failure("Not a file");

    handle = await open(target, "r");
    const whole = entry.size <= MAX_IMAGE_BYTES;
    let bytes: Buffer;
    if (whole) {
      bytes = await handle.readFile();
    } else {
      const head = Buffer.alloc(Math.min(HEAD_BYTES, entry.size));
      const { bytesRead } = await handle.read(head, 0, head.length, 0);
      bytes = head.subarray(0, bytesRead);
    }

    const kind = sniffImageKind(bytes, extension);
    if (kind === null) return failure(`Not an image: the bytes are not .${extension}`);
    const size = readImageSize(bytes, kind);
    const dimensions = { width: size?.width ?? null, height: size?.height ?? null };

    // The file can grow between the stat and the read.
    if (!whole || bytes.length > MAX_IMAGE_BYTES) {
      const total = whole ? bytes.length : entry.size;
      return { ...EMPTY, ...dimensions, bytes: total, error: "Too large to preview" };
    }

    const mime = KIND_MIMES[kind];
    return {
      dataUri: `data:${mime};base64,${bytes.toString("base64")}`,
      mime,
      ...dimensions,
      bytes: bytes.length,
      error: null,
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    await handle?.close();
  }
}
