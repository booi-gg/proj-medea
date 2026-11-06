# Medea search launcher

## Context

Medea is a CLI take on a Raycast-style launcher. The menu bar item and the global shortcut (`Cmd+Shift+Space`) already open the CLI in Terminal, but the CLI only offers add/remove for the menu bar item. This step makes it a real launcher: press the shortcut, type, press Enter, and an app opens or a built-in command runs.

Choosing the terminal (e.g. Ghostty) is explicitly later. It stays out of this change, and this change must not make it harder.

## Approach

### `apps.ts` (new): find and open apps

- `listApps()` runs `mdfind "kMDItemContentType == 'com.apple.application-bundle'"` (measured about 0.1s, 358 results).
- A pure `toApps(paths, homeDir)` filters and names the results:
  - Keep only paths under `/Applications`, `/System/Applications`, `~/Applications`, plus `/System/Library/CoreServices/Finder.app`.
  - Drop anything nested inside another `.app`, and helper bundles under `~/Library` or the stale `/Users/aftershoot` home (the root filter handles these).
  - Name = file name without `.app`. Dedupe by name, sort alphabetically.
- `openApp(path)` runs `open <path>` through `execFile` (no shell).

### `search.ts` (new): ranking

- Pure `rankItems(query, items)`: empty query keeps the original order; otherwise exact match > prefix > word start > substring > in-order letters (`vsc` finds `Visual Studio Code`), and non-matches are dropped. Case-insensitive.
- Needed because clack's `filter` option is yes/no only and cannot order results. Clack's dynamic `options` getter exposes `this.userInput`, so ranking runs there.

### `index.ts`: replace the `select` menu

- `runInteractive()` becomes the launcher, using clack `autocomplete` with `maxItems` around 8.
- Every item has a `run` function. Built-in commands: add or remove the menu bar item (from the existing `isMenuBarRunning`, `startMenuBar`, `stopMenuBar`), and Exit.
- Enter opens the app or runs the command, then the CLI exits. Esc cancels through the existing `isCancel` path.
- Keep the `start`, `stop` and `status` subcommands unchanged.

### `package.json`

- Add `"test": "node --test"`.

### Unchanged

`menubar.ts` and `native/StatusItem.swift` need no edits. The terminal is decided in one place, `openCliInTerminal()`, which is where the later chooser plugs in. Ghostty 1.4.0 is installed and registers for `public.unix-executable`, but how it should launch is unverified: `-e` reportedly shows a confirmation dialog, so test `open -a Ghostty <launcher>` first when that work starts.

## Known limitation

Terminal may leave a finished window open after each launch, depending on the profile's "When the shell exits" setting. Closing it from code would need Automation permission, so this stays as is until the terminal chooser work.

## Verification

1. `node --test`: `apps.test.ts` (root filter, nested bundles, dedupe, naming) and `search.test.ts` (ranking order, `vsc` style matches, empty query, no match).
2. `pnpm typecheck` and `pnpm check` pass.
3. Run the real prompt in a pseudo-terminal with `script`, type `calc`, press Enter, and confirm Calculator opens. Also check Esc exits cleanly.
4. Confirm `/Applications/Safari.app`, Terminal, Ghostty and Finder appear in the list, and helper bundles do not.
5. Ask the user to press `Cmd+Shift+Space` and try it, since a physical key press can't be simulated from this session.
