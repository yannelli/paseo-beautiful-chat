import type {
  EvalCell,
  McpToolData,
  PaseoToolData,
  ToolCallStatus,
  ToolCalloutData,
} from "../shared/contracts";
import { stripSelector } from "../shared/file-rpc";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function firstLine(text: string, max = 80): string {
  const line = text.trim().split("\n", 1)[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A failed call's error as one readable string. Hosts report a string or an `{ message }` record. */
export function errorText(value: unknown): string | undefined {
  if (value === null || value === undefined || value === false) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (isRecord(value) && typeof value.message === "string") return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function toolCallStatus(status: string): ToolCallStatus {
  if (status === "running" || status === "failed" || status === "canceled") return status;
  return "completed";
}

// MCP names: Paseo 0.11 bridge "server / tool", Claude "mcp__server__tool", OMP raw "mcp_server__tool_<hash>".
export function splitToolName(name: string): { server?: string; tool: string } {
  const bridged = name.match(/^(.+?) \/ (.+)$/);
  if (bridged?.[1] && bridged[2]) return { server: bridged[1], tool: bridged[2] };
  const claude = name.match(/^mcp__([^_](?:.*?[^_])?)__(.+)$/);
  if (claude?.[1] && claude[2]) return { server: claude[1], tool: claude[2] };
  const omp = name.match(/^mcp_([^_](?:.*?[^_])?)__(.+?)_[0-9a-f]{12}$/);
  if (omp?.[1] && omp[2]) return { server: omp[1], tool: omp[2] };
  return { tool: name };
}

/** A tool's human-readable text sits in the first text block of `content`. */
export function extractContentText(container: Record<string, unknown>): string | undefined {
  const content = container.content;
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (isRecord(block) && typeof block.text === "string" && block.text.length > 0) {
      return block.text;
    }
  }
  return undefined;
}

export function outputTextOf(output: unknown): string | undefined {
  if (typeof output === "string") return output || undefined;
  if (!isRecord(output)) return undefined;
  return asString(output.stdout) ?? asString(output.text) ?? extractContentText(output);
}

/** Kernel ids are short; the highlighter names dialects in full. */
function normalizeKernel(language: string): string {
  const id = language.toLowerCase();
  return id === "py" || id === "python" ? "python" : "typescript";
}

/** Eval nests its cells under the result's `details`; a flat provider puts the source on the input. */
export function extractEvalCells(
  detail: Record<string, unknown>,
  input: Record<string, unknown>,
  output: unknown,
): EvalCell[] {
  const container = isRecord(output) ? output : detail;
  const details = isRecord(container.details) ? container.details : {};
  const fallbackLanguage = asString(details.language) ?? asString(input.language) ?? "js";
  const raw = Array.isArray(details.cells) ? details.cells.filter(isRecord) : [];
  const cells = raw.flatMap((cell): EvalCell[] => {
    const code = asString(cell.code);
    if (!code) return [];
    return [
      {
        title: asString(cell.title),
        code,
        language: normalizeKernel(asString(cell.language) ?? fallbackLanguage),
        output: typeof cell.output === "string" ? cell.output : undefined,
      },
    ];
  });
  if (cells.length > 0) return cells;
  const code = asString(input.code);
  if (!code) return [];
  return [
    {
      title: asString(input.title),
      code,
      language: normalizeKernel(fallbackLanguage),
      output: extractContentText(container),
    },
  ];
}

/** Eval times the whole run and reports it beside the cells. */
export function extractEvalDuration(output: unknown): number | undefined {
  return isRecord(output) && isRecord(output.details)
    ? asNumber(output.details.durationMs)
    : undefined;
}

/** A pre-0.11 `task` call: a shared `context` plus one brief per spawned agent. */
export function buildSubagentBatch(input: Record<string, unknown>): ToolCalloutData["subagent"] {
  const entries = Array.isArray(input.tasks) ? input.tasks : [];
  const agents = entries.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const brief = asString(entry.task);
    if (!brief) return [];
    return [
      {
        name: asString(entry.name) ?? `agent ${index + 1}`,
        agentType: asString(entry.agent) ?? "task",
        task: brief,
      },
    ];
  });
  if (agents.length === 0) return undefined;
  const context = asString(input.context);
  return context ? { context, agents } : { agents };
}

export function buildMcpData(
  server: string,
  tool: string,
  input: Record<string, unknown>,
  output: unknown,
  durationMs: number | undefined,
): McpToolData {
  // Unwrap the content-block envelope so prose reads as prose; structured payloads stay objects.
  const prose = isRecord(output) ? extractContentText(output) : undefined;
  return {
    server,
    tool,
    arguments: input,
    result: prose ?? (output === "" ? undefined : output),
    durationMs,
  };
}

/** Paseo's own agent tools. Only `create_agent` carries a record worth a card. */
export function buildPaseoData(
  tool: string,
  input: Record<string, unknown>,
  outputText: string | undefined,
  durationMs: number | undefined,
): PaseoToolData | undefined {
  if (tool !== "create_agent") return undefined;
  const provider = asString(input.provider) ?? "agent";
  const [providerId, model] = provider.split("/");
  return {
    id: `paseo-${tool}`,
    tool: "create_agent",
    durationMs,
    createAgent: {
      title: asString(input.title) ?? "New agent",
      provider: providerId ?? provider,
      model: model ?? asString(input.model),
      initialPrompt: asString(input.initialPrompt) ?? asString(input.prompt) ?? "",
      agentId: outputText?.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0],
      status: "created",
    },
  };
}

export interface AskOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

/** The ask tool nests its prompt under `questions`, with the options beside it. */
export function extractAskQuestion(
  input: Record<string, unknown>,
): { question: string; options: AskOption[] } | null {
  const raw = Array.isArray(input.questions)
    ? input.questions.find(isRecord)
    : typeof input.question === "string"
      ? input
      : undefined;
  if (!raw) return null;
  const question = asString(raw.question) ?? "";
  const recommended = asNumber(raw.recommended);
  const entries = Array.isArray(raw.options) ? raw.options : [];
  const options = entries.flatMap((entry, index): AskOption[] => {
    if (!isRecord(entry)) return [];
    const label = asString(entry.label);
    if (!label) return [];
    return [
      {
        id: asString(entry.id) ?? `opt-${index}`,
        label,
        description: asString(entry.description),
        recommended: index === recommended,
      },
    ];
  });
  if (!question && options.length === 0) return null;
  return { question, options };
}

/** The chosen answer as prose, with any "User selected:" prefix removed. */
export function extractAskAnswer(text?: string): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^user\s+(?:selected|answered|chose)\s*:?\s*/i);
  const answer = match ? trimmed.slice(match[0].length).trim() : trimmed;
  return answer || undefined;
}

/** The selected labels: `details.selectedOptions` when reported, else the prose answer. */
export function extractAskSelections(output: unknown, outputText?: string): string[] {
  const details = isRecord(output) && isRecord(output.details) ? output.details : undefined;
  if (details && Array.isArray(details.selectedOptions)) {
    const labels = details.selectedOptions.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
    if (labels.length > 0) return labels;
  }
  const single = extractAskAnswer(isRecord(output) ? extractContentText(output) : outputText);
  return single ? [single] : [];
}

/** Paseo 0.11 reports an OMP ask as `question\nanswer` blocks separated by blank lines. */
export function parseAskPairs(
  label: string | undefined,
  text: string | undefined,
): Array<{ question: string; answer: string }> {
  if (!text?.trim()) return [];
  return text
    .trim()
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const [head, ...rest] = lines;
      if (!head) return [];
      if (rest.length === 0) {
        return [{ question: label ?? "", answer: extractAskAnswer(head) ?? head }];
      }
      return [{ question: head, answer: rest.join("\n") }];
    });
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  sass: "css",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
};

/** The language a file is written in, read from its path. */
export function languageFromPath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const name = stripSelector(filePath).toLowerCase().split(/[/\\]/).pop() ?? "";
  const base = name.split(/[?#]/)[0] ?? "";
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "docker";
  if (!base.includes(".")) return undefined;
  return LANGUAGE_BY_EXTENSION[base.split(".").pop() ?? ""];
}

/** `offset` is the first line read and `limit` the count, so the range is inclusive. */
export function lineRange(offset: unknown, limit: unknown): string | undefined {
  const start = asNumber(offset);
  const count = asNumber(limit);
  if (start === undefined && count === undefined) return undefined;
  const first = start ?? 1;
  return count !== undefined && count > 0 ? `${first}-${first + count - 1}` : `${first}-`;
}

/** An edit the host reports as old and new text, drawn as a removed block then an added block. */
export function diffFromStrings(oldText?: string, newText?: string): string | undefined {
  const removed = oldText ? oldText.split("\n").map((line) => `-${line}`) : [];
  const added = newText ? newText.split("\n").map((line) => `+${line}`) : [];
  const lines = [...removed, ...added];
  return lines.length > 0 ? lines.join("\n") : undefined;
}
