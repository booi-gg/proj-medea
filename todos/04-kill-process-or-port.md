# Kill a process or port

**Effort:** small

## What

- Search running apps and processes, then quit or force quit one.
- Type `port 3000` to see what's listening on that port and stop it.

## Why

Developers do this all the time, and it's a natural fit for a terminal.

## How

- Apps: the same list as app search, filtered to running ones. Quit politely with AppleScript and force quit with `kill -9`.
- Processes: `ps -axo pid,comm,%cpu,rss`, with CPU and memory shown beside each.
- Ports: `lsof -nP -iTCP:<port> -sTCP:LISTEN` to find the process ID.
- Ask before force quitting, and before stopping anything owned by root, which also needs `sudo`.
