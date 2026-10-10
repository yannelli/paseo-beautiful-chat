import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { launchDetached, revealCommand, revealPath } from "../server/reveal";
import { stripSelector } from "../shared/file-rpc";
import { isImagePath, pathExtension } from "../shared/image-rpc";

describe("stripSelector", () => {
  test("drops a trailing line or line range", () => {
    assert.equal(stripSelector("src/main.ts:55-85"), "src/main.ts");
    assert.equal(stripSelector("src/main.ts:55"), "src/main.ts");
    assert.equal(stripSelector("  shot.png:1-20  "), "shot.png");
  });

  test("keeps spaces inside a path", () => {
    assert.equal(
      stripSelector("Screenshot 2026-10-10 at 10.00.00.png"),
      "Screenshot 2026-10-10 at 10.00.00.png",
    );
    assert.equal(stripSelector("C:\\Users\\John Doe\\a.png"), "C:\\Users\\John Doe\\a.png");
    assert.equal(stripSelector("C:\\Users\\John Doe\\a.png:3-4"), "C:\\Users\\John Doe\\a.png");
  });

  test("keeps a colon that is not a line selector", () => {
    assert.equal(stripSelector("C:/a.png"), "C:/a.png");
    assert.equal(stripSelector("notes:draft.png"), "notes:draft.png");
  });
});

describe("image extensions", () => {
  test("a prototype key is not an image extension", () => {
    assert.equal(pathExtension("x.constructor"), "constructor");
    assert.equal(isImagePath("x.constructor"), false);
    assert.equal(isImagePath("x.__proto__"), false);
    assert.equal(isImagePath("x.toString"), false);
  });

  test("the extension comes from the last segment, selector removed", () => {
    assert.equal(isImagePath("Screenshot 2026-10-10 at 10.00.00.PNG:1-2"), true);
    assert.equal(isImagePath("C:\\Users\\John Doe\\a.webp"), true);
    assert.equal(isImagePath("assets.png/readme"), false);
    assert.equal(isImagePath(".png"), false);
    assert.equal(isImagePath(undefined), false);
  });
});

describe("reveal in the file manager", () => {
  test("Explorer gets the selected path quoted, so a comma stays inside it", () => {
    const command = revealCommand("C:\\Users\\a,b\\shot.png", false, "win32");
    assert.equal(command.command, "explorer.exe");
    assert.deepEqual(command.args, ['/select,"C:\\Users\\a,b\\shot.png"']);
    assert.equal(command.verbatim, true);
    assert.deepEqual(revealCommand("C:\\John Doe", true, "win32").args, ['"C:\\John Doe"']);
  });

  test("Finder selects the file, and other platforms open its directory", () => {
    assert.deepEqual(revealCommand("/a/b.png", false, "darwin").args, ["-R", "/a/b.png"]);
    assert.deepEqual(revealCommand("/a/b.png", false, "linux"), {
      command: "xdg-open",
      args: ["/a"],
      verbatim: false,
    });
  });

  test("a shell that cannot start rejects instead of reporting success", async () => {
    await assert.rejects(
      launchDetached({ command: "/nonexistent/paseo-reveal-test", args: [], verbatim: false }),
      /ENOENT/,
    );
  });

  test("a missing path, or a relative one with no directory, answers with an error", async () => {
    const missing = await revealPath({ cwd: "/", path: "/nonexistent/paseo/shot.png" });
    assert.equal(missing.revealed, null);
    assert.match(missing.error ?? "", /ENOENT/);
    const relative = await revealPath({ cwd: "", path: "shot.png" });
    assert.equal(relative.revealed, null);
    assert.match(relative.error ?? "", /working directory/);
  });
});
