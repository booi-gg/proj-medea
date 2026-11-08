# Script commands

**Effort:** medium · **Roadmap:** "loading scripts from a user folder"

## What

Redhot lists every script in a folder, like `~/.config/redhot/scripts/`, as a search result. Enter runs it.

## Why

Raycast's script commands are plain shell, Python or Node scripts with comment headers. If Redhot reads the same headers, people can reuse hundreds of community scripts from [raycast/script-commands](https://github.com/raycast/script-commands) on day one. Every script added is a feature added without changing Redhot.

## How

- Read the `@raycast.*` headers: `title`, `mode`, `icon`, `packageName`, `argument1` to `argument3`, `needsConfirmation`. Also accept `@redhot.*` with the same names.
- Modes: `silent` runs and shows nothing, `compact` shows the last line of output, `fullOutput` shows all output in the search window, `inline` refreshes on an interval (can come later).
- Arguments: prompt for them in the search window, like Quicklinks' placeholders.
- Scripts can take aliases and hotkeys like any other item.
- Run with the script's own shebang. Never log arguments or output (see the logging rules in CONTRIBUTING).

## Open questions

- Where the folder lives, and whether it syncs through iCloud with the rest.
- How to show long-running scripts, with a spinner and a way to cancel.
