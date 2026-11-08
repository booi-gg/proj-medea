# File search

**Effort:** small to medium

## What

Type a file name and get matching files. Enter opens the file. Other keys reveal it in Finder or copy its path.

## Why

People search for files daily, and a terminal is good at showing paths.

## How

- `mdfind -name <query>` asks Spotlight. Limit results and stop old queries as the person keeps typing.
- Show the name, with the shortened folder path dimmed beside it.
- Keep it as its own mode, entered with a prefix like `f ` or a "Search Files" item, so app search stays fast.
- Actions: Open (`open <path>`), Reveal in Finder (`open -R <path>`), Copy Path, Open With….

## Open questions

- Folders to leave out, like `node_modules` and `Library`.
- Whether to sort recent files first (`kMDItemLastUsedDate`).
