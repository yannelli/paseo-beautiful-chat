import { useSyncExternalStore } from "react";
import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import {
  presentationSchema,
  presentationSettings,
  type PresentationSettings,
} from "../shared/presentation-settings";

export const ACCENT_PRESETS = {
  host: undefined,
  jade: "#10b981",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
} as const;

export type AccentPreset = keyof typeof ACCENT_PRESETS;
export type UiFontPreference = PresentationSettings["uiFont"];
export type CodeFontPreference = PresentationSettings["codeFont"];
export type MarkdownVariantPreference = PresentationSettings["markdownVariant"];

// The host settings document, cached because transformers run outside React and read it synchronously.
// On web a local copy paints the first frame before the host answers.
export type EnhancerPreferences = PresentationSettings;

export const DEFAULT_PREFERENCES: Readonly<EnhancerPreferences> = presentationSchema.parse({});

// The 0.1 storage key, kept so the first host load can adopt choices saved in this browser.
const MIRROR_KEY = "paseo/beautiful-chat/preferences/v1";
const MIGRATED_KEY = "paseo/beautiful-chat/preferences/migrated";

const listeners = new Set<() => void>();

function storage(): Storage | undefined {
  try {
    return (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  } catch {
    return undefined;
  }
}

function readMirror(): EnhancerPreferences | undefined {
  try {
    const stored = storage()?.getItem(MIRROR_KEY);
    return stored ? presentationSchema.parse(JSON.parse(stored)) : undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Storage can be disabled; the host copy is the one that persists.
  }
}

let preferences: EnhancerPreferences = readMirror() ?? { ...DEFAULT_PREFERENCES };

function same(a: EnhancerPreferences, b: EnhancerPreferences): boolean {
  return (Object.keys(DEFAULT_PREFERENCES) as Array<keyof EnhancerPreferences>).every(
    (key) => a[key] === b[key],
  );
}

function publish(): void {
  for (const listener of listeners) listener();
}

export function getEnhancerPreferences(): EnhancerPreferences {
  return preferences;
}

/** Replaces the cached values, for example with the host document after a save. */
export function setEnhancerPreferences(values: EnhancerPreferences): void {
  if (same(preferences, values)) return;
  preferences = { ...values };
  writeStorage(MIRROR_KEY, JSON.stringify(preferences));
  publish();
}

export function useEnhancerPreferences(): EnhancerPreferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getEnhancerPreferences,
    getEnhancerPreferences,
  );
}

/** Reads the host document at startup; the first load in a browser that used 0.1 uploads its choices. */
export async function loadHostPreferences(client: PluginClientContext): Promise<void> {
  const rpc = settingsRpc(presentationSettings.id);
  const result = await client.rpc(rpc.read, {});
  if (result.status !== "ready") return;
  const hostValues = presentationSchema.parse(result.values);
  const local = readMirror();
  const firstLoad = !storage()?.getItem(MIGRATED_KEY);
  writeStorage(MIGRATED_KEY, "1");
  if (firstLoad && local && !same(local, hostValues)) {
    const saved = await client.rpc(rpc.write, { revision: result.revision, values: local });
    if (saved.status === "saved") return;
  }
  setEnhancerPreferences(hostValues);
}
