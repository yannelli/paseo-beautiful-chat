import { Linking } from "react-native";
import { openExternalUrl } from "@getpaseo/plugin/client";

// React Native's URL polyfill does not implement `protocol`, so the scheme is read directly.
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** The link's scheme when it is one a reader may open: model output is untrusted input. */
export function linkScheme(url: string): "http" | "mailto" | undefined {
  const scheme = url.trim().match(SCHEME)?.[1]?.toLowerCase();
  if (scheme === "http" || scheme === "https") return "http";
  if (scheme === "mailto") return "mailto";
  return undefined;
}

/** Opens a link outside Paseo: the system browser on desktop and native, a new tab on web. */
export function openLink(url: string): void {
  const scheme = linkScheme(url);
  if (scheme === "http") {
    openExternalUrl(url.trim()).catch((error: unknown) => {
      console.warn("[beautiful-chat] Could not open link", error);
    });
  } else if (scheme === "mailto") {
    Linking.openURL(url.trim()).catch(() => {
      // No mail handler on this device; nothing useful to show.
    });
  }
}
