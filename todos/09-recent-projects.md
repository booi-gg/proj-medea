# Recent projects

**Status:** built, and only VS Code has been checked against real data. Cursor is assumed to store its list like VS Code. See "Recent projects" in doc/how-it-works.md, which also has where the lists actually are, because the locations below turned out to be out of date.

**Effort:** small

## What

Open recent VS Code, Cursor or Xcode projects from search.

## How

- VS Code and Cursor keep recent folders in `~/Library/Application Support/<App>/User/globalStorage/storage.json`, or the `state.vscdb` SQLite file in newer versions.
- Xcode keeps recent documents in a plist under `~/Library/Preferences`.
- Open with `open -a "Visual Studio Code" <folder>`.
- Only show apps that are installed.
