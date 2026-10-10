import { stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { spawnProcess } from "@getpaseo/plugin/server";
import { revealPathRpc, stripSelector } from "../shared/file-rpc";

type RevealInput = RpcInput<typeof revealPathRpc>;
type RevealOutput = RpcOutput<typeof revealPathRpc>;

export interface RevealCommand {
  command: string;
  args: string[];
  /** Explorer parses its own command line, so its arguments must reach it untouched. */
  verbatim: boolean;
}

// Explorer and Finder select the file itself. Every other platform opens the
// containing directory, because `xdg-open` on a file launches its editor.
// Explorer reads `/select,` up to the next comma unless the path is quoted.
export function revealCommand(
  target: string,
  isDirectory: boolean,
  platform: NodeJS.Platform,
): RevealCommand {
  if (platform === "win32") {
    const args = isDirectory ? [`"${target}"`] : [`/select,"${target}"`];
    return { command: "explorer.exe", args, verbatim: true };
  }
  if (platform === "darwin") {
    return { command: "open", args: isDirectory ? [target] : ["-R", target], verbatim: false };
  }
  return { command: "xdg-open", args: [isDirectory ? target : dirname(target)], verbatim: false };
}

// Resolves once the child has started, and rejects when it could not start.
// The exit code is never read: Explorer exits non-zero even when it opened.
export function launchDetached({ command, args, verbatim }: RevealCommand): Promise<void> {
  return new Promise((resolveLaunch, rejectLaunch) => {
    // A synchronous throw here rejects the promise too.
    const child = spawnProcess(command, args, {
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: verbatim,
    });
    child.once("spawn", () => {
      child.unref();
      resolveLaunch();
    });
    child.once("error", (error) => rejectLaunch(error));
  });
}

// A path the daemon cannot stat answers with an error. A shell that fails to
// start throws, so the RPC rejects instead of reporting a reveal that never ran.
export async function revealPath(input: RevealInput): Promise<RevealOutput> {
  const requested = stripSelector(input.path);
  if (!requested) return { revealed: null, error: "No path" };
  if (!isAbsolute(requested) && !isAbsolute(input.cwd)) {
    return { revealed: null, error: "No working directory to resolve the path against" };
  }

  const target = isAbsolute(requested) ? requested : resolve(input.cwd, requested);
  let isDirectory: boolean;
  try {
    isDirectory = (await stat(target)).isDirectory();
  } catch (error) {
    return { revealed: null, error: error instanceof Error ? error.message : String(error) };
  }

  await launchDetached(revealCommand(target, isDirectory, process.platform));
  return { revealed: target, error: null };
}
