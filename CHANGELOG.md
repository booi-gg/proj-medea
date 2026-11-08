# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- `redhot --version`, `redhot -v` and `redhot version` print the installed version.
- The menu bar menu has **Check for Updates…**, and shows **Update to 0.x.y…** when npm has a newer version. Updating runs in a terminal window and restarts the menu bar item.
- Redhot checks npm for a newer version once a day. Turn it off with **Check for updates** in Settings.
- `redhot restart` (and `pnpm menubar:restart` in a checkout) restarts the menu bar item.

### Changed

- The menu bar icon and Redhot's alerts use the Redhot logo, the R from the banner, instead of a terminal symbol.

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
