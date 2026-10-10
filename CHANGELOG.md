# Changelog

## 0.2.0

Targets Paseo 0.11. Use 0.1 on Paseo 0.8 to 0.10.

### Paseo 0.11 support

- Reads the tool rows Paseo 0.11 produces. OMP `ask`, `eval`, `github`, `wait`, `think`, advisor notes, and device calls arrive as label and text, and they no longer render as empty cards.
- Adds cards for searches (grep, glob, file listings, web search), URL fetches, worktree setup, and plans.
- Task cards read the host's subagent record: the brief, the latest steps, and the final report.
- Finds Paseo's own tools and MCP servers under the bridged `server / tool` names that Paseo 0.11 uses.
- Shows a failed call's error message, and marks canceled calls as canceled instead of completed.
- Reads blocked and abandoned todo items in the 0.11 format, and shows Claude Code's `activeForm` for the running task.
- Restyles compaction rows.
- Adds a display name, a description, and screenshots to the manifest, and adds `OVERVIEW.md` for the plugin registry.
- The build step installs runtime dependencies only (`npm ci --omit=dev`).

### Settings

- Settings are stored on the host through the settings API, so they persist on iOS and Android and every client of a host shares them. The first load in a browser that used 0.1 uploads its saved choices.
- The settings screen uses Paseo's own settings components, and a Command Center item opens it.

### Fixes

- Links open through the SDK's external opener, which on desktop is the system browser.
- Copy buttons use the SDK clipboard, which also works on iOS and Android, and they report a failed copy.
- A fixed size and work cap on daemon-side highlighting keeps a huge code block from stalling the daemon.
- Image previews check the file's magic bytes, keep paths that contain spaces, read sizes from large JPEG headers and from every WebP format, and are cached.
- Windows reveal quotes the path, and a file manager that fails to start rejects the call.
- Markdown parsing is linear on pathological input. It keeps code fences inside list items and keeps balanced parentheses in bare URLs.
- A message that starts with `<constructor>` no longer crashes the system card.
- The reply footer and the background job card track the newest item per agent, so a chat in another pane no longer hides them.
- Only the newest prompt reads token usage, at most every three seconds.
- Cards follow their status until you toggle them, and finished cards stop animating.
- The checklist follows updates and no longer changes task status when tapped.
- Durations no longer print as `1m 60s`, and ages keep advancing on screen.
- Estimated reasoning token counts are marked as estimates. Placeholder text no longer appears as content.
- Ctrl+F (Cmd+F on macOS) opens the plugin's find bar only when focus is inside a chat, so terminals and file panes keep the key. A second press hands over to Paseo's find. The bar closes when its chat is hidden and follows pane resizes.
- Fonts, glass, glow, shimmer, the notice style, and the find bar are reference-counted, so a plugin on two hosts, or a reload, no longer strips them from the other.
- Phones use Menlo or the system monospace for code, so diff and terminal columns line up.
- Theme colours the plugin cannot parse fall back to the host's colours. On light themes the accent presets are darkened to reach 4.5:1 contrast.
- The notice restyle matches only notice rows. Animations honour the reduced-motion setting.
- Add to chat picks the visible composer, and a failed copy says so.
- Adds accessibility roles and states to the expandable headers and toggles.
- Removes the approval card, which the plugin never drew in a chat.
