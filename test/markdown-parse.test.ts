import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseMarkdown, type MdBlock, type MdInline } from "../client/components/markdown/parse";

type BlockOf<K extends MdBlock["kind"]> = Extract<MdBlock, { kind: K }>;

function only<K extends MdBlock["kind"]>(blocks: MdBlock[], kind: K): BlockOf<K> {
  assert.equal(blocks.length, 1, JSON.stringify(blocks));
  const block = blocks[0];
  assert.equal(block?.kind, kind);
  return block as BlockOf<K>;
}

function spansOf(text: string): MdInline[] {
  return only(parseMarkdown(text), "paragraph").spans;
}

function links(spans: MdInline[]): string[] {
  return spans.flatMap((span) => (span.kind === "link" ? [span.href] : []));
}

describe("fenced code inside a list item", () => {
  test("a fence indented four spaces stays code under its item", () => {
    const source = [
      "1. Install:",
      "    ```bash",
      "    npm install",
      "    npm run build",
      "    ```",
      "2. Run it",
    ].join("\n");
    const list = only(parseMarkdown(source), "list");
    assert.equal(list.items.length, 2);
    assert.deepEqual(list.items[0]?.spans, [{ kind: "text", text: "Install:" }]);
    assert.deepEqual(list.items[0]?.blocks, [
      { kind: "code", code: "npm install\nnpm run build", language: "bash" },
    ]);
    assert.equal(list.items[1]?.index, 2);
  });

  test("a fence indented three spaces keeps the list whole and drops the indent", () => {
    const list = only(
      parseMarkdown("1. Install:\n   ```bash\n   npm install\n     --global\n   ```\n2. Run it"),
      "list",
    );
    assert.equal(list.items.length, 2);
    assert.deepEqual(list.items[0]?.blocks, [
      { kind: "code", code: "npm install\n  --global", language: "bash" },
    ]);
  });

  test("prose after the fence follows the code", () => {
    const list = only(parseMarkdown("- Step\n\n  ```\n  x\n  ```\n\n  Then go."), "list");
    assert.deepEqual(list.items[0]?.blocks, [
      { kind: "code", code: "x", language: "" },
      { kind: "paragraph", spans: [{ kind: "text", text: "Then go." }] },
    ]);
  });

  test("a flush-left fence still ends the list", () => {
    const blocks = parseMarkdown("- a\n```js\nx\n```");
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ["list", "code"],
    );
    assert.equal(blocks[0]?.kind === "list" && blocks[0].items[0]?.blocks, undefined);
  });

  test("an unclosed nested fence degrades to plain text inside the item", () => {
    const list = only(parseMarkdown("- a\n  ```js\n  x"), "list");
    assert.deepEqual(list.items[0]?.blocks, [{ kind: "plain", text: "```js\nx" }]);
  });

  test("an indented top-level fence loses its indent from the body", () => {
    const code = only(parseMarkdown("  ```\n  a\n    b\n  ```"), "code");
    assert.equal(code.code, "a\n  b");
  });
});

describe("bare URLs", () => {
  test("balanced parentheses stay in the link", () => {
    const spans = spansOf("See https://en.wikipedia.org/wiki/Foo_(bar) for more.");
    assert.deepEqual(links(spans), ["https://en.wikipedia.org/wiki/Foo_(bar)"]);
  });

  test("a closing parenthesis from the prose is not part of the link", () => {
    assert.deepEqual(links(spansOf("(see https://x.com/a).")), ["https://x.com/a"]);
    assert.deepEqual(links(spansOf("(see https://x.com/Foo_(bar)).")), ["https://x.com/Foo_(bar)"]);
  });

  test("trailing sentence punctuation is not part of the link", () => {
    assert.deepEqual(links(spansOf("Go to https://x.com/b, then www.y.org!")), [
      "https://x.com/b",
      "https://www.y.org",
    ]);
  });

  test("a scheme with nothing after it is text", () => {
    assert.deepEqual(links(spansOf("www.. and https://.")), []);
  });
});

describe("inline markup", () => {
  test("ordinary markup still parses", () => {
    assert.deepEqual(spansOf("**b** *i* _u_ `c` ~~s~~ [l](http://a.b/(c))"), [
      { kind: "strong", spans: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " " },
      { kind: "emphasis", spans: [{ kind: "text", text: "i" }] },
      { kind: "text", text: " " },
      { kind: "emphasis", spans: [{ kind: "text", text: "u" }] },
      { kind: "text", text: " " },
      { kind: "codeSpan", text: "c" },
      { kind: "text", text: " " },
      { kind: "strike", spans: [{ kind: "text", text: "s" }] },
      { kind: "text", text: " " },
      { kind: "link", href: "http://a.b/(c)", spans: [{ kind: "text", text: "l" }] },
    ]);
  });

  test("unclosed markers survive as the characters typed", () => {
    const source = "2 * 3 * 4, *open, [label, ``tick, snake_case_name";
    assert.deepEqual(spansOf(source), [{ kind: "text", text: source }]);
  });

  test("a nested bracket does not hide the link after it", () => {
    assert.deepEqual(links(spansOf("[a [b](https://c.d)")), ["https://c.d"]);
  });

  test("two trailing spaces still break the line", () => {
    assert.deepEqual(spansOf("one  \ntwo\\\nthree"), [{ kind: "text", text: "one\ntwo\nthree" }]);
  });
});

describe("pathological input", () => {
  const cases: Record<string, string> = {
    "unclosed stars": "*a ".repeat(20000),
    "unclosed underscores": "_a ".repeat(20000),
    "unclosed brackets": "[a ".repeat(20000),
    "unclosed images": "![a ".repeat(20000),
    "unclosed link targets": "[a](".repeat(20000),
    "a long run of spaces": `x${" ".repeat(40000)}y`,
    "a long run of backticks": "`".repeat(40000),
    "a long run of stars": "*".repeat(40001),
    "a URL ending in dots": `http://x${".".repeat(40000)}a`,
    "a URL ending in parentheses": `http://x${")".repeat(40000)}`,
  };

  for (const [name, source] of Object.entries(cases)) {
    test(`${name} parses in well under 200 ms`, () => {
      const started = performance.now();
      parseMarkdown(source);
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 200, `${name} took ${elapsed.toFixed(0)} ms`);
    });
  }

  test("no character is lost from unclosed markers", () => {
    const source = "*a [b _c ".repeat(50).trimEnd();
    assert.deepEqual(spansOf(source), [{ kind: "text", text: source }]);
  });
});
