import AppKit

enum WindowCommand {
  case place(Placement)
  case center
  case restore
  case moveToDisplay(step: Int)

  private static let placementValues = 4

  /// Reads what the CLI's action list sends, like "place 0 0 0.5 1".
  init?(_ text: String) {
    let parts = text.split(separator: " ").map(String.init)
    switch (parts.first, parts.dropFirst().first) {
    case ("place", _):
      let values = parts.dropFirst().compactMap(Double.init).map { CGFloat($0) }
      guard values.count == Self.placementValues else {
        return nil
      }
      self = .place(Placement(x: values[0], y: values[1], width: values[2], height: values[3]))
    case ("center", _):
      self = .center
    case ("restore", _):
      self = .restore
    case ("display", "next"):
      self = .moveToDisplay(step: 1)
    case ("display", "previous"):
      self = .moveToDisplay(step: -1)
    default:
      return nil
    }
  }
}

/// The raw values are the replies the CLI turns into messages.
enum WindowFailure: String, Error {
  case badCommand = "bad-command"
  case noAccess = "no-access"
  case noWindow = "no-window"
  case fullScreen = "full-screen"
  case notMovable = "not-movable"
  case nothingToRestore = "nothing-to-restore"
  case oneDisplay = "one-display"
}

private enum WindowTarget {
  /// Closing an app's last window leaves that app in front with nothing to move, while another
  /// app's window looks active. That window is the one you mean, so it's used instead.
  case focused
  /// Search itself is the focused window, so the one you were using is the next one down.
  case behindFocused
}

private struct SavedFrame {
  let original: CGRect
  let lastPlaced: CGRect
}

/// Moves other apps' windows through the Accessibility API.
final class WindowManager {
  // An app that has stopped responding would otherwise hold each call for the default six seconds.
  private static let messagingTimeout: Float = 0.5
  private static let maxSavedFrames = 100
  private static let fullScreenAttribute = "AXFullScreen"
  private static let enhancedInterfaceAttribute = "AXEnhancedUserInterface"
  private static let okReply = "ok"

  // Accessibility calls wait on the other app, and the main thread also answers hotkeys.
  private let queue = DispatchQueue(label: "redhot.windows", qos: .userInteractive)
  /// Only touched on the queue.
  private var savedFrames: [AXUIElement: SavedFrame] = [:]

  /// Answers one line from the CLI's socket.
  func answer(_ request: String, reply: @escaping (String) -> Void) {
    let parts = request.split(separator: " ", maxSplits: 2).map(String.init)
    let traceValue = parts.count == 3 && parts[0] == "trace" ? parts[1] : nil
    let isValidTrace = traceValue?.range(of: "^[a-f0-9-]{6,64}$", options: .regularExpression) != nil
    let trace = isValidTrace ? traceValue : nil
    let commandRequest = trace == nil ? request : parts[2]
    if commandRequest == "access" {
      reply(AXIsProcessTrusted() ? "granted" : "missing")
    } else if commandRequest == "access ask" {
      askForAccess()
      reply(Self.okReply)
    } else if commandRequest.hasPrefix("window ") {
      let command = String(commandRequest.dropFirst("window ".count))
      let span = RedhotLog.start("window.run", trace: trace, fields: ["kind": Self.safeCommand(command), "sourceKind": "socket"])
      run(command, on: .behindFocused) { failure in
        RedhotLog.end(span, ok: failure == nil, fields: ["result": failure?.rawValue ?? "ok"])
        reply(failure?.rawValue ?? Self.okReply)
      }
    } else {
      reply(WindowFailure.badCommand.rawValue)
    }
  }

  /// A hotkey has nowhere to show a message, so a failure is a beep.
  func runFromHotKey(_ command: String, trace: String? = nil, parent: String? = nil) {
    let span = RedhotLog.start("window.run", trace: trace, parent: parent, fields: [
      "kind": Self.safeCommand(command), "sourceKind": "hotkey",
    ])
    run(command, on: .focused) { failure in
      RedhotLog.end(span, ok: failure == nil, fields: ["result": failure?.rawValue ?? "ok"])
      if failure != nil {
        DispatchQueue.main.async { NSSound.beep() }
      }
    }
  }

  private static func safeCommand(_ command: String) -> String {
    let kind = command.split(separator: " ").first.map(String.init) ?? "unknown"
    return ["place", "center", "restore", "display"].contains(kind) ? kind : "unknown"
  }

  private func askForAccess() {
    let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary)
  }

  private func run(
    _ text: String,
    on target: WindowTarget,
    finish: @escaping (WindowFailure?) -> Void
  ) {
    guard let command = WindowCommand(text) else {
      finish(.badCommand)
      return
    }
    guard AXIsProcessTrusted() else {
      askForAccess()
      finish(.noAccess)
      return
    }
    // Read here, on the main thread, because AppKit keeps these up to date there.
    let areas = readUsableAreas()
    let frontPid = NSWorkspace.shared.frontmostApplication?.processIdentifier
    queue.async { [self] in
      do {
        let (window, isFocused) = try findWindow(target, frontPid: frontPid)
        try perform(command, on: window, areas: areas)
        if !isFocused {
          raise(window)
        }
        finish(nil)
      } catch {
        finish(error as? WindowFailure ?? .notMovable)
      }
    }
  }

  // MARK: - Finding the window

  /// Each display's area without the menu bar and Dock, left to right, in Accessibility coordinates.
  private func readUsableAreas() -> [CGRect] {
    guard let primaryHeight = NSScreen.screens.first?.frame.maxY else {
      return []
    }
    let areas = NSScreen.screens.map { screen -> CGRect in
      let usable = screen.visibleFrame
      return CGRect(
        x: usable.minX,
        y: primaryHeight - usable.maxY,
        width: usable.width,
        height: usable.height
      )
    }
    return areas.sorted { ($0.minX, $0.minY) < ($1.minX, $1.minY) }
  }

  private func findWindow(
    _ target: WindowTarget,
    frontPid: pid_t?
  ) throws -> (window: AXUIElement, isFocused: Bool) {
    let focused = frontPid.flatMap(readFocusedWindow)
    if case .focused = target, let focused {
      return (focused, true)
    }
    // With nothing focused there's nothing to skip, so this is simply the top window.
    guard let window = findTopWindow(except: focused) else {
      throw WindowFailure.noWindow
    }
    return (window, false)
  }

  private func toAppElement(pid: pid_t) -> AXUIElement {
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, Self.messagingTimeout)
    return app
  }

  private func readFocusedWindow(pid: pid_t) -> AXUIElement? {
    let app = toAppElement(pid: pid)
    return readElement(app, kAXFocusedWindowAttribute) ?? readElement(app, kAXMainWindowAttribute)
  }

  /// The window list runs front to back and needs no permission, but only Accessibility can move a
  /// window, so each entry is matched to an app's window by its frame. Anything that doesn't match,
  /// like a floating panel with no Accessibility window, is skipped.
  private func findTopWindow(except excluded: AXUIElement?) -> AXUIElement? {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    let listed = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
    var windowsByPid: [pid_t: [AXUIElement]] = [:]

    for entry in listed {
      guard entry[kCGWindowLayer as String] as? Int == 0,
        let pid = entry[kCGWindowOwnerPID as String] as? pid_t,
        let bounds = entry[kCGWindowBounds as String] as? NSDictionary,
        let frame = CGRect(dictionaryRepresentation: bounds as CFDictionary)
      else {
        continue
      }
      let windows = windowsByPid[pid] ?? readWindows(pid: pid)
      windowsByPid[pid] = windows
      let match = windows.first { window in
        readFrame(window).map { isSameFrame($0, frame) } ?? false
      }
      if let match, match != excluded {
        return match
      }
    }
    return nil
  }

  private func readWindows(pid: pid_t) -> [AXUIElement] {
    var value: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(
      toAppElement(pid: pid),
      kAXWindowsAttribute as CFString,
      &value
    )
    return status == .success ? value as? [AXUIElement] ?? [] : []
  }

  // MARK: - Moving the window

  private func perform(
    _ command: WindowCommand,
    on window: AXUIElement,
    areas: [CGRect]
  ) throws {
    AXUIElementSetMessagingTimeout(window, Self.messagingTimeout)
    guard !readFlag(window, Self.fullScreenAttribute) else {
      throw WindowFailure.fullScreen
    }
    guard let current = readFrame(window), !areas.isEmpty else {
      throw WindowFailure.notMovable
    }
    let areaIndex = findAreaIndex(for: current, in: areas)
    let area = areas[areaIndex]

    switch command {
    case .place(let placement):
      let placed = try setFrame(
        window,
        to: toFrame(placement, in: area),
        pinRight: placement.touchesRightOnly,
        pinBottom: placement.touchesBottomOnly
      )
      saveFrame(of: window, before: current, after: placed)
    case .center:
      let placed = try setFrame(window, to: toCenteredFrame(current, in: area))
      saveFrame(of: window, before: current, after: placed)
    case .moveToDisplay(let step):
      guard areas.count > 1 else {
        throw WindowFailure.oneDisplay
      }
      let nextIndex = (areaIndex + step + areas.count) % areas.count
      let frame = toCarriedFrame(current, from: area, to: areas[nextIndex])
      let placed = try setFrame(window, to: frame)
      saveFrame(of: window, before: current, after: placed)
    case .restore:
      guard let saved = savedFrames.removeValue(forKey: window) else {
        throw WindowFailure.nothingToRestore
      }
      _ = try setFrame(window, to: saved.original)
    }
  }

  /// Repeated actions keep the first frame, unless you've moved the window yourself since.
  private func saveFrame(of window: AXUIElement, before: CGRect, after: CGRect) {
    let previous = savedFrames[window]
    let isStillPlaced = previous.map { isSameFrame($0.lastPlaced, before) } ?? false
    if previous == nil, savedFrames.count >= Self.maxSavedFrames {
      // Closed windows leave entries behind, and nothing says when one has closed.
      savedFrames.removeAll()
    }
    let original = isStillPlaced ? previous?.original ?? before : before
    savedFrames[window] = SavedFrame(original: original, lastPlaced: after)
  }

  /// Returns where the window ended up, which differs when an app holds a minimum size or snaps to
  /// a grid, like Terminal does. A window against a far edge then moves back to that edge.
  @discardableResult
  private func setFrame(
    _ window: AXUIElement,
    to frame: CGRect,
    pinRight: Bool = false,
    pinBottom: Bool = false
  ) throws -> CGRect {
    var pid: pid_t = 0
    AXUIElementGetPid(window, &pid)
    let app = toAppElement(pid: pid)
    // Chrome and Electron animate each change while this is on, and the steps below then clash.
    let isEnhanced = readFlag(app, Self.enhancedInterfaceAttribute)
    if isEnhanced {
      writeFlag(app, Self.enhancedInterfaceAttribute, false)
    }
    defer {
      if isEnhanced {
        writeFlag(app, Self.enhancedInterfaceAttribute, true)
      }
    }

    // Size first so the window fits where it's going, and again because macOS may have limited
    // the first one to what fitted where it was. A window that can't resize still moves.
    writeSize(window, frame.size)
    guard writePosition(window, frame.origin) else {
      throw WindowFailure.notMovable
    }
    writeSize(window, frame.size)

    guard let actual = readFrame(window) else {
      return frame
    }
    let pinned = CGPoint(
      x: pinRight ? frame.maxX - actual.width : frame.minX,
      y: pinBottom ? frame.maxY - actual.height : frame.minY
    )
    guard pinned != actual.origin, pinRight || pinBottom else {
      return actual
    }
    writePosition(window, pinned)
    return readFrame(window) ?? actual
  }

  private func raise(_ window: AXUIElement) {
    var pid: pid_t = 0
    AXUIElementGetPid(window, &pid)
    AXUIElementPerformAction(window, kAXRaiseAction as CFString)
    writeFlag(toAppElement(pid: pid), kAXFrontmostAttribute, true)
  }

  // MARK: - Accessibility values

  private func readValue(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    var value: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    return status == .success ? value : nil
  }

  private func readElement(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
    guard let value = readValue(element, attribute),
      CFGetTypeID(value) == AXUIElementGetTypeID()
    else {
      return nil
    }
    return unsafeDowncast(value, to: AXUIElement.self)
  }

  private func readFlag(_ element: AXUIElement, _ attribute: String) -> Bool {
    readValue(element, attribute) as? Bool ?? false
  }

  private func writeFlag(_ element: AXUIElement, _ attribute: String, _ flag: Bool) {
    AXUIElementSetAttributeValue(element, attribute as CFString, flag as CFBoolean)
  }

  private func readFrame(_ window: AXUIElement) -> CGRect? {
    var position = CGPoint.zero
    var size = CGSize.zero
    guard let positionValue = readValue(window, kAXPositionAttribute),
      let sizeValue = readValue(window, kAXSizeAttribute),
      CFGetTypeID(positionValue) == AXValueGetTypeID(),
      CFGetTypeID(sizeValue) == AXValueGetTypeID(),
      AXValueGetValue(unsafeDowncast(positionValue, to: AXValue.self), .cgPoint, &position),
      AXValueGetValue(unsafeDowncast(sizeValue, to: AXValue.self), .cgSize, &size)
    else {
      return nil
    }
    return CGRect(origin: position, size: size)
  }

  @discardableResult
  private func writePosition(_ window: AXUIElement, _ position: CGPoint) -> Bool {
    var position = position
    guard let value = AXValueCreate(.cgPoint, &position) else {
      return false
    }
    return AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value) == .success
  }

  @discardableResult
  private func writeSize(_ window: AXUIElement, _ size: CGSize) -> Bool {
    var size = size
    guard let value = AXValueCreate(.cgSize, &size) else {
      return false
    }
    return AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, value) == .success
  }
}
