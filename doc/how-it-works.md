# How Supercast works

Supercast is a command-line launcher for macOS. It is made of two programs:

- **The CLI** (TypeScript and clack) shows the search prompt, and stays open until you exit it.
- **The helper** (a small Swift program) stays running. It owns the menu bar icon and the global shortcut.

TypeScript can't call macOS AppKit directly, so anything that must stay alive in the background lives in the helper.

```text
pnpm menubar:start
   └─ menubar.ts builds and starts the helper, then the CLI exits

supercast-status (keeps running)
   └─ owns the icon and the shortcut, waits for input

left click or Cmd+Shift+Space
   └─ node index.ts show
        ├─ CLI already open: raise that window
        └─ no CLI open: open -a Terminal open-supercast.command
             └─ node index.ts
                  └─ search prompt
                       └─ Enter opens the app, then search returns
```

## Files

| File                      | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `index.ts`                | CLI entry point: subcommands and the search prompt      |
| `launcher-prompt.ts`      | Draws the search bar and results                        |
| `search.ts`               | Ranks results for what you typed                        |
| `apps.ts`                 | Finds installed apps and opens them                     |
| `menubar.ts`              | Builds, starts and stops the helper, and shows the CLI  |
| `instance.ts`             | Detects a running CLI and raises its window             |
| `native/StatusItem.swift` | The helper: menu bar icon and global shortcut           |
| `.build/`                 | Generated: helper binary, launcher script, `helper.log` |

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

`pnpm menubar:start` calls `startMenuBar()` in `menubar.ts`:

1. `pgrep` looks for a running helper. If there is one, nothing else happens, so you never get two icons.
2. `swiftc` compiles `native/StatusItem.swift` to `.build/supercast-status`. This is skipped if the binary is newer than the source.
3. It writes `.build/open-supercast.command`, a script that goes to the project folder and runs `node index.ts`.
4. It starts the helper with `detached: true`, then `unref()`, so the CLI can exit while the helper keeps running. Helper output goes to `.build/helper.log`.

If the helper is already running, `start` does nothing, even if the Swift file changed. After editing Swift, run `pnpm menubar:stop` first.

## Inside the helper

1. `setActivationPolicy(.accessory)` hides it from the Dock.
2. `NSStatusBar.system.statusItem(...)` asks macOS for a menu bar slot. On macOS 26, Control Centre hosts the actual window, so window lists show Control Centre as the owner, not the helper.
3. `GlobalHotKey` registers `Cmd+Shift+Space` with Carbon's `RegisterEventHotKey`. The result is written to `helper.log`, where status `0` means success.
4. `app.run()` starts the event loop. The helper must stay alive: if it exits, the icon and shortcut go with it.

No `.app` bundle or `Info.plist` is needed. The helper runs as a bare, ad-hoc signed binary.

## Showing the CLI

A left click or the shortcut makes the helper run `node index.ts show`. All the decisions live in `showCli()` in `menubar.ts`, so the helper stays simple.

1. `focusRunningCli()` connects to `.build/cli.sock`. A running CLI answers on this socket. A dead CLI refuses the connection, even if the socket file was left behind, so there is no stale state to clean up. It gives up after one second.
2. **If a CLI answers,** it writes an escape sequence to its own terminal that un-minimizes and raises its window. Then `open -a Terminal` brings Terminal to the front. This raises that exact window with no Automation permission.
3. **If nothing answers,** `open -a Terminal .build/open-supercast.command` opens a new window. macOS treats `.command` files as scripts for Terminal, so this needs no Automation permission either. The launcher uses an absolute Node path because Terminal's `PATH` can differ from your shell's.

The CLI has to stay open for this to work, so `runInteractive()` loops: after an action it clears the screen and shows search again. Exit and Esc end the loop.

If you open a second CLI, such as `pnpm start` in another terminal, the newest one takes over the socket.

A right click shows the Quit menu. The menu is attached only for that click, otherwise left clicks would open it too.

## The search prompt

The window starts with the screen cleared, the teal SUPERCAST logo from `banner.ts`, and a bare search bar. The logo is drawn once per round, outside the prompt, so typing never redraws it. In windows under 76 columns it falls back to the plain name. Results appear once you type and go away if you delete everything. Pressing Enter with nothing typed does nothing.

`promptForSelection()` in `launcher-prompt.ts` uses `AutocompletePrompt` from `@clack/core`, not `autocomplete` from `@clack/prompts`, because the higher-level prompt always draws its header and footer. `@clack/core` is pinned to the version `@clack/prompts` uses.

`runSearchRound()` in `index.ts` builds one list: the built-in commands, then the apps.

**Finding apps.** `listApps()` asks Spotlight for every application bundle through `mdfind`. `toApps()` then keeps only `/Applications`, `/System/Applications`, `~/Applications` and Finder, because Spotlight also returns helper apps from places like `~/Library`.

**Ranking.** `rankItems()` orders results as exact match, prefix, word start, initials, substring, letters in order from the first letter, then any letters in order. So `vs` puts Visual Studio Code first. Items with equal rank keep their alphabetical order.

**Rows.** Each row shows an icon, the name and a faded kind: `◆` Application or `⌘` Command. The label contains colour codes, so search uses the plain `name` field instead.

**Three clack details matter here. Recheck them when upgrading clack:**

- Clack runs its own filter even on dynamic options, and that filter would hide matches like `vsc`. The prompt passes a filter that lets everything through, so `rankItems()` alone decides.
- Clack keeps focus on an item for as long as it stays in the results. The `options()` getter clears focus whenever the typed text changes, so Enter always picks the top result. This sets clack's `focusedValue` field directly.
- Clack crashes if a redraw has fewer lines than it expects. `BLANK_FRAME` keeps the same line count as the search bar when the prompt finishes.

## Stopping

`pnpm menubar:stop`, or "Remove Menu Bar Item" in the search prompt, finds the helper with `pgrep` and sends it a kill signal. Quit in the right-click menu makes the helper exit by itself. Either way, the icon and shortcut go away.

## Known limits

- The helper doesn't restart after a reboot. Run `pnpm menubar:start` again.
- The launcher contains the current Node path. If that path changes, run `pnpm menubar:stop`, then `pnpm menubar:start`.
- After Exit or Esc, the next press opens a new window, and the finished one may stay open depending on your Terminal profile.
- Raising a window relies on Terminal honouring the escape sequence. Other terminals need testing.
- Raising a minimized window is untested.
