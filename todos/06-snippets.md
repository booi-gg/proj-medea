# Snippets with text expansion

**Status:** built, and expansion in other apps still needs testing by a person. See "Snippets" in the README and doc/how-it-works.md. Left out: Enter in search copies a snippet and doesn't paste it into the app behind Redhot.

**Effort:** medium to large · **Roadmap:** "Snippets are still to do"

## What

Save text snippets. Typing a keyword like `;addr` in any app replaces it with the snippet. Snippets can also be searched and pasted from Redhot.

## How

- Searching and copying a snippet from Redhot is easy, and can ship first.
- Expansion needs the helper to watch keystrokes with a `CGEventTap`, which needs Accessibility permission. Window actions already ask for that.
- To replace the keyword: delete it with backspaces, then paste the snippet and put the old clipboard back.
- Placeholders: `{date}`, `{time}`, `{clipboard}`, and `{cursor}` for where the cursor ends up.

## Open questions

- Secure input fields like passwords block event taps. Expansion must fail quietly there.
- Never log typed text.
