import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildToolCallout } from "../client/tool-mapping";
import { errorText, languageFromPath, lineRange, splitToolName } from "../client/tool-extract";

// Detail shapes below are the ones Paseo 0.11.2's OMP mapper emits.
describe("Paseo 0.11 detail shapes", () => {
  test("ask arrives as plain_text question and answer blocks", () => {
    const card = buildToolCallout({
      name: "ask",
      status: "completed",
      detail: {
        type: "plain_text",
        label: "Which database?",
        text: "Which database?\nPostgres\n\nWhich region?\neu-west-1, us-east-1",
      },
    });
    assert.equal(card.tool, "ask");
    assert.equal(card.title, "Which database?");
    assert.deepEqual(card.askPairs, [
      { question: "Which database?", answer: "Postgres" },
      { question: "Which region?", answer: "eu-west-1, us-east-1" },
    ]);
  });

  test("a one-line ask result keeps the label as its question", () => {
    const card = buildToolCallout({
      name: "ask",
      status: "completed",
      detail: { type: "plain_text", label: "Ship it?", text: "User selected: Yes" },
    });
    assert.deepEqual(card.askPairs, [{ question: "Ship it?", answer: "Yes" }]);
  });

  test("eval keeps its printed text", () => {
    const card = buildToolCallout({
      name: "eval",
      status: "completed",
      detail: { type: "plain_text", label: "eval", text: "42\n" },
    });
    assert.equal(card.tool, "eval");
    assert.equal(card.title, "Eval");
    assert.equal(card.output, "42\n");
  });

  test("a github device label becomes the op and subject", () => {
    const card = buildToolCallout({
      name: "github",
      status: "completed",
      detail: {
        type: "plain_text",
        label: "pr_create feature/login",
        text: "Created #128 Add login\nhttps://github.com/o/r/pull/128.",
      },
    });
    assert.equal(card.tool, "github");
    assert.equal(card.github?.op, "pr_create");
    assert.equal(card.github?.subject, "feature/login");
    assert.equal(card.github?.link, "https://github.com/o/r/pull/128");
    assert.deepEqual(card.github?.rows?.[0], { label: "pull request", value: "#128 Add login" });
    assert.equal(card.github?.request, undefined);
  });

  test("web search, glob, and grep use the search card", () => {
    const web = buildToolCallout({
      name: "web_search",
      status: "completed",
      detail: { type: "search", query: "paseo plugins", toolName: "web_search", content: "1. …" },
    });
    assert.equal(web.tool, "search");
    assert.equal(web.title, "Search the web: paseo plugins");
    assert.equal(web.output, "1. …");
    const grep = buildToolCallout({
      name: "grep",
      status: "completed",
      detail: {
        type: "search",
        query: "TODO",
        toolName: "grep",
        filePaths: ["a.ts", ""],
        numMatches: 3,
      },
    });
    assert.equal(grep.title, "Grep TODO");
    assert.deepEqual(grep.search?.files, ["a.ts"]);
    assert.equal(grep.search?.numMatches, 3);
  });

  test("a URL read uses the fetch card", () => {
    const card = buildToolCallout({
      name: "read",
      status: "completed",
      detail: { type: "fetch", url: "https://paseo.sh/docs/plugins?x=1", result: "# Plugins" },
    });
    assert.equal(card.tool, "fetch");
    assert.equal(card.title, "Fetch paseo.sh/docs/plugins");
    assert.equal(card.output, "# Plugins");
  });

  test("a task is a sub_agent detail", () => {
    const card = buildToolCallout({
      name: "task",
      status: "running",
      detail: {
        type: "sub_agent",
        subAgentType: "explore",
        description: "Map the auth flow\nthen report",
        log: " done ",
        actions: [{ index: 1, toolName: "read", summary: "auth.ts" }, { index: 2 }],
      },
    });
    assert.equal(card.tool, "task");
    assert.equal(card.title, "Map the auth flow");
    assert.deepEqual(card.subagent?.agents, [
      {
        name: "explore",
        agentType: "explore",
        task: "Map the auth flow\nthen report",
        status: "running",
      },
    ]);
    assert.deepEqual(card.subagent?.actions, [{ toolName: "read", summary: "auth.ts" }]);
    assert.equal(card.subagent?.log, "done");
  });

  test("an unmapped plain_text row keeps its label and text", () => {
    const card = buildToolCallout({
      name: "wait",
      status: "completed",
      detail: { type: "plain_text", label: "task completed: explore", text: "All done" },
    });
    assert.equal(card.tool, "note");
    assert.equal(card.title, "task completed: explore");
    assert.equal(card.output, "All done");
    const advisor = buildToolCallout({
      name: "advisor",
      status: "completed",
      detail: {
        type: "plain_text",
        label: "Advisor · 1 note",
        text: "Check the lock",
        icon: "brain",
      },
    });
    assert.equal(advisor.icon, "Brain");
  });

  test("a worktree setup lists its commands", () => {
    const card = buildToolCallout({
      name: "worktree_setup",
      status: "failed",
      error: "npm ci failed",
      detail: {
        type: "worktree_setup",
        worktreePath: "/w",
        branchName: "feat",
        log: "…",
        commands: [
          { index: 0, command: "npm ci", cwd: "/w", log: "", status: "failed", exitCode: 1 },
        ],
      },
    });
    assert.equal(card.tool, "worktree");
    assert.equal(card.title, "Set up worktree feat");
    assert.equal(card.error, "npm ci failed");
    assert.deepEqual(card.worktree?.commands, [
      { command: "npm ci", status: "failed", exitCode: 1, durationMs: undefined },
    ]);
  });
});

describe("tool names", () => {
  test("bridged Paseo tools reach the Paseo card", () => {
    const card = buildToolCallout({
      name: "paseo / create_agent",
      status: "completed",
      detail: {
        type: "unknown",
        input: { title: "Reviewer", provider: "claude/opus", initialPrompt: "Review" },
        output: {
          content: [{ type: "text", text: "Created 0123abcd-0000-0000-0000-000000000000" }],
        },
      },
    });
    assert.equal(card.tool, "paseo");
    assert.equal(card.paseo?.createAgent?.provider, "claude");
    assert.equal(card.paseo?.createAgent?.model, "opus");
    assert.equal(card.paseo?.createAgent?.agentId, "0123abcd-0000-0000-0000-000000000000");
  });

  test("MCP names split into server and tool", () => {
    assert.deepEqual(splitToolName("linear / list_issues"), {
      server: "linear",
      tool: "list_issues",
    });
    assert.deepEqual(splitToolName("mcp__linear__list_issues"), {
      server: "linear",
      tool: "list_issues",
    });
    assert.deepEqual(splitToolName("mcp_linear__list_issues_0123456789ab"), {
      server: "linear",
      tool: "list_issues",
    });
    assert.deepEqual(splitToolName("read"), { tool: "read" });
    const card = buildToolCallout({
      name: "mcp__linear__list_issues",
      status: "completed",
      detail: {
        type: "unknown",
        input: { team: "ENG" },
        output: { content: [{ type: "text", text: "[]" }] },
      },
    });
    assert.equal(card.tool, "mcp");
    assert.equal(card.mcp?.result, "[]");
  });
});

describe("core details", () => {
  test("a git shell command uses the git card", () => {
    const card = buildToolCallout({
      name: "bash",
      status: "completed",
      detail: { type: "shell", command: "git status\n--short", output: "M a.ts", exitCode: 0 },
    });
    assert.equal(card.tool, "git");
    assert.equal(card.title, "$ git status");
    assert.equal(card.command, "git status\n--short");
  });

  test("an edit with old and new text draws a diff", () => {
    const card = buildToolCallout({
      name: "edit",
      status: "completed",
      detail: { type: "edit", filePath: "src/a.ts", oldString: "a\nb", newString: "c" },
    });
    assert.equal(card.diff, "-a\n-b\n+c");
    assert.equal(card.language, "typescript");
  });

  test("a read carries its line range", () => {
    const card = buildToolCallout({
      name: "read",
      status: "completed",
      detail: { type: "read", filePath: "/x/y.py", content: "x = 1", offset: 10, limit: 5 },
    });
    assert.equal(card.lineRange, "10-14");
    assert.equal(card.title, "Read y.py");
    assert.equal(lineRange(undefined, undefined), undefined);
    assert.equal(languageFromPath("/Users/John Doe/My Notes.md:12"), "markdown");
    assert.equal(languageFromPath("src/app.tsx:3-9"), "typescript");
  });

  test("statuses and errors", () => {
    assert.equal(buildToolCallout({ name: "x", status: "canceled" }).status, "canceled");
    assert.equal(buildToolCallout({ name: "x", status: "weird" }).status, "completed");
    assert.equal(errorText({ message: "boom", code: 1 }), "boom");
    assert.equal(errorText({ code: 1 }), '{"code":1}');
    assert.equal(errorText("  "), undefined);
  });

  test("the pre-0.11 ask record still draws options", () => {
    const card = buildToolCallout({
      name: "ask",
      status: "completed",
      detail: {
        type: "unknown",
        input: {
          questions: [
            { question: "Pick", options: [{ label: "A" }, { label: "B" }], recommended: 1 },
          ],
        },
        output: { details: { selectedOptions: ["B"] } },
      },
    });
    assert.equal(card.title, "Pick");
    assert.equal(card.askOptions?.[1]?.recommended, true);
    assert.deepEqual(card.askAnswer, ["B"]);
  });

  test("an unmapped tool with no output shows its input", () => {
    const card = buildToolCallout({
      name: "lsp",
      status: "completed",
      detail: { type: "unknown", input: { op: "hover" }, output: null },
    });
    assert.equal(card.tool, "note");
    assert.equal(card.language, "json");
    assert.equal(card.code, '{\n  "op": "hover"\n}');
  });

  test("hub keeps its typed record", () => {
    const card = buildToolCallout({
      name: "hub",
      status: "completed",
      detail: { type: "unknown", input: { op: "jobs" }, output: { details: { jobs: [] } } },
    });
    assert.equal(card.tool, "hub");
    assert.equal(card.hub?.kind, "jobs");
  });
});
