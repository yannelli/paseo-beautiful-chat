import { Platform } from "react-native";
import { DEFAULT_PREFERENCES, type EnhancerPreferences, ACCENT_PRESETS } from "../preferences";
import { buildThemeColors, type PluginSurfaceColors, type ThemeColorTokens } from "./theme-color";

export { withAlpha } from "./theme-color";
export type { PluginSurfaceColors } from "./theme-color";

/**
 * Corner rounding, in three tiers: outer card, inner block, small chip. Each
 * tier steps down so a block nested in a card reads as inside it rather than
 * as a second card. Components reference these rather than literals, so the
 * tier a surface belongs to is stated once and stays consistent.
 */
export const radius = { card: 12, block: 8, chip: 5 } as const;

// One family name per stack, never a CSS list: React Native drops a list. The
// bundled faces exist only on web (`@font-face`); on iOS and Android an unknown
// name falls back to the proportional system font, so native names a platform face.
const nativeMono = Platform.select({ ios: "Menlo", android: "monospace", default: "" });
const systemUi = Platform.select({ android: "sans-serif", default: "System" });

export const fontMono = nativeMono || "OMP Iosevka";

// The ligature cut of Iosevka, used only inside code blocks. Terminal output,
// diffs and paths stay on `fontMono`: a shaped `->` stops matching its bytes.
export const fontCode = nativeMono || "OMP Iosevka Code";
export const fontUi = Platform.OS === "web" ? "OMP Inter" : systemUi;

export interface ExtendedThemeTokens extends ThemeColorTokens {
  fontMono: string;
  fontCode: string;
  fontUi: string;
}

// PluginTheme carries surfaces, border, foreground, accent and status colours.
// The plugin derives translucent tints from the foreground so it stays on-theme,
// and falls back to the host's colour wherever a value cannot be parsed.
export function buildThemeTokens(
  colors: PluginSurfaceColors,
  preferences: EnhancerPreferences = DEFAULT_PREFERENCES,
): ExtendedThemeTokens {
  return {
    ...buildThemeColors(colors, {
      accentPreset: ACCENT_PRESETS[preferences.accent],
      frostedGlass: preferences.frostedGlass,
    }),
    fontMono,
    fontCode: preferences.codeFont === "plain" ? fontMono : fontCode,
    fontUi: preferences.uiFont === "system" ? systemUi : fontUi,
  };
}
