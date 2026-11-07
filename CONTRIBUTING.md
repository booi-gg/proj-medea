# Contributing to Redhot

Thanks for helping. This guide covers setting up a clone, the checks a change must pass, and how to send it.

## Before you start

- For a bug, open an issue with your macOS version, Node version, terminal, and the steps to reproduce it. `redhot logs` output helps, and it never contains your search text or clipboard.
- For a new feature, open an issue first so we can agree on the shape before you write it. Check [doc/roadmap.md](doc/roadmap.md) for what's already planned.

## Set up a clone

You need macOS, Node.js 22.1 or later, [pnpm](https://pnpm.io) and the Xcode Command Line Tools (`xcode-select --install`).

```sh
git clone https://github.com/booi-gg/proj-redhot.git
cd proj-redhot
pnpm install
pnpm menubar:start   # build and start the helper from this checkout
pnpm start           # open search in the current terminal
```

A checkout builds into `.build/` and its menu bar item says "dev", so it can run beside an installed copy without either touching the other.

Node runs the TypeScript directly through type stripping, so there's no build step while you work. Editing a TypeScript file takes effect the next time search opens. Editing a Swift file rebuilds the helper on the next `pnpm menubar:start`, after `pnpm menubar:stop`.

Window actions need Accessibility permission. Run `pnpm menubar:sign` once so the grant survives rebuilds.

## Checks

Run these before opening a pull request:

```sh
pnpm typecheck
pnpm test
pnpm check      # format and lint with Oxfmt and Oxlint
```

`pnpm format` fixes most formatting problems. Don't silence a lint rule with a disable comment; change the code instead.

## How the code is laid out

[doc/how-it-works.md](doc/how-it-works.md) explains the helper, the CLI, and each feature, and has a map of every file. In short:

- `src/launcher/` is the search window.
- `src/redhot-apps/` holds the built-in features. Each one has an ID starting with `redhot-`, its own folder and is listed in `registry.ts`.
- `src/menubar/` and `src/terminals/` start the helper and open terminal windows.
- `native/` is the Swift helper.

Tests sit beside the file they cover, as `name.test.ts`, and run with Node's built-in test runner.

## Code style

- Small, focused functions with descriptive names. Early returns over nested conditions.
- Explicit types at module boundaries. `unknown` over `any`.
- `for...of` over `forEach`, `const` by default.
- A comment explains why, not what.
- No `console.log` left in. Use `withAction()` from `src/log.ts` for anything worth logging, and never log search text, clipboard content, link targets or command output.
- Keep start-up fast: `src/index.ts` imports what each command needs inside that command, because the helper starts Node on every copy and on most hotkeys.

## Pull requests

1. Branch from `main`.
2. Keep each pull request to one change, with tests for new behavior.
3. Update `doc/how-it-works.md` when you change how something works, and `README.md` when you change how something is used.
4. Add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md).
5. Say in the description how you tested it, including which terminal and macOS version, for anything a unit test can't reach.

By contributing, you agree that your work is released under the [MIT License](LICENSE) and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
