# Dictionary

**Effort:** medium

## What

`define serendipity` shows the definition in the search window.

## How

- macOS's built-in dictionary works through `DCSCopyTextDefinition` (DictionaryServices). The helper or a small Swift tool can call it, like the image preview tool.
- Wrap long definitions to fit the window.
