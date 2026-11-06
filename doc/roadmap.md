# Medea roadmap

The goal is a Raycast-style launcher for macOS that runs as a CLI.

## What is possible

| Feature                           | Possible?  | Needs                                                                                                            |
| --------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Global shortcut                   | Yes, built | Reportedly no permission, but Raycast's manual lists Accessibility for hotkeys, so confirm with a real key press |
| Search and open apps              | Yes, built | Nothing special                                                                                                  |
| Search files and URLs             | Yes        | Nothing special expected                                                                                         |
| Quicklinks                        | Yes, built | Nothing special                                                                                                  |
| Aliases and per-item settings     | Yes, built | Nothing special                                                                                                  |
| Hotkeys for apps and commands     | Yes, built | Nothing special                                                                                                  |
| Run your own scripts and commands | Yes        | Nothing special expected                                                                                         |
| Clipboard history                 | Yes        | The helper must keep watching the clipboard                                                                      |
| Switch windows, search menu items | Yes        | Accessibility permission                                                                                         |
| Move and resize windows           | Yes        | Accessibility permission                                                                                         |
| Snippet expansion                 | Yes        | Accessibility permission                                                                                         |

The main limit is speed and feel. Raycast appears instantly as a floating panel, while Medea opens a terminal window each time.

## Steps

1. **Shortcut:** done. The helper listens for `Cmd+Shift+Space` and opens the CLI.
2. **Search launcher:** done. Type to find apps and built-in commands, then press Enter.
3. **Commands:** started. Medea apps live in `src/medea-apps/`, and Quicklinks is the first. Loading scripts from a user folder is still to do.
4. **Terminal choice:** done for Terminal and Ghostty, from the menu bar. Other terminals need a tested recipe in `src/terminals/terminals.ts`.
5. **Background features:** clipboard history, plus start at login so the shortcut survives a reboot.
6. **Permission features:** window management and snippets, packaged as a signed `.app`. A rebuilt bare binary may lose granted permissions, so a stable app identity will matter here.

## Later ideas

- **Alias plus search text:** typing an alias then a query, like `gh react`. Quicklinks now take input through a prompt after Enter, so this would fill their first argument straight from the search bar.

## Decisions

- **Stay in a terminal for now.** A floating panel would feel closer to Raycast but needs much more native code. Revisit it if speed becomes a problem.
- **`Cmd+Shift+Space` for now.** Raycast currently uses `Cmd+Space`. To switch, quit Raycast, change `hotKeyModifiers` in `native/StatusItem.swift`, run `pnpm menubar:stop`, then `pnpm menubar:start`.

## Not tested yet

These need a person, because macOS blocks synthetic input from the development session:

- A physical click on the menu bar icon. The menu items and their actions were tested from inside the process.
- A physical `Cmd+Shift+Space` press. Registration succeeded with status `0`.
- The Automation prompt from the real helper. Ghostty was tested from the development session, which has its own permission.

Also untested: raising a minimized window. In one early test run, a CLI window went away for an unknown reason. It did not happen again in later runs, including through the real launcher, so watch for it.
