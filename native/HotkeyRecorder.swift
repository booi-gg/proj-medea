import AppKit
import Carbon.HIToolbox

private let panelSize = NSSize(width: 340, height: 170)
private let finishDelay = 0.45
private let giveUpDelay = 60.0
private let emptyPrompt = "Press your keys"
private let defaultHint = "Esc to cancel"
private let missingKeyHint = "No key arrived. macOS or another app may already use that shortcut."
private let hintWidth: CGFloat = 300

/// Shows the keys as they are pressed, then prints the combo as JSON and exits.
/// A focused window receives these keys directly, so this needs no permission.
final class RecorderController: NSObject, NSApplicationDelegate {
  private let keysLabel = NSTextField(labelWithString: emptyPrompt)
  private let hintLabel = NSTextField(wrappingLabelWithString: defaultHint)
  private var panel: NSPanel?
  private var isFinished = false
  private var heldFlags: NSEvent.ModifierFlags = []

  func applicationDidFinishLaunching(_ notification: Notification) {
    let panel = makePanel()
    self.panel = panel
    panel.center()
    panel.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)

    NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .flagsChanged]) { [weak self] event in
      self?.handle(event)
      return nil
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + giveUpDelay) { exit(1) }
  }

  /// Clicking away cancels, so a forgotten window can't linger. Losing focus with keys held means
  /// another app probably reacted to the shortcut, which is worth reporting.
  func applicationDidResignActive(_ notification: Notification) {
    if isFinished {
      return
    }
    if modifierNames(heldFlags).isEmpty {
      exit(1)
    }
    print("{\"interrupted\":true}")
    fflush(stdout)
    exit(0)
  }

  private func makePanel() -> NSPanel {
    let panel = NSPanel(
      contentRect: NSRect(origin: .zero, size: panelSize),
      styleMask: [.titled, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    panel.titleVisibility = .hidden
    panel.titlebarAppearsTransparent = true
    panel.level = .floating
    panel.isMovableByWindowBackground = true

    let title = NSTextField(labelWithString: "Record Hotkey")
    title.font = .systemFont(ofSize: 13, weight: .semibold)
    title.textColor = .secondaryLabelColor

    keysLabel.font = .systemFont(ofSize: 34, weight: .medium)
    keysLabel.alignment = .center

    hintLabel.font = .systemFont(ofSize: 12)
    hintLabel.textColor = .tertiaryLabelColor
    hintLabel.alignment = .center
    hintLabel.preferredMaxLayoutWidth = hintWidth

    let stack = NSStackView(views: [title, keysLabel, hintLabel])
    stack.orientation = .vertical
    stack.alignment = .centerX
    stack.spacing = 14
    stack.translatesAutoresizingMaskIntoConstraints = false

    let content = NSView()
    content.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerXAnchor.constraint(equalTo: content.centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: content.centerYAnchor),
    ])
    panel.contentView = content
    return panel
  }

  private func handle(_ event: NSEvent) {
    guard !isFinished else {
      return
    }
    let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
    if event.type == .flagsChanged {
      handleModifiers(flags)
      return
    }
    if !modifierNames(flags).isEmpty {
      finish(event, flags)
      return
    }
    if Int(event.keyCode) == kVK_Escape {
      exit(1)
    }
    // A stray key shouldn't end the recording.
    keysLabel.stringValue = "Hold ⌘ or ⌃ too"
  }

  /// macOS and other apps take their shortcuts before this window sees them. So modifiers that
  /// go down and up with no key are the one sign of a shortcut that is already in use.
  private func handleModifiers(_ flags: NSEvent.ModifierFlags) {
    let symbols = modifierSymbols(flags)
    keysLabel.stringValue = symbols.isEmpty ? emptyPrompt : symbols
    if !symbols.isEmpty {
      hintLabel.stringValue = defaultHint
    } else if !modifierNames(heldFlags).isEmpty {
      hintLabel.stringValue = missingKeyHint
    }
    heldFlags = flags
  }

  private func finish(_ event: NSEvent, _ flags: NSEvent.ModifierFlags) {
    isFinished = true
    keysLabel.stringValue = modifierSymbols(flags) + keyName(event)

    let names = modifierNames(flags).map { "\"\($0)\"" }.joined(separator: ",")
    let usedBySystem = isSystemShortcut(keyCode: Int(event.keyCode), flags: flags)
    print("{\"keyCode\":\(event.keyCode),\"modifiers\":[\(names)],\"usedBySystem\":\(usedBySystem)}")
    fflush(stdout)
    // Long enough to see what was recorded.
    DispatchQueue.main.asyncAfter(deadline: .now() + finishDelay) { exit(0) }
  }
}

private func modifierSymbols(_ flags: NSEvent.ModifierFlags) -> String {
  var symbols = ""
  if flags.contains(.control) { symbols += "⌃" }
  if flags.contains(.option) { symbols += "⌥" }
  if flags.contains(.shift) { symbols += "⇧" }
  if flags.contains(.command) { symbols += "⌘" }
  return symbols
}

private func modifierNames(_ flags: NSEvent.ModifierFlags) -> [String] {
  var names: [String] = []
  if flags.contains(.control) { names.append("ctrl") }
  if flags.contains(.option) { names.append("option") }
  if flags.contains(.shift) { names.append("shift") }
  if flags.contains(.command) { names.append("cmd") }
  return names
}

private func carbonFlags(_ flags: NSEvent.ModifierFlags) -> Int {
  var carbon = 0
  if flags.contains(.control) { carbon |= controlKey }
  if flags.contains(.option) { carbon |= optionKey }
  if flags.contains(.shift) { carbon |= shiftKey }
  if flags.contains(.command) { carbon |= cmdKey }
  return carbon
}

/// Checks the enabled macOS shortcuts, like the screenshot keys.
private func isSystemShortcut(keyCode: Int, flags: NSEvent.ModifierFlags) -> Bool {
  var hotKeys: Unmanaged<CFArray>?
  guard CopySymbolicHotKeys(&hotKeys) == noErr else {
    return false
  }
  let entries = hotKeys?.takeRetainedValue() as? [[String: Any]] ?? []
  return entries.contains { entry in
    let isEnabled = entry[kHISymbolicHotKeyEnabled as String] as? Bool ?? false
    let code = entry[kHISymbolicHotKeyCode as String] as? Int
    let modifiers = entry[kHISymbolicHotKeyModifiers as String] as? Int
    return isEnabled && code == keyCode && modifiers == carbonFlags(flags)
  }
}

private func keyName(_ event: NSEvent) -> String {
  switch Int(event.keyCode) {
  case kVK_Space: return "Space"
  case kVK_Return: return "↩"
  case kVK_Tab: return "⇥"
  case kVK_LeftArrow: return "←"
  case kVK_RightArrow: return "→"
  case kVK_UpArrow: return "↑"
  case kVK_DownArrow: return "↓"
  default: return event.charactersIgnoringModifiers?.uppercased() ?? ""
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = RecorderController()
app.delegate = controller
app.run()
