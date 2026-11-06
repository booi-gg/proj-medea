import AppKit
import Carbon.HIToolbox

private let hotKeySignature: OSType = 0x4D44_4541  // "MDEA"
private let hotKeyKeyCode = UInt32(kVK_Space)
private let hotKeyModifiers = UInt32(cmdKey | shiftKey)

/// System-wide shortcuts. Carbon delivers them without Accessibility or Input Monitoring permission.
final class HotKeyCenter {
  private var actions: [UInt32: () -> Void] = [:]
  private var itemHotKeys: [(id: UInt32, ref: EventHotKeyRef)] = []
  private var handlerRef: EventHandlerRef?
  private var nextId: UInt32 = 1

  func installHandler() -> OSStatus {
    var pressedEvent = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard),
      eventKind: UInt32(kEventHotKeyPressed)
    )
    return InstallEventHandler(
      GetApplicationEventTarget(),
      { _, event, userData in
        guard let event, let userData else {
          return OSStatus(eventNotHandledErr)
        }
        var hotKeyId = EventHotKeyID()
        let status = GetEventParameter(
          event,
          EventParamName(kEventParamDirectObject),
          EventParamType(typeEventHotKeyID),
          nil,
          MemoryLayout<EventHotKeyID>.size,
          nil,
          &hotKeyId
        )
        guard status == noErr else {
          return status
        }
        Unmanaged<HotKeyCenter>.fromOpaque(userData).takeUnretainedValue().fire(hotKeyId.id)
        return noErr
      },
      1,
      &pressedEvent,
      Unmanaged.passUnretained(self).toOpaque(),
      &handlerRef
    )
  }

  func fire(_ id: UInt32) {
    actions[id]?()
  }

  @discardableResult
  private func register(
    keyCode: UInt32,
    modifiers: UInt32,
    action: @escaping () -> Void
  ) -> (status: OSStatus, id: UInt32, ref: EventHotKeyRef?) {
    let id = nextId
    nextId += 1
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(
      keyCode,
      modifiers,
      EventHotKeyID(signature: hotKeySignature, id: id),
      GetApplicationEventTarget(),
      0,
      &ref
    )
    if status == noErr {
      actions[id] = action
    }
    return (status, id, ref)
  }

  /// A shortcut that lasts as long as the helper runs.
  func registerPermanent(keyCode: UInt32, modifiers: UInt32, action: @escaping () -> Void)
    -> OSStatus
  {
    register(keyCode: keyCode, modifiers: modifiers, action: action).status
  }

  /// Swaps the per-item hotkeys for this list.
  func replaceItemHotKeys(_ hotKeys: [ItemHotKey], onPress: @escaping (String) -> Void) {
    for hotKey in itemHotKeys {
      UnregisterEventHotKey(hotKey.ref)
      actions[hotKey.id] = nil
    }
    itemHotKeys = []

    for hotKey in hotKeys {
      let result = register(keyCode: hotKey.keyCode, modifiers: hotKey.modifiers) {
        onPress(hotKey.value)
      }
      NSLog("Medea hotkey for \(hotKey.value) registration status: \(result.status)")
      if let ref = result.ref {
        itemHotKeys.append((id: result.id, ref: ref))
      }
    }
  }
}

func openApp(at path: String) {
  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
  process.arguments = [path]
  do {
    try process.run()
  } catch {
    NSLog("Medea could not open \(path): \(error.localizedDescription)")
  }
}

struct ItemHotKey: Decodable {
  let keyCode: UInt32
  let modifiers: UInt32
  let value: String
}

struct TerminalChoice: Decodable {
  let name: String
  let selected: Bool
}

/// Owns the menu bar item and its menu. The CLI makes all the decisions.
final class StatusItemController: NSObject, NSMenuDelegate {
  private let cliCommand: [String]
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let menu = NSMenu()
  private let terminalMenu = NSMenu()

  init(cliCommand: [String]) {
    self.cliCommand = cliCommand
    super.init()

    statusItem.button?.image = NSImage(
      systemSymbolName: "terminal",
      accessibilityDescription: "Medea"
    )
    statusItem.button?.image?.isTemplate = true
    statusItem.button?.toolTip = "Medea"

    let openItem = NSMenuItem(
      title: "Open Medea",
      action: #selector(handleOpen),
      keyEquivalent: ""
    )
    openItem.target = self
    menu.addItem(openItem)

    let terminalItem = NSMenuItem(title: "Set Terminal", action: nil, keyEquivalent: "")
    terminalItem.submenu = terminalMenu
    menu.addItem(terminalItem)

    menu.addItem(.separator())

    let exitItem = NSMenuItem(
      title: "Exit",
      action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: ""
    )
    exitItem.target = NSApp
    menu.addItem(exitItem)

    menu.delegate = self
    statusItem.menu = menu
    reloadTerminals()
  }

  func menuWillOpen(_ menu: NSMenu) {
    reloadTerminals()
  }

  @objc private func handleOpen() {
    showCli()
  }

  @objc private func handleTerminalChoice(_ sender: NSMenuItem) {
    runCli(["set-terminal", sender.title]) { [weak self] _ in
      self?.reloadTerminals()
    }
  }

  func showCli() {
    runCli(["show"])
  }

  func reloadHotKeys(into hotKeys: HotKeyCenter) {
    runCli(["hotkeys"]) { output in
      guard let items = try? JSONDecoder().decode([ItemHotKey].self, from: output) else {
        NSLog("Medea could not read the saved hotkeys")
        return
      }
      hotKeys.replaceItemHotKeys(items) { [weak self] value in
        self?.runItem(value)
      }
    }
  }

  /// Apps are saved by path and open directly, which is fastest. Everything else needs the CLI.
  private func runItem(_ value: String) {
    if value.hasPrefix("/") {
      openApp(at: value)
    } else {
      runCli(["run", value])
    }
  }

  private func reloadTerminals() {
    runCli(["terminals"]) { [weak self] output in
      guard let choices = try? JSONDecoder().decode([TerminalChoice].self, from: output) else {
        return
      }
      self?.rebuildTerminalMenu(choices)
    }
  }

  private func rebuildTerminalMenu(_ choices: [TerminalChoice]) {
    terminalMenu.removeAllItems()
    for choice in choices {
      let item = NSMenuItem(
        title: choice.name,
        action: #selector(handleTerminalChoice(_:)),
        keyEquivalent: ""
      )
      item.target = self
      item.state = choice.selected ? .on : .off
      terminalMenu.addItem(item)
    }
  }

  private func runCli(_ arguments: [String], onFinish: ((Data) -> Void)? = nil) {
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: cliCommand[0])
    process.arguments = Array(cliCommand.dropFirst()) + arguments
    process.standardOutput = output
    process.terminationHandler = { _ in
      let data = output.fileHandleForReading.readDataToEndOfFile()
      DispatchQueue.main.async { onFinish?(data) }
    }
    do {
      try process.run()
    } catch {
      NSLog("Medea could not run the CLI: \(error.localizedDescription)")
    }
  }
}

let cliCommand = Array(CommandLine.arguments.dropFirst())
guard !cliCommand.isEmpty else {
  FileHandle.standardError.write(Data("usage: medea-status <cli command> [arguments]\n".utf8))
  exit(64)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = StatusItemController(cliCommand: cliCommand)
let hotKeys = HotKeyCenter()
NSLog("Medea hotkey handler status: \(hotKeys.installHandler())")
let hotKeyStatus = hotKeys.registerPermanent(keyCode: hotKeyKeyCode, modifiers: hotKeyModifiers) {
  controller.showCli()
}
NSLog("Medea hotkey registration status: \(hotKeyStatus)")
controller.reloadHotKeys(into: hotKeys)

// The CLI sends this signal after saving a hotkey, so it works without a restart.
signal(SIGUSR1, SIG_IGN)
let reloadSignal = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
reloadSignal.setEventHandler { controller.reloadHotKeys(into: hotKeys) }
reloadSignal.resume()

app.run()
