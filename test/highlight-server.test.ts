import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { highlightCode } from "../server/highlight";
import { exceedsHighlightBudget, HIGHLIGHT_LIMITS, measureCode } from "../server/highlight-limits";

const longLine = (length: number) =>
  "const value = call(a, 'b', 42); ".repeat(Math.ceil(length / 32)).slice(0, length);
const block = (lines: number, length: number) =>
  Array.from({ length: lines }, () => longLine(length)).join("\n");

describe("highlight work cap", () => {
  test("measures lines, the longest line and the squared work in one pass", () => {
    assert.deepEqual(measureCode("ab\ncde\n"), { chars: 7, lines: 3, longest: 3, work: 13 });
    assert.deepEqual(measureCode(""), { chars: 0, lines: 1, longest: 0, work: 0 });
  });

  test("400 lines of 999 characters is over budget", () => {
    const code = block(400, 999);
    assert.ok(code.length < 400 * 1024, "the old byte guard let this through");
    assert.equal(exceedsHighlightBudget(code), true);
  });

  test("a few long lines are over budget even when the block is small", () => {
    assert.equal(exceedsHighlightBudget(block(10, 999)), true);
    assert.equal(exceedsHighlightBudget(block(1, 1001)), true);
  });

  test("ordinary source stays under budget", () => {
    assert.equal(exceedsHighlightBudget(block(1200, 45)), false);
    assert.equal(exceedsHighlightBudget(block(4, 999)), false);
  });

  test("past the total size cap the block is plain whatever its shape", () => {
    assert.equal(exceedsHighlightBudget(block(HIGHLIGHT_LIMITS.maxChars / 16 + 1, 15)), true);
  });
});

describe("highlightCode", () => {
  test("an over-budget block comes back plain at once", async () => {
    const code = block(400, 999);
    const started = performance.now();
    const answer = await highlightCode({ code, language: "typescript", dark: true });
    assert.ok(performance.now() - started < 1000);
    assert.equal(answer.language, null);
    assert.equal(answer.lines.length, 400);
    assert.deepEqual(answer.lines[0], [{ text: longLine(999), color: null }]);
  });

  test("a small TypeScript block is tokenised", async () => {
    const answer = await highlightCode({ code: "const a = 1;\n", language: "ts", dark: false });
    assert.equal(answer.language, "typescript");
    assert.equal(answer.theme, "github-light-default");
    assert.ok((answer.lines[0]?.length ?? 0) > 1);
    assert.ok(answer.lines[0]?.some((token) => token.color !== null));
  });

  test("a plain-text hint is not tokenised", async () => {
    const answer = await highlightCode({ code: "const a = 1;", language: "text", dark: true });
    assert.equal(answer.language, null);
    assert.deepEqual(answer.lines, [[{ text: "const a = 1;", color: null }]]);
  });
});
