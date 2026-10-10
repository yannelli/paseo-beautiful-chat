import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Shows a path in the machine's own file manager.
 *
 * The client cannot reach the operating system, and Paseo exposes no file
 * navigation to plugins, so the daemon side does the work: it resolves the
 * path against the agent's working directory and asks the platform shell to
 * reveal it.
 */
export const revealPathRpc = defineRpc({
  // The host accepts lower-case, dotted RPC names only.
  name: "file.reveal",
  input: z.object({
    cwd: z.string(),
    path: z.string(),
  }),
  output: z.object({
    revealed: z.string().nullable(),
    error: z.string().nullable(),
  }),
});

// Strips a trailing `:line` or `:line-line` selector, such as `main.ts:55-85`.
// Nothing else: a path may hold spaces, and a Windows drive has its own colon.
export function stripSelector(path: string): string {
  return path.trim().replace(/:\d+(?:-\d+)?$/, "");
}
