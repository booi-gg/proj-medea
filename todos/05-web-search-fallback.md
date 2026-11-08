# Web search fallback

**Effort:** small

## What

- When a search finds nothing, the last row offers "Search Google for 'xyz'".
- Quicklinks can act as search engines: `gh redhot` searches GitHub, `yt lofi` searches YouTube.

## Why

Nothing typed into search is ever wasted, and most of the pieces already exist in Quicklinks.

## How

- Quicklinks already take an argument placeholder, so an alias followed by a space and some text can fill it.
- The fallback search engine is a setting, defaulting to Google, with DuckDuckGo and Kagi as choices.
- Ship a few ready-made engine quicklinks people can add from Settings.
