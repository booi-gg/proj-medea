import AppKit
import Carbon.HIToolbox

private let snippetTapCallback: CGEventTapCallBack = { _, type, event, userInfo in
  if let userInfo {
    Unmanaged<SnippetExpander>.fromOpaque(userInfo).takeUnretainedValue().observe(type, event)
  }
  return Unmanaged.passUnretained(event)
}

/// Replaces a typed keyword with its snippet in any app. Keystrokes are read here and never logged.
///
/// There's only a tap while a keyword exists and the helper has Accessibility permission, so people
/// who don't use snippets have nothing watching their keyboard.
final class SnippetExpander {
  // Marks this helper's own key presses, so it doesn't read them as typing.
  private static let syntheticMarker: Int64 = 0x5244_4854  // "RDHT"
  private static let reply = "ok"
  private static let requestPrefix = "snippets"
  private static let transientType = NSPasteboard.PasteboardType("org.nspasteboard.TransientType")
  private static let permissionCheckInterval: TimeInterval = 5
  // Long enough for a form, and short enough that a crashed CLI can't leave expansion off.
  private static let pauseDuration: TimeInterval = 300
  private static let messagingTimeout: Float = 0.5
  private static let secureSubrole = kAXSecureTextFieldSubrole as String
  private static let microsecondsPerMillisecond: UInt32 = 1000
  // Lets the keyword's last key reach the app before it's deleted.
  private static let keywordSettleMs: UInt32 = 20
  // Apps can drop key presses that arrive with no gap at all.
  private static let keyGapMs: UInt32 = 2
  private static let pasteSettleMs: UInt32 = 50
  // Apps read the clipboard some time after Cmd+V, so it can't be put back straight away.
  private static let clipboardRestoreMs: UInt32 = 300

  private let path: String
  private let pasteboard = NSPasteboard.general
  private let queue = DispatchQueue(label: "redhot.snippets", qos: .userInteractive)
  private let source = CGEventSource(stateID: .privateState)
  private var timer: Timer?
  private var activationObserver: NSObjectProtocol?

  // The tap has its own thread, so a busy main thread can't delay typing in every app.
  private let lock = NSLock()
  private var matcher = SnippetMatcher()
  private var snippets: [String: String] = [:]
  private var tap: CFMachPort?
  private var isExpanding = false
  private var pausedUntil: Date?

  init(path: String) {
    self.path = path
    source?.userData = Self.syntheticMarker
  }

  /// The permission is only checked here, because a hotkey or window action is what should ask.
  func start() {
    activationObserver = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.forgetTyping()
    }
    reload()
    timer = Timer.scheduledTimer(
      withTimeInterval: Self.permissionCheckInterval,
      repeats: true
    ) { [weak self] _ in
      self?.syncTap()
    }
  }

  /// Answers "snippets reload", "snippets pause" and "snippets resume", which may follow a trace.
  func answer(_ request: String) -> String? {
    let parts = request.split(separator: " ")
    guard parts.count >= 2, parts[parts.count - 2] == Self.requestPrefix else {
      return nil
    }
    switch parts[parts.count - 1] {
    case "reload":
      reload()
    case "pause":
      setPausedUntil(Date().addingTimeInterval(Self.pauseDuration))
    case "resume":
      setPausedUntil(nil)
    default:
      return WindowFailure.badCommand.rawValue
    }
    return Self.reply
  }

  private func reload() {
    let loaded = readSnippets()
    lock.withLock {
      snippets = loaded
      matcher.setKeywords(Array(loaded.keys))
    }
    syncTap()
  }

  private func setPausedUntil(_ date: Date?) {
    lock.withLock {
      pausedUntil = date
      matcher.reset()
    }
  }

  private func forgetTyping() {
    lock.withLock { matcher.reset() }
  }

  /// A broken file reads as no snippets, the same as it does in search.
  private func readSnippets() -> [String: String] {
    guard let data = FileManager.default.contents(atPath: path) else {
      return [:]
    }
    guard let list = (try? JSONSerialization.jsonObject(with: data)) as? [Any] else {
      RedhotLog.event("snippet.read-failed", level: "warn")
      return [:]
    }
    var loaded: [String: String] = [:]
    for case let entry as [String: Any] in list {
      if let keyword = entry["keyword"] as? String, isExpandableKeyword(keyword), let text = entry["text"] as? String {
        loaded[keyword] = text
      }
    }
    return loaded
  }

  /// Runs on the main thread. A tap left running after the permission is taken away can stop the
  /// keyboard working, so this also removes it again.
  private func syncTap() {
    let wanted = lock.withLock { !snippets.isEmpty } && AXIsProcessTrusted()
    let current = lock.withLock { tap }
    if wanted, current == nil {
      startTap()
    } else if !wanted, let current {
      stopTap(current)
    }
  }

  private func startTap() {
    let eventTypes: [CGEventType] = [.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown]
    let mask = eventTypes.reduce(CGEventMask(0)) { $0 | (1 << $1.rawValue) }
    // Active, even though every event passes through unchanged, because a listen-only tap needs
    // Input Monitoring as well and an active one only needs the Accessibility Redhot already asks for.
    guard
      let newTap = CGEvent.tapCreate(
        tap: .cgSessionEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,
        eventsOfInterest: mask,
        callback: snippetTapCallback,
        userInfo: Unmanaged.passUnretained(self).toOpaque()
      ),
      let runLoopSource = CFMachPortCreateRunLoopSource(nil, newTap, 0)
    else {
      RedhotLog.event("snippet.tap", level: "warn", fields: ["ok": false])
      return
    }
    lock.withLock { tap = newTap }
    let thread = Thread {
      CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
      CGEvent.tapEnable(tap: newTap, enable: true)
      // Returns once the tap is invalidated, because the run loop then has nothing left to wait on.
      CFRunLoopRun()
    }
    thread.name = "redhot.snippets.tap"
    thread.qualityOfService = .userInteractive
    thread.start()
    RedhotLog.event("snippet.tap", fields: ["ok": true])
  }

  private func stopTap(_ current: CFMachPort) {
    lock.withLock {
      tap = nil
      matcher.reset()
    }
    CGEvent.tapEnable(tap: current, enable: false)
    CFMachPortInvalidate(current)
    RedhotLog.event("snippet.tap", fields: ["ok": false, "reason": "stopped"])
  }

  /// Runs on the tap's thread for every key press in every app, so it must return quickly.
  fileprivate func observe(_ type: CGEventType, _ event: CGEvent) {
    lock.lock()
    defer { lock.unlock() }
    switch type {
    case .tapDisabledByTimeout, .tapDisabledByUserInput:
      if let tap {
        CGEvent.tapEnable(tap: tap, enable: true)
      }
      matcher.reset()
    case .keyDown:
      observeKey(event)
    default:
      // A click can move the cursor, so what came before may no longer be next to it.
      matcher.reset()
    }
  }

  private func observeKey(_ event: CGEvent) {
    guard event.getIntegerValueField(.eventSourceUserData) != Self.syntheticMarker else {
      return
    }
    let isPaused = pausedUntil.map { Date() < $0 } ?? false
    // Secure input hides keys from the tap, so anything it saw before can't be trusted either.
    guard !isExpanding, !isPaused, !IsSecureEventInputEnabled() else {
      matcher.reset()
      return
    }
    let flags = event.flags
    guard flags.isDisjoint(with: [.maskCommand, .maskControl]) else {
      matcher.reset()
      return
    }
    if event.getIntegerValueField(.keyboardEventKeycode) == kVK_Delete {
      if flags.contains(.maskAlternate) {
        matcher.reset()
      } else {
        matcher.deleteLast()
      }
      return
    }
    guard let text = Self.readTypedText(event) else {
      matcher.reset()
      return
    }
    guard let keyword = matcher.add(text), let template = snippets[keyword] else {
      return
    }
    isExpanding = true
    queue.async { [self] in
      expand(template, keywordLength: keyword.count)
      lock.withLock { isExpanding = false }
    }
  }

  /// Returns nil for anything that doesn't type, like the arrow keys, Return and Esc.
  private static func readTypedText(_ event: CGEvent) -> String? {
    var length = 0
    var units = [UniChar](repeating: 0, count: 8)
    event.keyboardGetUnicodeString(
      maxStringLength: units.count,
      actualStringLength: &length,
      unicodeString: &units
    )
    let text = String(utf16CodeUnits: units, count: length)
    let isTyped = !text.isEmpty && text.unicodeScalars.allSatisfy { scalar in
      // The function and arrow keys report characters from this private range.
      scalar.value >= 0x20 && scalar.value != 0x7F && !(0xF700...0xF8FF).contains(scalar.value)
    }
    return isTyped ? text : nil
  }

  private func expand(_ template: String, keywordLength: Int) {
    let span = RedhotLog.start("snippet.expand")
    Self.sleepMs(Self.keywordSettleMs)
    // Secure input catches most password fields. This catches the ones that only say what they are.
    guard !IsSecureEventInputEnabled(), !Self.isFocusedFieldSecure() else {
      RedhotLog.end(span, ok: true, fields: ["result": "secure-field"])
      return
    }
    let saved = readPasteboardItems()
    let clipboard = pasteboard.string(forType: .string) ?? ""
    let filled = fillSnippet(template, now: Date(), clipboard: clipboard)

    press(UInt16(kVK_Delete), times: keywordLength)
    let snippetChange = putOnPasteboard([[(.string, Data(filled.text.utf8))]])
    press(UInt16(kVK_ANSI_V), flags: .maskCommand)
    Self.sleepMs(Self.pasteSettleMs)
    press(UInt16(kVK_LeftArrow), times: filled.charactersAfterCursor)

    Self.sleepMs(Self.clipboardRestoreMs)
    // Something copied in the meantime is newer than what would be put back.
    if pasteboard.changeCount == snippetChange {
      putOnPasteboard(saved)
    }
    RedhotLog.end(span, ok: true)
  }

  private static func sleepMs(_ milliseconds: UInt32) {
    usleep(milliseconds * microsecondsPerMillisecond)
  }

  private static func isFocusedFieldSecure() -> Bool {
    let system = AXUIElementCreateSystemWide()
    AXUIElementSetMessagingTimeout(system, messagingTimeout)
    var focused: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(
      system,
      kAXFocusedUIElementAttribute as CFString,
      &focused
    )
    guard status == .success, let focused, CFGetTypeID(focused) == AXUIElementGetTypeID() else {
      return false
    }
    var subrole: CFTypeRef?
    // The cast can't fail, because the type ID was checked above.
    let element = focused as! AXUIElement
    AXUIElementSetMessagingTimeout(element, messagingTimeout)
    AXUIElementCopyAttributeValue(element, kAXSubroleAttribute as CFString, &subrole)
    return subrole as? String == secureSubrole
  }

  private func readPasteboardItems() -> [[(NSPasteboard.PasteboardType, Data)]] {
    (pasteboard.pasteboardItems ?? []).map { item in
      item.types.compactMap { type in
        item.data(forType: type).map { (type, $0) }
      }
    }
  }

  /// Marked temporary, so clipboard history doesn't record the snippet, or record whatever was
  /// there before as if it had just been copied. Returns the pasteboard's change count afterwards.
  @discardableResult
  private func putOnPasteboard(_ items: [[(NSPasteboard.PasteboardType, Data)]]) -> Int {
    pasteboard.clearContents()
    let pasteboardItems = items.map { contents -> NSPasteboardItem in
      let item = NSPasteboardItem()
      for (type, data) in contents {
        item.setData(data, forType: type)
      }
      item.setData(Data(), forType: Self.transientType)
      return item
    }
    pasteboard.writeObjects(pasteboardItems)
    return pasteboard.changeCount
  }

  private func press(_ key: CGKeyCode, flags: CGEventFlags = [], times: Int = 1) {
    guard times > 0 else {
      return
    }
    for _ in 0..<times {
      for isDown in [true, false] {
        guard let event = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: isDown) else {
          continue
        }
        // Set directly, or a held Shift could turn Cmd+V into another shortcut.
        event.flags = flags
        event.setIntegerValueField(.eventSourceUserData, value: Self.syntheticMarker)
        event.post(tap: .cghidEventTap)
      }
      Self.sleepMs(Self.keyGapMs)
    }
  }
}
