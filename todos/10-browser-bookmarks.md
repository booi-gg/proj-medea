# Browser bookmarks

**Status:** built for Chrome, Arc, Brave and Edge. Safari is left out for now, because it needs Full Disk Access. See "Browser bookmarks" in doc/how-it-works.md.

**Effort:** small for Chrome, medium for Safari

## What

Search bookmarks from Chrome, Arc, Brave, Edge and Safari, and open them.

## How

- Chrome-based browsers keep bookmarks in a JSON file: `~/Library/Application Support/Google/Chrome/Default/Bookmarks`.
- Safari's `~/Library/Safari/Bookmarks.plist` needs Full Disk Access, so leave it out at first or explain the permission.
- Open each bookmark in the browser it came from.
