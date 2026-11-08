# Redhot

A keyboard launcher for macOS that runs in your terminal. Press `Cmd+Shift+Space`, type a few letters and press Enter to open an app, run a command, follow a link or bring back something you copied.

Redhot has two parts. A small Swift helper lives in the menu bar and owns the global shortcut, your hotkeys, the clipboard watcher and window moves. The search window is a TypeScript CLI that opens in macOS's Terminal.

## Features

- **App search.** Finds everything in `/Applications`, `/System/Applications` and `~/Applications`, ranked by exact match, then prefix, word start and initials.
- **Aliases.** Give any app or command up to two short names, like `code` for Visual Studio Code.
- **Hotkeys.** Bind any app, command, quicklink or window action to a global shortcut.
- **Quicklinks.** Save URLs, deeplinks or folders, with `{argument}` and `{clipboard}` placeholders.
- **Snippets.** Save text and type a keyword like `;addr` in any app to replace it, or search for a snippet and copy it.
- **Web search.** When nothing matches, search Google, DuckDuckGo or Kagi. Type an alias and some text, like `yt lofi`, to search with a quicklink.
- **Script commands.** Turn any shell, Python or Node script into a search result, with arguments, output and hotkeys.
- **File search.** Type `f`, a space and a file name to find it with Spotlight, then open it, reveal it in Finder or copy its path.
- **Recent projects.** Type a project's name to reopen it in VS Code, Cursor or Xcode, in the app you last used it in. Off until you turn it on in Settings.
- **Browser bookmarks.** Type a bookmark's title to open it in Chrome, Arc, Brave or Edge, in the browser it came from. Off until you turn it on in Settings.
- **Folder search.** Jump to Downloads, Documents, Recents or any folder in Finder.
- **Kill a process or port.** Quit or force quit a running app or process, or type `port 3000` to stop whatever is listening on it.
- **System commands.** Lock, sleep, empty the Trash, toggle dark mode or hidden files, eject disks, restart, shut down and log out.
- **Clipboard history.** Text and images you copy, searchable, with a preview pane. Password managers and confidential copies are skipped.
- **Colour picker.** Pick a colour from anywhere on screen with the macOS magnifier, then copy it as hex, RGB or HSL. `Colour History` keeps your last 12.
- **Calculator.** Type `2 * (4 + 1)` and press Enter to copy the answer.
- **Currency conversion.** Type `356 USD to INR` or `$20 in €`. Rates are downloaded daily and work offline.
- **Units.** Type `5 km in miles`, `72 f to c` or `2 GB in MB`.
- **Time zones.** Type `3pm PST in Tokyo` or `time in London`.
- **Dates.** Type `days until dec 25` or `today + 90 days`.
- **Window actions.** Halves, quarters, thirds, maximize, center, restore and move to the next display, with optional Rectangle-style default hotkeys.
- **iCloud Drive sync** (experimental). Share settings, quicklinks, snippets and logs between your Macs through a folder you pick, and choose which of them each Mac shares.
- **Start at login,** so the shortcut and clipboard history survive a reboot.

## Requirements

- macOS. Redhot is developed on macOS 26 and uses AppKit, so it won't run on Linux or Windows.
- [Node.js](https://nodejs.org) 22.1 or later.
- The Xcode Command Line Tools, because the helper is compiled on your Mac the first time it starts. Install them with `xcode-select --install`.
- Terminal, the one that comes with macOS. Redhot always opens there, whichever terminal you use day to day.

## Install

```sh
npm install --global @booi-gg/redhot
redhot start
```

`redhot start` compiles the helper, puts the Redhot icon in the menu bar and turns on `Cmd+Shift+Space`. Press the shortcut, or choose **Open Redhot** from the icon, to open search.

To run from a clone instead, see [CONTRIBUTING.md](CONTRIBUTING.md).

### Updating

When a new version is out, the menu bar icon's menu shows **Update to 0.x.y…**. Choose it and Redhot opens a terminal window, installs the new version with the package manager you installed it with (npm, pnpm or Bun), and restarts the menu bar item. **Check for Updates…** in the same menu checks right away.

To update by hand:

```sh
npm install --global @booi-gg/redhot
redhot restart
```

## Using Redhot

| Key                | In search                                                 |
| ------------------ | --------------------------------------------------------- |
| Type               | Filter apps, commands, quicklinks and answers             |
| `↑` `↓`            | Move between results                                      |
| Enter              | Open or run the focused result                            |
| Tab or Shift+Enter | Open the focused item's settings (alias, hotkey and more) |
| Esc                | Go back, or from search, ask whether to end Redhot        |

The window stays open between uses, so the next `Cmd+Shift+Space` brings it straight back.

After Enter on a row made from what you typed, like a web search, `yt lofi`, a calculation or a currency conversion, your text and the row stay on screen so you can change it or run it again. `Cmd+Shift+Space` brings it back as you left it, and Esc clears it for a new search.

### Aliases and hotkeys

Focus any result and press Tab. From its settings:

- **Alias, Add** takes up to two aliases separated by commas, each up to 8 characters with no spaces. Several items can share an alias, and typing it lists them all.
- **Hotkey, Create** opens a small window that records the keys you press. Hold at least one modifier. Hotkeys work at once, with no restart.

`Hotkeys, Show All` lists every saved hotkey. Redhot warns when a shortcut looks taken, but macOS can't tell it about every other app's shortcuts.

### Quicklinks

Search `Quicklink, Create` and give it a name, a link and, if you like, an app to open it with. Links can be web URLs (`github.com` becomes `https://github.com`), deeplinks like `spotify://` or paths like `~/Downloads`.

| Placeholder                           | Becomes                                     |
| ------------------------------------- | ------------------------------------------- |
| `{argument}` or `{}`                  | Asked for when the link opens               |
| `{argument name="query" default="x"}` | A named question, shared by every use of it |
| `{query}`                             | Short for `{argument name="query"}`         |
| `{clipboard}`                         | The text on your clipboard                  |

For example, `https://github.com/search?q={query}` asks for a search term and opens GitHub.

### Web search

When nothing matches what you typed, search says `No results` and offers `Search Google for 'xyz'` below it. Press the down arrow and then Enter to open it in your browser. Choose DuckDuckGo or Kagi instead under **Web search** in Settings.

A quicklink can act as a search engine too. Give one with a single question an alias, then type the alias, a space and your search: `gh redhot` fills it in and opens the link without asking. A quicklink that asks more than one question opens and asks as usual.

**Web search** in Settings also adds ready-made quicklinks for GitHub (`gh`), YouTube (`yt`), Google (`g`), Wikipedia (`wiki`), npm (`npm`) and Stack Overflow (`so`). Anything you've already saved isn't offered, and if an alias is taken the link is added without it.

### Snippets

Search `Snippet, Create` and give it a name, the text and, if you like, a keyword. Enter on a snippet in search copies it. Tab has Edit and Delete. `Snippets, Show All` lists them with their keywords, and you can search by name or keyword.

Typing a keyword in any app replaces it with the snippet. That needs the menu bar item and Accessibility permission, which Redhot asks for when you save your first keyword. Your clipboard is put back afterwards. Expansion doesn't happen in password fields.

| Placeholder   | Result                                                          |
| ------------- | --------------------------------------------------------------- |
| `{date}`      | Today, like `2026-11-08`                                        |
| `{time}`      | The time, like `09:05`                                          |
| `{clipboard}` | The clipboard text                                              |
| `{cursor}`    | Where the cursor ends up after expanding. Left out when copying |

Keywords start with `;`, like `;addr`, so ordinary typing can't set one off. A saved keyword without it doesn't expand until you edit it.

### Script commands

A script command is a script with a few comments at the top that tell Redhot its name and how to show its output. Put it in `~/.config/redhot/scripts/`, and it shows up in search like any app. Give it an alias or a hotkey from its settings with Tab.

Search `Script, Create` to start one: Redhot writes a template and opens it in your text editor. `Scripts, Show All` lists every script to search, run with Enter, or open its settings with Tab. `Scripts, Open Folder` opens the folder in Finder.

```bash
#!/bin/bash

# @redhot.title Kill Port
# @redhot.mode compact
# @redhot.icon 🔪
# @redhot.argument1 { "type": "text", "placeholder": "port" }

# -sTCP:LISTEN matches only the server, not programs connected to it, like your browser.
pids=$(lsof -ti tcp:"$1" -sTCP:LISTEN | xargs)
[ -z "$pids" ] && { echo "Nothing listening on port $1"; exit 1; }
kill $pids && echo "Stopped process $pids on port $1"
```

Search `kill`, press Enter, type `3000`, and Redhot shows "Stopped process 41522 on port 3000".

Scripts can sit in subfolders. The comments can start with `#`, `//` or `--`, so a script can be in any language with a `#!` line.

| Header                       | What it does                                                           |
| ---------------------------- | ---------------------------------------------------------------------- |
| `title`                      | The name in search. Required.                                          |
| `mode`                       | How output shows. Required: see below.                                 |
| `argument1` to `argument3`   | Values to ask for before running, passed to the script as `$1` to `$3` |
| `icon`                       | An emoji shown beside the title. Image icons aren't supported.         |
| `description`, `packageName` | Shown in hotkey lists                                                  |
| `needsConfirmation`          | `true` asks "Run …?" first                                             |
| `currentDirectoryPath`       | The folder the script runs in. Defaults to the script's own folder.    |

| Mode         | Shows                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| `compact`    | The last line of output, above the search bar                               |
| `silent`     | The last line, if there is one                                              |
| `fullOutput` | Everything the script prints, colours included, until you go back           |
| `inline`     | Runs when chosen, like `compact`. Redhot doesn't refresh it on a timer yet. |

An argument is a JSON object. `type` is `text` (the default), `password` or `dropdown`. `placeholder` is the question, `"optional": true` lets it be left empty, and `"percentEncoded": true` encodes the answer for a URL. A dropdown lists its choices in `data`, as `[{ "title": "Dark", "value": "dark" }]`.

A few things to know:

- The script must be executable. Redhot says so if it isn't: run `chmod +x` on it. `Script, Create` does this for you.
- A script that exits with an error shows its last error line in red.
- Scripts find Homebrew's tools: Redhot adds `/opt/homebrew/bin` and `/usr/local/bin` to the `PATH`, which is otherwise bare in a Terminal window opened without a shell.
- A hotkey runs a script without opening a window when it asks nothing, and shows the last line in Redhot's notification.
- Redhot never logs a script's arguments or output.

If you want to add a Raycast script, Redhot can run those too. Download one from the [script-commands collection](https://github.com/raycast/script-commands/tree/HEAD/commands) (MIT licensed) into the scripts folder and make it executable:

```sh
mkdir -p ~/.config/redhot/scripts
cd ~/.config/redhot/scripts
curl -fsSLO https://raw.githubusercontent.com/raycast/script-commands/HEAD/commands/system/battery-info.sh
chmod +x battery-info.sh
```

Read a script before you add it, because it runs with your user's full access. Files with `.template.` in the name need editing first, and some scripts need other tools installed. Redhot isn't affiliated with Raycast.

### File search

Type `f` and a space in search to switch to file search, or open `Search Files`, which can have its own alias or hotkey. Type part of a file name, and every word has to appear in it.

| Key      | What it does                               |
| -------- | ------------------------------------------ |
| Enter    | Opens the file                             |
| `Ctrl+R` | Reveals it in Finder                       |
| `Ctrl+P` | Copies its path                            |
| Tab      | Lists these actions, along with Open With… |
| Esc      | Goes back to search                        |

The list stays open after you open, reveal or copy something, with the cursor where it was, so you can act on several files in a row. A window opened by a hotkey closes once the file is open.

The exact name comes first, then whatever you opened most recently. Redhot searches your home folder, iCloud Drive, `/Applications` and other drives, and skips `node_modules`, `Library`, hidden folders and the insides of apps. Results come from Spotlight, so a file Spotlight hasn't indexed won't show.

### Folder search

Open `Search Folders` to see Finder's usual places straight away: Recents, Downloads, Documents, Desktop, Home, iCloud Drive, Applications, Pictures, Movies and Music. Press Enter to open one in Finder, or type to find any other folder by name. Give it an alias or hotkey from its settings with Tab to get there quickly.

The keys are the same as file search, and the same folders are skipped. Recents is a Finder view rather than a folder, so it can only be opened.

### Kill a process or port

Open `Kill Process or Port` to see running apps by name, then every other process, busiest first, each with its process ID, CPU and memory. Type to filter by name or process ID. Type `port 3000`, here or in search, to see what's listening on that port.

| Key      | What it does                                                 |
| -------- | ------------------------------------------------------------ |
| Enter    | Quits it. An app gets the normal Quit, so it can ask to save |
| `Ctrl+K` | Force quits it, after asking                                 |
| Tab      | Offers Quit and Force Quit                                   |

Stopping anything owned by root or another user asks first and then uses `sudo`, so you may be asked for your password. macOS may also ask to let your terminal control an app the first time you quit one.

Without `sudo`, macOS hides what root is listening with, so a port held by root shows as having no listeners. Search for the process by name instead.

### System commands

Search for any of these and press Enter. Each can have its own alias or hotkey from its settings with Tab.

| Command               | What it does                                                                |
| --------------------- | --------------------------------------------------------------------------- |
| `Lock Screen`         | Locks straight away. Needs the menu bar item                                |
| `Sleep`               | Puts the Mac to sleep                                                       |
| `Sleep Displays`      | Turns the screens off and leaves the Mac running                            |
| `Empty Trash`         | Empties the Trash, for good                                                 |
| `Toggle Dark Mode`    | Switches between light and dark                                             |
| `Toggle Hidden Files` | Shows or hides dotfiles in Finder, which restarts Finder                    |
| `Eject All Disks`     | Ejects every removable disk, and says how many were in use                  |
| `Battery Info`        | Shows the charge, time left, cycles and maximum capacity                    |
| `Emoji Picker`        | Opens macOS's picker in your app. Needs the menu bar item and Accessibility |
| `Restart`             | Asks first, then restarts                                                   |
| `Shut Down`           | Asks first, then shuts down                                                 |
| `Log Out`             | Asks first, then logs out                                                   |

### Clipboard history

Search `Clipboard` to see what you've copied, newest first. Type to filter, Enter copies an entry back, and Tab offers View, Delete and Delete all. Redhot copies rather than pastes, so switch back to your app and press `Cmd+V`.

`Ctrl+P` pins the focused entry, and pressing it again unpins. Pinned entries are marked with ★, stay at the top of the list and don't expire. Delete and Delete all still remove them.

History is kept for 3 months by default (Settings offers up to a year) and stays on your Mac. Redhot doesn't record content marked confidential or temporary, anything copied in Passwords or Keychain Access, or text over 100,000 characters. A password manager has to mark its copies for this to work.

### Window actions

Search for `Left Half`, `Maximize`, `Next Display` and so on to move the window you were using. `Window Hotkeys, Add Defaults` adds Rectangle's layout, like `⌃⌥←` for the left half, and skips any key already set. Quit Rectangle first, or both will act on the same keys.

Window actions need Accessibility permission for the helper (see below).

### Settings

Search `Settings` for:

- **Start at login**, which adds a LaunchAgent so the helper starts when you log in.
- **Keep clipboard history** for 3, 4 or 5 months, or 1 year.
- **Log size** of 10, 50, 100 or 500 MB.
- **Check for updates**, on by default, which asks npm once a day whether a newer Redhot is out.
- **Window actions**, which shows whether Accessibility is granted and opens the right System Settings page.
- **iCloud Drive Sync**, which picks an iCloud Drive folder to share things between Macs. **What to Sync** switches settings, quicklinks, snippets and logs on and off for each Mac. Snippets start off, because their text is kept in iCloud Drive as plain files.
- **Web search**, which picks the engine used when search finds nothing and adds ready-made search quicklinks.
- **Show recent projects in search**, off by default, for your VS Code, Cursor and Xcode projects.
- **Show browser bookmarks in search**, off by default, for your Chrome, Arc, Brave and Edge bookmarks.

In Terminal.app, Redhot opens an 80×18 window from its own **Redhot** profile, which it copies from your default profile, so it keeps your colours and font. Change the default profile to change how Redhot looks, not the Redhot profile, which Redhot rewrites and tidies up after. `Cmd` + `=` makes the text bigger in an open window.

## Permissions

| Permission             | Needed for          | Notes                                                                                                                              |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility          | Window actions only | Granted to `redhot-status`. Run `redhot sign` once so the grant survives upgrades; otherwise remove and re-add it after an update. |
| Background item notice | Start at login      | macOS shows a notice. Nothing to grant.                                                                                            |
| Automation             | System commands     | macOS asks once each for Finder and System Events, the first time a command needs them. Sleep and Lock Screen don't need it.       |

`redhot sign` creates a `Redhot Local Signing` certificate in your login keychain and signs every later build with it.

## Commands

```sh
redhot                       # open search in the current terminal
redhot start                 # build and start the menu bar helper
redhot stop                  # stop the helper and its hotkeys
redhot restart               # restart the helper, e.g. after updating by hand
redhot status                # check whether the helper is running
redhot sign                  # one-time: keep Accessibility permission across rebuilds
redhot --version             # print the installed version (also -v)
redhot logs                  # print the logs
redhot logs --follow         # watch new log entries
redhot logs --trace <id>     # follow one action across processes
redhot sync [now|status|open]
```

## Where Redhot keeps things

| Path                                           | Contents                                        |
| ---------------------------------------------- | ----------------------------------------------- |
| `~/.config/redhot/config.json`                 | Aliases, hotkeys and settings                   |
| `~/.config/redhot/redhot-quicklinks.json`      | Quicklinks                                      |
| `~/.config/redhot/redhot-snippets.json`        | Snippets                                        |
| `~/.config/redhot/scripts/`                    | Your script commands                            |
| `~/.config/redhot/redhot-clipboard-history*`   | Clipboard history and its images                |
| `~/.config/redhot/redhot-colour-history.json`  | Colours you've picked                           |
| `~/Library/Application Support/Redhot/`        | The compiled helper, launcher script and socket |
| `~/Library/Logs/Redhot/`                       | Logs                                            |
| `~/Library/LaunchAgents/redhot.menu-bar.plist` | The login item, when Start at login is on       |

Logs record action types, item IDs, timings and error categories. They never contain search text, clipboard content, link targets, script arguments or command output. Redhot makes two kinds of network request: downloading currency rates from [Frankfurter](https://frankfurter.dev), and asking the npm registry for Redhot's latest version once a day. Settings turns the second off.

## Uninstall

```sh
redhot stop
rm -f ~/Library/LaunchAgents/redhot.menu-bar.plist
npm uninstall --global @booi-gg/redhot
rm -rf ~/.config/redhot ~/Library/Application\ Support/Redhot ~/Library/Logs/Redhot
```

If you ran `redhot sign`, also delete the `Redhot Local Signing` certificate in Keychain Access, and remove `redhot-status` from System Settings > Privacy & Security > Accessibility.

## Known limits

- Search opens in a terminal window, so it isn't as instant as a floating panel.
- Clipboard history copies but doesn't paste for you.
- Redhot only opens in macOS's Terminal.
- iCloud Drive sync hasn't yet been tested between two real Macs.
- If you move Node or the install, run `redhot stop` and `redhot start` again.

See [doc/roadmap.md](doc/roadmap.md) for what's planned.

## Contributing

Bug reports, ideas and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and [doc/how-it-works.md](doc/how-it-works.md) for how the pieces fit together. Please report security problems privately, as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
