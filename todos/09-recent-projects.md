# Recent projects

**Effort:** small

## What

Open recent VS Code, Cursor or Xcode projects from search.

## How

- VS Code and Cursor keep recent folders in `~/Library/Application Support/<App>/User/globalStorage/storage.json`, or the `state.vscdb` SQLite file in newer versions.
- Xcode keeps recent documents in a plist under `~/Library/Preferences`.
- Open with `open -a "Visual Studio Code" <folder>`.
- Only show apps that are installed.
