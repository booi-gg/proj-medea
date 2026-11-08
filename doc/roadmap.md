# Redhot roadmap

The goal is a keyboard launcher for macOS that runs as a CLI.

## What is possible

| Feature                           | Possible?  | Needs                                                                                                            |
| --------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Global shortcut                   | Yes, built | Reportedly no permission, but some launchers ask for Accessibility for hotkeys, so confirm with a real key press |
| Search and open apps              | Yes, built | Nothing special                                                                                                  |
| Search files                      | Yes, built | Spotlight's index                                                                                                |
| Search folders                    | Yes, built | Spotlight's index                                                                                                |
| Kill a process or port            | Yes, built | Automation permission to quit apps politely, and `sudo` for anything owned by root                               |
| System commands                   | Yes, built | Automation permission for Finder and System Events. Lock Screen needs the menu bar helper                        |
| Search URLs                       | Yes        | Nothing special expected                                                                                         |
| Quicklinks                        | Yes, built | Nothing special                                                                                                  |
| Aliases and per-item settings     | Yes, built | Nothing special                                                                                                  |
| Hotkeys for apps and commands     | Yes, built | Nothing special                                                                                                  |
| Run your own scripts and commands | Yes        | Nothing special expected                                                                                         |
| Start at login                    | Yes, built | Nothing to grant. macOS shows a notice, and the item can be switched off in System Settings                      |
| Calculator                        | Yes, built | Nothing special                                                                                                  |
| Currency conversion               | Yes, built | Daily rates from Frankfurter; saved rates work offline                                                           |
| Clipboard history                 | Yes, built | The helper watches the clipboard. Pasting into the previous app would need Accessibility permission              |
| Switch windows, search menu items | Yes        | Accessibility permission                                                                                         |
| Move and resize windows           | Yes, built | Accessibility permission. `pnpm menubar:sign` keeps it across rebuilds                                           |
| Snippet expansion                 | Yes        | Accessibility permission                                                                                         |

The main limit is speed and feel. A floating-panel launcher appears instantly, while Redhot opens a terminal window each time.

## Steps

1. **Shortcut:** done. The helper listens for `Cmd+Shift+Space` and opens the CLI.
2. **Search launcher:** done. Type to find apps and built-in commands, then press Enter.
3. **Commands:** started. Redhot apps live in `src/redhot-apps/`, with Quicklinks and Clipboard History built. Loading scripts from a user folder is still to do.
4. **Terminal:** Redhot opens only in macOS's Terminal. Choosing other terminals was removed to keep the scope small. Each would need a tested recipe in `src/terminals/terminals.ts`.
5. **Background features:** done. Clipboard history records in the background, and Start at login in Settings brings the helper back after a reboot.
6. **Permission features:** window actions are built, and need testing by a person. Snippets are still to do. A rebuilt ad-hoc binary may lose granted permissions, so `pnpm menubar:sign` gives it a stable signature. A signed `.app` may still be needed if terminal-started and login-started helpers turn out to be treated differently.

## Later ideas

- **Clipboard history:** files, pinned entries, and choosing which apps to ignore.
- **Window actions:** pressing a hotkey again to cycle sizes, gaps between windows, and larger and smaller. Drag-to-snap needs a global mouse tap and an overlay, so it's a project of its own.
- **Alias plus search text:** typing an alias then a query, like `gh react`. Quicklinks now take input through a prompt after Enter, so this would fill their first argument straight from the search bar.

## Decisions

- **Stay in a terminal for now.** A floating panel would feel faster but needs much more native code. Revisit it if speed becomes a problem.
- **`Cmd+Shift+Space` for now.** To use `Cmd+Space` instead, free it from Spotlight or any other launcher, change `hotKeyModifiers` in `native/main.swift`, run `pnpm menubar:stop`, then `pnpm menubar:start`.

## Not tested yet

These need a person, because macOS blocks synthetic input from the development session:

- A physical click on the menu bar icon. The menu items and their actions were tested from inside the process.
- A physical `Cmd+Shift+Space` press. Registration succeeded with status `0`.
- Moving a real window. The geometry, socket and hotkey wiring were tested, but the Accessibility calls need a grant only a person can give.
- `pnpm menubar:sign`, and whether a grant survives a rebuild with it.

Also untested: raising a minimized window. In one early test run, a CLI window went away for an unknown reason. It did not happen again in later runs, including through the real launcher, so watch for it.
