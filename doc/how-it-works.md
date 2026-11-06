# How Supercast works

Supercast is a command-line launcher for macOS. It is made of two programs:

- **The CLI** (TypeScript and clack) shows the search prompt, and stays open until you exit it.
- **The helper** (a small Swift program) stays running. It owns the menu bar icon and the global shortcut.

TypeScript can't call macOS AppKit directly, so anything that must stay alive in the background lives in the helper.

```text
pnpm menubar:start
   └─ the CLI builds and starts the helper, then the CLI exits

supercast-status (keeps running)
   └─ owns the icon and the shortcut, waits for input

Open Supercast in the menu, or Cmd+Shift+Space
   └─ node src/index.ts show
        ├─ CLI already open: raise that window
        └─ no CLI open: start open-supercast.command in the chosen terminal
             └─ node src/index.ts
                  └─ search prompt
                       └─ Enter opens the app, then search returns
```

## Files

Code is grouped by feature, and tests sit next to the file they cover.

```text
src/
├── index.ts              Routes commands. Nothing else.
├── paths.ts              Every project path, in one place
├── shell.ts              Shared command runner and shell quoting
├── launcher/
│   ├── launcher.ts       The search loop and its list of items
│   ├── prompt.ts         Draws the search bar and results
│   ├── banner.ts         The SUPERCAST logo
│   ├── search.ts         Ranks results with match-sorter
│   └── apps.ts           Finds installed apps and opens them
├── menubar/
│   ├── helper.ts         Builds, starts and stops the Swift helper
│   └── commands.ts       The start, stop and status commands
└── terminals/
    ├── terminals.ts      Lists terminals, saves the choice, launches each one
    ├── running-cli.ts    Talks to a running CLI over its socket
    └── actions.ts        Shows the CLI and changes the terminal
native/
└── StatusItem.swift      The helper: menu bar icon, menu and global shortcut
doc/                      These docs
.build/                   Generated: helper binary, launcher script, logs, socket
```

## Commands

```sh
pnpm start            # open the search prompt
pnpm menubar:start    # start the helper
pnpm menubar:stop     # stop the helper
pnpm menubar:status   # check whether it is running
pnpm test             # run unit tests
pnpm typecheck
pnpm check            # format and lint
```

## Starting the helper

`pnpm menubar:start` calls `startMenuBar()` in `src/menubar/helper.ts`:

1. `pgrep` looks for a running helper. If there is one, nothing else happens, so you never get two icons.
2. `swiftc` compiles `native/StatusItem.swift` to `.build/supercast-status`. This is skipped if the binary is newer than the source.
3. It writes `.build/open-supercast.command`, a script that goes to the project folder and runs `node src/index.ts`.
4. It starts the helper with `detached: true`, then `unref()`, so the CLI can exit while the helper keeps running. Helper output goes to `.build/helper.log`.

If the helper is already running, `start` does nothing, even if the Swift file changed. After editing Swift, run `pnpm menubar:stop` first.

## Inside the helper

1. `setActivationPolicy(.accessory)` hides it from the Dock.
2. `NSStatusBar.system.statusItem(...)` asks macOS for a menu bar slot. On macOS 26, Control Centre hosts the actual window, so window lists show Control Centre as the owner, not the helper.
3. `GlobalHotKey` registers `Cmd+Shift+Space` with Carbon's `RegisterEventHotKey`. The result is written to `helper.log`, where status `0` means success.
4. `app.run()` starts the event loop. The helper must stay alive: if it exits, the icon and shortcut go with it.

No `.app` bundle or `Info.plist` is needed. The helper runs as a bare, ad-hoc signed binary.

## The menu

Left or right clicking the icon opens a menu. The helper holds no logic of its own: each item runs the CLI.

| Item           | What it runs                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Open Supercast | `node src/index.ts show`                                                                                   |
| Set Terminal   | `node src/index.ts terminals` fills the list, and picking one runs `node src/index.ts set-terminal <name>` |
| Exit           | Quits the helper, which removes the icon and the shortcut                                                  |

## Choosing a terminal

`src/terminals/terminals.ts` lists the terminals Supercast knows how to launch, filtered to the ones installed. The choice is saved in `~/.config/supercast/config.json`. Missing or broken config falls back to Terminal.

Changing the terminal tells the running CLI to quit, because it lives in the old terminal. The next open uses the new one.

Each terminal has its own recipe in `launchers`, because they start programs differently:

| Terminal | Open                                                                                                       | Bring back                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Terminal | `open -a Terminal <launcher>`, with no permission needed                                                   | The CLI raises its own window with an escape sequence, then `open -a Terminal` |
| Ghostty  | AppleScript `new window` with `initial input` of `exec <launcher>`, which needs Automation permission once | AppleScript `focus` on the terminal whose `tty` matches the CLI                |

If AppleScript is refused, Ghostty falls back to `open -a Ghostty <launcher>`, which appears to ask for confirmation on each launch, and to plain activation for bringing it back. Because the fallback is silent, a broken script can look like a working one. In AppleScript, read `argv` into a variable before the `tell` block: Ghostty can't evaluate it in a `whose` clause.

Ghostty uses `initial input` and not `command` because it keeps a window open after a `command` exits, even with `wait after command` set to false. With `exec`, the CLI replaces the shell, so the window closes when the CLI exits. A new Ghostty session takes about 1.5 seconds, because the shell starts first.

To add a terminal, add a recipe to `launchers` and test both open and bring back.

## Showing the CLI

The menu and the shortcut both run `node src/index.ts show`. `showCli()` in `src/terminals/actions.ts` then:

1. Reads the chosen terminal.
2. `focusRunningCli()` connects to `.build/cli.sock`. A running CLI answers on this socket with its tty path. A dead CLI refuses the connection, even if the socket file was left behind, so there is no stale state to clean up. It gives up after one second.
3. **If a CLI answers,** the terminal's recipe brings it back.
4. **If nothing answers,** the recipe opens `.build/open-supercast.command`. The launcher uses an absolute Node path because a terminal's `PATH` can differ from your shell's.

The CLI has to stay open for this to work, so `runLauncher()` loops: after an action it clears the screen and shows search again. Exit and Esc end the loop.

If you open a second CLI, such as `pnpm start` in another terminal, the newest one takes over the socket.

## The search prompt

The window starts with the screen cleared, the teal SUPERCAST logo from `src/launcher/banner.ts`, and a bare search bar. The logo is drawn once per round, outside the prompt, so typing never redraws it. In windows under 76 columns it falls back to the plain name. Results appear once you type and go away if you delete everything. Pressing Enter with nothing typed does nothing.

`promptForSelection()` in `src/launcher/prompt.ts` uses `AutocompletePrompt` from `@clack/core`, not `autocomplete` from `@clack/prompts`, because the higher-level prompt always draws its header and footer. `@clack/core` is pinned to the version `@clack/prompts` uses.

`runSearchRound()` in `src/launcher/launcher.ts` builds one list: the built-in commands, then the apps.

**Finding apps.** `listApps()` reads `/Applications`, `/System/Applications` and `~/Applications`, two folders deep, plus Finder. It doesn't use Spotlight, because Spotlight's results depend on its index: it missed `News.app`. VS Code also went missing from one CLI's list shortly after its Spotlight record changed, though that cause was never proven. Bundles are never opened, so helper apps inside them stay out.

**Ranking.** `rankItems()` uses the [match-sorter](https://github.com/kentcdodds/match-sorter) library: exact match, then prefix, word start, substring, initials, and finally letters in order. Items that match equally well keep their alphabetical order. It was chosen by comparing fuzzysort, fzf, match-sorter and fuse.js on the real app list.

**Rows.** Each row shows an icon, the name and a faded kind: `◆` Application or `⌘` Command. The label contains colour codes, so search uses the plain `name` field instead.

**Three clack details matter here. Recheck them when upgrading clack:**

- Clack runs its own filter even on dynamic options, and that filter would hide matches like `vsc`. The prompt passes a filter that lets everything through, so `rankItems()` alone decides.
- Clack keeps focus on an item for as long as it stays in the results. The `options()` getter clears focus whenever the typed text changes, so Enter always picks the top result. This sets clack's `focusedValue` field directly.
- Clack crashes if a redraw has fewer lines than it expects. `BLANK_FRAME` keeps the same line count as the search bar when the prompt finishes.

## Stopping

`pnpm menubar:stop`, or "Remove Menu Bar Item" in the search prompt, finds the helper with `pgrep` and sends it a kill signal. Exit in the menu makes the helper exit by itself. Either way, the icon and shortcut go away.

## Known limits

- The helper doesn't restart after a reboot. Run `pnpm menubar:start` again.
- The launcher contains the current Node path. If that path changes, run `pnpm menubar:stop`, then `pnpm menubar:start`.
- After Exit or Esc, the next press opens a new window, and the finished one may stay open depending on your Terminal profile.
- Raising a minimized window is untested.
