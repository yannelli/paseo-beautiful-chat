import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import {
  type HighlightLine,
  type HighlightToken,
  highlightRpc,
  isPlainTextHint,
  plainLines,
} from "../shared/highlight-rpc";
import { exceedsHighlightBudget } from "./highlight-limits";

type HighlightInput = RpcInput<typeof highlightRpc>;
type HighlightOutput = RpcOutput<typeof highlightRpc>;

const DARK_THEME = "github-dark-default";
const LIGHT_THEME = "github-light-default";

/** shiki packs the style flags into one number. Only these two reach the client. */
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;

// A grammar registers its own aliases, so `bash` already reaches `shellscript`.
// These entries pin the mapping so it survives a grammar dropping an alias.
const ALIASES: ReadonlyMap<string, string> = new Map([
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["sh", "shellscript"],
  ["bash", "shellscript"],
  ["shell", "shellscript"],
  ["zsh", "shellscript"],
  ["py", "python"],
  ["md", "markdown"],
  ["yml", "yaml"],
  ["docker", "docker"],
  ["dockerfile", "docker"],
  ["ps1", "powershell"],
  ["rs", "rust"],
  ["golang", "go"],
]);

/** File extensions the chat shows often, lower-case and without the dot. */
const EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["ts", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["tsx", "tsx"],
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["jsx", "jsx"],
  ["json", "json"],
  ["jsonc", "json"],
  ["sh", "shellscript"],
  ["bash", "shellscript"],
  ["zsh", "shellscript"],
  ["py", "python"],
  ["pyi", "python"],
  ["diff", "diff"],
  ["patch", "diff"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["rs", "rust"],
  ["go", "go"],
  ["html", "html"],
  ["htm", "html"],
  ["css", "css"],
  ["sql", "sql"],
  ["toml", "toml"],
  ["dockerfile", "docker"],
  ["ps1", "powershell"],
  ["psm1", "powershell"],
]);

type ShikiCore = typeof import("@shikijs/core");
type Highlighter = Awaited<ReturnType<ShikiCore["createHighlighterCore"]>>;

/** The part of a shiki token this plugin reads. */
interface ShikiToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

interface HighlightEngine {
  highlighter: Highlighter;
  /** Every grammar name and alias the highlighter answers to. */
  loaded: Set<string>;
}

let enginePromise: Promise<HighlightEngine> | null = null;

// The imports stay inside this function: the grammar data is megabytes, and the
// daemon loads the plugin on every start. The JavaScript regex engine needs no
// WASM asset, and `forgiving` skips a rule it cannot express.
async function buildEngine(): Promise<HighlightEngine> {
  const [core, regex] = await Promise.all([
    import("@shikijs/core"),
    import("@shikijs/engine-javascript"),
  ]);
  const themes = await Promise.all([
    import("@shikijs/themes/github-dark-default"),
    import("@shikijs/themes/github-light-default"),
  ]);
  // Every subpath below is also the grammar id, except `dockerfile`, whose
  // grammar registers as `docker`.
  const langs = await Promise.all([
    import("@shikijs/langs/typescript"),
    import("@shikijs/langs/tsx"),
    import("@shikijs/langs/javascript"),
    import("@shikijs/langs/jsx"),
    import("@shikijs/langs/json"),
    import("@shikijs/langs/shellscript"),
    import("@shikijs/langs/python"),
    import("@shikijs/langs/diff"),
    import("@shikijs/langs/yaml"),
    import("@shikijs/langs/markdown"),
    import("@shikijs/langs/rust"),
    import("@shikijs/langs/go"),
    import("@shikijs/langs/html"),
    import("@shikijs/langs/css"),
    import("@shikijs/langs/sql"),
    import("@shikijs/langs/toml"),
    import("@shikijs/langs/dockerfile"),
    import("@shikijs/langs/powershell"),
  ]);

  const highlighter = await core.createHighlighterCore({
    themes,
    langs,
    engine: regex.createJavaScriptRegexEngine({ forgiving: true }),
  });
  return { highlighter, loaded: new Set(highlighter.getLoadedLanguages()) };
}

function getEngine(): Promise<HighlightEngine> {
  enginePromise ??= buildEngine().catch((error: unknown) => {
    // Drop the memo so the next request retries.
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

/** Reads a grammar out of a file name, by extension or by a bare `Dockerfile`. */
function fromFileName(name: string): string | null {
  const parts = name.replace(/\\/g, "/").split("/");
  const base = (parts[parts.length - 1] ?? "").trim().toLowerCase();
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "docker";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXTENSIONS.get(base.slice(dot + 1)) ?? null;
}

// Undefined when the hint names nothing known, so the caller falls through to
// the file name. Null when it names plain text, an answer that must not.
function fromHint(loaded: Set<string>, hint: string): string | null | undefined {
  const key = hint.trim().toLowerCase();
  if (!key) return undefined;
  if (isPlainTextHint(key)) return null;
  const mapped = ALIASES.get(key);
  if (mapped !== undefined) return loaded.has(mapped) ? mapped : null;
  return loaded.has(key) ? key : undefined;
}

/** Picks the grammar for a request, or null to render the text unhighlighted. */
export function resolveLanguage(
  loaded: Set<string>,
  hint: string | undefined,
  filename: string | undefined,
): string | null {
  if (hint) {
    const named = fromHint(loaded, hint);
    if (named !== undefined) return named;
    // A hint is sometimes a path, because a tool labels a block with its file.
    const derived = fromFileName(hint);
    if (derived !== null && loaded.has(derived)) return derived;
  }
  if (filename) {
    const derived = fromFileName(filename);
    if (derived !== null && loaded.has(derived)) return derived;
  }
  return null;
}

function toLines(tokenLines: readonly (readonly ShikiToken[])[]): HighlightLine[] {
  return tokenLines.map((tokens) => {
    const line: HighlightLine = [];
    for (const token of tokens) {
      // An empty run carries no glyphs, and dropping it keeps the wire small.
      if (token.content === "") continue;
      const style = token.fontStyle ?? 0;
      const out: HighlightToken = { text: token.content, color: token.color ?? null };
      if ((style & FONT_STYLE_BOLD) !== 0) out.bold = true;
      if ((style & FONT_STYLE_ITALIC) !== 0) out.italic = true;
      line.push(out);
    }
    return line;
  });
}

// A timeline mounts the same block again on every re-render and scroll back, so
// the last few results are kept. Map iteration yields the oldest insertion
// first, which is the entry to evict.
const CACHE_LIMIT = 200;
const cache = new Map<string, HighlightLine[]>();

function cachePut(key: string, lines: HighlightLine[]): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, lines);
}

/** 32-bit FNV-1a, for compact cache keys. */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function tokenize(
  highlighter: Highlighter,
  code: string,
  lang: string,
  theme: string,
): HighlightLine[] {
  const key = `${theme}:${lang}:${fnv1a(code)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const lines = toLines(highlighter.codeToTokens(code, { lang, theme }).tokens);
    cachePut(key, lines);
    return lines;
  } catch {
    return plainLines(code);
  }
}

function plainAnswer(input: HighlightInput, theme: string): HighlightOutput {
  return {
    lines: plainLines(input.code),
    ...(input.diffBodyCode !== undefined ? { diffLines: plainLines(input.diffBodyCode) } : {}),
    language: null,
    theme,
  };
}

// Code past the work budget comes back plain before the grammars even load, so
// one huge block cannot stall the daemon. A null language tells the client the
// text came back untokenised.
export async function highlightCode(input: HighlightInput): Promise<HighlightOutput> {
  const theme = input.dark ? DARK_THEME : LIGHT_THEME;
  const tooCostly =
    exceedsHighlightBudget(input.code) ||
    (input.diffBodyCode !== undefined && exceedsHighlightBudget(input.diffBodyCode));
  if (tooCostly) return plainAnswer(input, theme);

  try {
    const { highlighter, loaded } = await getEngine();
    const language = resolveLanguage(loaded, input.language, input.filename);
    const lines =
      language === null
        ? plainLines(input.code)
        : tokenize(highlighter, input.code, language, theme);

    let diffLines: HighlightLine[] | undefined;
    if (input.diffBodyCode !== undefined) {
      const diffLanguage = input.filename
        ? resolveLanguage(loaded, undefined, input.filename)
        : null;
      diffLines =
        diffLanguage === null
          ? plainLines(input.diffBodyCode)
          : tokenize(highlighter, input.diffBodyCode, diffLanguage, theme);
    }

    return { lines, ...(diffLines !== undefined ? { diffLines } : {}), language, theme };
  } catch {
    // A grammar fault must not kill the daemon, and the client still needs its text.
    return plainAnswer(input, theme);
  }
}
