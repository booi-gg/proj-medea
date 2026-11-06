import AppKit
import Carbon.HIToolbox

private let hotKeyKeyCode = UInt32(kVK_Space)
private let hotKeyModifiers = UInt32(cmdKey | shiftKey)

let cliCommand = Array(CommandLine.arguments.dropFirst())
guard !cliCommand.isEmpty else {
  FileHandle.standardError.write(Data("usage: medea-status <cli command> [arguments]\n".utf8))
  exit(64)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let windows = WindowManager()
let controller = StatusItemController(cliCommand: cliCommand, windows: windows)
let hotKeys = HotKeyCenter()
NSLog("Medea hotkey handler status: \(hotKeys.installHandler())")
let hotKeyStatus = hotKeys.registerPermanent(keyCode: hotKeyKeyCode, modifiers: hotKeyModifiers) {
  controller.showCli()
}
NSLog("Medea hotkey registration status: \(hotKeyStatus)")
controller.reloadHotKeys(into: hotKeys)

// MARK: - Start

// The CLI can exit before reading all the copied text, which must not end the helper.
signal(SIGPIPE, SIG_IGN)
let clipboardWatcher = ClipboardWatcher(pasteboard: .general) { clip in
  controller.recordClip(clip)
}
clipboardWatcher.start()

// The CLI sends this signal after saving a hotkey, so it works without a restart.
signal(SIGUSR1, SIG_IGN)
let reloadSignal = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
reloadSignal.setEventHandler { controller.reloadHotKeys(into: hotKeys) }
reloadSignal.resume()

// Search asks for window actions here. The socket sits next to this binary in .build.
let helperSocket = HelperSocket(
  path: URL(fileURLWithPath: CommandLine.arguments[0])
    .deletingLastPathComponent()
    .appendingPathComponent("helper.sock")
    .path,
  onRequest: windows.answer
)
NSLog("Medea helper socket started: \(helperSocket.start())")

app.run()
