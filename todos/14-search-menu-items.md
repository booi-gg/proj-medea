# Search menu items

**Effort:** medium

## What

Search the menu bar of the app you were just using, like `export pdf`, and run the item.

## How

- The helper reads the frontmost app's menus through the Accessibility API. Window actions already ask for that permission.
- Remember the frontmost app before Redhot's window takes focus.
- Show the menu path, like "File → Export → PDF", and the item's shortcut.
