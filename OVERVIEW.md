Beautiful Chat redraws the agent chat with themed cards for tool calls, reasoning, checklists, prompts, replies, and errors. Each tool gets its own card. A shell command shows in a terminal frame with its exit code, a file read gets syntax highlighting with line numbers and the file's language mark, and an edit shows as a diff. Searches and web fetches list their results. Subagent runs show their recent steps and their final report, while MCP calls show the input next to the response.

It was built around Oh My Pi (OMP), including its `hub`, `eval`, `ask`, and `github` tools. Because it reads the tool rows Paseo already normalizes, Claude Code, Codex, and other providers get the same cards.

## Setup

You need Paseo 0.11.0 or later on the daemon and in the app. Open **Settings > Plugins > Beautiful Chat**, or search the Command Center for "Beautiful Chat", to change the accent colour, the fonts, frosted glass, and the reply style. There you also choose whether the plugin draws prompts and replies or leaves them to Paseo. Settings live on the host. Every client connected to that host shares them.

## What runs where

- Syntax highlighting runs on the daemon.
- When an agent reads an image file, the daemon reads that file (up to 3 MB) for the card's thumbnail. It returns only files whose contents are an image.
- Pressing a file name asks the daemon to show the file in the system file manager.
- Links open in the system browser, and only when you press them.
- Nothing leaves the machine that runs Paseo.

## Known limits

- Paseo removes pasted images from a prompt before plugins see it. Turn off **Enhanced prompt bubble** to see them in Paseo's own bubble.
- Paseo's chat find cannot reach rows this plugin draws. On desktop and web, Ctrl+F (Cmd+F on macOS) inside a chat opens the plugin's own find bar, which searches the messages already loaded. With **Enhanced prompt bubble** and **Assistant markdown** off, Paseo's find covers prompts and replies again.
- A settings change applies to new messages. Reopen the chat to restyle older ones.
- Token usage on a prompt appears only for turns the client watched live.
- Since Paseo 0.11, OMP reports `ask`, `eval`, and `github` calls as a label and text. The cards show the question and answer, the printed output, and the GitHub reply, but not the options offered or the code that ran.
