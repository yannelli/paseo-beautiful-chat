import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ToolCalloutData } from "../../shared/contracts";
import { formatBytes, formatDuration } from "./format";
import { Glyph } from "./glyph";
import { MarkdownView } from "./markdown/markdown-view";
import { openLink } from "./open-link";
import { selectionCodeText } from "./selection-actions";
import { SyntaxHighlightBlock, renderTerminalOutput } from "./syntax-highlight";
import type { ExtendedThemeTokens } from "./theme-tokens";
import { radius } from "./theme-tokens";

type Styles = ReturnType<typeof buildStyles>;

interface BodyProps {
  data: ToolCalloutData;
  tokens: ExtendedThemeTokens;
  running: boolean;
}

function buildStyles(tokens: ExtendedThemeTokens) {
  return StyleSheet.create({
    stack: { gap: 8 },
    panel: {
      padding: 10,
      gap: 6,
      borderRadius: radius.block,
      backgroundColor: tokens.surfaceCode,
      ...tokens.boxShadow,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
    chip: {
      fontFamily: tokens.fontUi,
      fontSize: 10.5,
      fontWeight: "600",
      color: tokens.foregroundMuted,
      backgroundColor: tokens.surface2,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.chip,
      overflow: "hidden",
    },
    label: {
      fontFamily: tokens.fontUi,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: tokens.foregroundSubtle,
    },
    body: { fontFamily: tokens.fontUi, fontSize: 12.5, lineHeight: 18, color: tokens.foreground },
    muted: {
      fontFamily: tokens.fontUi,
      fontSize: 12,
      lineHeight: 17,
      color: tokens.foregroundMuted,
    },
    mono: {
      fontFamily: tokens.fontMono,
      fontSize: 11.5,
      lineHeight: 17,
      color: tokens.foregroundMuted,
    },
    link: {
      fontFamily: tokens.fontUi,
      fontSize: 12.5,
      color: tokens.accent,
      textDecorationLine: "underline",
    },
    empty: {
      fontFamily: tokens.fontUi,
      fontSize: 11,
      fontStyle: "italic",
      color: tokens.foregroundSubtle,
    },
    toggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 },
    errorBox: {
      padding: 8,
      borderRadius: radius.block,
      backgroundColor: tokens.dangerBg,
      borderWidth: 1,
      borderColor: tokens.dangerBorder,
    },
    errorText: { fontFamily: tokens.fontUi, fontSize: 12, lineHeight: 17, color: tokens.danger },
    answer: { fontFamily: tokens.fontUi, fontSize: 13, fontWeight: "600", color: tokens.success },
  });
}

export function useBodyStyles(tokens: ExtendedThemeTokens): Styles {
  return useMemo(() => buildStyles(tokens), [tokens]);
}

/** Terminal-style text, or a quiet line saying there was none. */
function Output({
  text,
  styles,
  tokens,
  empty,
}: {
  text?: string;
  styles: Styles;
  tokens: ExtendedThemeTokens;
  empty: string;
}) {
  if (!text) return <Text style={styles.empty}>{empty}</Text>;
  return (
    <Text selectable {...selectionCodeText} style={styles.mono}>
      {renderTerminalOutput(text, tokens)}
    </Text>
  );
}

/** Long text clamped to a few lines until the reader asks for the rest. */
function Clamped({
  text,
  lines,
  styles,
  tokens,
}: {
  text: string;
  lines: number;
  styles: Styles;
  tokens: ExtendedThemeTokens;
}) {
  const [open, setOpen] = useState(false);
  const long = text.split("\n").length > lines || text.length > lines * 120;
  return (
    <View style={{ gap: 4 }}>
      <Text selectable style={styles.muted} numberOfLines={open || !long ? undefined : lines}>
        {text}
      </Text>
      {long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? "Show less" : "Show all"}
          onPress={() => setOpen((value) => !value)}
          style={styles.toggle}
        >
          <Glyph
            name={open ? "ChevronUp" : "ChevronDown"}
            size={12}
            color={tokens.foregroundMuted}
          />
          <Text style={styles.label}>{open ? "show less" : "show all"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorBox({ message, tokens }: { message: string; tokens: ExtendedThemeTokens }) {
  const styles = useBodyStyles(tokens);
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Text selectable style={styles.errorText}>
        {message}
      </Text>
    </View>
  );
}

export function SearchBody({ data, tokens, running }: BodyProps) {
  const styles = useBodyStyles(tokens);
  const search = data.search;
  if (!search) return null;
  const counts = [
    search.numMatches !== undefined ? `${search.numMatches} matches` : undefined,
    search.numFiles !== undefined ? `${search.numFiles} files` : undefined,
    search.truncated ? "truncated" : undefined,
  ].filter((value): value is string => Boolean(value));
  const files = search.files ?? [];
  return (
    <View style={styles.stack}>
      {search.query || counts.length > 0 ? (
        <View style={styles.row}>
          {search.query ? (
            <Text selectable style={[styles.mono, { color: tokens.foreground }]}>
              {search.query}
            </Text>
          ) : null}
          {counts.map((count) => (
            <Text key={count} style={styles.chip}>
              {count}
            </Text>
          ))}
        </View>
      ) : null}
      {(search.webResults ?? []).map((hit, index) => (
        <Pressable
          key={`${hit.url}-${index}`}
          accessibilityRole="link"
          accessibilityLabel={hit.title}
          onPress={() => openLink(hit.url)}
        >
          <Text style={styles.link} numberOfLines={1}>
            {hit.title}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {hit.url}
          </Text>
        </Pressable>
      ))}
      {files.length > 0 ? (
        <View style={styles.panel}>
          {files.slice(0, 20).map((file, index) => (
            <Text key={`${file}-${index}`} selectable style={styles.mono} numberOfLines={1}>
              {file}
            </Text>
          ))}
          {files.length > 20 ? (
            <Text style={styles.empty}>{`${files.length - 20} more`}</Text>
          ) : null}
        </View>
      ) : null}
      {data.output || files.length === 0 ? (
        <View style={styles.panel}>
          <Output
            text={data.output}
            styles={styles}
            tokens={tokens}
            empty={running ? "Searching…" : "No results."}
          />
        </View>
      ) : null}
    </View>
  );
}

export function FetchBody({ data, tokens, running }: BodyProps) {
  const styles = useBodyStyles(tokens);
  const fetch = data.fetch;
  if (!fetch) return null;
  const ok = fetch.code !== undefined && fetch.code < 400;
  const chips = [
    fetch.code !== undefined
      ? `${fetch.code}${fetch.codeText ? ` ${fetch.codeText}` : ""}`
      : undefined,
    fetch.bytes !== undefined ? formatBytes(fetch.bytes) : undefined,
  ].filter((value): value is string => Boolean(value));
  return (
    <View style={styles.stack}>
      {fetch.url ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${fetch.url}`}
          onPress={() => openLink(fetch.url)}
        >
          <Text style={styles.link} numberOfLines={2}>
            {fetch.url}
          </Text>
        </Pressable>
      ) : null}
      {chips.length > 0 ? (
        <View style={styles.row}>
          {chips.map((chip, index) => (
            <Text
              key={chip}
              style={[
                styles.chip,
                index === 0 && fetch.code !== undefined
                  ? { color: ok ? tokens.success : tokens.danger }
                  : null,
              ]}
            >
              {chip}
            </Text>
          ))}
        </View>
      ) : null}
      {fetch.prompt ? (
        <Clamped text={fetch.prompt} lines={2} styles={styles} tokens={tokens} />
      ) : null}
      <View style={styles.panel}>
        <Output
          text={data.output}
          styles={styles}
          tokens={tokens}
          empty={running ? "Fetching…" : "The page returned no text."}
        />
      </View>
    </View>
  );
}

export function WorktreeBody({ data, tokens, running }: BodyProps) {
  const styles = useBodyStyles(tokens);
  const worktree = data.worktree;
  if (!worktree) return null;
  return (
    <View style={styles.stack}>
      {worktree.path ? (
        <Text selectable style={styles.mono} numberOfLines={1}>
          {worktree.path}
        </Text>
      ) : null}
      {worktree.commands.map((command, index) => {
        const tone =
          command.status === "failed"
            ? tokens.danger
            : command.status === "running"
              ? tokens.accent
              : tokens.success;
        return (
          <View key={`${command.command}-${index}`} style={styles.row}>
            <Glyph
              name={
                command.status === "failed" ? "X" : command.status === "running" ? "Dot" : "Check"
              }
              size={12}
              color={tone}
            />
            <Text selectable style={[styles.mono, { color: tokens.foreground, flexShrink: 1 }]}>
              {command.command}
            </Text>
            {command.exitCode !== null && command.exitCode !== 0 ? (
              <Text
                style={[styles.chip, { color: tokens.danger }]}
              >{`exit ${command.exitCode}`}</Text>
            ) : null}
            {command.durationMs !== undefined ? (
              <Text style={styles.chip}>{formatDuration(command.durationMs)}</Text>
            ) : null}
          </View>
        );
      })}
      {data.output || running ? (
        <View style={styles.panel}>
          <Output
            text={data.output}
            styles={styles}
            tokens={tokens}
            empty="Waiting for setup output…"
          />
        </View>
      ) : null}
    </View>
  );
}

export function AskPairsBody({ data, tokens, running }: BodyProps) {
  const styles = useBodyStyles(tokens);
  const pairs = data.askPairs ?? [];
  if (pairs.length === 0) {
    return (
      <Text style={styles.empty}>
        {running ? "Waiting for an answer…" : "No answer was recorded."}
      </Text>
    );
  }
  return (
    <View style={styles.stack}>
      {pairs.map((pair, index) => (
        <View key={index} style={{ gap: 2 }}>
          {pair.question && pair.question !== data.title ? (
            <Text selectable style={styles.muted}>
              {pair.question}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Glyph name="CheckCircle" size={14} color={tokens.success} />
            <Text selectable style={[styles.answer, { flexShrink: 1 }]}>
              {pair.answer}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** A tool this plugin has no typed card for: its request, when that is all there is, and its text. */
export function NoteBody({ data, tokens, running }: BodyProps) {
  const styles = useBodyStyles(tokens);
  return (
    <View style={styles.stack}>
      {data.code ? (
        <SyntaxHighlightBlock
          code={data.code}
          language={data.language ?? "json"}
          tokens={tokens}
          compact
        />
      ) : null}
      {data.output || !data.code ? (
        <View style={styles.panel}>
          <Output
            text={data.output}
            styles={styles}
            tokens={tokens}
            empty={running ? "Waiting for output…" : "The call returned no output."}
          />
        </View>
      ) : null}
    </View>
  );
}

export function PlanBody({ data, tokens }: BodyProps) {
  const styles = useBodyStyles(tokens);
  if (!data.output) return <Text style={styles.empty}>The plan is empty.</Text>;
  return <MarkdownView text={data.output} tokens={tokens} variant="compact" />;
}

/** What a delegated agent has done so far: its recent tool calls and its report. */
export function SubagentActivity({
  data,
  tokens,
}: {
  data: ToolCalloutData;
  tokens: ExtendedThemeTokens;
}) {
  const styles = useBodyStyles(tokens);
  const actions = data.subagent?.actions ?? [];
  const log = data.subagent?.log;
  if (actions.length === 0 && !log) return null;
  const recent = actions.slice(-8);
  return (
    <View style={styles.stack}>
      {recent.length > 0 ? (
        <View style={{ gap: 3 }}>
          <Text style={styles.label}>
            {actions.length > recent.length
              ? `last ${recent.length} of ${actions.length} steps`
              : "steps"}
          </Text>
          {recent.map((action, index) => (
            <View key={index} style={styles.row}>
              <Text style={styles.chip}>{action.toolName}</Text>
              {action.summary ? (
                <Text selectable style={[styles.muted, { flexShrink: 1 }]} numberOfLines={1}>
                  {action.summary}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {log ? (
        <View style={{ gap: 3 }}>
          <Text style={styles.label}>report</Text>
          <Clamped text={log} lines={6} styles={styles} tokens={tokens} />
        </View>
      ) : null}
    </View>
  );
}
