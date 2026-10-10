/** An image format this plugin can recognise from the file's own bytes. */
export type ImageKind = "png" | "jpeg" | "gif" | "webp" | "avif" | "bmp" | "ico" | "svg";

export interface ImageSize {
  width: number;
  height: number;
}

export const KIND_MIMES: Readonly<Record<ImageKind, string>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

/** ISO-BMFF brands an AVIF (or a sibling HEIF still image) declares in its `ftyp` box. */
const IMAGE_BRANDS = new Set(["avif", "avis", "mif1", "msf1", "heic", "heix"]);

/** How far into an SVG the root element may sit, past its prolog, comments and doctype. */
const SVG_SCAN_CHARS = 64 * 1024;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  if (bytes.length < end) return "";
  return String.fromCharCode(...bytes.subarray(start, end));
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function u16le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

function u16be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function u24le(bytes: Uint8Array, at: number): number {
  return u16le(bytes, at) | ((bytes[at + 2] ?? 0) << 16);
}

function u32le(bytes: Uint8Array, at: number): number {
  return (u16le(bytes, at) | (u16le(bytes, at + 2) << 16)) >>> 0;
}

function u32be(bytes: Uint8Array, at: number): number {
  return ((u16be(bytes, at) << 16) | u16be(bytes, at + 2)) >>> 0;
}

function i32le(bytes: Uint8Array, at: number): number {
  return u32le(bytes, at) | 0;
}

/** The SVG text head, lower-cased, with a BOM and leading whitespace dropped. */
function svgHead(bytes: Uint8Array): string {
  const end = Math.min(bytes.length, SVG_SCAN_CHARS);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, end));
  return text.trimStart().toLowerCase();
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = svgHead(bytes);
  if (head.startsWith("<svg")) return /^<svg[\s>/]/.test(head);
  const prolog =
    head.startsWith("<?xml") || head.startsWith("<!--") || head.startsWith("<!doctype svg");
  return prolog && /<svg[\s>/]/.test(head);
}

function isAvif(bytes: Uint8Array): boolean {
  if (ascii(bytes, 4, 8) !== "ftyp") return false;
  const boxEnd = Math.min(bytes.length, u32be(bytes, 0));
  if (IMAGE_BRANDS.has(ascii(bytes, 8, 12))) return true;
  // Compatible brands follow the major brand and its minor version.
  for (let at = 16; at + 4 <= boxEnd; at += 4) {
    if (IMAGE_BRANDS.has(ascii(bytes, at, at + 4))) return true;
  }
  return false;
}

// The image format the bytes themselves declare, or null for anything else.
// SVG is text, so it counts only when the extension already claims `svg`.
export function sniffImageKind(bytes: Uint8Array, extension: string): ImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  const six = ascii(bytes, 0, 6);
  if (six === "GIF87a" || six === "GIF89a") return "gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (isAvif(bytes)) return "avif";
  if (startsWith(bytes, [0x42, 0x4d]) && bytes.length >= 26) return "bmp";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) && bytes.length >= 6) return "ico";
  if (extension === "svg" && looksLikeSvg(bytes)) return "svg";
  return null;
}

function sized(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Walks the JPEG marker chain to the first frame header, which holds the size. */
function jpegSize(bytes: Uint8Array): ImageSize | null {
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1] ?? 0;
    // A fill byte, or a marker that carries no length of its own.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    // The scan or the end arrived before any frame header.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(bytes, at + 2);
    if (length < 2) return null;
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (at + 9 > bytes.length) return null;
      return sized(u16be(bytes, at + 7), u16be(bytes, at + 5));
    }
    at += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array): ImageSize | null {
  const chunk = ascii(bytes, 12, 16);
  // Lossy: a key frame's start code, then two 14-bit dimensions.
  if (chunk === "VP8 " && bytes.length >= 30) {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return sized(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  }
  // Lossless: a signature byte, then each dimension minus one in 14 bits.
  if (chunk === "VP8L" && bytes.length >= 25) {
    if (bytes[20] !== 0x2f) return null;
    const bits = u32le(bytes, 21);
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  // Extended: each dimension minus one, in 24 bits.
  if (chunk === "VP8X" && bytes.length >= 30) {
    return sized(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
  }
  return null;
}

/** Reads the four viewBox numbers, separated by whitespace, commas or both. */
function svgSize(bytes: Uint8Array): ImageSize | null {
  const box = svgHead(bytes).match(/viewbox\s*=\s*["']([^"']*)["']/);
  if (!box) return null;
  const parts = (box[1] ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  return sized(Math.round(parts[2] ?? 0), Math.round(parts[3] ?? 0));
}

/** The pixel size, read out of the file's own header. Null when unreadable. */
export function readImageSize(bytes: Uint8Array, kind: ImageKind): ImageSize | null {
  switch (kind) {
    case "png":
      if (bytes.length < 24 || ascii(bytes, 12, 16) !== "IHDR") return null;
      return sized(u32be(bytes, 16), u32be(bytes, 20));
    case "gif":
      return bytes.length >= 10 ? sized(u16le(bytes, 6), u16le(bytes, 8)) : null;
    case "bmp":
      return bytes.length >= 26 ? sized(i32le(bytes, 18), Math.abs(i32le(bytes, 22))) : null;
    case "jpeg":
      return jpegSize(bytes);
    case "webp":
      return webpSize(bytes);
    case "svg":
      return svgSize(bytes);
    default:
      return null;
  }
}
