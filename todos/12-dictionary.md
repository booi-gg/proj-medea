# Dictionary

**Status:** built. See "Dictionary" in doc/how-it-works.md. The definition opens on Enter, in `less`, because search rows are made on every keystroke and the longest entries run to 21,000 characters.

**Effort:** medium

## What

`define serendipity` shows the definition in the search window.

## How

- macOS's built-in dictionary works through `DCSCopyTextDefinition` (DictionaryServices). The helper or a small Swift tool can call it, like the image preview tool.
- Wrap long definitions to fit the window.
