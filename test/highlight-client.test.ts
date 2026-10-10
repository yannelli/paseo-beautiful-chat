import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  cachedResponse,
  fetchLines,
  localResponse,
  type HighlightRequest,
} from "../client/highlight";

const tokens = {
  lines: [[{ text: "const", color: "#ff7b72" }]],
  language: "typescript",
  theme: "github-dark-default",
};

describe("plain-text hints", () => {
  test("unlabeled fences, text and plaintext are built locally", () => {
    for (const language of ["plaintext", "text", " TXT "]) {
      const response = localResponse({ code: "a\n\nb", language, dark: true });
      assert.deepEqual(response?.lines, [
        [{ text: "a", color: null }],
        [],
        [{ text: "b", color: null }],
      ]);
    }
  });

  test("a real language, or a diff body, still goes to the daemon", () => {
    assert.equal(localResponse({ code: "a", language: "typescript", dark: true }), null);
    assert.equal(localResponse({ code: "a", dark: true }), null);
    assert.equal(
      localResponse({ code: "+a", language: "text", dark: true, diffBodyCode: "a" }),
      null,
    );
  });
});

describe("highlight cache", () => {
  test("a failed call is not cached, so a later mount is highlighted", async () => {
    const request: HighlightRequest = {
      code: "const reconnect = 1;",
      language: "typescript",
      dark: true,
    };
    await fetchLines(async () => {
      throw new Error("disconnected");
    }, request);
    assert.equal(cachedResponse(request), undefined);

    await fetchLines(async () => tokens, request);
    assert.deepEqual(cachedResponse(request)?.lines, [
      [{ text: "const", color: "#ff7b72", bold: false, italic: false }],
    ]);
  });

  test("concurrent mounts of one block share a single call", async () => {
    const request: HighlightRequest = {
      code: "const shared = 1;",
      language: "typescript",
      dark: false,
    };
    let calls = 0;
    const call = async () => {
      calls += 1;
      return tokens;
    };
    await Promise.all([
      fetchLines(call, request),
      fetchLines(call, request),
      fetchLines(call, request),
    ]);
    assert.equal(calls, 1);
  });

  test("an answer with no grammar is cached as no highlight", async () => {
    const request: HighlightRequest = { code: "zzz", language: "cobol", dark: true };
    await fetchLines(
      async () => ({ lines: [[{ text: "zzz", color: null }]], language: null, theme: "x" }),
      request,
    );
    assert.equal(cachedResponse(request), null);
  });
});
