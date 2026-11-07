# Redhot sync plan

## Implementation status

The local sync engine, iCloud Drive folder picker, coordinated file bridge, Settings controls, menu bar background timer, `redhot sync` command, and last-sync label beside the launcher logo are implemented. Automated tests cover two simulated Macs, portable settings, Quicklinks, deletion, conflicts, logs, and an unavailable folder. The Swift bridge compiles and its coordinated read and atomic write work on a local test folder.

**Still required before claiming cloud sync is verified:** sign in to iCloud Drive on two Macs, choose the same Redhot Sync folder in Settings on each, and run the real-device cases below. This development Mac currently has no active iCloud Drive folder, so actual iCloud delivery, file eviction, and the folder picker could not be tested here. The last-sync label records Redhot's last successful local exchange with the selected folder; it does not prove Apple's servers have delivered those files to another Mac.

## Goal and assumption

Keep a person's Redhot setup and metadata logs available across their Macs through **iCloud Drive**. This plan assumes two-way sync between Macs signed in to the same Apple Account. Redhot continues to work when iCloud Drive is offline or unavailable.

The first release syncs **shared preferences, Quicklinks, and logs**. Clipboard history is a separate future feature because it contains copied text and images. Caches, generated files, macOS permissions, and machine-specific choices stay local.

## iCloud Drive approach

- Let the user select or create a **Redhot Sync** folder inside iCloud Drive with a macOS folder picker. Save the chosen location in local-only sync state; do not assume a fixed `~/Library/Mobile Documents` path.
- Use files in that folder as the exchange medium. Redhot needs no separate account or server. Keep local files authoritative for fast launcher reads, and import or export in the background.
- First prove that the current CLI and menu bar helper can reliably access a selected iCloud Drive folder, including after restart, offline use, file eviction and a second Mac receiving changes. Use coordinated file access for iCloud reads and writes. If this requires a packaged, signed app or entitlement in practice, make that packaging work a prerequisite before shipping sync.
- Do not start with a native ubiquity container or CloudKit database. Those require app capabilities and entitlements that the current CLI distribution does not have. A native container can be revisited after Redhot has an app bundle.
- Treat iCloud Drive as eventually delivered files, not a transactional database. An absent or temporarily undownloaded file is not a deletion. Only an explicit tombstone deletes synced data.

## What syncs

| Data                                        | Recommendation                         | Reason                                                                                                                                                   |
| ------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built-in and Quicklink aliases              | Sync                                   | They identify the same Redhot item on each Mac.                                                                                                          |
| Built-in and Quicklink hotkeys              | Sync, but validate on each Mac         | A shortcut can conflict with a system or app shortcut on another Mac. Keep an unusable choice visible for correction rather than silently deleting it.   |
| Quicklink names, IDs, URLs and placeholders | Sync                                   | This is user-created launcher data. Warn during setup that URLs may contain private tokens.                                                              |
| Clipboard history retention                 | Sync                                   | It is a preference, even while the history itself stays local.                                                                                           |
| Structured logs                             | Sync by device, with a separate toggle | They are metadata-only, but app and Quicklink identifiers can still be private. The toggle starts on during setup because log sync is part of this plan. |

## What stays local

| Data                                                                        | Reason                                                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Selected terminal, Start at login, Accessibility grant and signing identity | These belong to one Mac. Start at login is a LaunchAgent, not a config field.                                                      |
| `logMaxSizeMb`                                                              | Different Macs may have different free space. Synced log retention is a separate setting.                                          |
| App aliases and hotkeys keyed by `/Applications/...` paths                  | Existing IDs are absolute paths and may point somewhere else on another Mac. Sync these only after app IDs use bundle identifiers. |
| Quicklink `openWith`                                                        | It currently stores an absolute `.app` path. Preserve a local override by Quicklink ID; later support portable bundle identifiers. |
| Clipboard history and image files                                           | Copied content can contain passwords or personal data and can reach gigabytes. Consider explicit opt-in later.                     |
| Currency rates, helper binaries, scripts, sockets and raw crash output      | These are caches or machine-generated state. Rates can be downloaded again.                                                        |

## Storage and merge model

- Keep the current local config, Quicklink and log paths as the files the launcher reads. Search must not wait for a network folder.
- Store a stable random device ID in local-only sync state. Each device writes only inside its own directory in the iCloud Drive folder. Never let two devices append to or replace the same file.
- Record settings and Quicklink changes as small operations with an operation ID, device ID, local sequence, timestamp, item key and value or deletion marker. Use immutable, uniquely named operation files or closed journal segments. Ignore an operation ID already applied.
- Merge by setting key or Quicklink ID, so editing one hotkey cannot overwrite a different Quicklink. Resolve concurrent edits to the same key deterministically by timestamp, then device ID and sequence; retain losing versions in a recoverable conflict record. Deletions need tombstones so an offline Mac cannot resurrect an item.
- Apply imports and local edits through one cross-process write lock. Write a temporary local file and rename it into place. The current config and Quicklink stores need this change before sync can safely write beside the CLI and helper.
- Use a durable local outbox for unsent changes. A crash or unavailable iCloud Drive folder must not lose an edit. Replaying the outbox and reimporting the same operations must be safe. Skip files that have not finished downloading; retry them later.
- On first setup, export the existing shared config fields and Quicklinks as baseline operations. When another Mac joins, merge its existing local data and show conflicts before replacing any same-key value.

Suggested iCloud Drive folder layout:

```text
Redhot Sync/
  devices/<device-id>/changes/<unique-operation>.json
  devices/<device-id>/logs/<closed-segment>.jsonl
```

## Logs

- Keep `~/Library/Logs/Redhot/` and its local size limit. Add a separate sync retention choice, initially **30 days or 50 MB per device**, whichever is reached first.
- Upload only closed, stable JSONL segments. Rotate or snapshot the active log periodically so a low-activity Mac does not wait until the size threshold. Do not sync an actively appended file.
- Include a device ID in each synced segment and show it in the log viewer. Preserve local-offset timestamps, but sort merged views by absolute time. A wrong device clock can still affect order.
- A device prunes only its own synced log directory. The iCloud Drive folder must never let one Mac delete another Mac's active data. If a Mac never returns, its old logs need a manual cleanup option.
- Keep the present metadata-only rule: no search terms, clipboard content, filled links, command arguments or output. Explain that iCloud Drive storage and any folder sharing are controlled by the user's Apple Account.

## User experience

- Settings: **Sync** setup opens a folder picker for iCloud Drive, then shows the device name, selected data types, last successful sync, pending changes, conflicts and errors. Explain that Quicklink URLs and metadata logs are stored in iCloud Drive. Keep the log toggle visible and independently switchable.
- Provide **Sync Now**, **Pause Sync**, **Open Sync Folder**, and a way to disconnect without deleting local data. Offer to keep or remove this device's synced files separately.
- Sync in the background; search and copy actions must never block on it. On a fresh Mac, import before showing shared items if possible, then update the search list when more data arrives.
- An unavailable or undownloaded iCloud Drive folder leaves local features working and shows a small status notice. Recover automatically when it returns.

## Implementation stages

1. **iCloud feasibility:** select an iCloud Drive folder on two Macs and exchange uniquely named files. Verify restart, offline edits, delayed download and file eviction. Check coordinated access from the actual CLI and helper processes. Settle any app packaging or entitlement requirement before the feature build.
2. **Storage safety:** atomic config and Quicklink writes, cross-process locking, local-only sync state and backups. Test a CLI edit racing an import.
3. **Shared data:** iCloud Drive folder setup, device IDs, outbox, operation import/export, deterministic merge, tombstones and conflict recovery. Sync shared config fields and Quicklinks; keep path-based fields local.
4. **Background work:** a low-frequency worker associated with the menu bar helper, plus a nonblocking sync check when the CLI starts. Show status in Settings and add a `redhot sync` command for manual diagnostics.
5. **Logs:** closed-segment export, per-device retention, merged viewing and tests for concurrent writers, rotation, partial files and duplicate imports.
6. **Later, optional:** clipboard history with explicit opt-in, image deduplication, size limits and a separate privacy decision. Support app aliases and `openWith` after switching from paths to portable app IDs.

## Tests before release

- Simulate two Macs using separate local directories and one temporary shared folder. Test offline edits, edits to different keys, simultaneous edits to the same key, deletion versus edit, duplicate delivery and a partially copied file.
- Run the same cases on two real Macs using iCloud Drive. Include delayed and evicted files; verify the app does not interpret them as deletions.
- Verify an app path or `openWith` choice from Mac A never becomes an invalid active setting on Mac B.
- Verify logs from both devices remain complete, bounded and distinguishable, including when one device is offline and returns later.
- Verify the launcher still starts and searches normally when the sync folder is missing or slow.

## Decisions and assumptions

1. **Chosen provider:** iCloud Drive, using a user-selected Redhot Sync folder.
2. **Assumed behavior:** two-way sync between Macs; the same folder also leaves a cloud copy of synced data.
3. **Log control:** a separate toggle, initially on during setup. Turning it off stops new uploads; offer an explicit action to remove this device's previously synced logs.
4. **Release gate:** the feasibility stage decides whether the current CLI and helper can use that folder safely or need a packaged app with entitlements.

## Apple references

- [Choosing an iCloud Drive folder with `NSOpenPanel`](https://developer.apple.com/documentation/appkit/nsopenpanel)
- [Coordinating access to shared files](https://developer.apple.com/documentation/technologyoverviews/shared-data)
- [Native iCloud container entitlement requirements](https://developer.apple.com/documentation/Foundation/FileManager/url%28forUbiquityContainerIdentifier%3A%29)
