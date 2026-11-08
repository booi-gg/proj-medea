# How Redhot works

Redhot is a command-line launcher for macOS. It is made of two programs:

- **The CLI** (TypeScript and clack) shows the search prompt, and stays open until you exit it.
- **The helper** (a small Swift program) stays running. It owns the menu bar icon, the global shortcut and moving windows.

TypeScript can't call macOS AppKit directly, so anything that must stay alive in the background lives in the helper.

## Logs

The CLI and helper append one JSON object per line to `~/Library/Logs/Redhot/redhot.log`. Each record has a local timestamp, process IDs, a trace ID, and an action ID. Timed actions have `start` and `end` records; the latter includes duration and success. The helper passes `REDHOT_TRACE` to child CLI processes so one hotkey or copy can be followed across both programs. A terminal window opened through a `.command` script starts a new trace.

Logs contain action types, safe item IDs, byte counts, exit codes and error categories. They never contain search text, clipboard content, link targets, command arguments or command output. Use `node src/start.js logs`, `node src/start.js logs --follow`, or `node src/start.js logs --trace <id>` to read them.

Search for **Logs, Open Folder** in Redhot, or choose **Open Logs Folder** in the menu bar, to open the log files in Finder.

Settings offers a total log size of 10, 50, 100 or 500 MB, defaulting to 50 MB. Node rotates the active file at one tenth of the limit and deletes the oldest archives when needed. The Swift helper only appends; `.build/helper.log` is reserved for raw crash output.

```text
pnpm menubar:start
   └─ the CLI builds and starts the helper, then the CLI exits

redhot-status (keeps running)
   └─ owns the icon and the shortcut, waits for input

Open Redhot in the menu, or Cmd+Shift+Space
   ├─ CLI already open: the helper asks it over its socket, and it raises its own window
   └─ no CLI open: node src/start.js show
        └─ start open-redhot.command in Terminal
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
├── log.ts                Writes metadata-only JSONL across Node processes
├── log-viewer.ts         Reads and follows log files
├── shell.ts              Shared command runner and shell quoting
├── socket.ts             Sends one request over a Unix socket
├── version.ts            Reads the name and version from package.json
├── update/
│   ├── update-check.ts   Asks npm for the latest version and compares it
│   ├── installer.ts      Picks npm, pnpm or Bun for an update
│   └── update-window.ts  Installs the update in its own window
├── launcher/
│   ├── launcher.ts       The search loop and its list of items
│   ├── prompt.ts         Draws the search bar and reads keys
│   ├── pager.ts          Shows long text in less
│   ├── screen.ts         Clears the window and draws the logo
│   ├── split-view.ts     Lays out a list beside a preview
│   ├── item-settings.ts  The settings screen for one app or command
│   ├── aliases.ts        Parses, checks and saves aliases
│   ├── hotkeys.ts        Parses, checks and saves hotkeys
│   ├── hotkey-recorder.ts Runs the native recorder window
│   ├── hotkey-list.ts    The list of hotkeys you can run and edit from
│   ├── banner.ts         The REDHOT logo
│   ├── search.ts         Ranks results with match-sorter
│   └── apps.ts           Finds installed apps and opens them
├── redhot-apps/
│   ├── types.ts          What an app gives the launcher
│   ├── icon.ts           Gives Redhot's own items their reserved icon colour
│   ├── registry.ts       The list of installed apps
│   ├── answer-item.ts    Builds a row that copies something worked out from what was typed
│   ├── redhot-units/
│   │   ├── index.ts      The answer row shown in search
│   │   └── units.ts      The table of units and the conversion
│   ├── redhot-time/
│   │   ├── index.ts      The answer rows shown in search
│   │   ├── zones.ts      City and abbreviation names, and converting between zones
│   │   └── dates.ts      Reads date phrases and does the sums
│   ├── redhot-calculator/
│   │   ├── index.ts      The answer row shown in search
│   │   └── calculate.ts  Parses and works out a sum
│   ├── redhot-currency/
│   │   ├── index.ts      Conversion answers and target suggestions
│   │   ├── convert.ts    Parses input and converts through USD
│   │   └── rates.ts      Reads and refreshes the local rates file
│   ├── redhot-files/
│   │   ├── index.ts      The Search Files command and the f prefix
│   │   ├── screen.ts     The search list, its keys and actions, shared with Search Folders
│   │   ├── search.ts     Runs mdfind, filters and ranks what it finds
│   │   └── format.ts     Row text: the name beside its shortened folder
│   ├── redhot-folders/
│   │   ├── index.ts      The Search Folders command and what counts as a folder result
│   │   └── places.ts     Finder's usual places, like Downloads and Recents
│   ├── redhot-projects/
│   │   ├── index.ts      The list of editors, and the search rows
│   │   └── sources.ts    Reads each editor's recent projects from disk
│   ├── redhot-bookmarks/
│   │   ├── index.ts      The list of browsers, and the search rows
│   │   └── sources.ts    Reads a browser's bookmarks from each of its profiles
│   ├── redhot-processes/
│   │   ├── index.ts      The Kill Process or Port command
│   │   ├── screen.ts     The list, its keys and the questions before stopping something
│   │   ├── search.ts     The full list, or a port's listeners, for what's typed
│   │   ├── list.ts       Runs ps and lsof, and works out which processes are apps
│   │   ├── stop.ts       Quits, force quits and uses sudo
│   │   └── format.ts     Row text: name, owner or kind, process ID, CPU and memory
│   ├── redhot-timer/
│   │   ├── index.ts      The timer row, Pomodoro and Cancel, and asking the helper to run them
│   │   └── duration.ts   Reads a length like 1h 30m and says one in words, with no system calls
│   ├── redhot-dictionary/
│   │   ├── index.ts      The define row, and running the native lookup
│   │   └── definition.ts Lays out a definition's senses and wraps them, with no system calls
│   ├── redhot-colour-picker/
│   │   ├── index.ts      Search items, and running the native sampler
│   │   ├── colour.ts     Hex, RGB and HSL text, and swatches, with no system calls
│   │   ├── history.ts    Reads and saves redhot-colour-history.json
│   │   └── screen.ts     The format and history lists
│   ├── redhot-clipboard-history/
│   │   ├── index.ts      The history list and its actions
│   │   ├── store.ts      Reads and saves history and image files
│   │   ├── format.ts     Row text, previews, ages and sizes
│   │   ├── syntax.ts     Colours code, and leaves other text alone
│   │   └── image-window.ts Runs the native window that shows images
│   ├── redhot-emoji/
│   │   ├── index.ts      The search screen, copying and pasting
│   │   ├── catalog.ts    Reads the bundled list, ranks it and puts recent picks first
│   │   ├── recents.ts    Reads and saves redhot-emoji-recents.json
│   │   └── data.ts       Generated by scripts/build-emoji-data.ts
│   ├── redhot-hotkeys/
│   │   └── index.ts      The Hotkeys, Show All command
│   ├── redhot-menu-items/
│   │   ├── index.ts      The Search Menu Items command and its list
│   │   ├── menu.ts       Asks the helper for the menus, and to press an item
│   │   └── format.ts     Row text, shortcuts and ranking, with no system calls
│   ├── redhot-logs/
│   │   └── index.ts      Opens the log files in Finder
│   ├── redhot-scripts/
│   │   ├── index.ts      Search items, argument prompts, output and the create command
│   │   ├── parse.ts      Reads @redhot headers
│   │   ├── store.ts      Finds scripts in the folder, re-reading only changed files
│   │   └── run.ts        Runs a script and cleans up its output
│   ├── redhot-settings/
│   │   └── index.ts      The Settings screen
│   ├── redhot-snippets/
│   │   ├── index.ts      Search items, settings actions and telling the helper about changes
│   │   ├── store.ts      Reads and saves redhot-snippets.json, and checks keywords
│   │   ├── placeholders.ts Fills {date}, {time}, {clipboard} and {cursor} for a copy
│   │   └── form.ts       The create and edit prompts
│   ├── redhot-system/
│   │   ├── index.ts      Search items and the question before Restart, Shut Down and Log Out
│   │   ├── commands.ts   The system commands and what each one runs
│   │   └── battery.ts    Turns macOS's battery readings into one line
│   ├── redhot-web-search/
│   │   ├── index.ts      The fallback row and the row for an alias followed by text
│   │   ├── alias-search.ts Works out which quicklink an alias and text would fill
│   │   ├── engines.ts    Fallback engines and the ready-made search quicklinks
│   │   └── settings.ts   The Web search menu in Settings
│   ├── redhot-window/
│   │   ├── index.ts      Search items and failure messages
│   │   └── actions.ts    The window actions and their default hotkeys
│   └── redhot-quicklinks/
│       ├── index.ts      Search items and settings actions
│       ├── store.ts      Reads and saves quicklinks.json
│       ├── placeholders.ts Finds and fills {argument} and {clipboard}
│       ├── open-link.ts  Checks links and opens them
│       └── form.ts       The create, edit and argument prompts
├── menubar/
│   ├── notice.ts         Shows Redhot's notification from anywhere
│   ├── helper.ts         Builds, starts and stops the Swift helper
│   ├── helper-socket.ts  Talks to the running helper over its socket
│   ├── signing.ts        Signs the helper so permissions survive a rebuild
│   ├── login-item.ts     Turns Start at login on and off
│   └── commands.ts       The start, stop and status commands
└── terminals/
    ├── terminals.ts      Lists terminals, saves the choice, launches each one
    ├── running-cli.ts    Talks to a running CLI over its socket
    ├── launcher-script.ts Writes the scripts terminals open
    ├── terminal-profile.ts Writes the Terminal profile that opens them without a shell
    ├── close-window.ts   Closes a finished Terminal window
    └── actions.ts        Shows the CLI, changes terminal, opens item windows
native/
├── main.swift            The helper's startup code
├── StatusItem.swift      Menu bar icon, menu, global shortcuts and clipboard watcher
├── Log.swift             Appends helper actions to the shared log
├── HelperSocket.swift    Answers requests from the CLI
├── WindowManager.swift   Finds and moves windows through the Accessibility API
├── WindowGeometry.swift  Works out frames, with no system calls
├── SnippetMatcher.swift  Finds a typed keyword and fills placeholders, with no system calls
├── SnippetExpander.swift Watches the keyboard and replaces a keyword with its snippet
├── PasteBack.swift       Remembers the previous app and presses a shortcut in it
├── MenuSearch.swift      Reads the previous app's menus and presses an item
├── Countdown.swift       Runs the one timer and reports the time left
├── HotkeyRecorder.swift  The window that records a hotkey
├── ColourSampler.swift   Shows the macOS magnifier and prints the colour picked
├── DictionaryLookup.swift Prints a word's definition from the macOS dictionaries
└── ImagePreview.swift    The floating window that shows clipboard images
doc/                      These docs
.build/                   Generated: helper binary, launcher script, logs, socket, compile cache
dist/                     Generated by `pnpm build`: the JavaScript that npm publishes
```

`.build/` is where a checkout builds. An installed copy (anything under `node_modules`) uses `~/Library/Application Support/Redhot/` instead, because its own folder may be root-owned and npm replaces it on every upgrade. The two never share a helper, socket or binary, so both can run at once, and the checkout's menu bar item says "dev". Each binary has a `.sha256` file beside it naming the sources it was built from. Redhot rebuilds when that hash changes rather than comparing file times, because npm dates every published file 1985.

## Commands

```sh
pnpm start            # open the search prompt
pnpm menubar:start    # start the helper
pnpm menubar:stop     # stop the helper
pnpm menubar:restart  # stop, then start the current build
pnpm menubar:status   # check whether it is running
pnpm menubar:sign     # one-time: keep Accessibility permission across rebuilds
node src/start.js logs                 # read all logs
node src/start.js logs --follow        # watch new entries
node src/start.js logs --trace <id>   # one trigger across processes
pnpm test             # run unit tests
pnpm typecheck
pnpm check            # format and lint
```

## Starting the helper

`pnpm menubar:start` calls `startMenuBar()` in `src/menubar/helper.ts`:

1. `pgrep` looks for a running helper. If there is one, nothing else happens, so you never get two icons.
2. `swiftc` compiles the helper's files to `.build/redhot-status`, then signs it if the local signing identity exists. Compiling is skipped if the binary's `.sha256` file matches the sources. `swiftc` only allows top-level code in a file called `main.swift`, so startup code lives there.
3. It writes `.build/open-redhot.command`, a script that goes to the project folder and runs `node src/start.js`.
4. It starts the helper with `detached: true`, then `unref()`, so the CLI can exit while the helper keeps running. Raw crash output goes to `.build/helper.log`; structured actions go to `~/Library/Logs/Redhot/`.

If the helper is already running, `start` does nothing, even if the Swift file changed. After editing Swift, run `pnpm menubar:restart`, which stops the helper, waits for it to exit, then starts it.

## Inside the helper

1. `setActivationPolicy(.accessory)` hides it from the Dock.
2. `NSStatusBar.system.statusItem(...)` asks macOS for a menu bar slot. On macOS 26, Control Centre hosts the actual window, so window lists show Control Centre as the owner, not the helper.
3. `GlobalHotKey` registers `Cmd+Shift+Space` with Carbon's `RegisterEventHotKey`. The result is written to the structured log, where status `0` means success.
4. `app.run()` starts the event loop. The helper must stay alive: if it exits, the icon and shortcut go with it.

No `.app` bundle or `Info.plist` is needed. The helper runs as a bare binary, ad-hoc signed until `pnpm menubar:sign` has been run.

## The menu

Left or right clicking the icon opens a menu.

| Item               | What it does                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Open Redhot        | Asks the open CLI over `.build/cli.sock`, or runs `node src/start.js show` if none answers                                            |
| Open Logs Folder   | Opens `~/Library/Logs/Redhot/` in Finder                                                                                              |
| Cancel Timer       | Stops the running timer. Only there while one is running                                                                              |
| Check for Updates… | Runs `update-status --now` and answers in an alert. It reads **Update to 0.x.y…** when a newer version is out, and then runs `update` |
| Exit               | Quits the helper, which removes the icon and the shortcut                                                                             |

## Updating

An installed copy checks npm for a newer version and can install it. A checkout, the "dev" item, only checks when you choose **Check for Updates…**, and its alert says to pull with git instead of offering to install.

- `redhot update-status` prints `{ current, latest, updateAvailable }`. It asks `https://registry.npmjs.org/@booi-gg/redhot/latest` with a 5 second timeout and saves the answer in `update-check.json` in the build folder. Automatic checks reuse an answer for a day, stay quiet when npm can't be reached and skip npm entirely when **Check for updates** is off in Settings. `--now` always asks npm and fails loudly.
- The helper runs `update-status` at startup and every hour, which reaches npm at most once a day, and renames its menu item to **Update to 0.x.y…** when a newer version is out.
- `redhot update` opens a Redhot window, like an item window, with a note to run `update-in-window`, which shows the banner and a spinner while it installs.
- The package manager comes from where Redhot is installed, in `src/update/installer.ts`: a `.pnpm` or `pnpm/global` folder means pnpm, `.bun` means Bun, and anything else npm, preferring the npm beside the Node running Redhot.
- The install replaces the running copy's files, so the window loads everything it needs first. It then quits an open search window, which still runs the old code, and runs `restart` from the new copy, which rebuilds the helper from the new Swift sources. pnpm keeps each version in its own folder, so the new copy is found with `pnpm root --global`.
- On success the window closes after a moment. On failure it shows the last lines of the installer's output and the command to run by hand, and closes on a key press.

## Notifications

Anything that happens with no window to show it in uses one notification. In TypeScript that's `showNotice({ title, message, isError })` in `src/menubar/notice.ts`. In Swift it's `NoticePanel.shared.show(...)`.

- macOS shows a notification with the icon of the app that sent it, and the helper is a bare binary with no icon. So `native/NoticePanel.swift` draws its own panel with the logo: top right, under the menu bar, on the screen the pointer is on. It needs no permission.
- The CLI sends `notice <base64 JSON>` over the helper's socket, because the socket reads one line. Text is cut to fit and stripped of escape codes first.
- It fades out after 3.5 seconds, or 6 for an error, and a click dismisses it. A finished timer's stays until clicked, because you may be looking away when it ends. A new one replaces the one on screen. It's announced to VoiceOver and skips the fade under Reduce Motion.
- `runCommandItem()` shows the result or failure of anything a hotkey runs with no window, so an item only has to return its line or throw. Window hotkeys run inside the helper and call the panel directly.
- If the helper isn't running, `showNotice` falls back to a macOS notification, which shows Script Editor's icon. The panel doesn't follow Do Not Disturb, because macOS has no public way to read it.

## Opening in Terminal

Redhot opens only in macOS's own Terminal, in `src/terminals/terminals.ts`. Other terminals start programs differently, and each would need its own tested recipe.

- **Open:** `open -a Terminal Redhot.terminal`, a profile that runs the launcher with no shell. It falls back to `open -a Terminal <launcher>`. No permission is needed.
- **Bring back:** the CLI raises its own window with an escape sequence, then runs `open -a Terminal`.

**Terminal's profile.** Opening a `.command` file starts a login shell, which prints `Last login` and types the launcher's path before Redhot can clear the screen. So the search window opens from a `Redhot.terminal` profile instead, written by `writeTerminalProfile()`. It sets `RunCommandAsShell`, which makes the launcher the window's only process, and an 80×18 window. Terminal names the profile after the file and saves it, so a "Redhot" profile appears in Terminal's settings after the first window. Terminal splits the profile's command at every space and ignores quotes, so `toTerminalCommand()` runs the launcher through `/bin/zsh -fc $'...'` with every unsafe byte of the path written as `\xHH`: the installed launcher lives in `Application Support`. Terminal saves a copy, "Redhot 1", whenever the opened file differs from the saved profile of the same name, so a checkout uses a "Redhot Dev" profile and never fights the installed copy. A saved profile still goes out of date after an upgrade or a change to the default profile, and from then on every window would add a copy. So `repairTerminalProfiles()` runs beside search in each Redhot window: a window on a numbered copy deletes the old profile and takes its name, and copies no window uses are deleted. A profile in use or set as the default is never touched. Redhot runs inside Terminal, so this AppleScript needs no permission.

**The title bar.** Terminal adds the running program and its arguments after a window's title, which would show the launcher's long path. The profile turns those parts off with the `Show…InTitle` keys and sets `WindowTitle` to Redhot, so the title is only what Redhot sets.

- The file is a copy of the default profile, so the window keeps the person's colours and font.
- Terminal saves a second profile, "Redhot 1", whenever an opened file differs from the saved Redhot profile. So the file comes out the same every time, and editing the Redhot profile in Terminal's settings would only make copies. The saved profile is never read back, because Terminal writes its settings late and it can be out of date.
- Every Redhot window runs the same launcher, because a profile's command has to stay the same or Terminal saves a copy. A hotkey for an item that needs input leaves a note in `pending-windows/` in the build folder (`requestWindow()`), then opens a window, and the new window takes the note when it starts with `REDHOT_WINDOW=1` and no arguments. A window takes each note once, and a note older than 15 seconds is thrown away.
- The file is written on every open, which takes about 30 ms. If Terminal's settings can't be read, a minimal profile is written instead, and if that fails, the `.command` file is opened as before.

To add a terminal, add a recipe to `launchers` and test both open and bring back.

## Showing the CLI

The menu and the shortcut both start in the helper, so bringing back an open CLI doesn't wait for Node to start:

1. `focusRunningCli()` in `native/StatusItem.swift` connects to `.build/cli.sock` and sends `focus`. A dead CLI refuses the connection, even if the socket file was left behind, so there is no stale state to clean up. It gives up after one second.
2. **If a CLI answers,** it raises its own window and runs the terminal's recipe to bring it back. The recipes stay in TypeScript, so the helper never needs to know which terminal is chosen.
3. **If nothing answers,** the helper runs `node src/start.js show`. `showCli()` in `src/terminals/actions.ts` tries the socket once more, then the recipe opens `.build/open-redhot.command`. The launcher uses an absolute Node path because a terminal's `PATH` can differ from your shell's. It clears the window first, because terminals type the launch command into a shell and that line would otherwise stay above Redhot.

The CLI has to stay open for this to work, so `runLauncher()` loops: after an action it clears the screen and shows search again. The Exit command ends the loop. Esc at search asks first: **End program** ends it, and **Cancel** or a second Esc goes back to search.

**Keeping a search.** A row made from what was typed (calculator, currency, web search, an alias and text) passes `keptSearch` to the next round, so the text and focused row come back. Apps and commands still start empty. The shortcut leaves a kept search alone, so coming back from the browser finds it where it was. Esc on one starts a new search rather than asking to end Redhot.

If you open a second CLI, such as `pnpm start` in another terminal, the newest one takes over the socket.

## Starting quickly

The helper starts the CLI on every copy and on most hotkeys, so start time matters. A bare Node process takes about 20 ms, and three things keep the CLI close to that:

- **Per-command imports.** `src/index.ts` imports what each command needs inside that command. A static import at the top would load every Redhot app for every copy. `src/terminals/actions.ts` and `src/terminals/close-window.ts` load the registry and clack late for the same reason.
- **The compile cache.** `src/start.js` turns on Node's compile cache in `.build/compile-cache`, which keeps the stripped TypeScript and compiled code. Editing a file updates its entry, so there is nothing to clear. `start.js` stays plain JavaScript because the first `.ts` file makes Node set up type stripping, which costs about 20 ms, and a cached start skips that.
- **An early cache save.** Node saves the cache on a clean exit, and closing a window isn't one. So the search window calls `flushCompileCache()` once its code has loaded.

## The search prompt

The window starts with the screen cleared, the REDHOT logo from `src/launcher/banner.ts`, a two-row block wordmark that fades from mild red on the left to hot red on the right, and a bare search bar. The logo is drawn once per round, outside the prompt, so typing never redraws it. In windows under 25 columns it falls back to the plain name. Results appear once you type and go away if you delete everything. Pressing Enter with nothing typed does nothing.

`promptForSelection()` in `src/launcher/prompt.ts` uses `AutocompletePrompt` from `@clack/core`, not `autocomplete` from `@clack/prompts`, because the higher-level prompt always draws its header and footer. `@clack/core` is pinned to the version `@clack/prompts` uses.

`runSearchRound()` in `src/launcher/launcher.ts` builds one list: the built-in commands, then the apps.

**Finding apps.** `listApps()` reads `/Applications`, `/System/Applications` and `~/Applications`, two folders deep, plus Finder. It doesn't use Spotlight, because Spotlight's results depend on its index: it missed `News.app`. VS Code also went missing from one CLI's list shortly after its Spotlight record changed, though that cause was never proven. Bundles are never opened, so helper apps inside them stay out.

**Ranking.** `rankItems()` uses the [match-sorter](https://github.com/kentcdodds/match-sorter) library: exact match, then prefix, word start, substring, initials, and finally letters in order. Items that match equally well keep their alphabetical order. It was chosen by comparing fuzzysort, fzf, match-sorter and fuse.js on the real app list.

**Rows.** Each row shows an icon, the name and a faded kind: `◆` Application or `⌘` Command. The label contains colour codes, so search uses the plain `name` field instead. Red icons are reserved for Redhot's own apps and commands, and `toRedhotIcon()` is the only place that sets it.

**Calculator.** Typing a sum like `2 * 4` puts `2 * 4 = 8` at the top of the results, and Enter or Tab copies the `8`. It takes `+ - * / % ^`, brackets and decimals, with `%` as the remainder. A bracket touching a value multiplies it, so `4(4)` is `16`, at the same level as `*` and `/`, which makes `8 / 2(2)` come to `8`. `calculate()` parses the text by hand, so search text never runs as code. A lone number isn't a sum, and neither is an unfinished one like `2 *`, so these stay ordinary searches. Neither is an answer that isn't a number, like `1 / 0`. The row comes from the search text, so it has no aliases, hotkey or settings.

**Currency conversion.** Type `356 USD to INR` or `356 INR in USD` to see a conversion at the top of search. Target suggestions appear after `to` and narrow as you type: `356 INR to SD` suggests matching codes, with USD first. Enter or Tab copies the rounded number for the selected target. Literal symbols work too, including `$356 to INR`, `356₹ to $`, `€`, `£`, `¥` and `₩`; `$` means USD and `¥` means JPY. Unknown currency codes leave normal search results alone.

**Units.** `5 km in miles`, `72 f to c` and `2 GB in MB` use a table of sizes in `units.ts`, with temperature as a special case. Both units must measure the same thing. KB and GB are decimal, as Finder counts them, and KiB and GiB are binary. `mb` means megabytes as people usually type it, and only `Mb` with that exact capitalisation means megabits. Enter copies only the number. A unit conversion replaces any currency row, because `5 miles to km` has the same shape as one.

**Time zones.** `3pm PST in Tokyo`, `3pm in Tokyo` and `time in London` use `Intl.DateTimeFormat`, so no library is loaded. `zones.ts` maps about 90 cities and the common abbreviations to zones. An abbreviation means the place, so `PST` follows Los Angeles through daylight saving. The time is taken as today in the source place, and the row names the day when the other place is on a different one. `CST` means US Central and `IST` means India, the most likely readings.

**Dates.** `days until dec 25`, `days since jan 1`, `today + 90 days`, `90 days from now` and `3 weeks ago` are read by a small parser in `dates.ts`. Dates are kept as midnight UTC on the calendar day, so daylight saving can't throw a count off by one. A date with no year means the next one when counting up to it, and the last one when counting since it.

The search arrow changes from white to Redhot's red when the query is any of these answers, including a partial currency target such as `350 usd to`.

The search path reads `~/.config/redhot/redhot-currency-rates.json` synchronously and never makes a network call. When a search window opens, Redhot refreshes rates older than a day in the background from Frankfurter v2's fixed USD endpoint. The file is replaced atomically after a valid response, so a failed request leaves old rates usable. The row shows the date of each rate used, which can differ between currencies. These are daily reference rates, not live or bank exchange rates. On first use, a conversion query explains that rates are still unavailable until a download finishes; another keystroke updates the search results.

**Four clack details matter here. Recheck them when upgrading clack:**

- Clack runs its own filter even on dynamic options, and that filter would hide matches like `vsc`. The prompt passes a filter that lets everything through, so `rankItems()` alone decides.
- Clack keeps focus on an item for as long as it stays in the results. The `options()` getter clears focus whenever the typed text changes, so Enter always picks the top result. This sets clack's `focusedValue` field directly.
- Clack draws the text cursor at the focused result's index, not at its place in the text, so the arrow keys seem to do nothing. `SearchPrompt` overrides `userInputWithCursor` to read the real position from clack's protected `_cursor` field.
- Clack crashes if a redraw has fewer lines than it expects. `BLANK_FRAME` keeps the same line count as the search bar when the prompt finishes.

## Aliases and item settings

Any app or command can have aliases, shown next to its name: `Visual Studio Code [code] [ide]`. They're searched like the name, so `code` or a partial `cod` finds it. You still press Enter to run it.

Aliases are stored in `~/.config/redhot/config.json`, keyed by app path or command ID:

```json
{
  "aliases": {
    "/Applications/Visual Studio Code.app": ["code", "ide"],
    "command:exit": ["q"]
  }
}
```

`updateConfig()` merges changes, so saving a terminal can't wipe aliases, or the other way round. Each item can have up to two aliases of up to 8 characters, so a row stays inside its title column. Aliases are lowercase with no spaces. Several items can share one, and typing it lists them all. These limits apply when saving in settings, so a hand-edited config can go over them.

**Opening settings.** Tab on a result opens that item's settings in the search window, and Done or Esc goes back to search. The `Alias, Add` and `Hotkey, Create` commands do the same after you pick an item. An error in settings shows above the search bar instead of closing Redhot.

Search reads aliases on every keystroke, so a new alias works as soon as you're back in search.

**Reading keys.** `readKeysInto()` in `prompt.ts` reads raw bytes before clack does, because Node can't parse Shift+Enter and would type junk into the search bar. A settings key is forwarded as a normal Enter, with a flag saying settings were asked for.

Terminal sends the same bytes for Shift+Enter and Enter, so Tab is the settings key, and the footer says so. The Shift+Enter codes other terminals send are still read, so running `redhot` in one of them never types junk into the search bar. `stdin` has to be resumed for each prompt: a paused stream stays paused when a listener is added, and the process would exit with code 13.

## Hotkeys

Search rows show a hotkey next to the name: `Calculator [calc] ⌃⌥9`. Any app or command can have one.

Settings is a menu: **Alias, Add**, **Hotkey, Create**, **Remove hotkey** (when one is set) and **Done**. Each change saves straight away.

**Recording.** `Hotkey, Create` opens a small native window, `native/HotkeyRecorder.swift`, which shows the keys live as you press them. A terminal can't do this, because macOS and the terminal app take combos like `Cmd+Shift+K` first. A focused window receives them directly, so it needs no permission. It's a separate binary, `.build/redhot-record`, so `pgrep` for the helper can't match it.

- The recorder prints the combo as JSON and exits. `parseRecording()` turns that into a saved hotkey.
- Esc, clicking away or 60 seconds cancels it.
- A key with no modifier doesn't end the recording. The window asks you to hold a modifier.

**Registering.**

1. Saving writes `hotkeys` to `~/.config/redhot/config.json`, keyed by item, in a fixed form such as `shift+cmd+k`.
2. The CLI sends the running helper `SIGUSR1`, so the hotkey works with no restart.
3. The helper runs `node src/start.js hotkeys`, which turns saved hotkeys into Carbon key codes and flags, and registers them. `helper.log` records each result, where status `0` means success.

**Pressing a hotkey.** An item saved as a path is an app, and opens directly through `open <path>` without starting Node. A window action also runs in the helper. Anything else runs `node src/start.js run <value>`:

| Command                       | Hotkey does                                                |
| ----------------------------- | ---------------------------------------------------------- |
| Exit                          | Quits the open search window                               |
| Alias, Add                    | Opens Redhot                                               |
| Hotkey, Create                | Opens Redhot                                               |
| Remove "Redhot" from Menu Bar | Stops the helper, which also ends all hotkeys              |
| Quicklink, Create             | Shows the form in the Redhot window                        |
| Clipboard                     | Shows the list in the Redhot window                        |
| Search Files                  | Shows the search in the Redhot window                      |
| Search Folders                | Shows the search in the Redhot window                      |
| Search Menu Items             | Shows the search in the Redhot window                      |
| Kill Process or Port          | Shows the list in the Redhot window                        |
| Restart, Shut Down            | Asks in the Redhot window first                            |
| Log Out                       | Asks in the Redhot window first                            |
| A quicklink                   | Opens it, through the Redhot window if it has `{argument}` |

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

A hotkey needs at least two modifiers, including `cmd` or `ctrl`, so it can't take over something like `cmd+q`. Duplicates and Redhot's own `cmd+shift+space` are refused.
**Warnings for shortcuts already in use.** macOS has no way to list other apps' hotkeys: Apple's header says it's "not an error to register the same hotkey in multiple processes", and the exclusive flag only clashes with other exclusive hotkeys. Pausing system shortcuts while recording needs Accessibility permission. So Redhot reads the symptoms instead:

| What happens                                                                     | Warning                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| Modifiers go down and up, but no key arrives, because something else took it     | The recorder says so and stays open      |
| Focus leaves the recorder while keys are held, because another app reacted       | The terminal warns, and nothing is saved |
| The key arrives and matches an enabled macOS shortcut from `CopySymbolicHotKeys` | The terminal asks "Use it anyway?"       |

A shortcut used by an app that only reacts while it's frontmost can't be seen, and it isn't a conflict either, because a global hotkey wins.

## Redhot apps

A Redhot app is a feature that adds its own items to search. It lives in `src/redhot-apps/<id>/` and is listed in `registry.ts`. Apps are built in for now, and loading them from a user folder could come later.

**Names.** Every built-in app has an ID starting with `redhot-`, like `redhot-quicklinks`. The ID is used for its folder, its storage file (`~/.config/redhot/<id>.json`) and its item values (`<id>:<item>`), so a third-party app can use any other name without clashing. `registry.test.ts` enforces this. Item values are saved in aliases and hotkeys, so changing an ID means migrating saved settings.

An app gives the launcher two things, defined in `types.ts`:

- `listItems()` returns its search items. It runs on every keystroke, so anything saved in another window shows straight away.
- `listSettingsActions(value)` returns extra rows for an item's settings menu.

An item with `needsWindow: true` asks for input, so its hotkey opens a new window running `node src/start.js run-in-window <value>`. That window closes when the item finishes.

## Quicklinks

The first Redhot app. `Quicklink, Create` asks for a name, a link and an optional app to open it with. Links appear in search with a `↗` icon, and aliases and hotkeys work as they do for apps. Tab opens settings, which add `Edit link` and `Delete link`.

Links are stored in `~/.config/redhot/redhot-quicklinks.json`:

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

The item value is `redhot-quicklinks:<id>`. The ID comes from the name when the link is created and never changes, so a rename keeps its alias and hotkey. Deleting a link also removes its alias and hotkey.

**Links.** A web URL, a deeplink like `spotify://...`, or a path starting with `/` or `~`. `github.com` is saved as `https://github.com`, and `localhost:3000` as `http://localhost:3000`.

**Placeholders.**

| Placeholder                           | Result                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| `{argument}`                          | Asks when the link opens. Each unnamed one is its own question   |
| `{argument name="query" default="x"}` | The same, and arguments with one name share one value            |
| `{}`                                  | Asks when the link opens, as an unnamed argument                 |
| `{query}`                             | Any word in braces is short for `{argument name="query"}`        |
| `{clipboard}`                         | The clipboard text, trimmed. Empty if nothing text-like is there |

A link can have up to 3 arguments. Values are percent-encoded when the link starts with a URL scheme, and left alone in paths and in a link that starts with a placeholder. Braces that hold anything else, like `{"a":1}`, stay in the link as written.

**Failures.** A link that can't open shows a red line above the search bar, and the window stays open. From a hotkey with no window, the failure shows as a [notification](#notifications). If `redhot-quicklinks.json` is broken, search shows no links and saving refuses to run, so a save can't overwrite links you could still fix.

## Web search

These rows aren't registered as a Redhot app. Like the calculator's answer, each comes from what's typed, so it has no saved value for an alias or hotkey to point at, and Tab does the same as Enter.

**The fallback.** `rankWithAnswers()` adds `toWebSearchItem()` only when there are no results and no answers other than a dictionary row, which can't know whether the word exists. With nothing else to show, it goes under a `No results` line, an option marked `isInert`, so focus starts there and it takes the down arrow and then Enter to search. An inert line shows no focus marker, and the prompt's `validate` refuses Enter on it, so a stray Enter can't send what was typed to a search engine. Tab is refused the same way. Loose matching finds something for most short text, so the row mostly appears for longer searches. The engine is `webSearchEngine` in `config.json`. It stays on each Mac, like log size and update checks, so it isn't synced.

**An alias and some text.** `findAliasSearch()` splits what's typed at the first space and looks for a quicklink with that alias and exactly one question. Named arguments that share a value count as one. It's an answer, so it goes above ordinary results, and the search arrow turns red to show it's active. When several quicklinks share an alias, the first in the file wins. The `f` and `port` prefixes are checked first, so an alias of `f` can't be used this way.

**Ready-made quicklinks.** Settings adds them as ordinary quicklinks, which can be edited, deleted and synced like any other. One already saved under the same name or link isn't offered. `addQuicklink()` resolves to the new ID so the alias can be saved against it.

## Snippets

`Snippet, Create` asks for a name, an optional keyword and the text, which can run over several lines. Snippets are stored in `~/.config/redhot/redhot-snippets.json` and appear in search with a `¶` icon. The item value is `redhot-snippets:<id>`, and aliases and hotkeys work as they do for quicklinks. Snippets stay on each Mac unless Snippets is turned on under What to Sync in iCloud Drive Sync, and an import makes the helper reload them.

**From search.** Enter fills the placeholders and copies the result. Like clipboard history, it doesn't paste, because Redhot's own window is in front. `Snippets, Show All` reuses the list behind `Hotkeys, Show All` (`runHotkeyList()`), sorted by name, with each keyword on its row and searchable through `searchTerms`. Enter copies, Tab opens settings, and the list stays open.

**Placeholders.** `{date}` is `yyyy-MM-dd` and `{time}` is `HH:mm`, both local. A fixed format is what lets TypeScript and Swift give the same answer. Each side has its own short version: the copy has to work with no helper running, and expansion can't wait for Node to start, because anything typed in that gap would land in the wrong place. They fill in one pass, so a `{date}` inside the copied text stays as it is. `{cursor}` is dropped from a copy.

**Expansion.** The helper reads the same JSON file at startup and when the CLI sends `snippets reload`.

1. `SnippetExpander` creates a `CGEventTap` only while a keyword exists and `AXIsProcessTrusted()` is true. It's rechecked every 5 seconds, so granting the permission needs no restart. It's also removed when the permission goes away, because a tap left behind can stop the keyboard working.
2. The tap runs on its own thread, so a busy main thread can't slow typing in every app. It's an active tap that changes nothing, because a listen-only one would need Input Monitoring too.
3. `SnippetMatcher` keeps only the last few characters, as many as the longest keyword needs. Backspace removes one. A click, an app switch, Cmd or Ctrl, and keys like the arrows, Return and Esc clear it, because whatever comes next may not be next to what came before.
4. When a keyword completes, the rest runs on a queue while typing is ignored: the keyword is deleted with backspaces, the snippet goes on the clipboard, Cmd+V is sent, and `{cursor}` is reached with left arrows, counted in the characters a person sees. After 300 ms the old clipboard goes back, unless something new was copied. Both clipboard writes carry `org.nspasteboard.TransientType`, so clipboard history records neither.

**Keywords.** They're matched exactly, as soon as the last character is typed. The form refuses one that starts another, because the shorter would always win. Every keyword must start with `;`, so ordinary typing can't set one off. The form enforces that, and `isExpandableKeyword()` in the helper ignores anything else, like a keyword edited in by hand or synced from an older Mac.

**The form.** It sends `snippets pause` while open, or retyping an existing keyword would expand it there. The pause runs out after 5 minutes, so a crashed CLI can't leave expansion off.

**Password fields.** While secure input is on, the tap sees no keys, and the matcher is cleared so nothing typed before can complete a keyword after. A field that only declares itself through Accessibility, with the `AXSecureTextField` subrole, is checked before anything is deleted. Either way it fails quietly. A terminal password prompt looks like normal typing unless Terminal's Secure Keyboard Entry is on.

**Privacy.** `snippet.expand` logs that it ran and how long it took. Typed text, keywords and snippet text are never logged.

**Limits.** Cmd+V and backspace are sent by US keyboard position, like hotkeys, so a layout such as Dvorak would need Cmd+V looked up.

## Emoji and symbols

**Hidden for now.** `redhot-emoji` isn't listed in `src/redhot-apps/registry.ts`, so none of this appears in search and the `Emoji Picker` system command is used instead. Listing it there brings it back, along with any aliases saved for it.

`Search Emoji & Symbols` is one search item with its own screen. The roughly 2,200 rows stay out of the main search so they can't crowd out apps, and `data.ts` is imported only when the screen opens, so it costs nothing at startup. `node scripts/build-emoji-data.ts` regenerates that file from Unicode's `emoji-test.txt` and CLDR's English annotations. Skin tone and hair variants are left out, and a short list in the script adds Mac keys like ⌘, which Unicode doesn't annotate.

Matching is by name or keyword and needs the text to appear whole, because the launcher's looser matching finds a word's letters scattered across unrelated names. Recent picks go first in the list handed to the ranking, so they lead an empty search and win ties. The last 24 are kept in `~/.config/redhot/redhot-emoji-recents.json`, on this Mac only.

**Enter** copies and the list stays open, unless the window was opened for this item alone.

**Ctrl+V** copies, then sends `paste-previous-app` to the helper. `PasteBack` tracks app activations, so when the request arrives the terminal holding Redhot is the current app and the one before it is the target. It makes that app frontmost through Accessibility and `NSRunningApplication.activate` together, because the second can be ignored when a background app asks, and the first reports success but does nothing for an app with no windows open. It waits up to a second for the switch and sends Cmd+V only once it has happened, so nothing lands in Redhot's own search bar. Only the helper can do this, as the permission belongs to it.

**Limits.** The paste goes to the last app that wasn't the terminal, so opening Redhot from another Terminal window pastes into whatever you used before Terminal. The pasted text stays on the clipboard and appears in clipboard history. Cmd+V is sent by US keyboard position, as it is for snippets.

## Script commands

Any executable in `~/.config/redhot/scripts/` with a `@redhot.title` comment near the top is a search item.

**Finding scripts.** `listScripts()` walks the folder three levels deep, skipping hidden files and `node_modules`. Search lists items on every keystroke, so it only stats each file and reads the first 16 KB again when the size or modified time changed. Headers are read from the first 100 lines, in `#`, `//`, `--`, `;` or `%` comments.

The item value is `redhot-scripts:script/<path in the folder>`, so renaming or moving the file loses its alias and hotkey. The `script/` prefix keeps a file called `create` from taking the create command's value.

**Scripts, Show All.** Reuses the list behind `Hotkeys, Show All` (`runHotkeyList()`), with its own placeholder and row, because script titles are longer and many icons are wide emoji. Enter runs a script, Tab opens its settings, and the list stays open between runs.

**Broken headers.** A file with a title but a bad mode or argument still shows, with the kind `Script ▲`. Running it shows what's wrong instead of running it, so a typo doesn't make the script silently disappear.

**Running.** `runScriptFile()` runs the file directly with `execFile`, so its `#!` line picks the language, with each answer as an argument and no shell in between. It runs in the script's folder, or `currentDirectoryPath`. The `PATH` gets Node's folder, `/opt/homebrew/bin` and `/usr/local/bin` added, because a Terminal window opened from Redhot's profile starts with the bare system `PATH`. Output is capped at 4 MB.

| Mode                          | In a window                                                                               | From a hotkey with no window    |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| `compact`, `silent`, `inline` | The last non-empty line of stdout, above the search bar                                   | The same line as a notification |
| `fullOutput`                  | stdout, then stderr, with colours kept and other escape codes removed, then a Back prompt | The last line as a notification |
| A failure                     | The last line of stderr, or of stdout, in red                                             | The same line as a notification |

`inline` scripts run when chosen. Refreshing them on a timer is still to do.

**When a window opens.** A hotkey opens a window when the script has arguments, uses `fullOutput` or sets `needsConfirmation`. Otherwise it runs straight from the helper.

**Start-up failures.** A file that isn't executable, has no `#!` line, or names a missing program in it gets a sentence saying how to fix it, rather than an error code.

**Privacy.** `script.run` logs the mode and the number of arguments. Never the answers, the output or the folder's contents.

## File search

Its own screen, so app search never waits on Spotlight. Typing `f` and a space in search closes the list and opens the screen with whatever followed the prefix. `Search Files` opens it empty. Aliases can't contain spaces, so the prefix can't shadow one.

**Asking Spotlight.** `createFileSearch()` waits 100 ms after the last keystroke, stops the previous `mdfind` and starts a new one. The query is raw, `kMDItemFSName == "*word*"cd` for each word, because `mdfind -name` reads text starting with a dash as an option and refuses to run. `-attr kMDItemLastUsedDate` adds each file's last use to the output, and `-0` separates entries with a null byte, so a line break in a name can't split one.

**Stopping early.** A common word can match tens of thousands of files and take seconds to read, so `mdfind` is stopped after 300 files that pass the filter or 5,000 read in total. Ranking only sees those files. It puts the exact name first, then the most recently used, then names that start with the text, then shorter paths. The list shows the top 50.

**What's left out.** Only the home folder, `/Applications` and `/Volumes` are searched. Inside those, any file in `node_modules`, `Library`, a hidden folder or a bundle like `.app` is dropped. iCloud Drive is inside `Library`, so `Library/Mobile Documents/` is let through. Only folders are checked, so a file like `.env` can still be found. Spotlight offers no way to exclude a path in the query, so this happens as results are read, which is why `node_modules` counts towards the 5,000.

**Results that arrive late.** Search options are normally worked out on a keystroke, but Spotlight answers afterwards. `watchOptions` hands the search a function that makes the prompt read its options again. Clack only re-reads them when the text changes, so `refreshOptions()` emits a throwaway text and then the real one, which keeps focus on the same result. While a new search runs, the old results stay listed, narrowed to what's now typed, so the list doesn't blank between keystrokes. The first batch and the finished list are the only updates, so rows don't jump about during a read.

**Keys.** Terminals don't pass Cmd, so reveal and copy are `Ctrl+R` and `Ctrl+P`, sent through `extraKeys`. They end the list through its abort signal and note the path when pressed, because the prompt clears its focus as it closes.

**After an action.** The list opens again with the same text and results, focus on the file just used (`initialFocus`) and any message or failure above it. A window a hotkey opened closes instead, so nothing is left behind the file: the launcher tells the item through `run({ closesWhenDone })`.

**Privacy.** `mdfind` is logged by program name only. Never the query or the results.

## Recent projects

**Off by default.** `recentProjects` in `config.json` turns this on, from **Show recent projects in search** in Settings. Until then `listItems` returns nothing and scans nothing. Like update checks, it stays on each Mac and isn't synced. Aliases and hotkeys saved for a project are kept while it's off, and work again when it's back on.

Each editor's recent projects are rows in the main search, up to 30 per editor, for editors that are installed. Enter runs `open -a <the editor> <project>`, so a project always opens in the app it came from. A folder used in two editors gets one row each, and the kind on the row names the editor and the parent folder, like `VS Code · personal`.

**Where the lists come from.**

- **VS Code and Cursor.** Each project has a folder under `User/workspaceStorage`, with its location in `workspace.json`. The date on `state.vscdb` beside it says when it was last used. VS Code 1.145 no longer has `history.recentlyOpenedPathsList` in its global database, which is where this used to be. Remote projects are skipped, because they have no local path to open.
- **Xcode.** Each project has a build folder under `~/Library/Developer/Xcode/DerivedData`, and its `info.plist` has `WorkspacePath`. Xcode's own recent list is in a place macOS blocks, and `IDERecentEditorDocuments` in its preferences lists files and not projects. So a project shows up once it's been built, and clearing DerivedData empties the list.

**Speed.** `listItems` runs on every keystroke, so a scan is kept for 30 seconds. Only the 100 most recently used folders are read, however long the history is. Projects that no longer exist are left out.

**Ranking.** Items marked `ranksAfterApps` come after apps in the list search ranks, so an app wins a tie and Enter on `Calendar` still opens Calendar. A project that matches better still comes first.

## Browser bookmarks

**Off by default.** `browserBookmarks` in `config.json` turns this on, from **Show browser bookmarks in search** in Settings. Until then `listItems` returns nothing and reads nothing. It stays on each Mac and isn't synced.

Bookmarks from Chrome, Arc, Brave and Edge are rows in the main search, for browsers that are installed. Enter runs `open -a <the browser> <url>`, so a bookmark opens in the browser it came from, in whichever of its profiles was last used. The kind on the row names the browser and the site, like `Chrome · github.com`.

**Where they come from.** Each profile folder (`Default` or `Profile N`) in the browser's data folder has a JSON file called `Bookmarks`. Guest and system profiles are skipped. A page saved in two profiles of one browser gets one row. Arc's sidebar is kept somewhere else, so only what's in its `Bookmarks` file shows up.

**What's left out.** Only `http` and `https` links are listed, so a `javascript:` bookmarklet can never be run from search. Safari isn't read, because `~/Library/Safari/Bookmarks.plist` needs Full Disk Access.

**Speed and width.** A scan is kept for 30 seconds, and each browser is capped at 2,000 bookmarks, because every row is rebuilt on each keystroke. Titles are cut to 44 columns so a row can't wrap, and search only sees the part that's kept.

**Ranking.** Bookmarks are marked `ranksAfterApps`, like projects.

## Dictionary

`define serendipity` adds a row to search, and Enter shows the definition. Rows are made on every keystroke and have to be ready at once, so the lookup waits for Enter. A user's own search alias called `define` keeps the higher row.

**Phrases.** `define` is one of a list, with `definition of`, `meaning of`, `what is`, `what's` and the two `the meaning of` forms. **Dictionary phrases** in Settings shows them as one comma-separated line, saved as `definePhrases` in `config.json`, and leaving it blank restores the defaults. It stays on each Mac, so it isn't synced. The longest phrase wins, so `what is the meaning of run` isn't read as `what is` and a long term. A term over four words gets no row, which leaves `what is the tallest mountain in asia` to web search. The row can't know whether the word exists, so when nothing else matches the web search row stays below it.

`.build/redhot-dictionary`, built from `native/DictionaryLookup.swift`, calls `DCSCopyTextDefinition` and prints the text, or nothing if there's no entry. It's a separate program so it doesn't need the menu bar item. macOS searches the dictionaries turned on in Dictionary.app, in that app's order, so turning on another language there adds it here. The whole term is looked up, so `define ice cream` works and `define asdf run` finds nothing. If nothing is found and the term starts with a, an or the, it's looked up again without that word, so `what is a noun` finds `noun` and `a priori` is still found as typed.

macOS returns a definition as one long paragraph, up to 21,000 characters for `run`. `definition.ts` splits it on what marks each part: the next number in the count for a sense, `•` for a sub-sense, and `PHRASES`, `PHRASAL VERBS`, `DERIVATIVES`, `ORIGIN` and `USAGE` for sections. Numbers only count in sequence and before the first section, so "weighs 3 tons" isn't read as sense 3. Dictionaries marked differently, like the Japanese ones, are wrapped without being split. The result is wrapped to the window, and shown in `less` through `src/launcher/pager.ts`, where `q` or the left arrow comes back to the search as you left it. The left arrow is bound with `LESSKEY_CONTENT`, which secure mode only accepts alongside `LESSSECURE_ALLOW=lesskey`. Clipboard's View full text doesn't bind it, because there it scrolls long lines back. Versions of `less` older than the one in macOS 26 may ignore the binding, and `q` still works.

## Timers

`timer 25m` adds a row to search, and Enter starts it. `duration.ts` also reads `1h 30m`, `90 seconds` and `1.5h`, and a bare `timer 25` means minutes. A length has to be from 1 second to 24 hours. `Pomodoro` is an ordinary item that starts 25 minutes, so it can have an alias or a hotkey, and `Timer, Cancel` stops whatever is running.

**The helper owns it.** The CLI sends `timer start <seconds> <base64 JSON>` over the helper's socket, with the notification to show at the end, and `native/Countdown.swift` does the rest, so a timer outlives the window that started it. Without the helper there's nowhere to run one, so the row says to add the menu bar item. There's one timer at a time. Starting another replaces it, and the notice above search says so.

**Counting.** It keeps the end as a date, not a count of ticks, so time asleep still counts and a timer that ended overnight notifies on waking. Each wake is timed to the next whole second, so the display doesn't skip one, and runs in the run loop's common modes so it doesn't stop while the menu is open.

**The title.** The menu bar item's title shows `24:59`, or `1:02:03` over an hour, after the logo and after "dev" in a checkout. Its digits are one width, so the item doesn't shift every second.

**The end.** It uses the helper's own notification panel, like everything else with no window, so it needs no bundle identifier or permission. That one stays until clicked.

## Menu item search

`Search Menu Items` is one search item with its own screen, like file search, because reading another app's menus has to wait on that app and search lists items on every keystroke.

**Which app.** The one `PasteBack` already remembers: when the request arrives the terminal holding Redhot is in front, so the app before it is the one you were using. A Terminal window can't be the target, because its menus would act on Redhot's own window. The screen's title names the app.

**Reading.** `menu-items list` makes `native/MenuSearch.swift` walk the menu bar on its own queue, skipping the Apple menu, which is macOS's and not the app's. Each item is read with `AXUIElementCopyMultipleAttributeValues`, and a typical app takes 60 to 250 ms. The read stops after 2.5 seconds or 5,000 items and says it only got part of the menus. The reply is one line of JSON. A submenu that an app fills in only when it's opened shows nothing.

**Rows.** Separators have no title and are skipped. The same path can come back twice, as section headings in the Window menu do, so `menu.ts` keeps one row per path and prefers an enabled copy. The shortcut stays as macOS reports it, and `format.ts` writes it out, with the `AXMenuItemCmdGlyph` number deciding keys like ⌫ and F5.

**Turned-off items stay listed.** An app in the background may not have updated its menus, so an item can read as disabled until the app is in front. Those rows are grey, and Enter still tries them. The check that counts is the one made after the app comes to the front.

**Matching.** Each word has to appear whole somewhere in the path, so `export pdf` finds `File → Export → PDF`. It's match-sorter once per word, with the item's own title ahead of the menus above it.

**Pressing.** `menu-items press <pid> <base64 JSON of the path>` brings the app to the front, follows the titles down from the menu bar and sends `AXPress`. The titles are followed afresh because apps rebuild menus at any time, and the process ID comes from the list, so switching apps while the list is open can't press an item of the same name in another app. An item that opens a dialog may not answer until the dialog closes, so running out of time counts as pressed. Tab does nothing, because a menu item has no settings and running Quit by accident would be worse.

**Privacy.** `menu-items.list` logs how many items were read and `menu-items.press` the result. Never the titles or the app's name.

## Folder search

`Search Folders` is its own command, with its own item value (`redhot-folders:search`), and runs the same screen as file search (`runSearchScreen()`). It has no prefix, so give it an alias or hotkey to reach it quickly.

**What's different from file search.** The Spotlight query adds `kMDItemContentType == "public.folder"`, which also leaves out app bundles. A result's own name is checked as well as the folders above it, or every project's `node_modules` and `.git` would be listed.

**Places.** Finder's usual places are pinned through `createFileSearch({ pinned })`. They're all listed before anything is typed, and those whose names match are listed above Spotlight's results, so `Downloads` shows at once and can't be crowded out. A place Spotlight also finds is listed once. A place the Mac doesn't have is left out when the screen opens.

**Recents.** Recents is a saved search, `myDocuments.cannedSearch` inside Finder.app, so it's only reachable as a place. It has no folder to reveal, copy or open in another app, so `hasRealPath()` hides those actions.

## Kill a process or port

`Kill Process or Port` (`redhot-processes:search`) lists what's running. Typing `port` and a number in search leaves for this screen the same way the `f` prefix leaves for file search (`createQueryExit()`). Only a number counts, so `port authority` stays an app search.

**The list.** `ps -axo pid=,user=,%cpu=,rss=,comm=` is read each time the list opens. A process is an app when its path ends in `<Name>.app/Contents/MacOS/<program>` and `<Name>` is in the app search list. It matches on the name because macOS runs Safari from a system volume, not `/Applications`. Helpers nested inside an app stay ordinary processes. Redhot leaves its own process out.

**Ports.** `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` finds the process IDs, then `ps -p` reads those processes, so a server started after the list opened still shows. The lookup waits 120 ms after a keystroke, and a slower answer for an earlier port is thrown away. `lsof` can't see what root is listening with unless it runs under `sudo`, so the empty text says that rather than calling the port free.

**Stopping.** Enter quits. An app gets `tell application … to quit` through `osascript`, with its name passed as an argument so nothing in it can be read as AppleScript. An app asking about unsaved work holds that call open, so it gives up after 2 seconds and says the app was asked. A process gets `SIGTERM`, and force quit is `SIGKILL`. Afterwards Redhot watches for up to 1.5 seconds so the notice says what really happened. A zombie counts as ended.

**Safety.** The list can be old by the time a key is pressed, so `ps` confirms the process ID still runs the same program before anything is signalled. Force quitting always asks, with No selected. So does anything owned by another user, which then runs `sudo -- /bin/kill` with the terminal attached so it can ask for a password.

## System commands

`src/redhot-apps/redhot-system/commands.ts` is the one list of commands, each with its own red symbol. They take the programs they run as an argument, so tests can check exactly what would run without restarting the Mac.

**Lock Screen.** `pmset displaysleepnow` only locks if the Mac is set to ask for a password immediately, so a lock command built on it could leave the screen open. The CLI sends `lock-screen` to the helper instead, which calls `SACLockScreenImmediate` from the private `login` framework (`native/ScreenLock.swift`). That needs no permission, unlike posting the `Ctrl+Cmd+Q` shortcut. It's looked up by name at run time, so if macOS ever removes it the command fails with a message. Without the helper the command says to add the menu bar item, rather than falling back to something that may not lock.

**The rest.** Sleep and Sleep Displays use `pmset`. Empty Trash and Eject All Disks tell Finder, and Toggle Dark Mode, Restart, Shut Down and Log Out tell System Events. Eject tries each disk separately, so one in use doesn't stop the others. Toggle Hidden Files treats a missing `AppleShowAllFiles` as off, because that's what macOS does, then restarts Finder so it reads the new value.

**Battery Info.** Reads `pmset -g batt` for the charge and time left, `pmset -g ac` for the charger's wattage, and `system_profiler -json SPPowerDataType` for cycles and maximum capacity. Only the first has to work, so a failed extra reading just shortens the line. `battery.ts` turns the output into that line. "AC attached" counts as plugged in but not charging, which is what macOS reports while it holds the charge at a limit.

**Emoji Picker.** Opens the macOS picker by having the helper press Ctrl+Cmd+Space. The picker types into whatever has focus, so from search `PasteBack` first brings back the app used before Redhot's window (`emoji-picker-previous-app`), the same way Ctrl+V does in `Search Emoji & Symbols`. A hotkey runs with no window, which the CLI sees as stdout not being a terminal, so the app in front is already the right one (`emoji-picker-front-app`). It needs the helper and Accessibility permission, and it stops working if that shortcut is turned off or changed in System Settings.

**Safety.** Restart, Shut Down and Log Out ask first, with No selected, so they set `needsWindow` and a hotkey opens a window to ask in.

## Colour picker

`Colour Picker` draws its screen, then runs `.build/redhot-colour-sampler`, built from `native/ColourSampler.swift`. That shows `NSColorSampler`, macOS's own magnifier, and prints `red green blue` in sRGB, or nothing when cancelled. It's a separate program and not part of the helper, because helper requests time out after 3 seconds and picking takes as long as you like. It also means no menu bar item is needed.

A picked colour goes into `~/.config/redhot/redhot-colour-history.json`, newest first, up to 12, on this Mac only. A list then offers Hex, RGB and HSL under a swatch, with Hex first, so one Enter copies it. Swatches use 24-bit colour when `COLORTERM` says the terminal has it, and otherwise the nearest of the 256-colour palette, because a terminal without 24-bit colour would misread that code. `Ctrl` + `P` leaves that list without copying and opens the magnifier again. `Colour History` lists past colours and leads to the same format list, without that key.

**Limit.** Redhot's window stays on screen while you pick, so it covers whatever is behind it.

## Clipboard history

The second Redhot app. `Clipboard` lists what you've copied, newest first, before you type anything. Typing filters by exact text, not loose letters, because loose matching on long text matches nearly everything. Enter copies the entry back and returns to search. Tab offers Copy, View full text or Open image, Delete and Delete all, and Delete all asks first.

**Pins.** `Ctrl+P` sets `pinned` on the focused entry, and pressing it again clears it. The key can't be a letter, because letters are search text. `pinnedFirst()` puts pins at the top when the list is drawn, not in the file, and ranking keeps that order among matches. Age-based expiry skips pins. Copying a pinned entry back records it again, so `addEntry()` carries the pin over to the new entry. The size limits below count pins first, so unpinned entries go before an old pin, and a pin is only lost if pins alone are over a limit. Delete all includes pins, because clearing history is often for privacy, and its question says how many.

Redhot only copies, and doesn't paste into the app you were using, because sending Cmd+V to another app needs Accessibility permission. After choosing an entry, switch back and paste.

**Preview.** The focused entry shows in a pane beside the list, built by `toSplitLayout()` and `joinColumns()` in `src/launcher/split-view.ts`. A window under 56 columns has no room, so it shows only the list.

- Text keeps its line breaks and indentation. Tabs show as four spaces, long lines wrap with `wrap-ansi`, and a note says how many lines don't fit. View full text opens the whole entry in `less`, and `q` comes back.
- Code gets syntax colours from `emphasize`, in the pane and in `less`. It guesses the language and gives a relevance score. Long code scores 5 or more. Short code scores as low as a sentence, so anything from 2 to 4 must also look like code: a line ending in `{`, `}` or `;`, a call like `foo(x)`, or an operator like `=>`. Colours go on after wrapping, so a break can't land inside a colour code.
- Images show at full quality in a floating window beside the terminal, which follows the list as you arrow through it. The pane only shows the size. `native/ImagePreview.swift` is a borderless panel that can't become the key or main window and ignores the mouse, so keys stay in the terminal even as new images appear. The CLI sends it `show <path>` or `hide` over stdin, and it exits when that pipe closes, so it can't outlive Redhot. It finds the terminal app through its parent processes, so it's right even if another app is in front by then, and it's only on screen while that app is in front. Switch to a browser and the image goes; switch back and it returns with whatever is selected. The left arrow closes the image you're on, and it comes back when you move away and return. Typing doesn't bring it back, because closing lasts until focus moves. While no image is open, the left arrow moves the cursor in the search bar as usual. The window can't take a click or a key itself, so the key has to go to the terminal. It finds the terminal's window through the window list, which needs no permission, and sits to the right, or the left if there's no room.

Images aren't drawn in the terminal, because a terminal can only draw characters. Chafa, through `chafa-wasm` and `static-chafa`, and `terminal-image` were all tried on real images. Even the best of them was too rough to count as seeing the image, and Terminal has no image protocol: on macOS 26.6.2 it ignores a Kitty graphics query.

`emphasize` loads when the screen opens, not at startup, because the CLI also starts on every copy.

**Staying current.** The list watches the history file and redraws as soon as anything is recorded, keeping what you've typed and the entry you're on. Without this, a screen left open would show an old list, because Redhot's window stays alive between uses.

The logo stays on this screen like every other, which leaves an 80×24 window 11 rows for the list. The panes grow with the window.

`string-width` measures rows, because characters like 日本 take two columns and a row that runs too long would wrap and break the screen.

**Recording.** The Swift helper checks the clipboard's change count every half second, which costs almost nothing, and only reads the content when it changes. So recording needs the helper running, and the CLI doesn't have to be open.

1. `ClipboardWatcher` in `native/StatusItem.swift` applies the privacy rules below.
2. The helper runs `node src/start.js record-clipboard` and sends the text through stdin, because anyone can read a process's arguments with `ps`. An image goes the same way as a PNG to `record-clipboard-image`, converted from TIFF if needed, with its name in the `REDHOT_IMAGE_NAME` environment variable.
3. `addEntry()` in `store.ts` puts it first. Copying the same thing again moves the old entry to the top, and images count as the same when their hash matches.

If the clipboard holds both text and an image, text wins, because apps like Excel also add a picture of the cells you copied. The exception is text that is only a web address, because a browser adds one to an image it copies.

Anything skipped is logged to `.build/helper.log` with its reason and clipboard type names, never its content, so a missing copy can be explained.

The list shows an image's file name when there is one, or `Image 293×409` when there isn't, and the pane shows the whole name. A file gives its own name. A browser's image takes the last part of its web address, from the HTML `<img src>`, then the copied URL or address text. A screenshot is only pixels, so it has no name. Names have control characters removed, because they end up on screen. Copying an image back out of Redhot leaves only pixels, so an entry keeps the name it already had.

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

**Storage.** `~/.config/redhot/redhot-clipboard-history.json` keeps entries for 3 months by default. Settings offers 3, 4 or 5 months or 1 year, with nothing unlimited, saved as `clipboardHistoryMonths` in `config.json`, and asks first if a shorter choice would delete anything. Old entries go on each copy and when the history opens. So heavy use can't fill the disk or slow every copy, history also stops at 5,000 entries, 20 million characters of text and 2 GB of images, dropping the oldest first. Images live in `~/.config/redhot/redhot-clipboard-history/` as `<hash>.png`. Images over 30 MB are skipped. Each save removes any image no entry mentions, so deleting an entry frees its files.

None of this is encrypted, and only your user can read it. Saving writes a temporary file and renames it, so a reader never sees half a file.

**Terminal safety.** Copied text can contain escape codes, so rows and menus strip control characters before showing it. The copy itself keeps the original text.

**Permissions.** macOS has a "Paste from Other Apps" privacy control that can ask before an app reads the clipboard. On macOS 26.6.2 `NSPasteboard.general.accessBehavior` reports `alwaysAllow` for the helper, so no prompt appears. A later macOS could change that.

Text is copied back with `pbcopy`. Images go through AppleScript's `set the clipboard`.

`pbcopy` and `pbpaste` garble non-English text when the locale is empty, as it can be for the helper, so both run with `LC_CTYPE=UTF-8`.

## Window actions

Rectangle-style window moves: halves, quarters, thirds, two-thirds, Maximize, Center, Restore Window, and Next and Previous Display. They appear in search with a `▣` icon and the kind `Window`, and aliases and hotkeys work as they do for anything else. It's written directly on Apple's Accessibility API, which is what Rectangle uses too, so nothing else needs to be installed.

**Where the code sits.** `src/redhot-apps/redhot-window/actions.ts` is the one list of actions, so adding a placement needs no Swift. A placement is four fractions of the display, like `place 0 0 0.5 1` for the left half. The helper only understands `place`, `center`, `restore` and `display`. Moving needs the helper because it holds the permission, and Restore needs a process that stays running to remember frames.

**Two ways in.**

| From   | Path                                                                                    | Moves                                      | A failure                     |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------- |
| Hotkey | `node src/start.js hotkeys` gives the helper the command up front, so Node never starts | The focused window                         | Beeps and writes `helper.log` |
| Search | `window <command>` over `.build/helper.sock`                                            | The window behind Redhot, which then rises | Shows a red line above search |

**A front app with no windows.** Closing Redhot closes its Terminal window, but Terminal stays the front app, while another app's window still looks active. A hotkey then finds nothing focused, so it moves the top window on screen and brings it forward, the same way search does.

**Finding the window from search.** Redhot's own window is focused when you press Enter, so moving the focused window would move Redhot. The helper walks the on-screen window list, which runs front to back and needs no permission, and takes the first window that isn't the focused one. Only Accessibility can move a window, so each entry is matched to an app's window by its frame. This keeps no state, so it works however Redhot was opened, including from another window of the same terminal.

**Moving the window.**

- The display is the one holding most of the window. Its area leaves out the menu bar and Dock, and is converted from AppKit's bottom-left origin to Accessibility's top-left one.
- Size is set, then position, then size again. The first fits the window to where it's going, and the last undoes any limit macOS applied at the old position.
- `AXEnhancedUserInterface` is switched off during the move and back on after, because Chrome and Electron animate each step while it's on.
- Apps can refuse a size. Terminal snaps to its character grid, for example. A window against the right or bottom edge then moves back to that edge.
- Accessibility calls wait on the other app, so they run on their own queue with a half-second timeout, away from the thread that answers hotkeys.

**Restore.** The first move saves the window's frame. Further moves keep it, unless you've moved the window yourself since. It's held in memory, so restarting the helper forgets it.

**Default hotkeys.** `Window Hotkeys, Add Defaults` fills in Rectangle's layout, such as `⌃⌥←` and `⌃⌥U`, and skips anything already taken or set. macOS can't tell Redhot when another app registers the same keys, so quit Rectangle first or both will act.

**Permission.** The helper needs Accessibility, not the CLI, so the CLI asks it over the socket. The Window actions row in Settings shows the state and opens the right page. macOS ties the grant to the binary's signature:

- An ad-hoc signature changes with every build, so a rebuilt helper can show as allowed in System Settings and still be refused. Remove it from the list and add it again.
- `pnpm menubar:sign` creates a `Redhot Local Signing` certificate in the login keychain, once, and every build after that signs with it. It needs running by hand because it changes the keychain.
- A process started from a terminal may be counted as part of that terminal for this permission, and one started at login as itself. This hasn't been tested yet.

## Settings

The third Redhot app. Search `Settings` for a list of toggles, where Enter flips the focused one. Esc or Done goes back to search.

**Start at login** puts Redhot in the menu bar when you log in, so the shortcut, hotkeys and clipboard recording survive a reboot.

| Row shows | Meaning                                     | Enter does                    |
| --------- | ------------------------------------------- | ----------------------------- |
| Off       | No login item                               | Turns it on                   |
| On        | The login item exists and macOS allows it   | Turns it off                  |
| Blocked   | The item is switched off in System Settings | Opens System Settings for you |

**How it works.** The setting is a file, `~/Library/LaunchAgents/redhot.menu-bar.plist`, so no saved value can disagree with what macOS will do. It runs `.build/redhot-status` directly, so macOS lists it as `redhot-status`.

- Apple's newer `SMAppService` needs a signed `.app`, so a LaunchAgent is the route for a bare binary.
- Turning it on only writes the file, and macOS loads it at the next login. Loading it straight away would start a second helper.
- Turning it off only deletes the file, so a running helper keeps running.
- `RunAtLoad` is set and `KeepAlive` isn't, so Exit in the menu bar stays exited until the next login.
- `pnpm menubar:start` rewrites the file if it exists, which keeps its paths right after Node or the project moves. If the project moves and that isn't run, the login item fails silently.

**Permissions.** There's nothing to grant, but macOS shows a "Background Items Added" notice for a new item, and you can switch it off under System Settings > General > Login Items & Extensions. No command can flip that switch back, so the Blocked row opens the page. Redhot spots the block two ways: `launchctl print-disabled`, and the `Disposition` in `sfltool dumpbtm`, which needs no `sudo` for your own items. `sfltool` isn't documented by Apple, so a failure there just means the block isn't seen. It takes about 4 seconds, so it only runs when a login item exists, behind a "Checking System Settings" line.

## Closing the window

Terminal keeps a dead window open after a program exits, showing `[Process completed]`, so Redhot closes its own.

When Redhot ends, through the Exit command, its hotkey or **End program**, it shows "Ending program..." under the logo, and the window closes without asking. A window opened for one item closes with that item and shows the same message.

- Launcher scripts set `REDHOT_WINDOW=1`, and only those windows can close. Running `pnpm start` in your own terminal never closes it.
- The window is found while Node is alive and closed 0.6 seconds later, so Terminal doesn't ask about running processes.
- Only a `busy` tab can match. Terminal reuses tty names and dead windows keep them, so matching on the tty alone closes the wrong window.
- A window with several tabs is left open.

## Stopping

`pnpm menubar:stop`, or `Remove "Redhot" from Menu Bar` in the search prompt, finds the helper with `pgrep` and sends it a kill signal. Exit in the menu makes the helper exit by itself. Either way, the icon and shortcut go away.

## Known limits

- The helper doesn't restart after a reboot. Run `pnpm menubar:start` again.
- A running timer lives only in the helper, so restarting the helper or updating Redhot loses it.
- The launcher contains the current Node path. If that path changes, run `pnpm menubar:restart`.
- After Redhot ends, the next press opens a new window.
- Raising a minimized window is untested.
