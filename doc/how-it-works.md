# How Medea works

Medea is a command-line launcher for macOS. It is made of two programs:

- **The CLI** (TypeScript and clack) shows the search prompt, and stays open until you exit it.
- **The helper** (a small Swift program) stays running. It owns the menu bar icon and the global shortcut.

TypeScript can't call macOS AppKit directly, so anything that must stay alive in the background lives in the helper.

```text
pnpm menubar:start
   └─ the CLI builds and starts the helper, then the CLI exits

medea-status (keeps running)
   └─ owns the icon and the shortcut, waits for input

Open Medea in the menu, or Cmd+Shift+Space
   └─ node src/index.ts show
        ├─ CLI already open: raise that window
        └─ no CLI open: start open-medea.command in the chosen terminal
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
├── config.ts             Reads and merges saved settings
├── shell.ts              Shared command runner and shell quoting
├── launcher/
│   ├── launcher.ts       The search loop and its list of items
│   ├── prompt.ts         Draws the search bar and reads keys
│   ├── screen.ts         Clears the window and draws the logo
│   ├── item-settings.ts  The settings screen for one app or command
│   ├── aliases.ts        Parses, checks and saves aliases
│   ├── hotkeys.ts        Parses, checks and saves hotkeys
│   ├── hotkey-recorder.ts Runs the native recorder window
│   ├── banner.ts         The MEDEA logo
│   ├── search.ts         Ranks results with match-sorter
│   └── apps.ts           Finds installed apps and opens them
├── medea-apps/
│   ├── types.ts          What an app gives the launcher
│   ├── registry.ts       The list of installed apps
│   ├── medea-clipboard-history/
│   │   ├── index.ts      The history list and its actions
│   │   ├── store.ts      Reads and saves the history file
│   │   └── format.ts     Row previews and ages
│   ├── medea-settings/
│   │   └── index.ts      The Medea Settings screen
│   └── medea-quicklinks/
│       ├── index.ts      Search items and settings actions
│       ├── store.ts      Reads and saves quicklinks.json
│       ├── placeholders.ts Finds and fills {argument} and {clipboard}
│       ├── open-link.ts  Checks links and opens them
│       └── form.ts       The create, edit and argument prompts
├── menubar/
│   ├── helper.ts         Builds, starts and stops the Swift helper
│   ├── login-item.ts     Turns Start at login on and off
│   └── commands.ts       The start, stop and status commands
└── terminals/
    ├── terminals.ts      Lists terminals, saves the choice, launches each one
    ├── running-cli.ts    Talks to a running CLI over its socket
    ├── launcher-script.ts Writes the scripts terminals open
    ├── close-window.ts   Closes a finished Terminal window
    └── actions.ts        Shows the CLI, changes terminal, opens item windows
native/
├── StatusItem.swift      The helper: menu bar icon, menu and global shortcuts
└── HotkeyRecorder.swift  The window that records a hotkey
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
2. `swiftc` compiles `native/StatusItem.swift` to `.build/medea-status`. This is skipped if the binary is newer than the source.
3. It writes `.build/open-medea.command`, a script that goes to the project folder and runs `node src/index.ts`.
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

| Item         | What it runs                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Open Medea   | `node src/index.ts show`                                                                                   |
| Set Terminal | `node src/index.ts terminals` fills the list, and picking one runs `node src/index.ts set-terminal <name>` |
| Exit         | Quits the helper, which removes the icon and the shortcut                                                  |

## Choosing a terminal

`src/terminals/terminals.ts` lists the terminals Medea knows how to launch, filtered to the ones installed. The choice is saved in `~/.config/medea/config.json`. Missing or broken config falls back to Terminal.

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
4. **If nothing answers,** the recipe opens `.build/open-medea.command`. The launcher uses an absolute Node path because a terminal's `PATH` can differ from your shell's. It clears the window first, because terminals type the launch command into a shell and that line would otherwise stay above Medea.

The CLI has to stay open for this to work, so `runLauncher()` loops: after an action it clears the screen and shows search again. Exit and Esc end the loop.

If you open a second CLI, such as `pnpm start` in another terminal, the newest one takes over the socket.

## The search prompt

The window starts with the screen cleared, the MEDEA logo from `src/launcher/banner.ts`, a slim wordmark that fades from teal to cyan, and a bare search bar. The logo is drawn once per round, outside the prompt, so typing never redraws it. In windows under 17 columns it falls back to the plain name. Results appear once you type and go away if you delete everything. Pressing Enter with nothing typed does nothing.

`promptForSelection()` in `src/launcher/prompt.ts` uses `AutocompletePrompt` from `@clack/core`, not `autocomplete` from `@clack/prompts`, because the higher-level prompt always draws its header and footer. `@clack/core` is pinned to the version `@clack/prompts` uses.

`runSearchRound()` in `src/launcher/launcher.ts` builds one list: the built-in commands, then the apps.

**Finding apps.** `listApps()` reads `/Applications`, `/System/Applications` and `~/Applications`, two folders deep, plus Finder. It doesn't use Spotlight, because Spotlight's results depend on its index: it missed `News.app`. VS Code also went missing from one CLI's list shortly after its Spotlight record changed, though that cause was never proven. Bundles are never opened, so helper apps inside them stay out.

**Ranking.** `rankItems()` uses the [match-sorter](https://github.com/kentcdodds/match-sorter) library: exact match, then prefix, word start, substring, initials, and finally letters in order. Items that match equally well keep their alphabetical order. It was chosen by comparing fuzzysort, fzf, match-sorter and fuse.js on the real app list.

**Rows.** Each row shows an icon, the name and a faded kind: `◆` Application or `⌘` Command. The label contains colour codes, so search uses the plain `name` field instead.

**Three clack details matter here. Recheck them when upgrading clack:**

- Clack runs its own filter even on dynamic options, and that filter would hide matches like `vsc`. The prompt passes a filter that lets everything through, so `rankItems()` alone decides.
- Clack keeps focus on an item for as long as it stays in the results. The `options()` getter clears focus whenever the typed text changes, so Enter always picks the top result. This sets clack's `focusedValue` field directly.
- Clack crashes if a redraw has fewer lines than it expects. `BLANK_FRAME` keeps the same line count as the search bar when the prompt finishes.

## Aliases and item settings

Any app or command can have aliases, shown next to its name: `Visual Studio Code [code] [ide]`. They're searched like the name, so `code` or a partial `cod` finds it. You still press Enter to run it.

Aliases are stored in `~/.config/medea/config.json`, keyed by app path or command ID:

```json
{
  "terminal": "Ghostty",
  "aliases": {
    "/Applications/Visual Studio Code.app": ["code", "ide"],
    "command:exit": ["q"]
  }
}
```

`updateConfig()` merges changes, so saving a terminal can't wipe aliases, or the other way round. Each item can have up to two aliases of up to 8 characters, so a row stays inside its title column. Aliases are lowercase with no spaces, and two items can't share one. These limits apply when saving in settings, so a hand-edited config can go over them.

**Opening settings.** Shift+Enter or Tab on a result opens that item's settings in the search window, and Done or Esc goes back to search. The Set Alias command does the same after you pick an item. An error in settings shows above the search bar instead of closing Medea.

Search reads aliases on every keystroke, so a new alias works as soon as you're back in search.

**Reading keys.** `readKeysInto()` in `prompt.ts` reads raw bytes before clack does, because Node can't parse Shift+Enter and would type junk into the search bar. A settings key is forwarded as a normal Enter, with a flag saying settings were asked for.

| Terminal | Shift+Enter                                                                                        | Tab   |
| -------- | -------------------------------------------------------------------------------------------------- | ----- |
| Ghostty  | Sends `ESC[27;2;13~` by default, so it works                                                       | Works |
| Terminal | Not on the published lists of terminals that send a distinct code, so assume it behaves like Enter | Works |

The footer hint shows `⇧↵` in Ghostty and `tab` elsewhere. `stdin` has to be resumed for each prompt: a paused stream stays paused when a listener is added, and the process would exit with code 13.

## Hotkeys

Search rows show a hotkey next to the name: `Calculator [calc] ⌃⌥9`. Any app or command can have one.

Settings is a menu: **Add alias**, **Create hotkey**, **Remove hotkey** (when one is set) and **Done**. Each change saves straight away.

**Recording.** Create hotkey opens a small native window, `native/HotkeyRecorder.swift`, which shows the keys live as you press them. A terminal can't do this, because macOS and the terminal app take combos like `Cmd+Shift+K` first. A focused window receives them directly, so it needs no permission. It's a separate binary, `.build/medea-record`, so `pgrep` for the helper can't match it.

- The recorder prints the combo as JSON and exits. `parseRecording()` turns that into a saved hotkey.
- Esc, clicking away or 60 seconds cancels it.
- A key with no modifier doesn't end the recording. The window asks you to hold a modifier.

**Registering.**

1. Saving writes `hotkeys` to `~/.config/medea/config.json`, keyed by item, in a fixed form such as `shift+cmd+k`.
2. The CLI sends the running helper `SIGUSR1`, so the hotkey works with no restart.
3. The helper runs `node src/index.ts hotkeys`, which turns saved hotkeys into Carbon key codes and flags, and registers them. `helper.log` records each result, where status `0` means success.

**Pressing a hotkey.** An item saved as a path is an app, and opens directly through `open <path>` without starting Node. Anything else runs `node src/index.ts run <value>`:

| Command              | Hotkey does                                           |
| -------------------- | ----------------------------------------------------- |
| Exit                 | Quits the open search window                          |
| Set Alias            | Opens Medea                                           |
| Remove Menu Bar Item | Stops the helper, which also ends all hotkeys         |
| Create Quicklink     | Opens a new window with the form                      |
| Clipboard History    | Opens a new window with the list                      |
| A quicklink          | Opens it, through a new window if it has `{argument}` |

`src/launcher/hotkeys.ts` holds the key table, checked against `HIToolbox/Events.h`. It uses US keyboard positions.

A hotkey needs at least two modifiers, including `cmd` or `ctrl`, so it can't take over something like `cmd+q`. Duplicates and Medea's own `cmd+shift+space` are refused.
**Warnings for shortcuts already in use.** macOS has no way to list other apps' hotkeys: Apple's header says it's "not an error to register the same hotkey in multiple processes", and the exclusive flag only clashes with other exclusive hotkeys. Pausing system shortcuts while recording needs Accessibility permission. So Medea reads the symptoms instead:

| What happens                                                                     | Warning                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| Modifiers go down and up, but no key arrives, because something else took it     | The recorder says so and stays open      |
| Focus leaves the recorder while keys are held, because another app reacted       | The terminal warns, and nothing is saved |
| The key arrives and matches an enabled macOS shortcut from `CopySymbolicHotKeys` | The terminal asks "Use it anyway?"       |

A shortcut used by an app that only reacts while it's frontmost can't be seen, and it isn't a conflict either, because a global hotkey wins.

## Medea apps

A Medea app is a feature that adds its own items to search. It lives in `src/medea-apps/<id>/` and is listed in `registry.ts`. Apps are built in for now, and loading them from a user folder could come later.

**Names.** Every built-in app has an ID starting with `medea-`, like `medea-quicklinks`. The ID is used for its folder, its storage file (`~/.config/medea/<id>.json`) and its item values (`<id>:<item>`), so a third-party app can use any other name without clashing. `registry.test.ts` enforces this. Item values are saved in aliases and hotkeys, so changing an ID means migrating saved settings.

An app gives the launcher two things, defined in `types.ts`:

- `listItems()` returns its search items. It runs on every keystroke, so anything saved in another window shows straight away.
- `listSettingsActions(value)` returns extra rows for an item's settings menu.

An item with `needsWindow: true` asks for input, so its hotkey opens a new window running `node src/index.ts run-in-window <value>`. That window closes when the item finishes.

## Quicklinks

The first Medea app, modelled on Raycast's. `Create Quicklink` asks for a name, a link and an optional app to open it with. Links appear in search with a `↗` icon, and aliases and hotkeys work as they do for apps. Tab opens settings, which add `Edit link` and `Delete link`.

Links are stored in `~/.config/medea/medea-quicklinks.json`:

```json
[
  {
    "id": "github-search",
    "name": "GitHub Search",
    "link": "https://github.com/search?q={argument name=\"query\"}",
    "openWith": "/Applications/Safari.app"
  }
]
```

The item value is `medea-quicklinks:<id>`. The ID comes from the name when the link is created and never changes, so a rename keeps its alias and hotkey. Warnings like "already used by" show this ID, so they can show an old name after a rename. Deleting a link also removes its alias and hotkey.

**Links.** A web URL, a deeplink like `spotify://...`, or a path starting with `/` or `~`. `github.com` is saved as `https://github.com`, and `localhost:3000` as `http://localhost:3000`.

**Placeholders.** These use Raycast's syntax:

| Placeholder                           | Result                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| `{argument}`                          | Asks when the link opens. Each unnamed one is its own question   |
| `{argument name="query" default="x"}` | The same, and arguments with one name share one value            |
| `{}`                                  | Asks when the link opens, as an unnamed argument                 |
| `{query}`                             | Any word in braces is short for `{argument name="query"}`        |
| `{clipboard}`                         | The clipboard text, trimmed. Empty if nothing text-like is there |

A link can have up to 3 arguments. Values are percent-encoded when the link starts with a URL scheme, and left alone in paths and in a link that starts with a placeholder. Braces that hold anything else, like `{"a":1}`, stay in the link as written.

**Failures.** A link that can't open shows a red line above the search bar, and the window stays open. From a hotkey with no window, the failure is silent. If `medea-quicklinks.json` is broken, search shows no links and saving refuses to run, so a save can't overwrite links you could still fix.

## Clipboard history

The second Medea app. `Clipboard History` lists what you've copied, newest first, before you type anything. Typing filters by exact text, not loose letters, because loose matching on long text matches nearly everything. Enter copies the entry back and returns to search. Tab offers Copy, Delete and Delete all, and Delete all asks first.

Raycast pastes straight into the app you were using. Medea only copies, because sending Cmd+V to another app needs Accessibility permission. After choosing an entry, switch back and paste.

**Recording.** The Swift helper checks the clipboard's change count every half second, which costs almost nothing, and only reads the text when it changes. So recording needs the helper running, and the CLI doesn't have to be open.

1. `ClipboardWatcher` in `native/StatusItem.swift` applies the privacy rules below.
2. The helper runs `node src/index.ts record-clipboard` and sends the text through stdin, because anyone can read a process's arguments with `ps`.
3. `addEntry()` in `store.ts` puts it first. Copying the same text again moves the old entry to the top.

Copies are recorded one at a time, so two quick copies can't overwrite each other.

**What is never recorded.**

| Copied content                                           | How it's spotted                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Content marked confidential, temporary or auto-generated | The `org.nspasteboard.*` types and the legacy types listed at nspasteboard.org |
| Anything copied in Passwords or Keychain Access          | The frontmost app's bundle ID                                                  |
| Files                                                    | A file URL on the clipboard, because the text would only be the file's name    |
| Images and other non-text content                        | No plain text on the clipboard                                                 |
| Blank text, or text over 100,000 characters              | Checked in `addEntry()`                                                        |

A password manager has to mark its copies for this to work, and an app that doesn't will be recorded like any other.

**Storage.** `~/.config/medea/medea-clipboard-history.json` keeps the newest 200 entries. It's plain text, not encrypted, and only your user can read it. Saving writes a temporary file and renames it, so a reader never sees half a file.

**Terminal safety.** Copied text can contain escape codes, so rows and menus strip control characters before showing it. The copy itself keeps the original text.

**Permissions.** macOS has a "Paste from Other Apps" privacy control that can ask before an app reads the clipboard. On macOS 26.6.2 `NSPasteboard.general.accessBehavior` reports `alwaysAllow` for the helper, so no prompt appears. A later macOS could change that.

`pbcopy` and `pbpaste` garble non-English text when the locale is empty, as it can be for the helper, so both run with `LC_CTYPE=UTF-8`.

## Medea Settings

The third Medea app. Search `Medea Settings` for a list of toggles, where Enter flips the focused one. Esc or Done goes back to search.

**Start at login** puts Medea in the menu bar when you log in, so the shortcut, hotkeys and clipboard recording survive a reboot.

| Row shows | Meaning                                     | Enter does                    |
| --------- | ------------------------------------------- | ----------------------------- |
| Off       | No login item                               | Turns it on                   |
| On        | The login item exists and macOS allows it   | Turns it off                  |
| Blocked   | The item is switched off in System Settings | Opens System Settings for you |

**How it works.** The setting is a file, `~/Library/LaunchAgents/medea.menu-bar.plist`, so no saved value can disagree with what macOS will do. It runs `.build/medea-status` directly, so macOS lists it as `medea-status`.

- Apple's newer `SMAppService` needs a signed `.app`, so a LaunchAgent is the route for a bare binary.
- Turning it on only writes the file, and macOS loads it at the next login. Loading it straight away would start a second helper.
- Turning it off only deletes the file, so a running helper keeps running.
- `RunAtLoad` is set and `KeepAlive` isn't, so Exit in the menu bar stays exited until the next login.
- `pnpm menubar:start` rewrites the file if it exists, which keeps its paths right after Node or the project moves. If the project moves and that isn't run, the login item fails silently.

**Permissions.** There's nothing to grant, but macOS shows a "Background Items Added" notice for a new item, and you can switch it off under System Settings > General > Login Items & Extensions. No command can flip that switch back, so the Blocked row opens the page. Medea spots the block two ways: `launchctl print-disabled`, and the `Disposition` in `sfltool dumpbtm`, which needs no `sudo` for your own items. `sfltool` isn't documented by Apple, so a failure there just means the block isn't seen. It takes about 4 seconds, so it only runs when a login item exists, behind a "Checking System Settings" line.

## Closing the window

Terminal keeps a dead window open after a program exits, showing `[Process completed]`. Ghostty closes its own, so this only applies to Terminal.

When search finishes, Medea shows a **Close terminal** option, and Enter closes the window. Esc leaves it open. A window that quits because you changed terminal closes without asking.

- Launcher scripts set `MEDEA_WINDOW=1`, and only those windows can close. Running `pnpm start` in your own terminal never offers this.
- The window is found while Node is alive and closed 0.6 seconds later, so Terminal doesn't ask about running processes.
- Only a `busy` tab can match. Terminal reuses tty names and dead windows keep them, so matching on the tty alone closes the wrong window.
- A window with several tabs is left open.

## Stopping

`pnpm menubar:stop`, or "Remove Menu Bar Item" in the search prompt, finds the helper with `pgrep` and sends it a kill signal. Exit in the menu makes the helper exit by itself. Either way, the icon and shortcut go away.

## Known limits

- The helper doesn't restart after a reboot. Run `pnpm menubar:start` again.
- The launcher contains the current Node path. If that path changes, run `pnpm menubar:stop`, then `pnpm menubar:start`.
- After Exit or Esc, the next press opens a new window.
- Raising a minimized window is untested.
