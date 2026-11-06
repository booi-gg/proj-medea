# How Medea works

Medea is a command-line launcher for macOS. It is made of two programs:

- **The CLI** (TypeScript and clack) shows the search prompt, and stays open until you exit it.
- **The helper** (a small Swift program) stays running. It owns the menu bar icon, the global shortcut and moving windows.

TypeScript can't call macOS AppKit directly, so anything that must stay alive in the background lives in the helper.

```text
pnpm menubar:start
   └─ the CLI builds and starts the helper, then the CLI exits

medea-status (keeps running)
   └─ owns the icon and the shortcut, waits for input

Open Medea in the menu, or Cmd+Shift+Space
   ├─ CLI already open: the helper asks it over its socket, and it raises its own window
   └─ no CLI open: node src/start.js show
        └─ start open-medea.command in the chosen terminal
             └─ node src/start.js
                  └─ search prompt
                       └─ Enter opens the app, then search returns
```

## Files

Code is grouped by feature, and tests sit next to the file they cover.

```text
src/
├── start.js              Turns on Node's compile cache, then loads index.ts
├── index.ts              Routes commands. Nothing else.
├── paths.ts              Every project path, in one place
├── config.ts             Reads and merges saved settings
├── shell.ts              Shared command runner and shell quoting
├── socket.ts             Sends one request over a Unix socket
├── launcher/
│   ├── launcher.ts       The search loop and its list of items
│   ├── prompt.ts         Draws the search bar and reads keys
│   ├── screen.ts         Clears the window and draws the logo
│   ├── split-view.ts     Lays out a list beside a preview
│   ├── item-settings.ts  The settings screen for one app or command
│   ├── aliases.ts        Parses, checks and saves aliases
│   ├── hotkeys.ts        Parses, checks and saves hotkeys
│   ├── hotkey-recorder.ts Runs the native recorder window
│   ├── hotkey-list.ts    The list of hotkeys you can run and edit from
│   ├── banner.ts         The MEDEA logo
│   ├── search.ts         Ranks results with match-sorter
│   └── apps.ts           Finds installed apps and opens them
├── medea-apps/
│   ├── types.ts          What an app gives the launcher
│   ├── icon.ts           Gives Medea's own items their reserved icon colour
│   ├── registry.ts       The list of installed apps
│   ├── medea-calculator/
│   │   ├── index.ts      The answer row shown in search
│   │   └── calculate.ts  Parses and works out a sum
│   ├── medea-currency/
│   │   ├── index.ts      Conversion answers and target suggestions
│   │   ├── convert.ts    Parses input and converts through USD
│   │   └── rates.ts      Reads and refreshes the local rates file
│   ├── medea-clipboard-history/
│   │   ├── index.ts      The history list and its actions
│   │   ├── store.ts      Reads and saves history and image files
│   │   ├── format.ts     Row text, previews, ages and sizes
│   │   ├── syntax.ts     Colours code, and leaves other text alone
│   │   └── image-window.ts Runs the native window that shows images
│   ├── medea-hotkeys/
│   │   └── index.ts      The Hotkeys, Show All command
│   ├── medea-settings/
│   │   └── index.ts      The Settings screen
│   ├── medea-window/
│   │   ├── index.ts      Search items and failure messages
│   │   └── actions.ts    The window actions and their default hotkeys
│   └── medea-quicklinks/
│       ├── index.ts      Search items and settings actions
│       ├── store.ts      Reads and saves quicklinks.json
│       ├── placeholders.ts Finds and fills {argument} and {clipboard}
│       ├── open-link.ts  Checks links and opens them
│       └── form.ts       The create, edit and argument prompts
├── menubar/
│   ├── helper.ts         Builds, starts and stops the Swift helper
│   ├── helper-socket.ts  Talks to the running helper over its socket
│   ├── signing.ts        Signs the helper so permissions survive a rebuild
│   ├── login-item.ts     Turns Start at login on and off
│   └── commands.ts       The start, stop and status commands
└── terminals/
    ├── terminals.ts      Lists terminals, saves the choice, launches each one
    ├── running-cli.ts    Talks to a running CLI over its socket
    ├── launcher-script.ts Writes the scripts terminals open
    ├── close-window.ts   Closes a finished Terminal window
    └── actions.ts        Shows the CLI, changes terminal, opens item windows
native/
├── main.swift            The helper's startup code
├── StatusItem.swift      Menu bar icon, menu, global shortcuts and clipboard watcher
├── HelperSocket.swift    Answers requests from the CLI
├── WindowManager.swift   Finds and moves windows through the Accessibility API
├── WindowGeometry.swift  Works out frames, with no system calls
├── HotkeyRecorder.swift  The window that records a hotkey
└── ImagePreview.swift    The floating window that shows clipboard images
doc/                      These docs
.build/                   Generated: helper binary, launcher script, logs, socket, compile cache
```

## Commands

```sh
pnpm start            # open the search prompt
pnpm menubar:start    # start the helper
pnpm menubar:stop     # stop the helper
pnpm menubar:status   # check whether it is running
pnpm menubar:sign     # one-time: keep Accessibility permission across rebuilds
pnpm test             # run unit tests
pnpm typecheck
pnpm check            # format and lint
```

## Starting the helper

`pnpm menubar:start` calls `startMenuBar()` in `src/menubar/helper.ts`:

1. `pgrep` looks for a running helper. If there is one, nothing else happens, so you never get two icons.
2. `swiftc` compiles the helper's files to `.build/medea-status`, then signs it if the local signing identity exists. Compiling is skipped if the binary is newer than every source. `swiftc` only allows top-level code in a file called `main.swift`, so startup code lives there.
3. It writes `.build/open-medea.command`, a script that goes to the project folder and runs `node src/start.js`.
4. It starts the helper with `detached: true`, then `unref()`, so the CLI can exit while the helper keeps running. Helper output goes to `.build/helper.log`.

If the helper is already running, `start` does nothing, even if the Swift file changed. After editing Swift, run `pnpm menubar:stop` first.

## Inside the helper

1. `setActivationPolicy(.accessory)` hides it from the Dock.
2. `NSStatusBar.system.statusItem(...)` asks macOS for a menu bar slot. On macOS 26, Control Centre hosts the actual window, so window lists show Control Centre as the owner, not the helper.
3. `GlobalHotKey` registers `Cmd+Shift+Space` with Carbon's `RegisterEventHotKey`. The result is written to `helper.log`, where status `0` means success.
4. `app.run()` starts the event loop. The helper must stay alive: if it exits, the icon and shortcut go with it.

No `.app` bundle or `Info.plist` is needed. The helper runs as a bare binary, ad-hoc signed until `pnpm menubar:sign` has been run.

## The menu

Left or right clicking the icon opens a menu. The helper holds no logic of its own: each item runs the CLI.

| Item         | What it runs                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Open Medea   | Asks the open CLI over `.build/cli.sock`, or runs `node src/start.js show` if none answers                 |
| Set Terminal | `node src/start.js terminals` fills the list, and picking one runs `node src/start.js set-terminal <name>` |
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

The menu and the shortcut both start in the helper, so bringing back an open CLI doesn't wait for Node to start:

1. `focusRunningCli()` in `native/StatusItem.swift` connects to `.build/cli.sock` and sends `focus`. A dead CLI refuses the connection, even if the socket file was left behind, so there is no stale state to clean up. It gives up after one second.
2. **If a CLI answers,** it raises its own window and runs the terminal's recipe to bring it back. The recipes stay in TypeScript, so the helper never needs to know which terminal is chosen.
3. **If nothing answers,** the helper runs `node src/start.js show`. `showCli()` in `src/terminals/actions.ts` tries the socket once more, then the recipe opens `.build/open-medea.command`. The launcher uses an absolute Node path because a terminal's `PATH` can differ from your shell's. It clears the window first, because terminals type the launch command into a shell and that line would otherwise stay above Medea.

The CLI has to stay open for this to work, so `runLauncher()` loops: after an action it clears the screen and shows search again. The Exit command ends the loop. Esc at search asks first: **End program** ends it, and **Cancel** or a second Esc goes back to search.

If you open a second CLI, such as `pnpm start` in another terminal, the newest one takes over the socket.

## Starting quickly

The helper starts the CLI on every copy and on most hotkeys, so start time matters. A bare Node process takes about 20 ms, and three things keep the CLI close to that:

- **Per-command imports.** `src/index.ts` imports what each command needs inside that command. A static import at the top would load every Medea app for every copy. `src/terminals/actions.ts` and `src/terminals/close-window.ts` load the registry and clack late for the same reason.
- **The compile cache.** `src/start.js` turns on Node's compile cache in `.build/compile-cache`, which keeps the stripped TypeScript and compiled code. Editing a file updates its entry, so there is nothing to clear. `start.js` stays plain JavaScript because the first `.ts` file makes Node set up type stripping, which costs about 20 ms, and a cached start skips that.
- **An early cache save.** Node saves the cache on a clean exit, and closing a window isn't one. So the search window calls `flushCompileCache()` once its code has loaded.

## The search prompt

The window starts with the screen cleared, the MEDEA logo from `src/launcher/banner.ts`, a slim wordmark that fades from teal to cyan, and a bare search bar. The logo is drawn once per round, outside the prompt, so typing never redraws it. In windows under 17 columns it falls back to the plain name. Results appear once you type and go away if you delete everything. Pressing Enter with nothing typed does nothing.

`promptForSelection()` in `src/launcher/prompt.ts` uses `AutocompletePrompt` from `@clack/core`, not `autocomplete` from `@clack/prompts`, because the higher-level prompt always draws its header and footer. `@clack/core` is pinned to the version `@clack/prompts` uses.

`runSearchRound()` in `src/launcher/launcher.ts` builds one list: the built-in commands, then the apps.

**Finding apps.** `listApps()` reads `/Applications`, `/System/Applications` and `~/Applications`, two folders deep, plus Finder. It doesn't use Spotlight, because Spotlight's results depend on its index: it missed `News.app`. VS Code also went missing from one CLI's list shortly after its Spotlight record changed, though that cause was never proven. Bundles are never opened, so helper apps inside them stay out.

**Ranking.** `rankItems()` uses the [match-sorter](https://github.com/kentcdodds/match-sorter) library: exact match, then prefix, word start, substring, initials, and finally letters in order. Items that match equally well keep their alphabetical order. It was chosen by comparing fuzzysort, fzf, match-sorter and fuse.js on the real app list.

**Rows.** Each row shows an icon, the name and a faded kind: `◆` Application or `⌘` Command. The label contains colour codes, so search uses the plain `name` field instead. Magenta icons are reserved for Medea's own apps and commands, and `toMedeaIcon()` is the only place that sets it.

**Calculator.** Typing a sum like `2 * 4` puts `2 * 4 = 8` at the top of the results, and Enter or Tab copies the `8`. It takes `+ - * / % ^`, brackets and decimals, with `%` as the remainder. A bracket touching a value multiplies it, so `4(4)` is `16`, at the same level as `*` and `/`, which makes `8 / 2(2)` come to `8`. `calculate()` parses the text by hand, so search text never runs as code. A lone number isn't a sum, and neither is an unfinished one like `2 *`, so these stay ordinary searches. Neither is an answer that isn't a number, like `1 / 0`. The row comes from the search text, so it has no aliases, hotkey or settings.

**Currency conversion.** Type `356 USD to INR` or `356 INR in USD` to see a conversion at the top of search. Target suggestions appear after `to` and narrow as you type: `356 INR to SD` suggests matching codes, with USD first. Enter or Tab copies the rounded number for the selected target. Literal symbols work too, including `$356 to INR`, `356₹ to $`, `€`, `£`, `¥` and `₩`; `$` means USD and `¥` means JPY. Unknown currency codes leave normal search results alone.

The search arrow changes from cyan to Medea's magenta when the query is a calculator expression or a currency conversion, including a partial target such as `350 usd to`.

The search path reads `~/.config/medea/medea-currency-rates.json` synchronously and never makes a network call. When a search window opens, Medea refreshes rates older than a day in the background from Frankfurter v2's fixed USD endpoint. The file is replaced atomically after a valid response, so a failed request leaves old rates usable. The row shows the date of each rate used, which can differ between currencies. These are daily reference rates, not live or bank exchange rates. On first use, a conversion query explains that rates are still unavailable until a download finishes; another keystroke updates the search results.

**Four clack details matter here. Recheck them when upgrading clack:**

- Clack runs its own filter even on dynamic options, and that filter would hide matches like `vsc`. The prompt passes a filter that lets everything through, so `rankItems()` alone decides.
- Clack keeps focus on an item for as long as it stays in the results. The `options()` getter clears focus whenever the typed text changes, so Enter always picks the top result. This sets clack's `focusedValue` field directly.
- Clack draws the text cursor at the focused result's index, not at its place in the text, so the arrow keys seem to do nothing. `SearchPrompt` overrides `userInputWithCursor` to read the real position from clack's protected `_cursor` field.
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

**Opening settings.** Shift+Enter or Tab on a result opens that item's settings in the search window, and Done or Esc goes back to search. The `Alias, Add` and `Hotkey, Create` commands do the same after you pick an item. An error in settings shows above the search bar instead of closing Medea.

Search reads aliases on every keystroke, so a new alias works as soon as you're back in search.

**Reading keys.** `readKeysInto()` in `prompt.ts` reads raw bytes before clack does, because Node can't parse Shift+Enter and would type junk into the search bar. A settings key is forwarded as a normal Enter, with a flag saying settings were asked for.

| Terminal | Shift+Enter                                                                                        | Tab   |
| -------- | -------------------------------------------------------------------------------------------------- | ----- |
| Ghostty  | Sends `ESC[27;2;13~` by default, so it works                                                       | Works |
| Terminal | Not on the published lists of terminals that send a distinct code, so assume it behaves like Enter | Works |

The footer hint shows `⇧↵` in Ghostty and `tab` elsewhere. `stdin` has to be resumed for each prompt: a paused stream stays paused when a listener is added, and the process would exit with code 13.

## Hotkeys

Search rows show a hotkey next to the name: `Calculator [calc] ⌃⌥9`. Any app or command can have one.

Settings is a menu: **Alias, Add**, **Hotkey, Create**, **Remove hotkey** (when one is set) and **Done**. Each change saves straight away.

**Recording.** `Hotkey, Create` opens a small native window, `native/HotkeyRecorder.swift`, which shows the keys live as you press them. A terminal can't do this, because macOS and the terminal app take combos like `Cmd+Shift+K` first. A focused window receives them directly, so it needs no permission. It's a separate binary, `.build/medea-record`, so `pgrep` for the helper can't match it.

- The recorder prints the combo as JSON and exits. `parseRecording()` turns that into a saved hotkey.
- Esc, clicking away or 60 seconds cancels it.
- A key with no modifier doesn't end the recording. The window asks you to hold a modifier.

**Registering.**

1. Saving writes `hotkeys` to `~/.config/medea/config.json`, keyed by item, in a fixed form such as `shift+cmd+k`.
2. The CLI sends the running helper `SIGUSR1`, so the hotkey works with no restart.
3. The helper runs `node src/start.js hotkeys`, which turns saved hotkeys into Carbon key codes and flags, and registers them. `helper.log` records each result, where status `0` means success.

**Pressing a hotkey.** An item saved as a path is an app, and opens directly through `open <path>` without starting Node. A window action also runs in the helper. Anything else runs `node src/start.js run <value>`:

| Command              | Hotkey does                                               |
| -------------------- | --------------------------------------------------------- |
| Exit                 | Quits the open search window                              |
| Alias, Add           | Opens Medea                                               |
| Hotkey, Create       | Opens Medea                                               |
| Remove Menu Bar Item | Stops the helper, which also ends all hotkeys             |
| Quicklink, Create    | Shows the form in the Medea window                        |
| Clipboard            | Shows the list in the Medea window                        |
| A quicklink          | Opens it, through the Medea window if it has `{argument}` |

**Seeing them all.** `Hotkeys, Show All` lists everything with a saved hotkey, and `Window Hotkeys, Show All` lists every window action, including any with no hotkey. Each window action has a small diagram, a bracketed screen with the filled part showing where the window ends up, and a few words when a diagram can't show it. Enter runs the row and Tab opens its settings. The list stays open after running something, so you can try several in a row, and Esc goes back. It shows as many rows as the window has room for.

**One window.** A hotkey for an item that needs a window sends `run <item>` over the socket before opening anything, so a second press never opens a second window. What the open window does depends on what it's showing:

| The window is showing            | The hotkey                                  |
| -------------------------------- | ------------------------------------------- |
| Nothing is open                  | Opens a window for that item                |
| Search, a pick list or Clipboard | Switches to the item                        |
| That same item                   | Brings it to the front                      |
| A form, settings or an open menu | Brings it to the front, and nothing is lost |

Only lists marked `replaceable` can be switched away from, because anything else could hold typing you haven't saved. A window opened for one item is the launcher with that item as its first step, so it answers the socket too. It closes when the item is done, unless `Cmd+Shift+Space` moved it on to search. Two quick presses can both find nothing open, so a window that finds another already answering hands its item over and closes.

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

An item with `needsWindow: true` asks for input, so its hotkey opens a new window running `node src/start.js run-in-window <value>`. That window closes when the item finishes.

## Quicklinks

The first Medea app, modelled on Raycast's. `Quicklink, Create` asks for a name, a link and an optional app to open it with. Links appear in search with a `↗` icon, and aliases and hotkeys work as they do for apps. Tab opens settings, which add `Edit link` and `Delete link`.

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

The second Medea app. `Clipboard` lists what you've copied, newest first, before you type anything. Typing filters by exact text, not loose letters, because loose matching on long text matches nearly everything. Enter copies the entry back and returns to search. Tab offers Copy, View full text or Open image, Delete and Delete all, and Delete all asks first.

Raycast pastes straight into the app you were using. Medea only copies, because sending Cmd+V to another app needs Accessibility permission. After choosing an entry, switch back and paste.

**Preview.** The focused entry shows in a pane beside the list, built by `toSplitLayout()` and `joinColumns()` in `src/launcher/split-view.ts`. A window under 56 columns has no room, so it shows only the list.

- Text keeps its line breaks and indentation. Tabs show as four spaces, long lines wrap with `wrap-ansi`, and a note says how many lines don't fit. View full text opens the whole entry in `less`, and `q` comes back.
- Code gets syntax colours from `emphasize`, in the pane and in `less`. It guesses the language and gives a relevance score. Long code scores 5 or more. Short code scores as low as a sentence, so anything from 2 to 4 must also look like code: a line ending in `{`, `}` or `;`, a call like `foo(x)`, or an operator like `=>`. Colours go on after wrapping, so a break can't land inside a colour code.
- Images show at full quality in a floating window beside the terminal, which follows the list as you arrow through it. The pane only shows the size. `native/ImagePreview.swift` is a borderless panel that can't become the key or main window and ignores the mouse, so keys stay in the terminal even as new images appear. The CLI sends it `show <path>` or `hide` over stdin, and it exits when that pipe closes, so it can't outlive Medea. It finds the terminal app through its parent processes, so it's right even if another app is in front by then, and it's only on screen while that app is in front. Switch to a browser and the image goes; switch back and it returns with whatever is selected. The left arrow closes the image you're on, and it comes back when you move away and return. Typing doesn't bring it back, because closing lasts until focus moves. While no image is open, the left arrow moves the cursor in the search bar as usual. The window can't take a click or a key itself, so the key has to go to the terminal. It finds the terminal's window through the window list, which needs no permission, and sits to the right, or the left if there's no room.

Images aren't drawn in the terminal, because a terminal can only draw characters. Chafa, through `chafa-wasm` and `static-chafa`, and `terminal-image` were all tried on real images. Even the best of them was too rough to count as seeing the image, and Terminal has no image protocol: on macOS 26.6.2 it ignores a Kitty graphics query.

`emphasize` loads when the screen opens, not at startup, because the CLI also starts on every copy.

**Staying current.** The list watches the history file and redraws as soon as anything is recorded, keeping what you've typed. Without this, a screen left open would show an old list, because Medea's window stays alive between uses.

The logo stays on this screen like every other, which leaves an 80×24 window 11 rows for the list. The panes grow with the window.

`string-width` measures rows, because characters like 日本 take two columns and a row that runs too long would wrap and break the screen.

**Recording.** The Swift helper checks the clipboard's change count every half second, which costs almost nothing, and only reads the content when it changes. So recording needs the helper running, and the CLI doesn't have to be open.

1. `ClipboardWatcher` in `native/StatusItem.swift` applies the privacy rules below.
2. The helper runs `node src/start.js record-clipboard` and sends the text through stdin, because anyone can read a process's arguments with `ps`. An image goes the same way as a PNG to `record-clipboard-image`, converted from TIFF if needed, with its name in the `MEDEA_IMAGE_NAME` environment variable.
3. `addEntry()` in `store.ts` puts it first. Copying the same thing again moves the old entry to the top, and images count as the same when their hash matches.

If the clipboard holds both text and an image, text wins, because apps like Excel also add a picture of the cells you copied. The exception is text that is only a web address, because a browser adds one to an image it copies.

Anything skipped is logged to `.build/helper.log` with its reason and clipboard type names, never its content, so a missing copy can be explained.

The list shows an image's file name when there is one, or `Image 293×409` when there isn't, and the pane shows the whole name. A file gives its own name. A browser's image takes the last part of its web address, from the HTML `<img src>`, then the copied URL or address text. A screenshot is only pixels, so it has no name. Names have control characters removed, because they end up on screen. Copying an image back out of Medea leaves only pixels, so an entry keeps the name it already had.

An image file copied in Finder counts as an image, and selecting several records up to 10 of them. The clipboard only holds their names and icons, so the watcher reads each file itself, up to 30 MB. Any format macOS can decode works, including JPEG, HEIC and GIF, and photos keep their rotation. Copying it back gives you the image, not the file. Conversion runs off the main thread, because that thread also answers hotkeys.

Copies are recorded one at a time, so two quick copies can't overwrite each other.

**What is never recorded.**

| Copied content                                           | How it's spotted                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Content marked confidential, temporary or auto-generated | The `org.nspasteboard.*` types and the legacy types listed at nspasteboard.org |
| Anything copied in Passwords or Keychain Access          | The frontmost app's bundle ID                                                  |
| Copied files that aren't a single image                  | A file URL on the clipboard, because the text would only be the file's name    |
| Content that is neither text nor an image                | No plain text or image data                                                    |
| Blank text, or text over 100,000 characters              | Checked in `addEntry()`                                                        |

A password manager has to mark its copies for this to work, and an app that doesn't will be recorded like any other.

**Storage.** `~/.config/medea/medea-clipboard-history.json` keeps entries for 3 months by default. Settings offers 3, 4 or 5 months or 1 year, with nothing unlimited, saved as `clipboardHistoryMonths` in `config.json`, and asks first if a shorter choice would delete anything. Old entries go on each copy and when the history opens. So heavy use can't fill the disk or slow every copy, history also stops at 5,000 entries, 20 million characters of text and 2 GB of images, dropping the oldest first. Images live in `~/.config/medea/medea-clipboard-history/` as `<hash>.png`. Images over 30 MB are skipped. Each save removes any image no entry mentions, so deleting an entry frees its files.

None of this is encrypted, and only your user can read it. Saving writes a temporary file and renames it, so a reader never sees half a file.

**Terminal safety.** Copied text can contain escape codes, so rows and menus strip control characters before showing it. The copy itself keeps the original text.

**Permissions.** macOS has a "Paste from Other Apps" privacy control that can ask before an app reads the clipboard. On macOS 26.6.2 `NSPasteboard.general.accessBehavior` reports `alwaysAllow` for the helper, so no prompt appears. A later macOS could change that.

Text is copied back with `pbcopy`. Images go through AppleScript's `set the clipboard`.

`pbcopy` and `pbpaste` garble non-English text when the locale is empty, as it can be for the helper, so both run with `LC_CTYPE=UTF-8`.

## Window actions

Rectangle-style window moves: halves, quarters, thirds, two-thirds, Maximize, Center, Restore Window, and Next and Previous Display. They appear in search with a `▣` icon and the kind `Window`, and aliases and hotkeys work as they do for anything else. It's written directly on Apple's Accessibility API, which is what Rectangle uses too, so nothing else needs to be installed.

**Where the code sits.** `src/medea-apps/medea-window/actions.ts` is the one list of actions, so adding a placement needs no Swift. A placement is four fractions of the display, like `place 0 0 0.5 1` for the left half. The helper only understands `place`, `center`, `restore` and `display`. Moving needs the helper because it holds the permission, and Restore needs a process that stays running to remember frames.

**Two ways in.**

| From   | Path                                                                                    | Moves                                     | A failure                     |
| ------ | --------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------- |
| Hotkey | `node src/start.js hotkeys` gives the helper the command up front, so Node never starts | The focused window                        | Beeps and writes `helper.log` |
| Search | `window <command>` over `.build/helper.sock`                                            | The window behind Medea, which then rises | Shows a red line above search |

**A front app with no windows.** Closing Medea closes its Terminal window, but Terminal stays the front app, while another app's window still looks active. A hotkey then finds nothing focused, so it moves the top window on screen and brings it forward, the same way search does.

**Finding the window from search.** Medea's own window is focused when you press Enter, so moving the focused window would move Medea. The helper walks the on-screen window list, which runs front to back and needs no permission, and takes the first window that isn't the focused one. Only Accessibility can move a window, so each entry is matched to an app's window by its frame. This keeps no state, so it works however Medea was opened, including from another window of the same terminal.

**Moving the window.**

- The display is the one holding most of the window. Its area leaves out the menu bar and Dock, and is converted from AppKit's bottom-left origin to Accessibility's top-left one.
- Size is set, then position, then size again. The first fits the window to where it's going, and the last undoes any limit macOS applied at the old position.
- `AXEnhancedUserInterface` is switched off during the move and back on after, because Chrome and Electron animate each step while it's on.
- Apps can refuse a size. Terminal snaps to its character grid, for example. A window against the right or bottom edge then moves back to that edge.
- Accessibility calls wait on the other app, so they run on their own queue with a half-second timeout, away from the thread that answers hotkeys.

**Restore.** The first move saves the window's frame. Further moves keep it, unless you've moved the window yourself since. It's held in memory, so restarting the helper forgets it.

**Default hotkeys.** `Window Hotkeys, Add Defaults` fills in Rectangle's layout, such as `⌃⌥←` and `⌃⌥U`, and skips anything already taken or set. macOS can't tell Medea when another app registers the same keys, so quit Rectangle first or both will act.

**Permission.** The helper needs Accessibility, not the CLI, so the CLI asks it over the socket. The Window actions row in Settings shows the state and opens the right page. macOS ties the grant to the binary's signature:

- An ad-hoc signature changes with every build, so a rebuilt helper can show as allowed in System Settings and still be refused. Remove it from the list and add it again.
- `pnpm menubar:sign` creates a `Medea Local Signing` certificate in the login keychain, once, and every build after that signs with it. It needs running by hand because it changes the keychain.
- A process started from a terminal may be counted as part of that terminal for this permission, and one started at login as itself. This hasn't been tested yet.

## Settings

The third Medea app. Search `Settings` for a list of toggles, where Enter flips the focused one. Esc or Done goes back to search.

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

When Medea ends, through the Exit command or **End program**, the window closes without asking. So does a window that quits because you changed terminal.

- Launcher scripts set `MEDEA_WINDOW=1`, and only those windows can close. Running `pnpm start` in your own terminal never closes it.
- The window is found while Node is alive and closed 0.6 seconds later, so Terminal doesn't ask about running processes.
- Only a `busy` tab can match. Terminal reuses tty names and dead windows keep them, so matching on the tty alone closes the wrong window.
- A window with several tabs is left open.

## Stopping

`pnpm menubar:stop`, or "Remove Menu Bar Item" in the search prompt, finds the helper with `pgrep` and sends it a kill signal. Exit in the menu makes the helper exit by itself. Either way, the icon and shortcut go away.

## Known limits

- The helper doesn't restart after a reboot. Run `pnpm menubar:start` again.
- The launcher contains the current Node path. If that path changes, run `pnpm menubar:stop`, then `pnpm menubar:start`.
- After Medea ends, the next press opens a new window.
- Raising a minimized window is untested.
