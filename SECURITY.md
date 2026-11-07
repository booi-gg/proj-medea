# Security policy

Medea reads your clipboard, registers global hotkeys and, with your permission, controls other apps' windows through Accessibility. Problems in those areas matter, so please report them privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Please don't open a public issue for a security problem.

Include what you found, how to reproduce it, and the Medea, macOS and Node versions. You should hear back within a week. Once a fix is released, you'll be credited in the advisory unless you'd rather not be.

## Supported versions

Only the latest release gets security fixes.

## In scope

- Clipboard content being recorded when it should be skipped, or leaking into logs, sync or other files.
- Search text, link targets or command output appearing in logs.
- Another local user or process being able to drive the helper through its socket.
- Copied text running as code, or escaping the terminal through control sequences.
- Synced files from iCloud Drive being able to run code or overwrite files outside Medea's folders.
