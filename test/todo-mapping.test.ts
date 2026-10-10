import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTaskList } from "../client/todo-mapping";

test("maps statuses, blockers, and the active form", () => {
  const list = buildTaskList([
    { text: "Write tests", completed: true, status: "completed" },
    { text: "Run tests", completed: false, status: "in_progress", activeForm: "Running tests" },
    { text: "Deploy (blocked: waiting on CI)", completed: false, status: "pending" },
    { text: "Tag release (blocked)", completed: false, status: "pending" },
    { text: "Announce", completed: false, id: "a1" },
    { text: "", completed: false },
  ]);
  assert.deepEqual(
    list.tasks.map((task) => [task.id, task.title, task.status, task.blockerReason]),
    [
      ["todo-0", "Write tests", "completed", undefined],
      ["todo-1", "Running tests", "in_progress", undefined],
      ["todo-2", "Deploy", "blocked", "waiting on CI"],
      ["todo-3", "Tag release", "blocked", undefined],
      ["a1", "Announce", "pending", undefined],
      ["todo-5", "Untitled task", "pending", undefined],
    ],
  );
});
