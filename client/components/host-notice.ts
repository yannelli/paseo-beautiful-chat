import { Platform } from "react-native";
import { installShared } from "./shared-install";

// Paseo 0.11.2 still rejects a `notification` timeline transformer (its allowlist
// is user_message, assistant_message, reasoning, tool_call, todo, error,
// compaction), so the host draws this row and the plugin can only re-chrome it.

const STYLE_ELEMENT_ID = "beautiful-chat-host-notice";
const RESCAN_MS = 500;

// The background each level of the host's `Notification` row uses
// (`components/message.tsx`), as the browser serialises it. They are literals
// in the host's stylesheet, not theme tokens, which is what makes them findable.
const LEVEL_COLORS = [
  { level: "info", rgb: "147, 197, 253" },
  { level: "warning", rgb: "245, 158, 11" },
  { level: "error", rgb: "239, 68, 68" },
] as const;

// The row's shape: container > content > row > icon slot > svg. Another element
// that happens to share the tint lacks it and keeps the host's styling.
const NOTICE_SHAPE = ":has(> div > div > div:first-child svg)";

function findColorClasses(): Map<string, string> {
  const found = new Map<string, string>();

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin sheet cannot be read; the host's own styles can.
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const background = rule.style.backgroundColor.replace(/\s+/g, " ").trim();
      for (const { level, rgb } of LEVEL_COLORS) {
        if (found.has(level) || background !== `rgba(${rgb}, 0.1)`) continue;
        const selector = rule.selectorText.trim();
        if (/^\.[\w-]+$/.test(selector)) found.set(level, selector);
      }
    }
  }

  return found;
}

/** The same border, radius and shadow every card in this plugin carries. */
function ruleFor(selector: string, rgb: string): string {
  return `${selector}${NOTICE_SHAPE} {
  border-radius: 12px;
  border: 1px solid rgba(${rgb}, 0.22);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.12);
}`;
}

/** Sheet and rule counts: cheap to read, and they move whenever styles are added. */
function sheetSignature(): string {
  let rules = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      rules += sheet.cssRules.length;
    } catch {
      // Cross-origin; see findColorClasses.
    }
  }
  return `${document.styleSheets.length}:${rules}`;
}

// Gives the host's background-job notice the plugin's card chrome. The host
// injects a style the first time a row renders, often after install, so any DOM
// change schedules a rescan that runs only when the stylesheets have changed.
export function installHostNoticeStyle(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  return installShared("host-notice", installRestyle);
}

function installRestyle(): () => void {
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  document.head.appendChild(style);

  let signature = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scan = (): void => {
    timer = undefined;
    const next = sheetSignature();
    if (next === signature) return;
    signature = next;
    const classes = findColorClasses();
    const rules: string[] = [];
    for (const { level, rgb } of LEVEL_COLORS) {
      const selector = classes.get(level);
      if (selector) rules.push(ruleFor(selector, rgb));
    }
    const text = rules.join("\n");
    if (style.textContent !== text) style.textContent = text;
  };

  const observer = new MutationObserver(() => {
    timer ??= setTimeout(scan, RESCAN_MS);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  scan();

  return () => {
    observer.disconnect();
    if (timer !== undefined) clearTimeout(timer);
    style.remove();
  };
}
