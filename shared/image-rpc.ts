import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { stripSelector } from "./file-rpc";

/**
 * Reads an image file so the chat can show it.
 *
 * A read of a `.png` arrives as a tool call whose `code` is the reader's
 * placeholder text, because the bytes never travel through the timeline. The
 * client cannot reach the filesystem either, so the daemon side loads the file
 * and returns it as a data URI, along with the pixel size read out of the
 * file's own header.
 *
 * `dataUri` is null whenever the file cannot be shown — missing, too large,
 * not an image — and `error` says which.
 */
export const imageRpc = defineRpc({
  // The host accepts lower-case, dotted RPC names only.
  name: "file.image",
  input: z.object({
    cwd: z.string(),
    path: z.string(),
  }),
  output: z.object({
    dataUri: z.string().nullable(),
    mime: z.string().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    bytes: z.number().nullable(),
    error: z.string().nullable(),
  }),
});

// Image types worth previewing, by lower-case extension, with each data URI's
// mime. A Map, so a name such as `x.constructor` finds nothing.
export const IMAGE_MIMES: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["ico", "image/x-icon"],
  ["svg", "image/svg+xml"],
]);

/** The lower-case extension of the last path segment, selector removed, or "". */
export function pathExtension(path: string): string {
  const parts = stripSelector(path).split(/[\\/]/);
  const base = parts[parts.length - 1] ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** True when this path names a file the chat can draw rather than tokenise. */
export function isImagePath(path: string | undefined): boolean {
  return path !== undefined && IMAGE_MIMES.has(pathExtension(path));
}
