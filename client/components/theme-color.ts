import type { PluginTheme } from "@getpaseo/plugin";

// Colour maths and the colour half of the theme tokens. Kept free of React
// Native so node:test can load it. Only hex and rgb() parse; anything else
// falls back to a host colour for surfaces and to transparent for tints.

export type PluginSurfaceColors = PluginTheme["colors"];

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ThemeColorTokens {
  isDark: boolean;

  // Surfaces
  surface0: string;
  surface1: string;
  surface2: string;
  surfaceCode: string;
  // Translucent variants, for surfaces that blur what sits behind them.
  surfaceGlass: string;
  surfaceCodeGlass: string;

  // Foreground
  foreground: string;
  foregroundMuted: string;
  foregroundSubtle: string;

  // Accent: primary action, selection, and running state only
  accent: string;
  accentForeground: string;
  accentBg: string;
  // The authored turn sits on a raised theme surface, exactly as the native
  // stream draws it. It carries no accent: colour belongs to the agent's work.
  userSurface: string;
  userBorder: string;
  userText: string;
  userTextMuted: string;

  // Semantic status: failure, risk, and diff markers only
  success: string;
  successBg: string;
  successBorder: string;

  warning: string;
  warningBg: string;
  warningBorder: string;

  danger: string;
  dangerBg: string;
  dangerBorder: string;

  // Borders
  border: string;
  borderSubtle: string;
  boxShadow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };

  // Syntax
  syntax: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    property: string;
    function: string;
    diffAddBg: string;
    diffAddMarker: string;
    diffRemoveBg: string;
    diffRemoveMarker: string;
    hunk: string;
  };
}

/** WCAG AA for body text. */
export const TEXT_CONTRAST = 4.5;

export function parseColor(color: string): Rgba | null {
  const value = color.trim();
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = [...hex].map((c) => c + c).join("");
    }
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return null;
    const channel = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: hex.length === 8 ? channel(6) / 255 : 1,
    };
  }
  const body = /^rgba?\(([^)]+)\)$/i.exec(value)?.[1];
  if (!body) return null;
  const parts = body.split(/[\s,/]+/).filter(Boolean);
  // Percent channels would be misread as numbers, so they do not parse.
  if (parts.length < 3 || parts.length > 4 || parts.some((part) => !/^[\d.]+$/.test(part))) {
    return null;
  }
  const [r, g, b, a = 1] = parts.map(Number);
  if (r === undefined || g === undefined || b === undefined) return null;
  if ([r, g, b, a].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

function toHex({ r, g, b }: Rgba): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

// `color` at `alpha` opacity, multiplied with any alpha it already has. An
// unparseable colour returns `fallback`: passed through, a tint would paint
// as a solid block of foreground.
export function withAlpha(color: string, alpha: number, fallback = "transparent"): string {
  const rgba = parseColor(color);
  if (!rgba) return fallback;
  const a = Number((rgba.a * alpha).toFixed(3));
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${a})`;
}

/** WCAG relative luminance: 0 for black, 1 for white. Alpha is ignored. */
export function luminance({ r, g, b }: Rgba): number {
  const linear = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** WCAG contrast ratio of two colours, or null when either does not parse. */
export function contrastRatio(first: string, second: string): number | null {
  const a = parseColor(first);
  const b = parseColor(second);
  if (!a || !b) return null;
  return ratio(luminance(a), luminance(b));
}

// Lightness from 0 to 1. Beyond hex and rgb(), reads the lightness channel of
// hsl(), lab(), lch(), oklab() and oklch(): enough to tell light from dark.
export function lightness(color: string): number | null {
  const rgba = parseColor(color);
  if (rgba) return (0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b) / 255;
  const match = /^(hsla?|lab|lch|oklab|oklch)\(\s*([^)]*)\)$/i.exec(color.trim());
  if (!match?.[1] || match[2] === undefined) return null;
  const space = match[1].toLowerCase();
  const channels = match[2].split(/[\s,/]+/).filter(Boolean);
  const raw = space.startsWith("hsl") ? channels[2] : channels[0];
  if (raw === undefined) return null;
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) return null;
  // oklab() and oklch() take 0 to 1 unless written as a percentage.
  const scale = raw.endsWith("%") || !space.startsWith("ok") ? 100 : 1;
  return Math.max(0, Math.min(1, value / scale));
}

/** Dark from the surface, else from the foreground, else dark like Paseo's default theme. */
export function isDarkTheme(surface: string, foreground: string): boolean {
  const surfaceLightness = lightness(surface);
  if (surfaceLightness !== null) return surfaceLightness < 0.5;
  const foregroundLightness = lightness(foreground);
  if (foregroundLightness !== null) return foregroundLightness >= 0.5;
  return true;
}

// `color` darkened until it reaches `target` contrast against `surface`.
// Unchanged when it already passes, when the surface is the darker of the two,
// or when either colour does not parse.
export function darkenToContrast(color: string, surface: string, target = TEXT_CONTRAST): string {
  const foreground = parseColor(color);
  const background = parseColor(surface);
  if (!foreground || !background) return color;
  const surfaceLuminance = luminance(background);
  if (ratio(luminance(foreground), surfaceLuminance) >= target) return color;
  if (surfaceLuminance <= luminance(foreground)) return color;
  // Scaling every channel by the same factor keeps the hue.
  for (let step = 1; step <= 100; step += 1) {
    const scale = 1 - step / 100;
    const { r, g, b } = foreground;
    const hex = toHex({ r: r * scale, g: g * scale, b: b * scale, a: 1 });
    const rounded = parseColor(hex);
    if (rounded && ratio(luminance(rounded), surfaceLuminance) >= target) return hex;
  }
  return "#000000";
}

/** Black or white, whichever reads better on `background`; null when it does not parse. */
export function textOn(background: string): string | null {
  const rgba = parseColor(background);
  if (!rgba) return null;
  const value = luminance(rgba);
  return ratio(value, 1) >= ratio(value, 0) ? "#ffffff" : "#000000";
}

// Every colour token from the eleven PluginTheme colours. Surfaces and borders
// are translucent tints of the host foreground so they layer over whatever the
// host paints; when the foreground does not parse, the host's own colour stands in.
export function buildThemeColors(
  colors: PluginSurfaceColors,
  options: { accentPreset?: string; frostedGlass: boolean },
): ThemeColorTokens {
  const isDark = isDarkTheme(colors.surface0, colors.foreground);
  const fg = colors.foreground;
  const preset = options.accentPreset;
  // A preset is a fixed hex, so on a light surface it is darkened until it reads as text.
  const accent = preset
    ? isDark
      ? preset
      : darkenToContrast(preset, colors.surface0)
    : colors.accent;
  const accentForeground = preset
    ? (textOn(accent) ?? colors.accentForeground)
    : colors.accentForeground;
  const success = colors.statusSuccess || (isDark ? "#4cb782" : "#1f8a5b");
  const warning = colors.statusWarning || (isDark ? "#d9a53f" : "#a36a00");
  const danger = colors.statusDanger || (isDark ? "#f47067" : "#cf222e");
  const tint = isDark ? 0.1 : 0.08;
  const edge = isDark ? 0.22 : 0.18;
  const codeSurface = isDark ? "rgba(0, 0, 0, 0.22)" : withAlpha(fg, 0.03, colors.surface1);

  return {
    isDark,

    surface0: colors.surface0,
    surface1: withAlpha(fg, isDark ? 0.03 : 0.025, colors.surface1),
    surface2: withAlpha(fg, isDark ? 0.06 : 0.045, colors.surface2),
    surfaceCode: codeSurface,
    // Translucent so the blur behind them reads, but still dense enough to
    // keep text legible over whatever scrolls past.
    surfaceGlass: options.frostedGlass
      ? withAlpha(colors.surface0, isDark ? 0.52 : 0.64, colors.surface0)
      : colors.surface0,
    surfaceCodeGlass: options.frostedGlass
      ? isDark
        ? "rgba(0, 0, 0, 0.34)"
        : withAlpha(fg, 0.05, colors.surface1)
      : codeSurface,

    foreground: fg,
    foregroundMuted: colors.foregroundMuted,
    foregroundSubtle: withAlpha(colors.foregroundMuted, 0.7, colors.foregroundMuted),

    accent,
    accentForeground,
    accentBg: withAlpha(accent, isDark ? 0.14 : 0.1),
    userSurface: withAlpha(fg, isDark ? 0.1 : 0.06, colors.surface2),
    userBorder: withAlpha(fg, isDark ? 0.14 : 0.12, colors.border),
    userText: fg,
    userTextMuted: colors.foregroundMuted,

    success,
    successBg: withAlpha(success, tint),
    successBorder: withAlpha(success, edge),

    warning,
    warningBg: withAlpha(warning, tint),
    warningBorder: withAlpha(warning, edge),

    danger,
    dangerBg: withAlpha(danger, tint),
    dangerBorder: withAlpha(danger, edge),

    border: withAlpha(fg, isDark ? 0.09 : 0.1, colors.border),
    borderSubtle: withAlpha(fg, 0.06, colors.border),
    boxShadow: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.12 : 0.08,
      shadowRadius: 5,
      elevation: 1,
    },

    // GitHub Dark Dimmed / GitHub Light
    syntax: {
      keyword: isDark ? "#f47067" : "#cf222e",
      string: isDark ? "#96d0ff" : "#0a3069",
      number: isDark ? "#6cb6ff" : "#0550ae",
      comment: isDark ? "#768390" : "#6e7781",
      property: isDark ? "#6cb6ff" : "#0550ae",
      function: isDark ? "#dcbdfb" : "#8250df",
      diffAddBg: withAlpha(success, tint),
      diffAddMarker: success,
      diffRemoveBg: withAlpha(danger, tint),
      diffRemoveMarker: danger,
      hunk: withAlpha(colors.foregroundMuted, 0.7, colors.foregroundMuted),
    },
  };
}
