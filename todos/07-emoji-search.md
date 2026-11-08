# Emoji and symbol search

**Status:** built, and pasting into another app still needs testing by a person. See "Emoji and symbols" in doc/how-it-works.md. Left out: a grid, because a list searches just as well in a terminal, and skin tone variants.

**Effort:** small

## What

Search "fire" to copy 🔥. Also symbols like ⌘, →, ©.

## How

- Bundle a name list from Unicode's emoji data, which is a small JSON file.
- Show a grid or a list, with recent picks first.
- Enter copies, and a second key pastes.
