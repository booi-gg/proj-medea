import AppKit
import Carbon.HIToolbox

/// Pastes into the app you were using before Redhot's window came to the front. Whatever to paste
/// is already on the clipboard. Terminals are never named here: when this is asked for, the terminal
/// holding Redhot is the app in front, so the one to go back to is the one before it.
final class PasteBack {
  private static let request = "paste-previous-app"
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

  /// Requests arrive on the main thread, which also keeps `previous` up to date.
  func answer(_ request: String) -> String? {
    guard request.split(separator: " ").last.map(String.init) == Self.request else {
      return nil
    }
    guard AXIsProcessTrusted() else {
      return Self.noAccessReply
    }
    guard let target = previous, !target.isTerminated else {
      return Self.noAppReply
    }
    // The waiting can't happen here, because the main thread also answers hotkeys.
    queue.async { Self.paste(into: target) }
    return Self.okReply
  }

  private static func paste(into target: NSRunningApplication) {
    let span = RedhotLog.start("paste.previous-app")
    let element = AXUIElementCreateApplication(target.processIdentifier)
    AXUIElementSetMessagingTimeout(element, messagingTimeout)
    AXUIElementSetAttributeValue(element, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    // Cmd+V in the terminal would paste into Redhot's own search bar instead.
    guard waitUntilFrontmost(target) else {
      RedhotLog.end(span, ok: false, fields: ["result": "not-frontmost"])
      return
    }
    usleep(settleMs * microsecondsPerMillisecond)
    pressCommandV()
    RedhotLog.end(span, ok: true)
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

  private static func pressCommandV() {
    let source = CGEventSource(stateID: .privateState)
    for isDown in [true, false] {
      let event = CGEvent(
        keyboardEventSource: source,
        virtualKey: CGKeyCode(kVK_ANSI_V),
        keyDown: isDown
      )
      // Set directly, or a held Shift could turn Cmd+V into another shortcut.
      event?.flags = .maskCommand
      event?.post(tap: .cghidEventTap)
    }
  }
}
