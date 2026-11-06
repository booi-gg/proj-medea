# Medea logging

## Context

Medea should record every action and process, with process ids, date, time and duration, and the total size of the logs should be configurable.

Today the only logging is a few `NSLog` calls in the helper, written to `.build/helper.log`. The CLI logs nothing, and its 16 empty `catch` blocks hide failures completely. That log also has no size limit when the helper starts at login, because launchd appends to it forever.

Medea is many processes, not one. The helper stays running, a CLI window can stay open, and a new Node process starts on every copy and hotkey. All of them have to share one log safely, and logging must not slow down that short-lived Node start.

## Open decisions

The recommendations below are what the rest of this plan assumes.

1. **What "everything" includes.** Recommended: log every action but no content. That means byte counts and types, not clipboard text, search text, filled-in links or command arguments. Logging keystrokes or copied text would create a plaintext file of passwords and tokens, and the helper already keeps copied content out of its log on purpose. The catch is that the log says "quicklink X opened", not the URL.
2. **Default size.** Recommended: 50 MB. That is about 30,000 copies of history at an estimated 1.5 KB per copy. The estimate comes from line size and has not been measured.
3. **Location.** Recommended: `~/Library/Logs/Medea/`, which Console.app lists automatically. The alternative is `~/.config/medea/logs`, next to the other settings.

## Log format

Each process appends one JSON object per line to `~/Library/Logs/Medea/medea.log`:

```json
{"ts":"2026-11-07T01:14:22.318+05:30","level":"info","source":"cli","pid":48213,"ppid":48190,"trace":"a1b2c3","id":"d4e5f6","parent":"9f8e7d","event":"item.run","phase":"end","item":"medea-quicklinks:open","durationMs":142,"ok":true}
```

- `ts` holds the date and time, with the local offset.
- `pid` and `ppid` are the OS process ids.
- `id` identifies each action, and `parent` is the action that started it.
- `trace` links everything from one trigger, such as hotkey → helper → CLI → `open`.
- Anything that takes time writes a `start` and an `end` line, and the `end` line has `durationMs`. A `start` with no `end` means the process was killed or crashed.
- Lines are capped in length, so a long stack trace can't produce a huge line.

Everything is logged, so there is no log level setting at first. `level` stays in each line for filtering.

These are not logged, because they run on every keystroke: `listItems`, `readConfigSync` and the search text itself.

## Size limit and rotation

- `logMaxSizeMb` in the config is the total for all log files, with choices of 10, 50, 100 or 500 and a default of 50. It follows the pattern of `HISTORY_MONTH_CHOICES` in `config.ts`.
- At a tenth of the limit, the active file is renamed to a unique timestamped name. The oldest files are then deleted until the total fits, so one deletion loses about a tenth of the history.
- Unique names mean no locks are needed. Two processes rotating at once can't overwrite each other, and the worst case is one very small file.
- Writes are synchronous and unbuffered. `process.exit(0)` and closing the terminal window would lose anything still queued.
- Each write opens the file, appends and closes it, so a long-running process always follows a rotation.
- Only Node rotates. The helper just appends, so it doesn't need the size setting. Every copy starts Node anyway, and window hotkeys, the one thing that doesn't, add only a few hundred bytes each.

### Stress test

12 Node processes wrote 240,000 lines through about 1,100 rotations, with no lines lost, corrupted or duplicated. Each write took about 237µs under that load.

This test did not cover deleting old files or Swift writers, so stages 1 and 4 need to cover those.

## Stages

Stages 1 to 3 are useful without the rest.

### 1. Logger

- Add `src/log.ts`, using only `node:fs`, because Node starts on every copy and hotkey.
- Add the log paths to `paths.ts`, with a way for tests to use a temporary folder so they never write to the real log.
- A logging failure must never break the app.
- Tests cover formatting, scrubbing, rotation, deletion and concurrent writers.

### 2. Processes and commands

These shared points cover most of the activity:

- `main()` in `src/index.ts` for process start, end and errors. The `end` line must be written before `closeOwnWindow()`.
- `runCommand` in `src/shell.ts`, which covers all its call sites at once. It has to keep the `(file)` and `(file, options)` call shapes working.
- The 5 direct `spawn` calls.
- `sendSocketRequest` in `src/socket.ts`.

### 3. User actions

- `trackItem` in `src/launcher/launcher.ts` and `runCommandItem` in `src/terminals/actions.ts`, since hotkeys skip `trackItem`.
- `updateConfig` and the clipboard and quicklink stores.
- `showErrorsAsNotice` and the empty `catch` blocks, as warnings.

### 4. Swift helper

- Add `native/Log.swift` to `helperSourcePaths`. It only appends, using the same line format.
- Log hotkeys, window actions and clipboard detection, with types and byte counts only.
- Log `runCli` with the child pid, exit status and duration, and pass `trace` through its existing `environment` parameter as `MEDEA_TRACE`.
- Replace the `NSLog` calls, and keep `helper.log` for raw crash output only.
- Test Swift and Node writing at the same time.

This stage rebuilds the helper, so window actions need a quick retest afterwards.

### 5. Settings and viewing

- Add the size setting to the Settings app.
- Add a `medea logs` command that prints readable rows, with `--follow` and `--trace <id>`.
- Update `doc/how-it-works.md`.

## Known problems to handle

- **Secrets in error messages:** `execFile` errors include the full command line, and `openTarget` errors include the filled-in link. The logger records exit codes and scrubbed errors instead of raw messages.
- **Clipboard text in command output:** `pbpaste` returns it as stdout, so command output is never logged.
- **False failures:** `pgrep` exiting with 1 just means no match, so it isn't logged as an error.
- **Misleading durations:** an item that asks for input includes the time spent typing, so these lines are marked as interactive.
- **Recursion:** logging a bad config while the logger reads its size from config could loop, so it needs a guard.
- **Broken traces:** a terminal window opened through a `.command` script doesn't inherit `trace`, so it starts a new one. `ppid` won't link it either, because its parent is the terminal.
