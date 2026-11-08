import AppKit
import Carbon.HIToolbox

/// Presses a shortcut in the app you were using before Redhot's window came to the front, to paste
/// what's on the clipboard or open macOS's emoji picker. Terminals are never named here: when this
/// is asked for, the terminal holding Redhot is the app in front, so the one to go back to is the
/// one before it. A hotkey opens no window, so it asks for the front app instead.
final class PasteBack {
  private struct Shortcut {
    let keyCode: Int
    let flags: CGEventFlags
    let logName: String
  }

  private static let pasteRequest = "paste-previous-app"
  private static let emojiPickerPreviousRequest = "emoji-picker-previous-app"
  private static let emojiPickerFrontRequest = "emoji-picker-front-app"
  private static let requests = [pasteRequest, emojiPickerPreviousRequest, emojiPickerFrontRequest]
  private static let paste = Shortcut(
    keyCode: kVK_ANSI_V,
    flags: .maskCommand,
    logName: "paste.previous-app"
  )
  private static let emojiPicker = Shortcut(
    keyCode: kVK_Space,
    flags: [.maskCommand, .maskControl],
    logName: "emoji-picker.open"
  )
  private static let okReply = "ok"
  private static let noAccessReply = "no-access"
  private static let noAppReply = "no-app"
  private static let messagingTimeout: Float = 0.5
  private static let pollMs: UInt32 = 20
  private static let maxWaitMs: UInt32 = 1000
  // Being frontmost doesn't mean its focused field is ready for keys yet.
  private static let settleMs: UInt32 = 80
  private static let microsecondsPerMillisecond: UInt32 = 1000

  private let queue = DispatchQueue(label: "redhot.paste-back", qos: .userInitiated)
  private var current: NSRunningApplication?
  private var previous: NSRunningApplication?
  private var observer: NSObjectProtocol?

  func start() {
    current = NSWorkspace.shared.frontmostApplication
    observer = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      let key = NSWorkspace.applicationUserInfoKey
      if let app = notification.userInfo?[key] as? NSRunningApplication {
        self?.noteActivated(app)
      }
    }
  }

  // Menu-bar-only windows, like the image preview, come and go without being where you were working.
  private func noteActivated(_ app: NSRunningApplication) {
    guard app.activationPolicy == .regular, app != current else {
      return
    }
    previous = current
    current = app
  }

  /// The app in use before this one. Only read this on the main thread, which keeps it up to date.
  var previousApp: NSRunningApplication? {
    previous
  }

  /// Requests arrive on the main thread, which also keeps `previous` up to date.
  func answer(_ request: String) -> String? {
    guard let command = request.split(separator: " ").last.map(String.init),
      Self.requests.contains(command)
    else {
      return nil
    }
    guard AXIsProcessTrusted() else {
      return Self.noAccessReply
    }
    // The waiting can't happen here, because the main thread also answers hotkeys.
    if command == Self.emojiPickerFrontRequest {
      queue.async { Self.press(Self.emojiPicker, in: nil) }
      return Self.okReply
    }
    guard let target = previous, !target.isTerminated else {
      return Self.noAppReply
    }
    let shortcut = command == Self.pasteRequest ? Self.paste : Self.emojiPicker
    queue.async { Self.press(shortcut, in: target) }
    return Self.okReply
  }

  /// With no target, the keys go to whichever app is already in front.
  private static func press(_ shortcut: Shortcut, in target: NSRunningApplication?) {
    let span = RedhotLog.start(shortcut.logName)
    // In the terminal, these keys would act on Redhot's own search bar instead.
    if let target, !bringToFront(target) {
      RedhotLog.end(span, ok: false, fields: ["result": "not-frontmost"])
      return
    }
    settle()
    post(shortcut)
    RedhotLog.end(span, ok: true)
  }

  /// Asks both ways: `activate` can be ignored when a background app asks, and setting the
  /// attribute reports success but does nothing for an app with no windows open. Waits on the
  /// calling thread, so it must not be called on the main one.
  static func bringToFront(_ target: NSRunningApplication) -> Bool {
    let element = AXUIElementCreateApplication(target.processIdentifier)
    AXUIElementSetMessagingTimeout(element, messagingTimeout)
    AXUIElementSetAttributeValue(element, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    target.activate(options: [])
    return waitUntilFrontmost(target)
  }

  static func settle() {
    usleep(settleMs * microsecondsPerMillisecond)
  }

  private static func waitUntilFrontmost(_ target: NSRunningApplication) -> Bool {
    var waitedMs: UInt32 = 0
    while waitedMs < maxWaitMs {
      if NSWorkspace.shared.frontmostApplication == target {
        return true
      }
      usleep(pollMs * microsecondsPerMillisecond)
      waitedMs += pollMs
    }
    return false
  }

  private static func post(_ shortcut: Shortcut) {
    let source = CGEventSource(stateID: .privateState)
    for isDown in [true, false] {
      let event = CGEvent(
        keyboardEventSource: source,
        virtualKey: CGKeyCode(shortcut.keyCode),
        keyDown: isDown
      )
      // Set directly, or a held Shift could turn this into another shortcut.
      event?.flags = shortcut.flags
      event?.post(tap: .cghidEventTap)
    }
  }
}
