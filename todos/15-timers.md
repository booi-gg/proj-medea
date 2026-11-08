# Timers and Pomodoro

**Effort:** small

## What

`timer 25m` or `pomodoro` starts a countdown. A notification appears when it's done.

## How

- The helper owns the timer, so it keeps running after Redhot's window closes.
- Show the time left in the menu bar item's title.
- Notifications through `UNUserNotificationCenter` need a bundle identifier, so a bare binary may need `osascript -e 'display notification'` instead.
