import AppKit
import Carbon.HIToolbox

private let panelSize = NSSize(width: 340, height: 170)
private let finishDelay = 0.45
private let giveUpDelay = 60.0
private let emptyPrompt = "Press your keys"

/// Shows the keys as they are pressed, then prints the combo as JSON and exits.
/// A focused window receives these keys directly, so this needs no permission.
final class RecorderController: NSObject, NSApplicationDelegate {
  private let keysLabel = NSTextField(labelWithString: emptyPrompt)
  private var panel: NSPanel?
  private var isFinished = false

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

  /// Clicking away cancels, so a forgotten window can't linger.
  func applicationDidResignActive(_ notification: Notification) {
    if !isFinished {
      exit(1)
    }
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

    let hint = NSTextField(labelWithString: "Esc to cancel")
    hint.font = .systemFont(ofSize: 12)
    hint.textColor = .tertiaryLabelColor

    let stack = NSStackView(views: [title, keysLabel, hint])
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
      let symbols = modifierSymbols(flags)
      keysLabel.stringValue = symbols.isEmpty ? emptyPrompt : symbols
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

  private func finish(_ event: NSEvent, _ flags: NSEvent.ModifierFlags) {
    isFinished = true
    keysLabel.stringValue = modifierSymbols(flags) + keyName(event)

    let names = modifierNames(flags).map { "\"\($0)\"" }.joined(separator: ",")
    print("{\"keyCode\":\(event.keyCode),\"modifiers\":[\(names)]}")
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
