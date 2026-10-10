import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const ACCENT_PRESET_IDS = ["host", "jade", "violet", "amber", "rose"] as const;

export const presentationSchema = z.object({
  accent: z.enum(ACCENT_PRESET_IDS).catch("host"),
  uiFont: z.enum(["inter", "system"]).catch("inter"),
  codeFont: z.enum(["code", "plain"]).catch("code"),
  frostedGlass: z.boolean().catch(true),
  pointerGlow: z.boolean().catch(true),
  enhancedUserBubble: z.boolean().catch(true),
  selectionActions: z.boolean().catch(true),
  assistantMarkdown: z.boolean().catch(true),
  markdownVariant: z.enum(["document", "compact", "terminal"]).catch("document"),
});

export type PresentationSettings = z.output<typeof presentationSchema>;

/** Host-scoped, so every client of a host, phones included, shares and keeps the same look. */
export const presentationSettings = defineSettings({
  id: "presentation",
  scope: "host",
  version: 1,
  schema: presentationSchema,
});
