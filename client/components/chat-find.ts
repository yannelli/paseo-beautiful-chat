import { Platform } from "react-native";
import { getEnhancerPreferences } from "../preferences";
import { installShared } from "./shared-install";
import { parseColor, textOn } from "./theme-color";

const STYLE_ELEMENT_ID = "beautiful-chat-find-style";
const BAR_ID = "beautiful-chat-find";
const MATCHES = "beautiful-chat-find";
const CURRENT = "beautiful-chat-find-current";
const CHAT = '[data-testid="agent-chat-scroll"]';
/** A split pane; it holds the tab row and every tab's panel. */
const PANE = '[data-testid^="workspace-pane-"]';
const COMPOSER = "[data-composer-input]";
const TERMINAL = ".xterm";
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const THEME_KEY = Symbol.for("beautiful-chat/find-theme");
const IGNORED =
  'button, [role="button"], [aria-hidden="true"], input, textarea, svg, script, style';
const BLOCK = "div, p, li, td, th, pre, h1, h2, h3, h4, h5, h6";

const FIND_RULES = `::highlight(${MATCHES}) {
  background-color: rgb(250 204 21 / 0.35);
}
::highlight(${CURRENT}) {
  background-color: rgb(250 204 21);
  color: #111;
}
#${BAR_ID} {
  position: fixed;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 8px;
  border: 1px solid rgb(127 127 127 / 0.35);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
  font: 13px var(--paseo-ui-font, system-ui, sans-serif);
}
#${BAR_ID}[hidden] {
  display: none;
}
#${BAR_ID} input {
  width: 180px;
  padding: 3px 6px;
  border: 1px solid rgb(127 127 127 / 0.45);
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
}
#${BAR_ID} span {
  min-width: 64px;
  text-align: center;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}
#${BAR_ID} button {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
#${BAR_ID} button:hover {
  background: rgb(127 127 127 / 0.2);
}`;

/** Retained panels stay mounted while hidden; only a rendered chat counts. */
function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0;
}

function visibleChats(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CHAT)).filter(isVisible);
}

// The region that belongs to `chat`: its split pane, else the widest ancestor
// that holds no other chat and no terminal, stopping once it takes in the
// composer, which sits beside the scroll area rather than inside it.
function paneOf(chat: HTMLElement): Element {
  const pane = chat.closest(PANE);
  if (pane) return pane;
  let region: Element = chat;
  for (let parent = chat.parentElement; parent; parent = parent.parentElement) {
    if (visibleChats(parent).length > 1 || parent.querySelector(TERMINAL)) break;
    region = parent;
    if (parent.querySelector(COMPOSER)) break;
  }
  return region;
}

/** The chat whose pane holds `element`; never for a terminal or a non-composer editable. */
function chatFor(element: Element | null): HTMLElement | null {
  if (!element?.isConnected || element.closest(TERMINAL)) return null;
  if (element.closest(EDITABLE) && !element.closest(COMPOSER)) return null;
  return visibleChats(document).find((chat) => paneOf(chat).contains(element)) ?? null;
}

interface FindTheme {
  surface: string;
  foreground: string;
}

/** Fed by every plugin surface, for a page where nothing behind the chat paints a background. */
export function setChatFindTheme(theme: FindTheme): void {
  (globalThis as unknown as Record<symbol, FindTheme | undefined>)[THEME_KEY] = theme;
}

function hostTheme(): FindTheme | undefined {
  return (globalThis as unknown as Record<symbol, FindTheme | undefined>)[THEME_KEY];
}

/** The first painted background behind `element`, so the bar matches the theme. */
function backgroundOf(element: Element | null): string | null {
  for (; element; element = element.parentElement) {
    const color = getComputedStyle(element).backgroundColor;
    const rgba = parseColor(color);
    // A translucent tint shows the page through it, so keep climbing to an opaque one.
    if (rgba ? rgba.a >= 0.95 : color && color !== "transparent") return color;
  }
  return null;
}

// Colours for the bar. The container's own `color` is the browser default, not
// the theme, because the host sets colour on each text element instead; the
// text is picked against the background, and the host theme fills in.
function colorsFor(chat: Element): { background: string; color: string } {
  const theme = hostTheme();
  const painted = backgroundOf(chat);
  if (painted) {
    return { background: painted, color: textOn(painted) ?? theme?.foreground ?? "CanvasText" };
  }
  if (theme) return { background: theme.surface, color: theme.foreground };
  return { background: "Canvas", color: "CanvasText" };
}

function isMac(): boolean {
  const platform = (navigator as Navigator & { platform?: string }).platform ?? "";
  return (
    /Macintosh|Mac OS|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    /Mac|iPhone|iPad|iPod/i.test(platform)
  );
}

/**
 * Every rendered occurrence of `query` inside `chat`, in reading order.
 * Text is joined per block before matching, so a phrase that crosses a bold
 * or code span inside one paragraph still matches.
 */
function findMatches(chat: HTMLElement, query: string): Range[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const pattern = new RegExp(
    words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"),
    "giu",
  );

  const groups = new Map<Element, Text[]>();
  const walker = document.createTreeWalker(chat, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!(node instanceof Text) || !parent || !node.data.trim()) continue;
    if (parent.closest(IGNORED) || !isVisible(parent)) continue;
    const block = parent.closest(BLOCK) ?? chat;
    const texts = groups.get(block) ?? [];
    texts.push(node);
    groups.set(block, texts);
  }

  const ranges: Range[] = [];
  for (const texts of groups.values()) {
    const points: { node: Text; start: number; end: number }[] = [];
    let text = "";
    for (const node of texts) {
      points.push({ node, start: text.length, end: text.length + node.data.length });
      text += node.data;
    }
    for (const match of text.matchAll(pattern)) {
      const endOffset = match.index + match[0].length;
      const start = points.find((point) => point.start <= match.index && point.end > match.index);
      const end = points.find((point) => point.start < endOffset && point.end >= endOffset);
      if (!start || !end) continue;
      const range = document.createRange();
      range.setStart(start.node, match.index - start.start);
      range.setEnd(end.node, endOffset - end.start);
      ranges.push(range);
    }
  }
  return ranges;
}

// Paseo's own find addresses rows by host message id, and a plugin-drawn row
// carries a plugin id, so the host cannot reveal a match inside one. This bar
// searches what is rendered; history the windowed list has not loaded is not.
export function installChatFind(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return () => {};
  return installShared("chat-find", installFindBar);
}

// The key is taken only while the plugin draws prompts or replies, and only when
// focus, or the last click, sits in a chat's own pane; anywhere else it reaches
// the host untouched. Command+F on macOS, Control+F elsewhere, like the host.
function installFindBar(): () => void {
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = FIND_RULES;
  document.head.appendChild(style);

  let chat: HTMLElement | null = null;
  let ranges: Range[] = [];
  let current = -1;
  let lastTarget: EventTarget | null = null;
  const mac = isMac();

  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.hidden = true;
  bar.setAttribute("role", "search");
  bar.title = "Searches the messages loaded in this chat";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Find in chat";
  input.setAttribute("aria-label", "Find in chat");
  const count = document.createElement("span");
  count.setAttribute("aria-live", "polite");
  const controls: [string, string, () => void][] = [
    ["Previous match", "\u2191", () => step(-1)],
    ["Next match", "\u2193", () => step(1)],
    ["Close find", "\u2715", close],
  ];
  bar.append(
    input,
    count,
    ...controls.map(([label, glyph, onClick]) => {
      const element = document.createElement("button");
      element.type = "button";
      element.textContent = glyph;
      element.setAttribute("aria-label", label);
      element.title = label;
      element.addEventListener("click", onClick);
      return element;
    }),
  );
  document.body.appendChild(bar);

  // A pane resize moves the bar's anchor, and a tab switch hides the chat
  // (it stays connected), which reads as a resize to zero.
  const resizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());

  /** False, after closing the bar, once the chat is gone or hidden by a tab switch. */
  function present(): boolean {
    if (chat?.isConnected && isVisible(chat)) return true;
    close();
    return false;
  }

  function place() {
    if (!chat || !present()) return;
    const rect = chat.getBoundingClientRect();
    bar.style.top = `${Math.max(rect.top + 8, 8)}px`;
    bar.style.right = `${Math.max(window.innerWidth - rect.right + 16, 8)}px`;
    const { background, color } = colorsFor(chat);
    bar.style.background = background;
    bar.style.color = color;
  }

  function show() {
    CSS.highlights.set(MATCHES, new Highlight(...ranges));
    const active = ranges[current];
    if (active) CSS.highlights.set(CURRENT, new Highlight(active));
    else CSS.highlights.delete(CURRENT);
    if (!input.value.trim()) count.textContent = "";
    else if (ranges.length) count.textContent = `${current + 1} of ${ranges.length}`;
    else count.textContent = "No results";
    active?.startContainer.parentElement?.scrollIntoView({ block: "center" });
  }

  function search() {
    if (!chat || !present()) return;
    ranges = findMatches(chat, input.value);
    // Start from the first match at or below the top of what is on screen.
    const top = chat.getBoundingClientRect().top;
    const first = ranges.findIndex((range) => range.getBoundingClientRect().bottom >= top);
    current = ranges.length ? Math.max(first, 0) : -1;
    show();
  }

  function step(direction: 1 | -1) {
    if (!chat || !present()) return;
    // Rows mount, unmount and stream while the bar is open, so re-read the page
    // and continue from the same occurrence when it is still there.
    const previous = ranges[current];
    ranges = findMatches(chat, input.value);
    if (!ranges.length) {
      current = -1;
      return show();
    }
    const kept = previous
      ? ranges.findIndex(
          (range) =>
            range.startContainer === previous.startContainer &&
            range.startOffset === previous.startOffset,
        )
      : -1;
    const base = kept >= 0 ? kept : Math.min(current, ranges.length - 1);
    current = (base + direction + ranges.length) % ranges.length;
    show();
  }

  function close() {
    bar.hidden = true;
    chat = null;
    ranges = [];
    current = -1;
    resizes?.disconnect();
    CSS.highlights.delete(MATCHES);
    CSS.highlights.delete(CURRENT);
  }

  /** The focused element, or the last thing clicked when focus is on the page itself. */
  function origin(): Element | null {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return active;
    if (lastTarget instanceof Element) return lastTarget;
    return lastTarget instanceof Node ? lastTarget.parentElement : null;
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!bar.contains(event.target as Node)) lastTarget = event.target;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key.toLowerCase() !== "f" || event.altKey || event.shiftKey) return;
    if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return;
    // A second press from the bar hands over to the host's find, which also
    // searches history the chat has not loaded.
    if (bar.contains(document.activeElement)) return close();
    const { assistantMarkdown, enhancedUserBubble } = getEnhancerPreferences();
    if (!assistantMarkdown && !enhancedUserBubble) return;
    const target = chatFor(origin());
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    chat = target;
    bar.hidden = false;
    resizes?.disconnect();
    resizes?.observe(target);
    place();
    input.focus();
    input.select();
    if (input.value.trim()) search();
  };

  const onInputKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") step(event.shiftKey ? -1 : 1);
    else if (event.key === "Escape") close();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onResize = () => place();

  // Window capture runs before the host's document-level Ctrl+F handler.
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("resize", onResize);
  input.addEventListener("keydown", onInputKeyDown);
  input.addEventListener("input", search);

  return () => {
    close();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("resize", onResize);
    bar.remove();
    style.remove();
  };
}
