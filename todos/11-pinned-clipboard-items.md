# Pinned clipboard items

**Effort:** small

## What

Pin an entry in clipboard history so it stays at the top and is never deleted for being old.

## How

- Add a `pinned` flag to entries in the store.
- Expiry skips pinned entries.
- A key in the history view pins and unpins.
