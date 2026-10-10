import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { loadImageFile, peekImageFile, type ImageFile } from "../client/image-file";
import { readImageSize, sniffImageKind } from "../server/image-header";
import { MAX_IMAGE_BYTES, readImageFile } from "../server/image-file";

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function segment(marker: number, payload: number): Buffer {
  const bytes = Buffer.alloc(4 + payload, 0x41);
  bytes[0] = 0xff;
  bytes[1] = marker;
  bytes.writeUInt16BE(payload + 2, 2);
  return bytes;
}

/** A JPEG whose frame header sits behind `metadata` bytes of EXIF and ICC, as a phone writes it. */
function jpeg(width: number, height: number, metadata: number, tail = 0): Buffer {
  const frame = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  const exif = Math.min(metadata, 60_000);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe1, exif),
    segment(0xe2, metadata - exif),
    Buffer.from([0xff, 0xff]),
    frame,
    segment(0xda, 10),
    Buffer.alloc(tail, 0x55),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function riff(chunk: string, body: Buffer): Buffer {
  const head = Buffer.alloc(20);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(12 + body.length, 4);
  head.write("WEBP", 8, "latin1");
  head.write(chunk, 12, "latin1");
  head.writeUInt32LE(body.length, 16);
  return Buffer.concat([head, body]);
}

function webpLossy(width: number, height: number): Buffer {
  const body = Buffer.from([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0, 0, 0, 0]);
  body.writeUInt16LE(width, 6);
  body.writeUInt16LE(height, 8);
  return riff("VP8 ", body);
}

function webpLossless(width: number, height: number): Buffer {
  const body = Buffer.alloc(5);
  body[0] = 0x2f;
  body.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 1);
  return riff("VP8L", body);
}

function webpExtended(width: number, height: number): Buffer {
  const body = Buffer.alloc(10);
  body.writeUIntLE(width - 1, 4, 3);
  body.writeUIntLE(height - 1, 7, 3);
  return riff("VP8X", body);
}

const svg = (attributes: string) =>
  Buffer.from(
    `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${attributes}></svg>`,
  );

const KEY = Buffer.from("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n");

describe("image magic bytes", () => {
  test("each supported format is recognised from its header", () => {
    const avif = Buffer.alloc(32);
    avif.writeUInt32BE(28, 0);
    avif.write("ftypmif1", 4, "latin1");
    avif.write("avif", 16, "latin1");
    const bmp = Buffer.alloc(30);
    bmp.write("BM", 0, "latin1");

    assert.equal(sniffImageKind(png(1, 1), "png"), "png");
    assert.equal(sniffImageKind(jpeg(1, 1, 10), "jpg"), "jpeg");
    assert.equal(sniffImageKind(Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"), "gif"), "gif");
    assert.equal(sniffImageKind(webpLossy(1, 1), "webp"), "webp");
    assert.equal(sniffImageKind(avif, "avif"), "avif");
    assert.equal(sniffImageKind(bmp, "bmp"), "bmp");
    assert.equal(sniffImageKind(Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]), "ico"), "ico");
    assert.equal(sniffImageKind(Buffer.from('<svg viewBox="0 0 1 1"/>'), "svg"), "svg");
    assert.equal(sniffImageKind(svg(""), "svg"), "svg");
  });

  test("text that is not an image is refused", () => {
    assert.equal(sniffImageKind(KEY, "png"), null);
    assert.equal(
      sniffImageKind(Buffer.from('<?xml version="1.0"?><config secret="x"/>'), "svg"),
      null,
    );
    assert.equal(sniffImageKind(Buffer.alloc(0), "png"), null);
  });

  test("SVG text only counts under an svg extension", () => {
    assert.equal(sniffImageKind(svg(""), "png"), null);
  });

  test("an MP4 ftyp box is not an AVIF", () => {
    const mp4 = Buffer.alloc(24);
    mp4.writeUInt32BE(24, 0);
    mp4.write("ftypisom", 4, "latin1");
    mp4.write("mp42", 16, "latin1");
    assert.equal(sniffImageKind(mp4, "avif"), null);
  });
});

describe("image dimensions", () => {
  test("PNG, GIF and BMP read their fixed headers", () => {
    assert.deepEqual(readImageSize(png(640, 480), "png"), { width: 640, height: 480 });
    assert.deepEqual(readImageSize(Buffer.from("GIF89a\x20\x00\x10\x00", "latin1"), "gif"), {
      width: 32,
      height: 16,
    });
  });

  test("a JPEG frame header past 64 KB of EXIF and ICC is still found", () => {
    const bytes = jpeg(4032, 3024, 70_000);
    assert.ok(bytes.indexOf(Buffer.from([0xff, 0xc0])) > 4096);
    assert.deepEqual(readImageSize(bytes, "jpeg"), { width: 4032, height: 3024 });
  });

  test("a JPEG with no frame header before its scan has no size", () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xda, 4)]);
    assert.equal(readImageSize(bytes, "jpeg"), null);
  });

  test("WebP lossy, lossless and extended headers", () => {
    assert.deepEqual(readImageSize(webpLossy(800, 600), "webp"), { width: 800, height: 600 });
    assert.deepEqual(readImageSize(webpLossless(1024, 768), "webp"), { width: 1024, height: 768 });
    assert.deepEqual(readImageSize(webpExtended(5000, 3000), "webp"), {
      width: 5000,
      height: 3000,
    });
  });

  test("SVG viewBox values may be separated by commas", () => {
    assert.deepEqual(readImageSize(svg('viewBox="0,0,100,50"'), "svg"), { width: 100, height: 50 });
    assert.deepEqual(readImageSize(svg('viewBox="0, 0, 24 12.4"'), "svg"), {
      width: 24,
      height: 12,
    });
    assert.deepEqual(readImageSize(svg("viewBox='0 0 16 16'"), "svg"), { width: 16, height: 16 });
    assert.equal(readImageSize(svg('viewBox="0 0 16"'), "svg"), null);
  });
});

describe("readImageFile", () => {
  let dir = "";

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "beautiful-chat-image-"));
    await writeFile(join(dir, "Screenshot 2026-10-10 at 10.00.00.png"), png(1440, 900));
    await writeFile(join(dir, "phone.jpg"), jpeg(4032, 3024, 70_000));
    await writeFile(join(dir, "huge.jpg"), jpeg(8000, 6000, 70_000, MAX_IMAGE_BYTES));
    await writeFile(join(dir, "misnamed.jpg"), png(2, 2));
    await writeFile(join(dir, "id_ed25519"), KEY);
    await symlink(join(dir, "id_ed25519"), join(dir, "k.png"));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("a path with spaces and a line selector reads the file", async () => {
    const result = await readImageFile({
      cwd: dir,
      path: "Screenshot 2026-10-10 at 10.00.00.png:1-20",
    });
    assert.equal(result.error, null);
    assert.equal(result.mime, "image/png");
    assert.ok(result.dataUri?.startsWith("data:image/png;base64,"));
    assert.deepEqual([result.width, result.height], [1440, 900]);
  });

  test("an absolute path does not need the agent's directory", async () => {
    const result = await readImageFile({ cwd: "", path: join(dir, "phone.jpg") });
    assert.equal(result.error, null);
    assert.deepEqual([result.width, result.height], [4032, 3024]);
  });

  test("a symlinked key file named .png is never returned", async () => {
    const result = await readImageFile({ cwd: dir, path: "k.png" });
    assert.equal(result.dataUri, null);
    assert.match(result.error ?? "", /not an image/i);
  });

  test("a prototype key is not an image extension", async () => {
    for (const name of ["x.constructor", "x.__proto__", "x.toString", "x.hasOwnProperty"]) {
      const result = await readImageFile({ cwd: dir, path: name });
      assert.equal(result.dataUri, null);
      assert.match(result.error ?? "", /not an image/i);
    }
  });

  test("a relative path with no working directory is refused", async () => {
    const result = await readImageFile({ cwd: "", path: "phone.jpg" });
    assert.equal(result.dataUri, null);
    assert.match(result.error ?? "", /working directory/);
  });

  test("the bytes pick the mime, not the extension", async () => {
    const result = await readImageFile({ cwd: dir, path: "misnamed.jpg" });
    assert.equal(result.mime, "image/png");
  });

  test("an oversized file reports its size and dimensions without its bytes", async () => {
    const result = await readImageFile({ cwd: dir, path: "huge.jpg" });
    assert.equal(result.dataUri, null);
    assert.equal(result.error, "Too large to preview");
    assert.ok((result.bytes ?? 0) > MAX_IMAGE_BYTES);
    assert.deepEqual([result.width, result.height], [8000, 6000]);
  });
});

describe("client image cache", () => {
  const drawn = (dataUri: string): ImageFile => ({
    dataUri,
    width: 1,
    height: 1,
    bytes: 1,
    error: null,
  });

  test("mounts of the same image share one read, and a remount reads the cache", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return drawn("data:image/png;base64,AA==");
    };
    const [first, second] = await Promise.all([
      loadImageFile(load, "/repo", "a.png"),
      loadImageFile(load, "/repo", "a.png"),
    ]);
    assert.equal(first, second);
    await loadImageFile(load, "/repo", "a.png");
    assert.equal(calls, 1);
    assert.equal(peekImageFile("/repo", "a.png")?.dataUri, "data:image/png;base64,AA==");
  });

  test("a failed read is not cached, so the next mount asks again", async () => {
    const failing = async (): Promise<ImageFile> => {
      throw new Error("disconnected");
    };
    const failed = await loadImageFile(failing, "/repo", "b.png");
    assert.equal(failed.error, "disconnected");
    assert.equal(peekImageFile("/repo", "b.png"), undefined);
    const retried = await loadImageFile(
      async () => drawn("data:image/png;base64,AQ=="),
      "/repo",
      "b.png",
    );
    assert.equal(retried.dataUri, "data:image/png;base64,AQ==");
  });

  test("the cache keeps the 16 most recent images", async () => {
    for (let index = 0; index < 20; index += 1) {
      await loadImageFile(
        async () => drawn(`data:image/png;base64,${index}`),
        "/lru",
        `${index}.png`,
      );
    }
    assert.equal(peekImageFile("/lru", "0.png"), undefined);
    assert.equal(peekImageFile("/lru", "3.png"), undefined);
    assert.ok(peekImageFile("/lru", "4.png"));
    assert.ok(peekImageFile("/lru", "19.png"));
  });
});
