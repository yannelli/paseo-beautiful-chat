import { Platform } from "react-native";
import { EMBEDDED_FONTS } from "./font-data";
import { installShared } from "./shared-install";

const STYLE_ELEMENT_ID = "beautiful-chat-fonts";

/**
 * Host faces to try if the embedded bytes ever fail to decode. These belong in
 * the `src` chain rather than in `fontFamily`, because a comma-separated
 * family list is not a valid React Native style value.
 */
const LOCAL_FALLBACKS: Record<string, readonly string[]> = {
  "OMP Iosevka": ["Iosevka", "Cascadia Code", "Consolas", "Menlo"],
  "OMP Iosevka Code": ["Iosevka", "Cascadia Code", "Fira Code", "Consolas"],
  "OMP Inter": ["Inter", "Segoe UI", "Roboto", "Helvetica Neue"],
};

// Installs the bundled faces as `@font-face` rules over embedded woff2: the
// sandbox has no font loader. Native has no `document`, so theme-tokens names
// platform faces there. Shared, so the last cleanup removes the style element.
export function embedFonts(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  return installShared("fonts", installFaces);
}

function installFaces(): () => void {
  const rules = EMBEDDED_FONTS.map(({ family, weight, woff2Base64 }) => {
    const sources = [
      `url(data:font/woff2;base64,${woff2Base64}) format("woff2")`,
      ...(LOCAL_FALLBACKS[family] ?? []).map((name) => `local("${name}")`),
    ].join(",\n    ");
    return `@font-face {
  font-family: "${family}";
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: ${sources};
}`;
  }).join("\n");

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = rules;
  document.head.appendChild(style);

  return () => {
    style.remove();
  };
}
