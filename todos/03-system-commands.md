# System commands

**Effort:** small

## What

Built-in commands for everyday Mac actions: lock screen, sleep, sleep displays, empty Trash, toggle dark mode, show or hide hidden files, eject all disks, restart, shut down, log out.

## Why

Cheap to build, each one is a single command, and people use them every day.

## How

| Command                     | How                                                                      |
| --------------------------- | ------------------------------------------------------------------------ |
| Lock Screen                 | `pmset displaysleepnow`, or the lock shortcut through the helper         |
| Sleep                       | `pmset sleepnow`                                                         |
| Empty Trash                 | AppleScript to Finder                                                    |
| Toggle Dark Mode            | AppleScript to System Events, `appearance preferences`                   |
| Toggle Hidden Files         | `defaults write com.apple.finder AppleShowAllFiles`, then restart Finder |
| Eject All Disks             | AppleScript to Finder                                                    |
| Restart, Shut Down, Log Out | AppleScript to System Events, behind a confirmation                      |

- AppleScript to Finder or System Events asks for Automation permission once. Say so in the README's permissions table.
- Each command can take aliases and hotkeys.
