import AppKit
import Carbon.HIToolbox

let cliCommand = Array(CommandLine.arguments.dropFirst())
guard !cliCommand.isEmpty else {
  FileHandle.standardError.write(Data("usage: redhot-status <cli command> [arguments]\n".utf8))
  exit(64)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let windows = WindowManager()
let countdown = Countdown()
let controller = StatusItemController(cliCommand: cliCommand, windows: windows, countdown: countdown)
let hotKeys = HotKeyCenter()
let handlerStatus = hotKeys.installHandler()
RedhotLog.event("hotkey.handler", level: handlerStatus == noErr ? "info" : "warn", trace: RedhotLog.startupTrace, fields: ["status": handlerStatus])
// Includes the shortcut that opens Redhot, which Settings can change, so this is the only place
// hotkeys are registered and a change needs no restart.
controller.reloadHotKeys(into: hotKeys)

// MARK: - Start

// The CLI can exit before reading all the copied text, which must not end the helper.
signal(SIGPIPE, SIG_IGN)
let clipboardWatcher = ClipboardWatcher(pasteboard: .general) { clip in
  controller.recordClip(clip)
}
clipboardWatcher.start()

// The CLI writes this file, in paths.ts, and asks for a reload over the socket after each change.
let snippetExpander = SnippetExpander(
  path: FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent(".config/redhot/redhot-snippets.json")
    .path
)
snippetExpander.start()

let pasteBack = PasteBack()
pasteBack.start()

// The CLI sends this signal after saving a hotkey, so it works without a restart.
signal(SIGUSR1, SIG_IGN)
let reloadSignal = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
reloadSignal.setEventHandler { controller.reloadHotKeys(into: hotKeys) }
reloadSignal.resume()

let menuSearch = MenuSearch(previousApp: { pasteBack.previousApp })

// Search asks for window actions here. The socket sits next to this binary in the build folder.
let helperSocket = HelperSocket(
  path: URL(fileURLWithPath: CommandLine.arguments[0])
    .deletingLastPathComponent()
    .appendingPathComponent("helper.sock")
    .path,
  onRequest: { request, reply in
    if let answer = NoticePanel.shared.answer(request)
      ?? snippetExpander.answer(request)
      ?? pasteBack.answer(request)
      ?? countdown.answer(request)
    {
      reply(answer)
    } else if !menuSearch.answer(request, reply: reply) {
      windows.answer(request, reply: reply)
    }
  }
)
let socketStarted = helperSocket.start()
RedhotLog.event("helper.socket", level: socketStarted ? "info" : "warn", trace: RedhotLog.startupTrace, fields: ["ok": socketStarted])

app.run()
