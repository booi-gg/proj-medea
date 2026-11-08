# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- iCloud Drive Sync has a **What to Sync** screen, where each Mac chooses whether to share settings, quicklinks, snippets and logs. Snippets are off until you turn them on, because their text is kept in iCloud Drive as plain files.
- **Sync Folder** shows the current folder's name and lets you choose another.

### Changed

- **Sync logs** moved into What to Sync.

## 0.6.1

### Added

- Snippets: save text with `Snippet, Create`, then type its keyword, like `;addr`, in any app to replace it, or find it in search and copy it. `{date}`, `{time}`, `{clipboard}` and `{cursor}` are filled in. Expansion needs Accessibility permission and stays out of password fields.

## 0.6.0

### Added

- Web search: when search finds nothing, the row offers `Search Google for 'xyz'`, and Settings can switch that to DuckDuckGo or Kagi.
- Quicklinks as search engines: an alias, a space and some text fills a quicklink's argument, so `yt lofi` opens YouTube straight away. Settings can add ready-made ones for GitHub, YouTube, Google, Wikipedia, npm and Stack Overflow.

### Changed

- Enter on a web search, calculation or currency conversion keeps what you typed on screen, so you can change it or run it again. The shortcut brings it back as you left it, and Esc clears it.

## 0.5.0

## 0.4.1

### Added

- File search: type `f` and a space in search, or open `Search Files`, to find files by name with Spotlight. Enter opens a file, `Ctrl+R` reveals it in Finder, `Ctrl+P` copies its path, and Tab adds Open With….
- Folder search: `Search Folders` lists Finder's usual places, like Downloads, Documents and Recents, and finds any other folder by name.
- Kill a process or port: `Kill Process or Port` lists running apps and processes with their CPU and memory, and `port 3000` in search shows what's listening on that port. Enter quits, and `Ctrl+K` force quits after asking. Anything owned by root asks first and uses `sudo`.
- System commands: `Lock Screen`, `Sleep`, `Sleep Displays`, `Empty Trash`, `Toggle Dark Mode`, `Toggle Hidden Files`, `Eject All Disks`, `Battery Info`, `Restart`, `Shut Down` and `Log Out`, each with its own alias and hotkey. Restart, Shut Down and Log Out ask first.

### Changed

- Redhot shows "Ending program..." when you exit, so the window doesn't vanish without warning.
- Screen titles like Clipboard and Search Files are now red text on a white label with a line across the window, so it's clear which screen you're on.

## 0.4.0

## 0.3.0

### Fixed

- Windows opened by a hotkey or for an update no longer flash the file path first, and their title bar shows only Redhot.
- Hotkeys for items that no longer exist can't hold a key or block it from being used, and the "already used by" message names the real item.

## 0.2.1

## 0.2.0

## 0.1.5

### Added

- Script commands: any script in `~/.config/redhot/scripts/` with `@redhot.` headers shows up in search, with arguments, output modes, aliases and hotkeys. `Script, Create` writes a template, `Scripts, Show All` lists them, and `Scripts, Open Folder` opens the folder.
- `redhot --version`, `redhot -v` and `redhot version` print the installed version.
- The menu bar menu has **Check for Updates…**, and shows **Update to 0.x.y…** when npm has a newer version. Updating runs in a terminal window and restarts the menu bar item.
- Redhot checks npm for a newer version once a day. Turn it off with **Check for updates** in Settings.
- `redhot restart` (and `pnpm menubar:restart` in a checkout) restarts the menu bar item.

### Changed

- The menu bar icon and Redhot's alerts use the Redhot logo, the R from the banner, instead of a terminal symbol.

### Release process

- Every push to `main` bumps the version from the commit messages, updates this changelog, and commits and tags the release. Publishing to npm stays manual.

### Notifications

- Redhot has its own notification, with its logo, drawn by the menu bar item. Anything a hotkey runs with no window now reports its result or failure there, including window actions that used to only beep.

### Removed

- Ghostty support and the **Set Terminal** menu. Redhot now opens only in macOS's Terminal.

### Fixed

- In Terminal.app, the title bar shows only "Redhot", not the program and the long path to the launcher.
- Terminal no longer piles up `Redhot 1`, `Redhot 2` and so on after an upgrade. A Redhot window that opens on a numbered copy takes over the Redhot profile and removes copies nothing uses.

- In Terminal.app, the search window failed with `Command not found: .../Library/Application` in 0.1.1, because the installed launcher's folder has a space in its name.
- Running Redhot from a checkout and an installed copy on the same Mac no longer adds `Redhot 1`, `Redhot 2` and so on to Terminal's profiles. The checkout uses its own `Redhot Dev` profile.

## 0.1.1

### Changed

- Several items can now share an alias.
- `redhot` stops with a clear message on Windows and Linux, even when an install got past the `os` check.
- In Terminal.app, the search window opens straight into Redhot at 80×18, without the `Last login` line or the launcher path flashing first.

## 0.1.0

First public release.

- Menu bar helper with the `Cmd+Shift+Space` shortcut, opening search in Terminal or Ghostty.
- App search, aliases and global hotkeys for any app or command.
- Quicklinks with argument and clipboard placeholders.
- Clipboard history for text and images, with a preview pane.
- Calculator and currency conversion in search.
- Window actions with optional Rectangle-style hotkeys.
- Settings for Start at login, clipboard history length, log size and window permission.
- Experimental iCloud Drive sync for settings and quicklinks.
- Metadata-only logs, with `redhot logs`.
