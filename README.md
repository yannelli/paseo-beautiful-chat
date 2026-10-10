# Beautiful Chat

A Paseo plugin that redraws the agent chat stream: tool calls, reasoning, prompts, replies, and
checklists. It was built around Oh My Pi (OMP) and replaces the host rendering of timeline items with
typed, syntax-aware cards that follow the active Paseo theme. It reads the tool rows Paseo already
normalizes, so Claude Code, Codex, and other providers get the same cards.

![A prompt, a tool call, a finished background job, and the reply that closes the turn](images/hero.png)

Every screenshot here is a capture of the real component, rendered by the harness in `.showcase/`.
[One whole turn, top to bottom](images/thread.png) shows the cards in the order the timeline draws
them.

## Install

From the plugin registry:

```bash
paseo plugin add aborakati/beautiful-chat
```

Straight from GitHub (Paseo 0.11 reads a bare `owner/repo` as a registry slug):

```bash
paseo plugin add github:ABorakati/beautiful-chat
```

The manifest requires Paseo `>=0.11.0` on the daemon and in the app. Version 0.1 of this plugin
targets Paseo 0.8 to 0.10. Open **Settings → Plugins → Beautiful Chat**, or search the Command Center
for "Beautiful Chat", for the accent, font, glass, and prompt and reply options.

---

## Tool calls

### Shell and Git

Terminal frame, Bash syntax, exit code, duration, and the Git brand mark. A command that prints
nothing says so rather than showing an empty panel.

![Shell and Git tool calls](docs/images/tool-bash.png)

### Read

The file's own language logo, a wrapped path, line numbers, and a copy button. The path is a link:
pressing it shows the file in the machine's file manager.

![Read tool call](docs/images/tool-read.png)

### Images

A read of a `.png` carries no bytes through the timeline, so the host draws it as an empty code
block with a language badge. This card draws the file instead: a picture mark, the path as a link,
the pixel size and file size read from the header, and an eye control that hides the thumbnail. The
bytes come from the plugin's own daemon-side RPC (`file.image`), which is the only side that can
reach the file; PNG, JPEG, GIF, WebP, AVIF, BMP, ICO and SVG are recognised, and anything past
3 MB reports its size rather than inlining a data URI.

![Image read](docs/images/tool-image.png)

### Edit

Diff rendering where adjacent removed and added rows join into one rounded block, and only the
marker column carries the red or green.

![Edit tool call](docs/images/tool-edit.png)

### Reasoning tool

Live thinking text, a token badge, and numbered steps.

![Thinking tool call](docs/images/tool-thinking.png)

### MCP

Server badge, transport, input parameters, and the response payload, each syntax-highlighted.

![MCP tool call](docs/images/tool-mcp.png)

### Eval

One card per kernel cell: the source that ran, then the text it printed. Paseo 0.11 reports an OMP
`eval` call as a label and its printed text only, so on 0.11 the card shows the output without the
cell source.

![Eval tool call](docs/images/tool-eval.png)

### Ask

Option cards with the recommended badge, the chosen answer marked, and a typed reply labelled as
typed rather than shown as a selection. Paseo 0.11 reports an OMP `ask` as question and answer text,
so the card lists each question with the answer given; a call still waiting says so.

![Ask tool call](docs/images/tool-ask.png)

### Task

The delegated brief and the agent type. While the subagent runs, the card lists its latest steps;
when it finishes, its report sits under the steps, clamped until expanded.

![Task tool call](docs/images/tool-task.png)

### Search and fetch

Grep, glob, file listings, and web searches share one card: the query, the match and file counts,
the files found, and each web result as a link. A URL read or web fetch shows the address as a
link, the HTTP status, the size, and the text that came back. Links open in the system browser.

### Worktree setup, plans, and everything else

A worktree setup lists each command with its status, exit code, and duration. A plan renders as
markdown. A tool with no typed card, including OMP's status lines and device calls, shows its label
and text; a call that printed nothing shows the request it was given. A failed call shows the
host's error message at the top of its card, and a canceled call says so.

### Hub

Every `hub` op is mapped: `start`, `stop`, `restart`, `ps`, `logs`, and `describe` render the
process card with its launch line, readiness, and recent output; `send`, `wait`, `inbox`, and
`list` render the message card; `jobs` and `cancel` render the job snapshot. The cards report;
they carry no buttons, because a plugin cannot restart or cancel anything.

![Hub tool calls](docs/images/hub.png)

### Paseo tools

Paseo's own mark leads the card, and the created agent's provider carries its brand mark.

![Paseo tool call](docs/images/paseo.png)

---

## Stream components

### Reasoning trace

A collapsible trace with a connected step rail, per-step duration, and a token total.

![Reasoning trace](docs/images/reasoning.png)

### Checklist

Phase name, per-task status, durations, and a blocked task with its reason.

![Checklist](docs/images/tasks.png)

### Prompt bubble

The authored turn on a raised theme surface with a square tail, a copy button, and the turn's token
usage.

![Prompt bubble](docs/images/user.png)

### Syntax block

Shared by every card that shows code: language detection from the path, line numbers, diff tints,
Devicon brand marks, and the file-manager link.

![Syntax block](docs/images/syntax.png)

---

## Settings

![Settings screen](docs/images/settings.png)

Settings are a host-scoped document, so every client connected to a host, phones included, shares
them and keeps them across restarts. The first load in a browser that used version 0.1 uploads the
choices that browser saved locally.

| Setting                | Effect                                                                      |
| ---------------------- | --------------------------------------------------------------------------- |
| Accent colour          | Follow the Paseo theme, or pick Jade, Violet, Amber, or Rose.               |
| Interface font         | Embedded Inter, or the system face. Phones always use the system face.      |
| Code glyphs            | Iosevka with ligatures, or literal glyphs. Phones use the system monospace. |
| Frosted glass          | Blur card surfaces, or paint them solid.                                    |
| Pointer glow           | A light that follows the pointer across cards. Desktop and web only.        |
| Enhanced prompt bubble | Off hands prompts back to Paseo, whose bubble shows pasted images.          |
| Assistant markdown     | Off hands replies back to Paseo's own markdown renderer.                    |
| Reply style            | Document, Compact, or Terminal spacing for plugin-drawn replies.            |
| Selection actions      | Copy and Add to chat on highlighted card text. Desktop and web only.        |

---

## Finding text

Paseo's own chat find (Ctrl/Cmd+F) cannot reach a prompt or reply this plugin draws (see
[limitation 14](#plugin-sdk-limitations-found-while-building-this)). The plugin therefore takes
Ctrl+F (Cmd+F on macOS) on desktop and web when the focus is inside a chat, and opens its own find
bar over that chat. Focus in a terminal, file pane, or other input keeps the key for that pane. Pressing it again
while the bar has focus closes the bar and lets Paseo's own find open. The bar searches
everything the chat has rendered, including tool cards. Enter moves to the next match, Shift+Enter
to the previous one, and Escape closes the bar.

The bar searches only messages the chat has loaded. Scroll up first to include older history.

To keep Paseo's native search, which also searches unloaded history, turn off **Assistant
markdown** and **Enhanced prompt bubble** in **Settings -> Plugins -> Beautiful Chat**. Paseo then
draws replies and prompts itself, and Ctrl/Cmd+F opens Paseo's find instead of the plugin's bar.
New messages follow the change.
Tool, reasoning, and checklist cards keep the plugin's styling, so Paseo's find still cannot reveal a
match inside one of them.

## Opening files

A file name in a read, write, edit, or code block is a link. Pressing it calls the plugin's own
daemon-side RPC (`file.reveal`), which resolves the path against the agent's working directory and
asks the platform shell to show it:

| Platform | Behaviour                                              |
| -------- | ------------------------------------------------------ |
| Windows  | `explorer.exe /select,"<file>"` selects the file.      |
| macOS    | `open -R <file>` selects the file in Finder.           |
| Other    | `xdg-open <directory>` opens the containing directory. |

A directory path opens that directory. A path the daemon cannot stat, or a shell that fails to
start, rejects the call and nothing opens.

## Unmapped output

A tool the plugin has no typed card for still shows its output in the terminal frame. A call that
printed nothing shows the request it was given, or says it returned nothing. No card renders an
empty panel.

The link cannot open Paseo's own file editor: see the first limitation below.

---

## Plugin SDK limitations found while building this

First measured against `@getpaseo/plugin` 0.8.0 and the Paseo 0.8.0 desktop build, and rechecked
against `@getpaseo/plugin` 0.11.2 and the Paseo 0.11.2 source. Each entry names the evidence and the
workaround this plugin uses.

1. **No file navigation.** Timeline renderer props are exactly `{agentId, theme, host, layout,
timestamp, item}`, with no `navigation`. Surfaces get `openAgent`, `openWorkspace`, and, on
   Electron only, `openBrowser`, plus `openScreen`, `openSettings`, and `openPanel` for the plugin's
   own contributions. The host's own file tab
   target (`{kind:"file", path}`, reachable in-app through `?open=file:<path>`) is not exposed, and
   the `paseo://` scheme only carries agent deep links. Workaround: a daemon-side RPC that reveals
   the path in the operating system's file manager.
2. **Transformers see a stripped item.** The app maps its stream item to the plugin item before any
   transformer runs, and a user message keeps only `text`, `messageId`, and `clientMessageId`. Pasted
   images never reach plugin code, and the daemon timeline row stores the same item, so a server RPC
   cannot recover them either. Workaround: the **Enhanced prompt bubble** setting returns prompts to
   the host.
3. **Interception is all or nothing.** A transformer replaces the host item completely. There is no
   way to decorate an item or keep host affordances that the plugin does not reimplement. Returning
   `undefined` is the only opt-out.
4. **Transform results are cached per item.** Changing a preference does not re-run transformers for
   items already on screen. New items follow the change; existing ones need a reload.
5. **Renderers get no workspace.** Props carry `agentId` only, so `cwd` and `workspaceId` need a
   second lookup through `useAgent`.
6. **Token usage is live-only.** Usage is not persisted on timeline items, so a turn this client did
   not observe live shows no figures.
7. **RPC names are validated late.** The host requires `^[a-z][a-z0-9._-]*$`. A camelCase name such
   as `revealPath` typechecks, then fails the whole plugin at install or reload with
   `Invalid plugin RPC method`.
8. **The React Native runtime module is a stub in the package.** `@getpaseo/plugin/client/react-native`
   ships as `export {}`; the host injects the implementations. Bundling or testing plugin UI outside
   Paseo needs a shim, which is what `.showcase/shims` provides.
9. **The theme carries eleven colours.** `PluginTheme` exposes `surface0` to `surface2`,
   `border`, `foreground`, `foregroundMuted`, `accent`, `accentForeground`, and three status
   colours. Every other surface, including code backgrounds and diff tints, must be derived with
   alpha; that is what `client/components/theme-tokens.ts` exists for.
10. **No CSS escape hatch.** React Native styles drop unknown keys, so `backdrop-filter` is
    impossible through the style API. Frosted glass is a hand-injected `<style>` rule matched by a
    data attribute.
11. **No font registration.** Faces are embedded as data URIs in an injected `@font-face` rule, and
    every surface needs a wrapper that escapes the host's own font cascade.
12. **A closed module allowlist, and no SVG renderer.** Plugin client code may import only
    `react`, `react/jsx-runtime`, `react-native`, `@tanstack/react-query`, `zod`,
    `@getpaseo/plugin`, `@getpaseo/plugin/client`, `@getpaseo/plugin/client/react-native`, and
    `@getpaseo/plugin/client/ui`. Anything else throws
    `Module "x" is not available in plugin client code` when the bundle loads, so
    `react-native-svg` and `lucide-react-native` are out of reach. Lucide icons still work,
    because the host renders them: `Icon` from `@getpaseo/plugin/client/react-native` takes any
    Lucide name. Brand marks are not in Lucide, and React Native's `<Image>` decodes PNG, JPEG,
    GIF, and WebP but never SVG, so a data-URI SVG renders on web and stays blank on iOS and
    Android. Those marks ship as PNG rasters in `client/components/mark-bitmaps.ts`.
13. **Settings are host-scoped only.** `defineSettings` rejects any scope other than `host`, so
    per-device, per-workspace, or per-agent presentation settings are impossible. Version 0.1 kept
    preferences in browser storage, which iOS and Android lack, so phones forgot every change.
    Version 0.2 stores them as a host settings document and caches them in memory, because
    transformers run outside React and must read them synchronously.
14. **Paseo's chat find cannot reach replaced rows.** Paseo 0.9.1 finds a match by its original
    message id, then waits for a row carrying that id. A transformed row always carries
    `<pluginId>/<itemId>` instead, so Ctrl+F on a styled prompt or reply never reveals the match.
    Workaround: the plugin's own find bar, described in [Finding text](#finding-text).
15. **`notification` rows cannot be transformed.** Paseo 0.11.2 accepts transformers for
    `user_message`, `assistant_message`, `reasoning`, `tool_call`, `todo`, `error`, and
    `compaction` only, and registering any other type throws. Workaround: the finished-job notice
    keeps the host row and gets the plugin's chrome from an injected style rule.
16. **Paseo 0.11 narrows what OMP rows carry.** The 0.11 OMP mapper turns `ask`, `eval`, `github`,
    `wait`, `think`, and device calls into `plain_text` rows with a label and text, web searches and
    globs into `search` rows, and URL reads into `fetch` rows. The raw arguments no longer reach a
    plugin, so the ask options and the eval source cannot be drawn. Bridged MCP tools are named
    `server / tool`, which the plugin splits to find Paseo's own tools.

---

## Project structure

```text
beautiful-chat/
  paseo-plugin.json          # Manifest: id, display name, supported Paseo range, build step
  OVERVIEW.md                # Registry listing text
  index.client.tsx           # Timeline transformers, renderers, settings screen, Command Center item
  index.server.ts            # Settings registration and daemon-side RPCs
  server/
    highlight.ts             # highlight.lines: shiki tokenizing, capped so a huge block cannot stall
    image-file.ts            # file.image: reads an image the agent read, checked by its magic bytes
    image-header.ts          # Image type sniffing and pixel sizes
    reveal.ts                # file.reveal: shows a path in the system file manager
  shared/
    contracts.ts             # Card data contracts
    presentation-settings.ts # Host-scoped settings document
    file-rpc.ts              # file.reveal contract
    image-rpc.ts             # file.image contract
    highlight-rpc.ts         # highlight.lines contract
  client/
    tool-mapping.ts          # Host tool_call item to card record, by detail shape then name
    tool-extract.ts          # Field readers shared by the mapping
    todo-mapping.ts          # Host todo items to checklist rows
    live-renderers.tsx       # Timeline renderers
    settings-page.tsx        # Settings screen built from the SDK settings components
    preferences.ts           # In-memory cache of the host settings for transformers
    components/              # Cards, syntax block, glyphs, motion, theme tokens
      mark-bitmaps.ts        # GENERATED PNG rasters of every brand mark
      devicon-data.ts        # Vendor SVG sources, read only by the generator
      lobe-marks.ts          # Vendor SVG sources, read only by the generator
  test/                      # node:test suites for the pure modules
  .showcase/                 # Offline harness used to capture the screenshots
  docs/images/               # Screenshots in this README
```

## Development

```bash
npm install
npm run typecheck
npm test
paseo plugin reload beautiful-chat
```

`npm test` runs Node's built-in test runner with type stripping, so it needs Node 22.18 or later and
no extra packages. Only modules that do not import React Native at runtime are testable this way,
which is why the mapping and parsing logic lives in plain `.ts` modules.

Rebuild the screenshots after a visual change:

```bash
esbuild .showcase/showcase.tsx --bundle --outfile=.showcase/showcase.js --jsx=automatic \
  --alias:react-native=react-native-web \
  --alias:@getpaseo/plugin/client/react-native=./.showcase/shims/plugin-react-native.tsx \
  --alias:@getpaseo/plugin/client/ui=./.showcase/shims/plugin-ui.tsx \
  --alias:@getpaseo/plugin/client=./.showcase/shims/plugin-client.tsx
```

Then serve `.showcase/` and capture each `#shot-*` element.

## License

MIT
