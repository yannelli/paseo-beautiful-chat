import type { PluginClientContext } from "@getpaseo/plugin/client";
import { z } from "zod";
import { BeautifulChatSettingsPage } from "./client/settings-page";
import { embedFonts } from "./client/components/embed-fonts";
import { installFrostedGlass } from "./client/components/frosted";
import { installShimmer } from "./client/components/shimmer";
import { installPointerGlow } from "./client/components/glow";
import { installHostNoticeStyle } from "./client/components/host-notice";
import { installChatFind } from "./client/components/chat-find";
import { extractPromptImages } from "./client/prompt-images";
import { getEnhancerPreferences, loadHostPreferences } from "./client/preferences";
import { errorText } from "./client/tool-extract";
import {
  LiveToolCallRenderer,
  LiveReasoningRenderer,
  LiveTodoRenderer,
  LiveUserMessageRenderer,
  LiveNoticeRenderer,
  LiveAssistantRenderer,
} from "./client/live-renderers";

type JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

const SETTINGS_SCREEN = "chat-presentation";

function compactionMessage(status: "loading" | "completed", trigger?: string, preTokens?: number) {
  if (status === "loading") return "Compacting the conversation context…";
  const from = preTokens ? ` from ${preTokens.toLocaleString()} tokens` : "";
  return `Context compacted${from}${trigger === "auto" ? " automatically" : ""}.`;
}

export default function contribute(client: PluginClientContext) {
  const cleanups: Array<() => void> = [];
  const cleanup = () => {
    for (const remove of cleanups.splice(0).reverse()) {
      try {
        remove();
      } catch (error) {
        console.error("[beautiful-chat] Cleanup failed", error);
      }
    }
  };

  // A registration that throws must not leave the fonts, styles, and key handlers installed.
  try {
    cleanups.push(embedFonts(), installFrostedGlass(), installShimmer(), installPointerGlow());
    // Paseo 0.11 still refuses a `notification` transformer, so the host row is only re-chromed.
    cleanups.push(installHostNoticeStyle());
    // Paseo's chat find cannot reveal rows this plugin draws; this bar can.
    cleanups.push(installChatFind());

    cleanups.push(
      client.addSettingsScreen({
        id: SETTINGS_SCREEN,
        title: "Chat presentation",
        icon: "Blocks",
        Component: BeautifulChatSettingsPage,
      }),
      client.addCommandCenterItem({
        id: "open-settings",
        title: "Beautiful Chat: presentation settings",
        icon: "Blocks",
        context: "global",
        keywords: ["chat", "theme", "markdown", "font", "accent"],
        onSelect: ({ openSettings }) => openSettings(SETTINGS_SCREEN),
      }),
    );

    cleanups.push(
      client.addTimelineTransformer({
        id: "omp-enhanced-tool-call",
        query: { itemType: "tool_call" },
        transform({ item, phase }) {
          return {
            items: [
              {
                type: "plugin" as const,
                kind: "omp-tool-call",
                version: 1,
                data: {
                  name: item.name,
                  status: item.status,
                  detail: toJsonValue(item.detail),
                  ...(item.callId ? { callId: item.callId } : {}),
                  error: errorText(item.error) ?? null,
                  phase,
                },
              },
            ],
          };
        },
      }),
      client.addTimelineRenderer({
        kind: "omp-tool-call",
        version: 1,
        schema: z.object({
          name: z.string(),
          status: z.string(),
          detail: z.record(z.string(), z.unknown()).optional(),
          callId: z.string().optional(),
          error: z.string().nullable().optional(),
          phase: z.string().optional(),
        }),
        Component: LiveToolCallRenderer,
      }),
    );

    cleanups.push(
      client.addTimelineTransformer({
        id: "omp-enhanced-reasoning",
        query: { itemType: "reasoning" },
        transform({ item, phase }) {
          return {
            items: [
              {
                type: "plugin" as const,
                kind: "omp-reasoning",
                version: 1,
                data: { text: item.text, phase },
              },
            ],
          };
        },
      }),
      client.addTimelineRenderer({
        kind: "omp-reasoning",
        version: 1,
        schema: z.object({ text: z.string(), phase: z.string().optional() }),
        Component: LiveReasoningRenderer,
      }),
    );

    cleanups.push(
      client.addTimelineTransformer({
        id: "omp-enhanced-todo",
        query: { itemType: "todo" },
        transform({ item, phase }) {
          return {
            items: [
              {
                type: "plugin" as const,
                kind: "omp-todo",
                version: 1,
                data: { items: toJsonValue(item.items), phase },
              },
            ],
          };
        },
      }),
      client.addTimelineRenderer({
        kind: "omp-todo",
        version: 1,
        schema: z.object({
          items: z.array(z.record(z.string(), z.unknown())),
          phase: z.string().optional(),
        }),
        Component: LiveTodoRenderer,
      }),
    );

    cleanups.push(
      client.addTimelineTransformer({
        id: "omp-enhanced-user-message",
        query: { itemType: "user_message" },
        transform({ item }) {
          // Paseo strips pasted images before plugins see a prompt; the setting hands prompts back.
          if (!getEnhancerPreferences().enhancedUserBubble) return undefined;
          const images = extractPromptImages(item);
          if (images.hasUnrenderable) return undefined;
          // `messageId` lets the renderer carry the host's row id, which the chat outline scrolls to.
          return {
            items: [
              {
                type: "plugin" as const,
                kind: "omp-user-message",
                version: 1,
                data: toJsonValue({
                  text: item.text,
                  ...(images.uris.length > 0 ? { images: images.uris } : {}),
                  ...(item.messageId ? { messageId: item.messageId } : {}),
                }),
              },
            ],
          };
        },
      }),
      client.addTimelineRenderer({
        kind: "omp-user-message",
        version: 1,
        schema: z.object({
          text: z.string(),
          images: z.array(z.string()).optional(),
          messageId: z.string().optional(),
        }),
        Component: LiveUserMessageRenderer,
      }),
    );

    cleanups.push(
      client.addTimelineTransformer({
        id: "omp-enhanced-assistant",
        query: { itemType: "assistant_message" },
        transform({ item }) {
          // Read per item, so a settings change applies to the next reply without a reload.
          if (!getEnhancerPreferences().assistantMarkdown) return undefined;
          if (!item.text.trim()) return undefined;
          return {
            items: [
              {
                type: "plugin" as const,
                kind: "omp-assistant",
                version: 1,
                data: { text: item.text },
              },
            ],
          };
        },
      }),
      client.addTimelineRenderer({
        kind: "omp-assistant",
        version: 1,
        schema: z.object({ text: z.string() }),
        Component: LiveAssistantRenderer,
      }),
    );

    cleanups.push(
      client.addTimelineTransformer({
        id: "omp-enhanced-error",
        query: { itemType: "error" },
        transform({ item }) {
          return {
            items: [
              {
                type: "plugin" as const,
                kind: "omp-notice",
                version: 1,
                data: { level: "error", message: item.message, fatal: true },
              },
            ],
          };
        },
      }),
      client.addTimelineTransformer({
        id: "omp-enhanced-compaction",
        query: { itemType: "compaction" },
        transform({ item }) {
          return {
            items: [
              {
                type: "plugin" as const,
                kind: "omp-notice",
                version: 1,
                data: {
                  level: "info",
                  message: compactionMessage(item.status, item.trigger, item.preTokens),
                },
              },
            ],
          };
        },
      }),
      client.addTimelineRenderer({
        kind: "omp-notice",
        version: 1,
        schema: z.object({
          level: z.string(),
          message: z.string(),
          fatal: z.boolean().optional(),
        }),
        Component: LiveNoticeRenderer,
      }),
    );
  } catch (error) {
    cleanup();
    throw error;
  }

  loadHostPreferences(client).catch((error: unknown) => {
    console.warn("[beautiful-chat] Could not load presentation settings", error);
  });

  return cleanup;
}
