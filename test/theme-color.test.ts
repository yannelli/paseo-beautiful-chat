import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildThemeColors,
  contrastRatio,
  darkenToContrast,
  isDarkTheme,
  parseColor,
  textOn,
  withAlpha,
  type PluginSurfaceColors,
} from "../client/components/theme-color";

// Mirrors ACCENT_PRESETS in client/preferences.ts.
const PRESETS = { jade: "#10b981", violet: "#8b5cf6", amber: "#f59e0b", rose: "#f43f5e" };

const LIGHT: PluginSurfaceColors = {
  surface0: "#ffffff",
  surface1: "#f4f4f5",
  surface2: "#e4e4e7",
  border: "#d4d4d8",
  foreground: "#18181b",
  foregroundMuted: "#71717a",
  accent: "#2563eb",
  accentForeground: "#ffffff",
  statusSuccess: "#15803d",
  statusWarning: "#b45309",
  statusDanger: "#b91c1c",
};

const DARK: PluginSurfaceColors = {
  ...LIGHT,
  surface0: "#0b0b0b",
  surface1: "#18181b",
  surface2: "#27272a",
  border: "#3f3f46",
  foreground: "#fafafa",
  foregroundMuted: "#a1a1aa",
};

const OKLCH: PluginSurfaceColors = {
  surface0: "oklch(0.98 0.01 250)",
  surface1: "oklch(0.95 0.01 250)",
  surface2: "oklch(0.92 0.01 250)",
  border: "oklch(0.88 0.01 250)",
  foreground: "oklch(0.2 0.02 250)",
  foregroundMuted: "oklch(0.5 0.02 250)",
  accent: "oklch(0.55 0.2 260)",
  accentForeground: "oklch(0.99 0 0)",
  statusSuccess: "oklch(0.6 0.15 150)",
  statusWarning: "oklch(0.7 0.15 80)",
  statusDanger: "oklch(0.6 0.2 25)",
};

describe("colour parsing", () => {
  test("reads hex and rgb()", () => {
    assert.deepEqual(parseColor("#abc"), { r: 170, g: 187, b: 204, a: 1 });
    assert.deepEqual(parseColor("rgba(147, 197, 253, 0.1)"), { r: 147, g: 197, b: 253, a: 0.1 });
    assert.deepEqual(parseColor("rgb(1 2 3 / 0.5)"), { r: 1, g: 2, b: 3, a: 0.5 });
  });

  test("refuses what it cannot read rather than guessing", () => {
    for (const color of ["oklch(0.5 0.1 200)", "hsl(0 0% 50%)", "white", "rgb(50% 0% 0%)"]) {
      assert.equal(parseColor(color), null, color);
    }
  });

  test("an unparseable tint falls back instead of painting solid", () => {
    assert.equal(withAlpha("oklch(0.5 0.1 200)", 0.1), "transparent");
    assert.equal(withAlpha("white", 0.1, "#eeeeee"), "#eeeeee");
    assert.equal(withAlpha("#ffffff", 0.5), "rgba(255, 255, 255, 0.5)");
  });
});

describe("light or dark", () => {
  test("reads the lightness channel of modern colour functions", () => {
    assert.equal(isDarkTheme("oklch(0.98 0.01 250)", "#000"), false);
    assert.equal(isDarkTheme("oklch(21% 0.01 250)", "#fff"), true);
    assert.equal(isDarkTheme("hsl(210, 20%, 98%)", "#000"), false);
    assert.equal(isDarkTheme("lab(12 0 0)", "#fff"), true);
  });

  test("falls back to the foreground, then to dark", () => {
    assert.equal(isDarkTheme("white", "#111111"), false);
    assert.equal(isDarkTheme("black", "#eeeeee"), true);
    assert.equal(isDarkTheme("white", "black"), true);
  });
});

describe("an oklch theme", () => {
  const tokens = buildThemeColors(OKLCH, { frostedGlass: true });

  test("is read as light", () => {
    assert.equal(tokens.isDark, false);
  });

  test("takes surfaces and borders from the host instead of solid foreground", () => {
    assert.equal(tokens.surface1, OKLCH.surface1);
    assert.equal(tokens.surface2, OKLCH.surface2);
    assert.equal(tokens.border, OKLCH.border);
    assert.equal(tokens.surfaceGlass, OKLCH.surface0);
    for (const value of [tokens.surface1, tokens.surface2, tokens.userSurface, tokens.border]) {
      assert.notEqual(value, OKLCH.foreground);
    }
  });

  test("leaves derived tints transparent and text opaque", () => {
    assert.equal(tokens.accentBg, "transparent");
    assert.equal(tokens.successBg, "transparent");
    assert.equal(tokens.dangerBorder, "transparent");
    assert.equal(tokens.foregroundSubtle, OKLCH.foregroundMuted);
  });
});

describe("status colours", () => {
  test("come from the host", () => {
    const tokens = buildThemeColors(LIGHT, { frostedGlass: false });
    assert.equal(tokens.success, LIGHT.statusSuccess);
    assert.equal(tokens.warning, LIGHT.statusWarning);
    assert.equal(tokens.danger, LIGHT.statusDanger);
  });

  test("fall back when the host leaves one empty", () => {
    const tokens = buildThemeColors(
      { ...DARK, statusSuccess: "", statusWarning: "" },
      {
        frostedGlass: false,
      },
    );
    assert.equal(tokens.success, "#4cb782");
    assert.equal(tokens.warning, "#d9a53f");
  });
});

describe("accent presets", () => {
  test("fail AA as text on white before adjustment", () => {
    assert.ok((contrastRatio(PRESETS.amber, "#ffffff") ?? 0) < 4.5);
    assert.ok((contrastRatio(PRESETS.jade, "#ffffff") ?? 0) < 4.5);
  });

  for (const [name, hex] of Object.entries(PRESETS)) {
    test(`${name} reaches AA on a light theme, with readable text on it`, () => {
      const tokens = buildThemeColors(LIGHT, { accentPreset: hex, frostedGlass: false });
      assert.ok((contrastRatio(tokens.accent, LIGHT.surface0) ?? 0) >= 4.5, tokens.accent);
      assert.ok((contrastRatio(tokens.accentForeground, tokens.accent) ?? 0) >= 4.5);
    });
  }

  test("stay as authored on a dark theme", () => {
    const tokens = buildThemeColors(DARK, { accentPreset: PRESETS.amber, frostedGlass: false });
    assert.equal(tokens.accent, PRESETS.amber);
    assert.equal(tokens.accentForeground, "#000000");
  });

  test("the host accent keeps the host's foreground", () => {
    const tokens = buildThemeColors(LIGHT, { frostedGlass: false });
    assert.equal(tokens.accent, LIGHT.accent);
    assert.equal(tokens.accentForeground, LIGHT.accentForeground);
  });
});

describe("contrast helpers", () => {
  test("darkening keeps a passing colour and ignores a dark surface", () => {
    assert.equal(darkenToContrast("#1d4ed8", "#ffffff"), "#1d4ed8");
    assert.equal(darkenToContrast("#f59e0b", "#0b0b0b"), "#f59e0b");
    assert.equal(darkenToContrast("oklch(0.7 0.1 80)", "#ffffff"), "oklch(0.7 0.1 80)");
  });

  test("text on a background is whichever of black and white reads better", () => {
    assert.equal(textOn("#ffffff"), "#000000");
    assert.equal(textOn("rgb(24, 24, 27)"), "#ffffff");
    assert.equal(textOn("Canvas"), null);
  });
});
