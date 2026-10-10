import React, { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { hostFontEscape } from "./components/host-font-escape";
import { radius, buildThemeTokens } from "./components/theme-tokens";
import {
  ACCENT_PRESETS,
  DEFAULT_PREFERENCES,
  setEnhancerPreferences,
  useEnhancerPreferences,
  type AccentPreset,
  type EnhancerPreferences,
} from "./preferences";
import { presentationSettings } from "../shared/presentation-settings";

const ACCENT_OPTIONS: ReadonlyArray<{ id: AccentPreset; label: string }> = [
  { id: "host", label: "Host theme" },
  { id: "jade", label: "Jade" },
  { id: "violet", label: "Violet" },
  { id: "amber", label: "Amber" },
  { id: "rose", label: "Rose" },
];

/** Settings content mounted by Paseo under the selected host's plugin settings. */
export function BeautifulChatSettingsPage({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(presentationSettings);
  const cached = useEnhancerPreferences();
  const ready = settings.status === "ready";
  const preferences = ready ? settings.values : cached;
  const tokens = useMemo(
    () => buildThemeTokens(theme.colors, preferences),
    [preferences, theme.colors],
  );
  // Pointer glow and the selection bar exist only where there is a pointer and a DOM selection.
  const web = layout.platform === "web";

  // Opening this page refreshes the cache the transformers read, including changes from other clients.
  useEffect(() => {
    if (settings.status === "ready") setEnhancerPreferences(settings.values);
  }, [settings.status, settings.status === "ready" ? settings.revision : null]);

  const disabled = !ready || settings.saving;
  function update(patch: Partial<EnhancerPreferences>): void {
    if (settings.status !== "ready") return;
    const next = { ...settings.values, ...patch };
    setEnhancerPreferences(next);
    void settings.save(next, settings.revision);
  }

  return (
    <View {...hostFontEscape} style={styles.page}>
      {settings.status === "invalid" ? (
        <SettingsSection title="Stored settings">
          <SettingsCard>
            <SettingsAction
              label="The stored settings could not be read"
              hint={settings.error}
              actionLabel="Reset"
              onPress={() => void settings.reset()}
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}
      {settings.status === "error" ? (
        <SettingsSection title="Connection">
          <SettingsCard>
            <SettingsAction
              label="The host did not answer"
              hint={settings.error}
              actionLabel="Retry"
              onPress={() => void settings.reload()}
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Appearance">
        <SettingsCard>
          <SettingsRow
            label="Accent colour"
            hint="Follow the Paseo theme, or choose an accent for the chat cards."
          >
            <View
              style={styles.swatches}
              accessibilityRole="radiogroup"
              accessibilityLabel="Accent colour"
            >
              {ACCENT_OPTIONS.map((option) => {
                const selected = preferences.accent === option.id;
                const swatch = ACCENT_PRESETS[option.id] ?? theme.colors.accent;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected, checked: selected, disabled }}
                    disabled={disabled}
                    onPress={() => update({ accent: option.id })}
                    style={[
                      styles.swatchButton,
                      {
                        borderColor: selected ? tokens.accent : tokens.borderSubtle,
                        backgroundColor: selected ? tokens.accentBg : tokens.surface2,
                      },
                    ]}
                  >
                    <View style={[styles.swatch, { backgroundColor: swatch }]} />
                    <Text
                      style={[
                        styles.swatchLabel,
                        {
                          color: selected ? tokens.foreground : tokens.foregroundMuted,
                          fontFamily: tokens.fontUi,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </SettingsRow>
          <SettingsSelect
            label="Interface font"
            hint={
              web
                ? "The embedded Inter face, or the system face."
                : "Phones always use the system face."
            }
            value={preferences.uiFont}
            options={[
              { label: "Inter", value: "inter" },
              { label: "System", value: "system" },
            ]}
            onValueChange={(uiFont) => update({ uiFont })}
            disabled={disabled || !web}
          />
          <SettingsSelect
            label="Code glyphs"
            hint={
              web
                ? "Programming ligatures in code, or every glyph literal."
                : "Phones use the system monospace face."
            }
            value={preferences.codeFont}
            options={[
              { label: "Ligatures", value: "code" },
              { label: "Literal", value: "plain" },
            ]}
            onValueChange={(codeFont) => update({ codeFont })}
            disabled={disabled || !web}
          />
          <SettingsSwitch
            label="Frosted glass"
            hint="Blur card surfaces where the platform supports it, or paint them solid."
            value={preferences.frostedGlass}
            onValueChange={(frostedGlass) => update({ frostedGlass })}
            disabled={disabled}
          />
          {web ? (
            <SettingsSwitch
              label="Pointer glow"
              hint="A soft light follows the pointer across each card. Skipped when the system asks for reduced motion."
              value={preferences.pointerGlow}
              onValueChange={(pointerGlow) => update({ pointerGlow })}
              disabled={disabled}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Chat">
        <SettingsCard>
          <SettingsSwitch
            label="Enhanced prompt bubble"
            hint="Paseo removes pasted images before a plugin sees a prompt. Turn this off for Paseo's own bubble with image previews and its chat find. New prompts follow the change."
            value={preferences.enhancedUserBubble}
            onValueChange={(enhancedUserBubble) => update({ enhancedUserBubble })}
            disabled={disabled}
          />
          <SettingsSwitch
            label="Assistant markdown"
            hint="Draw replies with the plugin's headings, lists, and highlighted code. Turn this off for Mermaid diagrams, images, file links, and Paseo's chat find. New replies follow the change."
            value={preferences.assistantMarkdown}
            onValueChange={(assistantMarkdown) => update({ assistantMarkdown })}
            disabled={disabled}
          />
          <SettingsSelect
            label="Reply style"
            hint="Document suits long answers, Compact tightens spacing, Terminal sets replies in the code face."
            value={preferences.markdownVariant}
            options={[
              { label: "Document", value: "document" },
              { label: "Compact", value: "compact" },
              { label: "Terminal", value: "terminal" },
            ]}
            onValueChange={(markdownVariant) => update({ markdownVariant })}
            disabled={disabled || !preferences.assistantMarkdown}
          />
          {web ? (
            <SettingsSwitch
              label="Selection actions"
              hint="Highlighting text in a card raises a bar with Copy and Add to chat."
              value={preferences.selectionActions}
              onValueChange={(selectionActions) => update({ selectionActions })}
              disabled={disabled}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Defaults">
        <SettingsCard>
          <SettingsAction
            label="Restore the default presentation"
            hint="Every client connected to this host uses these settings."
            error={settings.saveError}
            actionLabel="Reset"
            onPress={() => update({ ...DEFAULT_PREFERENCES })}
            disabled={disabled}
          />
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}

const styles = StyleSheet.create({
  // No `flex: 1`: the host mounts settings in a content-sized column, where web compiles it to a zero basis.
  page: { alignSelf: "stretch", gap: 24 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  swatchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: radius.block,
    paddingHorizontal: 10,
  },
  swatch: { width: 12, height: 12, borderRadius: radius.chip },
  swatchLabel: { fontSize: 12, fontWeight: "600" },
});
