import type { TaskItemData, TaskListData } from "../shared/contracts";

// Paseo 0.11 folds an OMP blocker into the text as "<task> (blocked: <reason>)" or "<task> (blocked)".
const BLOCKED_SUFFIX = /\s*\(blocked(?::\s*([\s\S]*?))?\)\s*$/i;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** The host's `todo` items as the checklist draws them. */
export function buildTaskList(items: ReadonlyArray<Record<string, unknown>>): TaskListData {
  const tasks = items.map((item, index): TaskItemData => {
    const text = asString(item.text) ?? "Untitled task";
    const id = asString(item.id) ?? `todo-${index}`;
    if (item.completed === true || item.status === "completed") {
      return { id, title: text, phase: "", status: "completed" };
    }
    const blocked = text.match(BLOCKED_SUFFIX);
    if (blocked) {
      const reason = asString(blocked[1]);
      return {
        id,
        title: text.slice(0, blocked.index).trim() || text,
        phase: "",
        status: "blocked",
        ...(reason ? { blockerReason: reason.trim() } : {}),
      };
    }
    if (item.status === "in_progress") {
      // Claude Code's `activeForm` names the step as it runs ("Running tests").
      return { id, title: asString(item.activeForm) ?? text, phase: "", status: "in_progress" };
    }
    return { id, title: text, phase: "", status: "pending" };
  });
  return { id: "live-todo", phaseName: "Tasks", tasks };
}
