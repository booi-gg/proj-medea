# Redhot

A keyboard launcher for macOS that runs in your terminal. Press `Cmd+Shift+Space`, type a few letters and press Enter to open an app, run a command, follow a link or bring back something you copied.

Redhot has two parts. A small Swift helper lives in the menu bar and owns the global shortcut, your hotkeys, the clipboard watcher and window moves. The search window is a TypeScript CLI that opens in Terminal or Ghostty.

## Features

- **App search.** Finds everything in `/Applications`, `/System/Applications` and `~/Applications`, ranked by exact match, then prefix, word start and initials.
- **Aliases.** Give any app or command up to two short names, like `code` for Visual Studio Code.
- **Hotkeys.** Bind any app, command, quicklink or window action to a global shortcut.
- **Quicklinks.** Save URLs, deeplinks or folders, with `{argument}` and `{clipboard}` placeholders.
- **Clipboard history.** Text and images you copy, searchable, with a preview pane. Password managers and confidential copies are skipped.
- **Calculator.** Type `2 * (4 + 1)` and press Enter to copy the answer.
- **Currency conversion.** Type `356 USD to INR` or `$20 in €`. Rates are downloaded daily and work offline.
- **Window actions.** Halves, quarters, thirds, maximize, center, restore and move to the next display, with optional Rectangle-style default hotkeys.
- **iCloud Drive sync** (experimental). Share settings and quicklinks between your Macs through a folder you pick.
- **Start at login,** so the shortcut and clipboard history survive a reboot.

## Requirements

- macOS. Redhot is developed on macOS 26 and uses AppKit, so it won't run on Linux or Windows.
- [Node.js](https://nodejs.org) 22.1 or later.
- The Xcode Command Line Tools, because the helper is compiled on your Mac the first time it starts. Install them with `xcode-select --install`.
- Terminal or [Ghostty](https://ghostty.org).

## Install

```sh
npm install --global @booi-gg/redhot
redhot start
```

`redhot start` compiles the helper, puts the Redhot icon in the menu bar and turns on `Cmd+Shift+Space`. Press the shortcut, or choose **Open Redhot** from the icon, to open search.

To run from a clone instead, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Using Redhot

| Key                | In search                                                 |
| ------------------ | --------------------------------------------------------- |
| Type               | Filter apps, commands, quicklinks and answers             |
| `↑` `↓`            | Move between results                                      |
| Enter              | Open or run the focused result                            |
| Tab or Shift+Enter | Open the focused item's settings (alias, hotkey and more) |
| Esc                | Go back, or from search, ask whether to end Redhot        |

The window stays open between uses, so the next `Cmd+Shift+Space` brings it straight back.

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

### Clipboard history

Search `Clipboard` to see what you've copied, newest first. Type to filter, Enter copies an entry back, and Tab offers View, Delete and Delete all. Redhot copies rather than pastes, so switch back to your app and press `Cmd+V`.

History is kept for 3 months by default (Settings offers up to a year) and stays on your Mac. Redhot doesn't record content marked confidential or temporary, anything copied in Passwords or Keychain Access, or text over 100,000 characters. A password manager has to mark its copies for this to work.

### Window actions

Search for `Left Half`, `Maximize`, `Next Display` and so on to move the window you were using. `Window Hotkeys, Add Defaults` adds Rectangle's layout, like `⌃⌥←` for the left half, and skips any key already set. Quit Rectangle first, or both will act on the same keys.

Window actions need Accessibility permission for the helper (see below).

### Settings

Search `Settings` for:

- **Start at login**, which adds a LaunchAgent so the helper starts when you log in.
- **Keep clipboard history** for 3, 4 or 5 months, or 1 year.
- **Log size** of 10, 50, 100 or 500 MB.
- **Window actions**, which shows whether Accessibility is granted and opens the right System Settings page.
- **iCloud Drive Sync**, which picks an iCloud Drive folder to share settings and quicklinks between Macs.

Choose your terminal from the menu bar icon under **Set Terminal**.

In Terminal.app, Redhot opens an 80×14 window from its own **Redhot** profile, which it copies from your default profile, so it keeps your colours and font. Change the default profile to change how Redhot looks, not the Redhot profile, which Redhot rewrites. `Cmd` + `=` makes the text bigger in an open window.

## Permissions

| Permission             | Needed for                | Notes                                                                                                                              |
| ---------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility          | Window actions only       | Granted to `redhot-status`. Run `redhot sign` once so the grant survives upgrades; otherwise remove and re-add it after an update. |
| Automation (Ghostty)   | Opening search in Ghostty | Asked for once.                                                                                                                    |
| Background item notice | Start at login            | macOS shows a notice. Nothing to grant.                                                                                            |

`redhot sign` creates a `Redhot Local Signing` certificate in your login keychain and signs every later build with it.

## Commands

```sh
redhot                       # open search in the current terminal
redhot start                 # build and start the menu bar helper
redhot stop                  # stop the helper and its hotkeys
redhot status                # check whether the helper is running
redhot sign                  # one-time: keep Accessibility permission across rebuilds
redhot logs                  # print the logs
redhot logs --follow         # watch new log entries
redhot logs --trace <id>     # follow one action across processes
redhot sync [now|status|open]
```

## Where Redhot keeps things

| Path                                           | Contents                                        |
| ---------------------------------------------- | ----------------------------------------------- |
| `~/.config/redhot/config.json`                 | Terminal, aliases, hotkeys and settings         |
| `~/.config/redhot/redhot-quicklinks.json`      | Quicklinks                                      |
| `~/.config/redhot/redhot-clipboard-history*`   | Clipboard history and its images                |
| `~/Library/Application Support/Redhot/`        | The compiled helper, launcher script and socket |
| `~/Library/Logs/Redhot/`                       | Logs                                            |
| `~/Library/LaunchAgents/redhot.menu-bar.plist` | The login item, when Start at login is on       |

Logs record action types, item IDs, timings and error categories. They never contain search text, clipboard content, link targets or command output. Redhot makes no network requests except downloading currency rates from [Frankfurter](https://frankfurter.dev).

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
- Only Terminal and Ghostty are supported so far.
- iCloud Drive sync hasn't yet been tested between two real Macs.
- If you move Node or the install, run `redhot stop` and `redhot start` again.

See [doc/roadmap.md](doc/roadmap.md) for what's planned.

## Contributing

Bug reports, ideas and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and [doc/how-it-works.md](doc/how-it-works.md) for how the pieces fit together. Please report security problems privately, as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
