/**
 * Markdown, small enough to own. The plugin sandbox admits `react`,
 * `react-native`, `zod` and `@getpaseo/plugin*` only, so a markdown library is
 * not available at any price: this module turns the subset an assistant
 * actually writes into a block tree the renderer walks.
 *
 * Two rules govern every branch below. A malformed document must not throw,
 * and it must not lose a character: anything the grammar does not recognise
 * survives as text, and a construct that starts but never finishes degrades to
 * a `plain` block holding its own source verbatim.
 *
 * Pure module: no React, no runtime imports.
 */

/** One inline run. `text` is the only leaf; every other kind carries runs. */
export type MdInline =
  | { kind: "text"; text: string }
  | { kind: "codeSpan"; text: string }
  | { kind: "strong"; spans: MdInline[] }
  | { kind: "emphasis"; spans: MdInline[] }
  | { kind: "strike"; spans: MdInline[] }
  | { kind: "link"; href: string; spans: MdInline[] };

/** One table cell, already reduced to inline runs. */
export type MdCell = MdInline[];

export type MdAlign = "left" | "center" | "right";

/** Deeper hashes clamp to 4: a chat bubble has no room for six tiers. */
export type MdHeadingLevel = 1 | 2 | 3 | 4;

export interface MdListItem {
  spans: MdInline[];
  /** 0 for a top-level item, one step per indent level the author opened. */
  depth: number;
  /** Per item, not per list: `1.` nested under `-` keeps its own kind. */
  ordered: boolean;
  /** The number the author typed, so a list starting at `3.` still says 3. */
  index: number;
  /** Set only by `- [ ]` / `- [x]`; an ordinary bullet leaves it undefined. */
  checked?: boolean;
  /** Fenced code indented under the item, and any prose after it, in order. */
  blocks?: MdBlock[];
}

export type MdBlock =
  | { kind: "heading"; level: MdHeadingLevel; spans: MdInline[] }
  | { kind: "paragraph"; spans: MdInline[] }
  | { kind: "list"; ordered: boolean; items: MdListItem[] }
  | { kind: "quote"; paragraphs: MdInline[][] }
  | { kind: "code"; code: string; language: string }
  | { kind: "rule" }
  | { kind: "table"; header: MdCell[]; rows: MdCell[][]; align: MdAlign[] }
  /** The degraded case: source that opened a construct it never closed. */
  | { kind: "plain"; text: string };

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*(\S*)/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
// Three or more of one marker, nothing else. Checked before the bullet rule,
// which `- - -` would otherwise claim as a list item.
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^ {0,3}>[ \t]?(.*)$/;
const BULLET_RE = /^([ \t]*)([-*+])[ \t]+(.*)$/;
const ORDERED_RE = /^([ \t]*)(\d{1,9})[.)][ \t]+(.*)$/;
const TASK_RE = /^\[([ xX])\][ \t]*(.*)$/;
const DELIMITER_CELL_RE = /^:?-+:?$/;
const WORD_RE = /[\w\u00c0-\uffff]/;
// ASCII punctuation is exactly what a backslash may escape in markdown.
const ESCAPABLE_RE = /[!-\/:-@\[-`{-~]/;
// Sticky, so a candidate is tested in place instead of slicing the line.
// Parentheses are allowed here; `trimUrl` drops the ones the URL did not open.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>[\]]+/y;
/** Sentence punctuation that trails a bare URL belongs to the prose. */
const URL_TRAILING_PUNCTUATION = ".,;:!?'\"";
/** What is left once the tail is trimmed must still hold more than a scheme. */
const URL_HEAD_RE = /^(?:https?:\/\/|www\.)./;

/** Emphasis inside emphasis is rare and cheap to bound; deeper text stays flat. */
const MAX_INLINE_DEPTH = 4;

export function parseMarkdown(text: string): MdBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index++;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence !== null) {
      const read = readFence(lines, index, fence, indentWidth(line));
      blocks.push(read.block);
      index = read.next;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading !== null) {
      const hashes = (heading[1] ?? "#").length;
      const level = (hashes > 4 ? 4 : hashes) as MdHeadingLevel;
      const title = (heading[2] ?? "").trimEnd();
      blocks.push({ kind: "heading", level, spans: parseInline(title) });
      index++;
      continue;
    }

    if (RULE_RE.test(line)) {
      blocks.push({ kind: "rule" });
      index++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      index = readQuote(lines, index, blocks);
      continue;
    }

    if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      index = readList(lines, index, blocks);
      continue;
    }

    if (isTableStart(lines, index)) {
      index = readTable(lines, index, blocks);
      continue;
    }

    index = readParagraph(lines, index, blocks);
  }

  return blocks;
}

/** True when the line at `index` opens a block, so a paragraph must stop short of it. */
function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (line.trim() === "") return true;
  if (FENCE_RE.test(line)) return true;
  if (HEADING_RE.test(line)) return true;
  if (RULE_RE.test(line)) return true;
  if (QUOTE_RE.test(line)) return true;
  if (BULLET_RE.test(line)) return true;
  if (ORDERED_RE.test(line)) return true;
  return isTableStart(lines, index);
}

/**
 * A fence owns every line up to its closing run of the same character. An
 * unterminated fence is the normal shape of a streaming answer's tail, and it
 * degrades to `plain` carrying its own source — including the opening fence, so
 * nothing the author typed disappears while the rest of the block arrives.
 */
function readFence(
  lines: string[],
  start: number,
  match: RegExpExecArray,
  indent: number,
): { block: MdBlock; next: number } {
  const marker = match[1] ?? "```";
  const language = (match[2] ?? "").trim();
  const closeRe = marker.startsWith("~") ? /^~+[ \t]*$/ : /^`+[ \t]*$/;
  const body: string[] = [];
  let index = start + 1;
  let closed = false;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.length >= marker.length && closeRe.test(trimmed)) {
      closed = true;
      index++;
      break;
    }
    // Each line loses up to the opening fence's indent, so code nested under a
    // list item does not keep the item's indent.
    body.push(stripIndent(line, indent));
    index++;
  }

  if (!closed) {
    const opening = stripIndent(lines[start] ?? "", indent);
    return { block: { kind: "plain", text: [opening, ...body].join("\n") }, next: lines.length };
  }

  return { block: { kind: "code", code: body.join("\n"), language }, next: index };
}

/** Removes up to `columns` columns of leading blanks, a tab counting as four. */
function stripIndent(line: string, columns: number): string {
  let width = 0;
  let index = 0;
  while (index < line.length && width < columns) {
    const ch = line[index];
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4;
    else break;
    index++;
  }
  return line.slice(index);
}

/**
 * Consecutive `>` lines only. A lazy continuation — prose under a quote with no
 * marker of its own — reads as the next paragraph instead, which is what an
 * assistant that forgot the marker actually meant.
 */
function readQuote(lines: string[], start: number, out: MdBlock[]): number {
  const collected: string[] = [];
  let index = start;

  while (index < lines.length) {
    const match = QUOTE_RE.exec(lines[index] ?? "");
    if (match === null) break;
    // Nesting flattens: `>> deeper` joins the one level this renderer draws.
    let content = match[1] ?? "";
    let inner = QUOTE_RE.exec(content);
    while (inner !== null) {
      content = inner[1] ?? "";
      inner = QUOTE_RE.exec(content);
    }
    collected.push(content);
    index++;
  }

  const paragraphs: MdInline[][] = [];
  let run: string[] = [];
  for (const line of collected) {
    if (line.trim() === "") {
      if (run.length > 0) paragraphs.push(parseInline(joinSoft(run)));
      run = [];
      continue;
    }
    run.push(line);
  }
  if (run.length > 0) paragraphs.push(parseInline(joinSoft(run)));

  out.push({ kind: "quote", paragraphs });
  return index === start ? start + 1 : index;
}

interface RawItem {
  text: string;
  depth: number;
  ordered: boolean;
  index: number;
  checked?: boolean;
  /** Nested code blocks, and the raw prose that follows each one. */
  blocks: Array<MdBlock | string>;
}

/**
 * One list block per run of markers. A top-level marker that switches kind —
 * bullet to number, or plain bullet to checkbox — starts a new block, because
 * those are three different things on screen even when no blank line separates
 * them.
 */
function readList(lines: string[], start: number, out: MdBlock[]): number {
  const items: RawItem[] = [];
  // Each entry is the indent column of one open level, so nesting follows what
  // the author actually typed instead of assuming two spaces per level.
  const indents: number[] = [];
  let index = start;
  let blankSeen = false;
  let blockOrdered: boolean | null = null;
  let blockTask: boolean | null = null;

  while (index < lines.length) {
    const raw = lines[index] ?? "";

    if (raw.trim() === "") {
      blankSeen = true;
      index++;
      continue;
    }

    // A fence indented under an item belongs to that item. It is tested on the
    // line without its indent, so four or more columns still read as a fence.
    const indent = indentWidth(raw);
    const previous = items[items.length - 1];
    const nested = previous !== undefined && indent >= 2 ? FENCE_RE.exec(raw.trimStart()) : null;
    if (previous !== undefined && nested !== null) {
      const read = readFence(lines, index, nested, indent);
      previous.blocks.push(read.block);
      blankSeen = false;
      index = read.next;
      continue;
    }

    // A rule, a heading or a flush-left fence ends the list rather than being
    // swallowed as item text.
    if (RULE_RE.test(raw) || HEADING_RE.test(raw) || FENCE_RE.test(raw)) break;

    const bullet = BULLET_RE.exec(raw);
    const ordered = bullet === null ? ORDERED_RE.exec(raw) : null;
    const marker = bullet ?? ordered;

    if (marker !== null) {
      const depth = depthFor(indents, indentWidth(marker[1] ?? ""));
      const body = marker[3] ?? "";
      const task = bullet === null ? null : TASK_RE.exec(body);
      const isOrdered = bullet === null;
      const isTask = task !== null;

      if (depth === 0) {
        if (blockOrdered !== null && (blockOrdered !== isOrdered || blockTask !== isTask)) break;
        blockOrdered = isOrdered;
        blockTask = isTask;
      } else if (blockOrdered === null) {
        blockOrdered = isOrdered;
        blockTask = isTask;
      }

      const item: RawItem = {
        text: task === null ? body : (task[2] ?? ""),
        depth,
        ordered: isOrdered,
        index: isOrdered ? Number(marker[2] ?? "1") : items.length + 1,
        blocks: [],
      };
      if (task !== null) item.checked = (task[1] ?? " ").toLowerCase() === "x";
      items.push(item);
      blankSeen = false;
      index++;
      continue;
    }

    if (previous === undefined) break;
    // After a blank line only indented prose still belongs to the item; flush
    // left text is the paragraph that follows the list.
    if (blankSeen && indent < 2) break;
    if (blankSeen && startsBlock(lines, index)) break;
    // Prose after a nested fence follows the code instead of joining the lead.
    const tail = previous.blocks[previous.blocks.length - 1];
    if (tail === undefined) previous.text = `${previous.text} ${raw.trim()}`;
    else if (typeof tail !== "string") previous.blocks.push(raw.trim());
    else previous.blocks[previous.blocks.length - 1] = `${tail} ${raw.trim()}`;
    blankSeen = false;
    index++;
  }

  if (items.length === 0) return start + 1;

  // A marker with no body is not a row. `- ` is legal markdown, and a bare
  // marker is the ordinary tail of a streaming answer, so dropping it keeps a
  // stray bullet out of the card instead of drawing a marker beside nothing.
  const parsed: MdListItem[] = [];
  for (const item of items) {
    const spans = parseInline(item.text.trim());
    const blocks: MdBlock[] = [];
    for (const part of item.blocks) {
      if (typeof part !== "string") blocks.push(part);
      else if (part !== "") blocks.push({ kind: "paragraph", spans: parseInline(part) });
    }
    if (spans.length === 0 && blocks.length === 0) continue;
    const entry: MdListItem = {
      spans,
      depth: item.depth,
      ordered: item.ordered,
      index: item.index,
    };
    if (item.checked !== undefined) entry.checked = item.checked;
    if (blocks.length > 0) entry.blocks = blocks;
    parsed.push(entry);
  }
  if (parsed.length === 0) return index;

  out.push({ kind: "list", ordered: blockOrdered ?? false, items: parsed });
  return index;
}

/** Resolves an indent column against the open levels, opening one when it grows. */
function depthFor(indents: number[], indent: number): number {
  while (indents.length > 1) {
    const top = indents[indents.length - 1] ?? 0;
    if (indent >= top) break;
    indents.pop();
  }
  const top = indents[indents.length - 1];
  if (top === undefined) {
    indents.push(indent);
    return 0;
  }
  // Two columns is the smallest deliberate nest; one is a stray space.
  if (indent >= top + 2) {
    indents.push(indent);
    return indents.length - 1;
  }
  return indents.length - 1;
}

function indentWidth(prefix: string): number {
  let width = 0;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (ch === "\t") width += 4;
    else if (ch === " ") width += 1;
    else break;
  }
  return width;
}

/**
 * A table needs a pipe in both the header and the delimiter. Requiring the
 * delimiter's pipe keeps prose that happens to contain a `|` above a `---` rule
 * from being read as a one-column table.
 */
function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? "";
  if (!header.includes("|")) return false;
  const delimiter = lines[index + 1];
  if (delimiter === undefined || !delimiter.includes("|")) return false;
  return parseDelimiter(delimiter) !== null;
}

function readTable(lines: string[], start: number, out: MdBlock[]): number {
  let end = start;
  while (end < lines.length) {
    const line = lines[end] ?? "";
    if (line.trim() === "" || !line.includes("|")) break;
    end++;
  }

  const headerCells = splitCells(lines[start] ?? "");
  const align = parseDelimiter(lines[start + 1] ?? "");
  // A header and a delimiter that disagree on width is not a table anyone can
  // read; the run keeps its pipes as plain text instead of being reshaped.
  if (align === null || headerCells.length === 0 || align.length !== headerCells.length) {
    out.push({ kind: "plain", text: lines.slice(start, end).join("\n") });
    return end === start ? start + 1 : end;
  }

  const width = headerCells.length;
  const rows: MdCell[][] = [];
  for (let index = start + 2; index < end; index++) {
    const cells = splitCells(lines[index] ?? "");
    const row: MdCell[] = [];
    for (let column = 0; column < width; column++) {
      row.push(parseInline((cells[column] ?? "").trim()));
    }
    // A row wider than its header keeps the overflow in the last column: a
    // half-written streaming row must not delete text it already carries.
    if (cells.length > width) {
      const last = row[width - 1];
      const overflow = cells.slice(width).join(" ").trim();
      if (last !== undefined && overflow !== "") {
        last.push({ kind: "text", text: ` ${overflow}` });
      }
    }
    rows.push(row);
  }

  out.push({
    kind: "table",
    header: headerCells.map((cell) => parseInline(cell.trim())),
    rows,
    align,
  });
  return end;
}

function parseDelimiter(line: string): MdAlign[] | null {
  const cells = splitCells(line);
  if (cells.length === 0) return null;
  const align: MdAlign[] = [];
  for (const cell of cells) {
    const text = cell.trim();
    if (!DELIMITER_CELL_RE.test(text)) return null;
    const left = text.startsWith(":");
    const right = text.endsWith(":");
    align.push(left && right ? "center" : right ? "right" : "left");
  }
  return align;
}

/** Splits on unescaped pipes. Outer pipes are optional, as they are in the wild. */
function splitCells(line: string): string[] {
  const body = line.trim();
  const cells: string[] = [];
  let buffer = "";
  let index = body.startsWith("|") ? 1 : 0;

  for (; index < body.length; index++) {
    const ch = body[index];
    if (ch === "\\" && body[index + 1] === "|") {
      buffer += "|";
      index++;
      continue;
    }
    if (ch === "|") {
      cells.push(buffer);
      buffer = "";
      continue;
    }
    buffer += ch ?? "";
  }
  if (buffer.trim() !== "" || cells.length === 0) cells.push(buffer);
  return cells;
}

function readParagraph(lines: string[], start: number, out: MdBlock[]): number {
  const collected: string[] = [];
  let index = start;

  while (index < lines.length) {
    if (index > start && startsBlock(lines, index)) break;
    const raw = lines[index] ?? "";
    if (raw.trim() === "") break;
    collected.push(raw);
    index++;
  }

  if (collected.length === 0) return start + 1;
  out.push({ kind: "paragraph", spans: parseInline(joinSoft(collected)) });
  return index;
}

/**
 * Markdown's soft break is a space, so hard-wrapped prose reflows to the card's
 * width instead of keeping the author's column. Only an explicit two-space or
 * backslash ending survives as a real line break.
 */
function joinSoft(lines: string[]): string {
  let out = "";
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    // Two spaces, or a trailing backslash, are the author asking for a new line.
    const hard = line.endsWith("  ") || line.endsWith("\\");
    const trimmed = line.trimEnd();
    out += trimmed.endsWith("\\") ? trimmed.slice(0, -1) : trimmed;
    if (index < lines.length - 1) out += hard ? "\n" : " ";
  }
  return out;
}

function isWordChar(ch: string): boolean {
  return ch !== "" && WORD_RE.test(ch);
}

/**
 * Inline runs. Every marker that fails to close is written back as the literal
 * characters the author typed, so `2 * 3 * 4` and a stray `**` read as prose
 * rather than vanishing into an unfinished span.
 */
function parseInline(src: string, depth = 0): MdInline[] {
  if (src === "") return [];
  if (depth >= MAX_INLINE_DEPTH) return [{ kind: "text", text: src }];

  const out: MdInline[] = [];
  let buffer = "";
  let index = 0;
  // A delimiter kind that found no closer from one position finds none further
  // on, so it is searched for once. Bracket partners come from one pass each.
  const exhausted = new Set<string>();
  let squares: Int32Array | null = null;
  let parens: Int32Array | null = null;

  const flush = (): void => {
    if (buffer !== "") {
      out.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  while (index < src.length) {
    const ch = src[index] ?? "";

    if (ch === "\\") {
      const next = src[index + 1] ?? "";
      if (ESCAPABLE_RE.test(next)) {
        buffer += next;
        index += 2;
        continue;
      }
    }

    if (ch === "`") {
      let run = 1;
      while (src[index + run] === "`") run++;
      const key = `code${run}`;
      const close = exhausted.has(key) ? -1 : src.indexOf("`".repeat(run), index + run);
      if (close === -1) {
        // An unclosed run is literal as a whole, so its tail is not re-read.
        exhausted.add(key);
        buffer += src.slice(index, index + run);
        index += run;
        continue;
      }
      flush();
      let text = src.slice(index + run, close);
      // One padding space each side is the escape for code that starts or
      // ends with a backtick; it is not part of the code.
      if (text.length > 2 && text.startsWith(" ") && text.endsWith(" ")) {
        text = text.slice(1, -1);
      }
      out.push({ kind: "codeSpan", text });
      index = close + run;
      continue;
    }

    // `***both***` is bold and italic at once. It is tested before the `**`
    // branch, which would close on the third star and leave a stray marker.
    if (ch === "*" && src[index + 1] === "*" && src[index + 2] === "*" && !exhausted.has("***")) {
      const close = src.indexOf("***", index + 3);
      if (close === -1) exhausted.add("***");
      else if (close > index + 3) {
        flush();
        out.push({
          kind: "strong",
          spans: [{ kind: "emphasis", spans: parseInline(src.slice(index + 3, close), depth + 2) }],
        });
        index = close + 3;
        continue;
      }
    }
    if ((ch === "*" || ch === "~") && src[index + 1] === ch && !exhausted.has(ch + ch)) {
      const close = src.indexOf(ch + ch, index + 2);
      if (close === -1) exhausted.add(ch + ch);
      else if (close > index + 2) {
        flush();
        out.push({
          kind: ch === "*" ? "strong" : "strike",
          spans: parseInline(src.slice(index + 2, close), depth + 1),
        });
        index = close + 2;
        continue;
      }
    }

    if ((ch === "*" || ch === "_") && !exhausted.has(ch) && canOpenEmphasis(src, index, ch)) {
      const close = findEmphasisClose(src, index, ch);
      if (close === -1) exhausted.add(ch);
      else if (close > index + 1) {
        flush();
        out.push({ kind: "emphasis", spans: parseInline(src.slice(index + 1, close), depth + 1) });
        index = close + 1;
        continue;
      }
    }

    if (ch === "[" || (ch === "!" && src[index + 1] === "[")) {
      const open = ch === "!" ? index + 1 : index;
      if (squares === null) squares = bracketPartners(src, "[", "]");
      const labelEnd = squares[open] ?? -1;
      if (labelEnd > -1 && src[labelEnd + 1] === "(") {
        if (parens === null) parens = bracketPartners(src, "(", ")");
        const hrefEnd = parens[labelEnd + 1] ?? -1;
        if (hrefEnd > -1) {
          const href = cleanHref(src.slice(labelEnd + 2, hrefEnd));
          const label = src.slice(open + 1, labelEnd);
          flush();
          out.push({
            kind: "link",
            href,
            spans: label === "" ? [{ kind: "text", text: href }] : parseInline(label, depth + 1),
          });
          index = hrefEnd + 1;
          continue;
        }
      }
    }

    if ((ch === "h" || ch === "w") && !isWordChar(src[index - 1] ?? "")) {
      URL_RE.lastIndex = index;
      const match = URL_RE.exec(src);
      if (match !== null) {
        const url = trimUrl(match[0] ?? "");
        if (URL_HEAD_RE.test(url)) {
          flush();
          out.push({
            kind: "link",
            href: url.startsWith("www.") ? `https://${url}` : url,
            spans: [{ kind: "text", text: url }],
          });
          index += url.length;
          continue;
        }
      }
    }

    buffer += ch;
    index++;
  }

  flush();
  return out;
}

/** A lone `*` or `_` opens only against text, and `_` only at a word start. */
function canOpenEmphasis(src: string, open: number, marker: string): boolean {
  if ((src[open + 1] ?? " ").trim() === "") return false;
  return marker !== "_" || !isWordChar(src[open - 1] ?? "");
}

/**
 * A single `*` or `_` closes on the next lone marker that does not sit against
 * whitespace. `_` additionally needs word boundaries on both ends, so
 * `snake_case_name` stays one word instead of turning half of it italic.
 */
function findEmphasisClose(src: string, open: number, marker: string): number {
  for (let index = open + 1; index < src.length; index++) {
    const ch = src[index];
    if (ch === "\\") {
      index++;
      continue;
    }
    if (ch !== marker) continue;
    if (src[index + 1] === marker) {
      index++;
      continue;
    }
    if ((src[index - 1] ?? " ").trim() === "") continue;
    if (marker === "_" && isWordChar(src[index + 1] ?? "")) continue;
    return index;
  }
  return -1;
}

/**
 * For each `open` delimiter, the index of the one closing it, or -1 when it
 * never closes. One pass with a stack, so a run of unclosed brackets is linear.
 */
function bracketPartners(src: string, open: string, close: string): Int32Array {
  const partners = new Int32Array(src.length).fill(-1);
  const stack: number[] = [];
  for (let index = 0; index < src.length; index++) {
    const ch = src[index];
    if (ch === "\\") {
      index++;
      continue;
    }
    if (ch === open) stack.push(index);
    else if (ch === close) {
      const start = stack.pop();
      if (start !== undefined) partners[start] = index;
    }
  }
  return partners;
}

/**
 * A bare URL keeps parentheses it opened itself, as in `Foo_(bar)`, but not a
 * `)` closing the prose around it, nor sentence punctuation after it.
 */
function trimUrl(raw: string): string {
  let balance = 0;
  for (let index = 0; index < raw.length; index++) {
    if (raw[index] === "(") balance++;
    else if (raw[index] === ")") balance--;
  }
  let end = raw.length;
  while (end > 0) {
    const ch = raw[end - 1] ?? "";
    if (ch === ")" && balance < 0) balance++;
    else if (!URL_TRAILING_PUNCTUATION.includes(ch)) break;
    end--;
  }
  return raw.slice(0, end);
}

function cleanHref(raw: string): string {
  let href = raw.trim();
  // A link title follows the target after whitespace: `(url "title")`.
  const space = href.search(/\s/);
  if (space > -1) href = href.slice(0, space);
  if (href.startsWith("<") && href.endsWith(">")) href = href.slice(1, -1);
  return href;
}
