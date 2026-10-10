import type { PluginServerContext } from "@getpaseo/plugin/server";
import { highlightCode } from "./server/highlight";
import { readImageFile } from "./server/image-file";
import { revealPath } from "./server/reveal";
import { revealPathRpc } from "./shared/file-rpc";
import { highlightRpc } from "./shared/highlight-rpc";
import { imageRpc } from "./shared/image-rpc";
import { presentationSettings } from "./shared/presentation-settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(presentationSettings);
  server.handle(revealPathRpc, (input) => revealPath(input));
  server.handle(imageRpc, (input) => readImageFile(input));
  server.handle(highlightRpc, (input) => highlightCode(input));

  // The highlighter and its cache sit at module scope, shared by every
  // contribution, so a single teardown must not dispose them.
  return () => {};
}
