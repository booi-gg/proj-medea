import AppKit
import Carbon.HIToolbox

private let hotKeySignature: OSType = 0x5350_4354  // "SPCT"
private let hotKeyKeyCode = UInt32(kVK_Space)
private let hotKeyModifiers = UInt32(cmdKey | shiftKey)

/// System-wide shortcut. Carbon delivers it without Accessibility or Input Monitoring permission.
final class GlobalHotKey {
  private let onPress: () -> Void
  private var hotKeyRef: EventHotKeyRef?
  private var handlerRef: EventHandlerRef?

  init(onPress: @escaping () -> Void) {
    self.onPress = onPress
  }

  func register(keyCode: UInt32, modifiers: UInt32) -> OSStatus {
    var pressedEvent = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard),
      eventKind: UInt32(kEventHotKeyPressed)
    )
    let handlerStatus = InstallEventHandler(
      GetApplicationEventTarget(),
      { _, _, userData in
        guard let userData else {
          return OSStatus(eventNotHandledErr)
        }
        Unmanaged<GlobalHotKey>.fromOpaque(userData).takeUnretainedValue().onPress()
        return noErr
      },
      1,
      &pressedEvent,
      Unmanaged.passUnretained(self).toOpaque(),
      &handlerRef
    )
    guard handlerStatus == noErr else {
      return handlerStatus
    }
    return RegisterEventHotKey(
      keyCode,
      modifiers,
      EventHotKeyID(signature: hotKeySignature, id: 1),
      GetApplicationEventTarget(),
      0,
      &hotKeyRef
    )
  }
}

/// Owns the menu bar item. Left click shows the CLI, right click shows Quit.
final class StatusItemController: NSObject {
  private let showCommand: [String]
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let contextMenu = NSMenu()

  init(showCommand: [String]) {
    self.showCommand = showCommand
    super.init()

    let quitItem = NSMenuItem(
      title: "Quit Supercast",
      action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: ""
    )
    contextMenu.addItem(quitItem)

    guard let button = statusItem.button else {
      return
    }
    button.image = NSImage(systemSymbolName: "terminal", accessibilityDescription: "Supercast")
    button.image?.isTemplate = true
    button.toolTip = "Open Supercast"
    button.target = self
    button.action = #selector(handleClick)
    button.sendAction(on: [.leftMouseUp, .rightMouseUp])
  }

  @objc private func handleClick() {
    if NSApp.currentEvent?.type == .rightMouseUp {
      showContextMenu()
      return
    }
    showCli()
  }

  private func showContextMenu() {
    statusItem.menu = contextMenu
    statusItem.button?.performClick(nil)
    statusItem.menu = nil
  }

  /// The CLI decides whether to reuse a running window or open a new one.
  func showCli() {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: showCommand[0])
    process.arguments = Array(showCommand.dropFirst())
    do {
      try process.run()
    } catch {
      NSLog("Supercast could not show the CLI: \(error.localizedDescription)")
    }
  }
}

let showCommand = Array(CommandLine.arguments.dropFirst())
guard !showCommand.isEmpty else {
  FileHandle.standardError.write(Data("usage: supercast-status <command> [arguments]\n".utf8))
  exit(64)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = StatusItemController(showCommand: showCommand)
let hotKey = GlobalHotKey { controller.showCli() }
let hotKeyStatus = hotKey.register(keyCode: hotKeyKeyCode, modifiers: hotKeyModifiers)
NSLog("Supercast hotkey registration status: \(hotKeyStatus)")
app.run()
