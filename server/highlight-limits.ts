// Tokenising runs on the daemon's event loop, so a large block stalls every
// request. Measured cost is about 25 ms per million units of work (each line's
// length squared, summed), so these caps hold a block near 250 ms.

/** Past any of these the block comes back plain, untokenised. */
export const HIGHLIGHT_LIMITS = {
  /** Total source, in UTF-16 code units. */
  maxChars: 64 * 1024,
  maxLines: 4000,
  /** A line this long is minified code or an encoded blob, whose colours nobody reads. */
  maxLineChars: 1000,
  /** Each line's length squared, summed: 400 lines of 999 characters is 400 million. */
  maxWork: 8_000_000,
} as const;

export interface CodeMeasure {
  chars: number;
  lines: number;
  longest: number;
  work: number;
}

/** Measures what the guards need in one pass, without allocating. */
export function measureCode(code: string): CodeMeasure {
  let lines = 0;
  let longest = 0;
  let work = 0;
  let start = 0;
  for (;;) {
    const at = code.indexOf("\n", start);
    const end = at === -1 ? code.length : at;
    const length = end - start;
    lines += 1;
    longest = Math.max(longest, length);
    work += length * length;
    if (at === -1) return { chars: code.length, lines, longest, work };
    start = at + 1;
  }
}

/** True when tokenising this code would cost more than the daemon should spend. */
export function exceedsHighlightBudget(code: string): boolean {
  if (code.length > HIGHLIGHT_LIMITS.maxChars) return true;
  const size = measureCode(code);
  return (
    size.lines > HIGHLIGHT_LIMITS.maxLines ||
    size.longest > HIGHLIGHT_LIMITS.maxLineChars ||
    size.work > HIGHLIGHT_LIMITS.maxWork
  );
}
