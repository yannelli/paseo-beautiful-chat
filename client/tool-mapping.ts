import type {
  FetchToolData,
  SearchToolData,
  ToolCallKind,
  ToolCallStatus,
  ToolCalloutData,
  WorktreeToolData,
} from "../shared/contracts";
import { buildGitHubData } from "./github-request";
import { buildHubData } from "./hub-details";
import {
  asNumber,
  asString,
  buildMcpData,
  buildPaseoData,
  buildSubagentBatch,
  diffFromStrings,
  errorText,
  extractAskQuestion,
  extractAskSelections,
  extractEvalCells,
  extractEvalDuration,
  firstLine,
  isRecord,
  languageFromPath,
  lineRange,
  outputTextOf,
  parseAskPairs,
  splitToolName,
  toolCallStatus,
} from "./tool-extract";

/** The tool call as the transformer hands it to the renderer. */
export interface ToolCallPayload {
  name: string;
  status: string;
  detail?: Record<string, unknown>;
  callId?: string;
  error?: string | null;
  phase?: string;
}

type Detail = Record<string, unknown>;

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

/** The host's `sub_agent` detail: one delegation, its tool calls so far, and its report. */
function subagentFromDetail(detail: Detail, status: ToolCallStatus): ToolCalloutData["subagent"] {
  const agentType = asString(detail.subAgentType);
  const actions = (Array.isArray(detail.actions) ? detail.actions : [])
    .filter(isRecord)
    .flatMap((action) => {
      const toolName = asString(action.toolName);
      return toolName ? [{ toolName, summary: asString(action.summary) }] : [];
    });
  const log = asString(detail.log)?.trim();
  return {
    agents: [
      {
        name: agentType ?? "subagent",
        agentType: agentType ?? "agent",
        task: asString(detail.description) ?? "",
        status,
      },
    ],
    ...(actions.length > 0 ? { actions } : {}),
    ...(log ? { log } : {}),
  };
}

function searchFromDetail(detail: Detail): SearchToolData {
  const files = (Array.isArray(detail.filePaths) ? detail.filePaths : []).filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
  const webResults = (Array.isArray(detail.webResults) ? detail.webResults : [])
    .filter(isRecord)
    .flatMap((hit) => {
      const url = asString(hit.url);
      return url ? [{ title: asString(hit.title) ?? url, url }] : [];
    });
  return {
    query: asString(detail.query) ?? "",
    toolName: asString(detail.toolName),
    ...(files.length > 0 ? { files } : {}),
    ...(webResults.length > 0 ? { webResults } : {}),
    numFiles: asNumber(detail.numFiles),
    numMatches: asNumber(detail.numMatches),
    truncated: detail.truncated === true ? true : undefined,
  };
}

function searchTitle(search: SearchToolData, toolName: string): string {
  const query = firstLine(search.query, 60);
  const kind = search.toolName ?? toolName;
  if (kind === "web_search" || kind === "websearch") return `Search the web: ${query}`;
  if (kind === "glob") return `Glob ${query}`;
  if (kind === "grep") return `Grep ${query}`;
  if (kind === "ls") return `List ${query}`;
  return query ? `Search ${query}` : "Search";
}

function fetchFromDetail(detail: Detail): FetchToolData {
  return {
    url: asString(detail.url) ?? "",
    prompt: asString(detail.prompt),
    code: asNumber(detail.code),
    codeText: asString(detail.codeText),
    bytes: asNumber(detail.bytes),
  };
}

/** `host/path` without the scheme or query, which is what a reader scans for. */
export function urlLabel(url: string): string {
  const match = url.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)([^?#]*)/i);
  if (!match) return url;
  return firstLine(`${match[1]}${(match[2] ?? "").replace(/\/$/, "")}`, 70);
}

function worktreeFromDetail(detail: Detail): WorktreeToolData {
  const commands = (Array.isArray(detail.commands) ? detail.commands : [])
    .filter(isRecord)
    .flatMap((entry) => {
      const command = asString(entry.command);
      if (!command) return [];
      const status: WorktreeToolData["commands"][number]["status"] =
        entry.status === "running" || entry.status === "failed" ? entry.status : "completed";
      return [
        {
          command,
          status,
          exitCode: asNumber(entry.exitCode) ?? null,
          durationMs: asNumber(entry.durationMs),
        },
      ];
    });
  return {
    path: asString(detail.worktreePath) ?? "",
    branch: asString(detail.branchName) ?? "",
    commands,
    truncated: detail.truncated === true ? true : undefined,
  };
}

const PASEO_TOOLS = new Set([
  "create_agent",
  "list_providers",
  "list_models",
  "get_agent_activity",
  "send_agent_prompt",
  "get_agent_status",
  "list_agents",
]);
const ASK_TOOLS = new Set(["ask", "ask_user", "askuserquestion"]);
const THINK_TOOLS = new Set(["think", "thinking"]);
const GIT_COMMAND = /^\s*git(?:\.exe)?(?:\s|$)/i;
// Paseo's `ToolCallIconName` set, as the Lucide names the host draws for it.
const HOST_ICONS: Record<string, string> = {
  wrench: "Wrench",
  square_terminal: "SquareTerminal",
  eye: "Eye",
  pencil: "Pencil",
  search: "Search",
  bot: "Bot",
  sparkles: "Sparkles",
  brain: "Brain",
  mic_vocal: "MicVocal",
};

/** Builds the card record for one host tool call: from its `detail` shape first, its name second. */
export function buildToolCallout(payload: ToolCallPayload): ToolCalloutData {
  const fullName = payload.name || "tool";
  const { server, tool } = splitToolName(fullName);
  const name = tool.toLowerCase();
  const detail: Detail = isRecord(payload.detail) ? payload.detail : {};
  const type = (asString(detail.type) ?? "").toLowerCase();
  const input = [detail.input, detail.arguments, detail.args].find(isRecord) ?? {};
  const output = detail.output ?? detail.result ?? "";
  const status = toolCallStatus(payload.status);
  const filePath = asString(detail.filePath) ?? asString(input.path) ?? asString(input.filePath);
  const label = asString(detail.label);
  const text = asString(detail.text);
  const error = status === "failed" ? errorText(payload.error) : undefined;
  const card: ToolCalloutData = {
    id: `live-${payload.callId ?? name}`,
    tool: "note",
    title: fullName,
    status,
    ...(error ? { error } : {}),
    durationMs: asNumber(detail.durationMs) ?? extractEvalDuration(output),
  };
  const kind = (next: ToolCallKind, title: string, extra: Partial<ToolCalloutData> = {}) => ({
    ...card,
    tool: next,
    title,
    ...extra,
  });

  // A github device call is a write to xd://github, an xdev record, or Paseo 0.11 prose.
  if (name === "github" || filePath === "xd://github" || filePath?.startsWith("xd://github/")) {
    const request =
      asString(input.content) ??
      asString(detail.content) ??
      (Object.keys(input).length > 0 ? JSON.stringify(input) : undefined);
    const reply = type === "plain_text" ? text : outputTextOf(output);
    const github = buildGitHubData(
      request ?? label,
      reply !== request ? reply : undefined,
      request === undefined,
    );
    const title = github
      ? [github.op, github.repo, github.subject].filter(Boolean).join(" ")
      : "GitHub";
    return kind("github", title, { github });
  }

  switch (type) {
    case "shell": {
      const command = asString(detail.command) ?? "";
      const shellKind = GIT_COMMAND.test(command) ? "git" : name === "bash" ? "bash" : "shell";
      return kind(shellKind, command ? `$ ${firstLine(command, 70)}` : "Run command", {
        command,
        language: "bash",
        output: asString(detail.output),
        exitCode: asNumber(detail.exitCode),
      });
    }
    case "read":
      return kind("read", filePath ? `Read ${basename(filePath)}` : "Read file", {
        filePath,
        language: languageFromPath(filePath),
        code: asString(detail.content),
        lineRange: lineRange(detail.offset, detail.limit),
      });
    case "edit":
      return kind("edit", filePath ? `Edit ${basename(filePath)}` : "Edit file", {
        filePath,
        language: languageFromPath(filePath),
        diff:
          asString(detail.unifiedDiff) ??
          asString(detail.diff) ??
          diffFromStrings(asString(detail.oldString), asString(detail.newString)),
      });
    case "write":
      if (filePath?.startsWith("xd://")) {
        const device = filePath.slice("xd://".length).split(/[/?#]/, 1)[0];
        return kind("note", device || fullName, {
          code: asString(detail.content),
          language: "json",
          output: outputTextOf(output),
        });
      }
      return kind("write", filePath ? `Write ${basename(filePath)}` : "Write file", {
        filePath,
        language: languageFromPath(filePath),
        code: asString(detail.content),
      });
    case "search": {
      const search = searchFromDetail(detail);
      return kind("search", searchTitle(search, name), {
        search,
        output: asString(detail.content),
      });
    }
    case "fetch": {
      const fetch = fetchFromDetail(detail);
      return kind("fetch", fetch.url ? `Fetch ${urlLabel(fetch.url)}` : "Fetch", {
        fetch,
        output: asString(detail.result),
      });
    }
    case "sub_agent": {
      const brief = asString(detail.description);
      const title = brief ? firstLine(brief, 70) : (asString(detail.subAgentType) ?? "Subagent");
      return kind("task", title, { subagent: subagentFromDetail(detail, status) });
    }
    case "worktree_setup": {
      const worktree = worktreeFromDetail(detail);
      const title = worktree.branch ? `Set up worktree ${worktree.branch}` : "Set up worktree";
      return kind("worktree", title, { worktree, output: asString(detail.log) });
    }
    case "plan":
      return kind("plan", "Plan", { output: asString(detail.text) });
    case "plain_text":
      if (ASK_TOOLS.has(name)) {
        return kind("ask", label ?? "Question", { askPairs: parseAskPairs(label, text) });
      }
      if (THINK_TOOLS.has(name)) {
        return kind("thinking", "Thinking", {
          thinking: { text: text ?? "", status: status === "running" ? "thinking" : "completed" },
        });
      }
      if (name === "eval") {
        return kind("eval", label && label !== "eval" ? `Eval: ${label}` : "Eval", {
          output: text,
        });
      }
      return kind("note", label ?? fullName, {
        output: text,
        icon: HOST_ICONS[asString(detail.icon) ?? ""],
      });
  }

  const outputText = outputTextOf(output);
  if (server?.toLowerCase() === "paseo" || (!server && PASEO_TOOLS.has(name))) {
    const paseo = buildPaseoData(name, input, outputText, card.durationMs);
    return kind("paseo", `Paseo: ${tool}`, { paseo, output: outputText });
  }
  if (server || name === "mcp") {
    const mcp = buildMcpData(server ?? "mcp", tool, input, output, card.durationMs);
    return kind("mcp", `${mcp.server} / ${mcp.tool}`, { mcp });
  }
  if (ASK_TOOLS.has(name)) {
    const asked = extractAskQuestion(input);
    const options = asked?.options ?? [];
    const answer = extractAskSelections(output, outputText);
    const question = asked?.question || "Question";
    if (options.length === 0) {
      const pairs = answer.length > 0 ? [{ question, answer: answer.join(", ") }] : [];
      return kind("ask", question, { askPairs: pairs });
    }
    return kind("ask", question, {
      askOptions: options,
      ...(answer.length > 0 ? { askAnswer: answer } : {}),
    });
  }
  if (name === "hub") {
    return kind("hub", `Hub: ${asString(input.op) ?? "operation"}`, {
      hub: buildHubData(input, outputText, output),
    });
  }
  if (name === "eval") {
    const cells = extractEvalCells(detail, input, output);
    const cellTitle = cells.find((cell) => cell.title)?.title;
    return kind("eval", cellTitle ? `Eval: ${cellTitle}` : "Eval", {
      ...(cells.length > 0 ? { cells } : { output: outputText }),
    });
  }
  if (name === "task") {
    const subagent = buildSubagentBatch(input);
    const count = subagent?.agents.length ?? 0;
    const title =
      count === 1 ? (subagent?.agents[0]?.name ?? "Subagent") : `${count || "No"} subagents`;
    return kind("task", title, { subagent, ...(subagent ? {} : { output: outputText }) });
  }
  if (THINK_TOOLS.has(name)) {
    const thought = asString(input.thoughts) ?? asString(input.thought) ?? outputText ?? "";
    return kind("thinking", "Thinking", {
      thinking: { text: thought, status: status === "running" ? "thinking" : "completed" },
    });
  }
  // An unmapped tool shows what it printed, or what it was asked when it printed nothing.
  const asked = Object.keys(input).length > 0 ? JSON.stringify(input, null, 2) : undefined;
  return kind("note", fullName, {
    output: outputText,
    ...(outputText || !asked ? {} : { code: asked, language: "json" }),
  });
}
