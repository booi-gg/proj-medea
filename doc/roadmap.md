# Supercast roadmap

The goal is a Raycast-style launcher for macOS that runs as a CLI.

## What is possible

| Feature                           | Possible?  | Needs                                                                                                            |
| --------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Global shortcut                   | Yes, built | Reportedly no permission, but Raycast's manual lists Accessibility for hotkeys, so confirm with a real key press |
| Search and open apps              | Yes, built | Nothing special                                                                                                  |
| Search files and URLs             | Yes        | Nothing special expected                                                                                         |
| Run your own scripts and commands | Yes        | Nothing special expected                                                                                         |
| Clipboard history                 | Yes        | The helper must keep watching the clipboard                                                                      |
| Switch windows, search menu items | Yes        | Accessibility permission                                                                                         |
| Move and resize windows           | Yes        | Accessibility permission                                                                                         |
| Snippet expansion                 | Yes        | Accessibility permission                                                                                         |

The main limit is speed and feel. Raycast appears instantly as a floating panel, while Supercast opens a terminal window each time.

## Steps

1. **Shortcut:** done. The helper listens for `Cmd+Shift+Space` and opens the CLI.
2. **Search launcher:** done. Type to find apps and built-in commands, then press Enter.
3. **Commands:** each command is a small TypeScript file or script in a folder, so adding one doesn't change the core.
4. **Terminal choice and speed:** let the user pick a terminal, such as Ghostty, and reuse one window instead of opening a new one on every press.
5. **Background features:** clipboard history, plus start at login so the shortcut survives a reboot.
6. **Permission features:** window management and snippets, packaged as a signed `.app`. A rebuilt bare binary may lose granted permissions, so a stable app identity will matter here.

## Decisions

- **Stay in a terminal for now.** A floating panel would feel closer to Raycast but needs much more native code. Revisit it if speed becomes a problem.
- **`Cmd+Shift+Space` for now.** Raycast currently uses `Cmd+Space`. To switch, quit Raycast, change `hotKeyModifiers` in `native/StatusItem.swift`, run `pnpm menubar:stop`, then `pnpm menubar:start`.

## Notes for the terminal chooser

- The terminal is chosen in one place: `openCliInTerminal()` in `native/StatusItem.swift`.
- Ghostty 1.4.0 is installed and registers for `public.unix-executable`.
- Try `open -a Ghostty <launcher>` first. Launching with `-e` [reportedly shows a confirmation dialog](https://github.com/ghostty-org/ghostty/discussions/10203). Neither route has been tested yet.

## Not tested yet

These need a person, because macOS blocks synthetic input from the development session:

- A physical click on the menu bar icon. The button's action was tested from inside the process.
- A physical `Cmd+Shift+Space` press. Registration succeeded with status `0`.
- The right-click Quit menu.
