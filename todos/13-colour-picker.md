# Colour picker

**Status:** built, and the magnifier still needs testing by a person. See "Colour picker" in doc/how-it-works.md. The sampler is its own small program and not part of the helper, because helper requests time out after 3 seconds.

**Effort:** medium

## What

Pick a colour from anywhere on screen, then copy it as hex, RGB or HSL. Keep a short history of picked colours.

## How

- `NSColorSampler` in the helper shows macOS's own magnifier.
- Show a swatch in the terminal with a 24-bit background colour.
