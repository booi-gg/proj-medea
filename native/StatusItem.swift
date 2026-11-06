import AppKit
import Carbon.HIToolbox
import UniformTypeIdentifiers

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

/// Asks the open CLI to raise its window, so the shortcut doesn't wait for Node to start. Returns
/// false when no CLI answers. It blocks for up to a second, so call it off the main thread.
func focusRunningCli(socketPath: String) -> Bool {
  let connection = socket(AF_UNIX, SOCK_STREAM, 0)
  guard connection >= 0 else {
    return false
  }
  defer { close(connection) }

  var timeout = timeval(tv_sec: 1, tv_usec: 0)
  let timeoutSize = socklen_t(MemoryLayout<timeval>.size)
  setsockopt(connection, SOL_SOCKET, SO_RCVTIMEO, &timeout, timeoutSize)
  setsockopt(connection, SOL_SOCKET, SO_SNDTIMEO, &timeout, timeoutSize)

  var address = sockaddr_un()
  address.sun_family = sa_family_t(AF_UNIX)
  let pathBytes = Array(socketPath.utf8) + [0]
  guard pathBytes.count <= MemoryLayout.size(ofValue: address.sun_path) else {
    return false
  }
  withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: pathBytes) }
  let connected = withUnsafePointer(to: &address) {
    $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
      connect(connection, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
    }
  }
  guard connected == 0 else {
    return false
  }

  let request = Array("focus\n".utf8)
  guard send(connection, request, request.count, 0) == request.count else {
    return false
  }
  // The CLI closes the connection once it has the request. A CLI that hangs times out here.
  var reply = [UInt8](repeating: 0, count: 256)
  var received = recv(connection, &reply, reply.count, 0)
  while received > 0 {
    received = recv(connection, &reply, reply.count, 0)
  }
  return received == 0
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

// MARK: - Clipboard watcher

enum Clip {
  case text(String)
  case image(Data, name: String?)
}

/// Watches for copied text and images. It runs only here, because the CLI isn't always open.
final class ClipboardWatcher {
  private static let checkInterval: TimeInterval = 0.5
  // From nspasteboard.org: confidential, temporary or generated content that must stay out.
  private static let ignoredTypes: Set<String> = [
    "org.nspasteboard.ConcealedType",
    "org.nspasteboard.TransientType",
    "org.nspasteboard.AutoGeneratedType",
    "com.agilebits.onepassword",
    "de.petermaurer.TransientPasteboardType",
    "com.typeit4me.clipping",
    "Pasteboard generator type",
  ]
  private static let ignoredApps: Set<String> = ["com.apple.Passwords", "com.apple.keychainaccess"]
  private static let maxImageFileBytes = 30_000_000
  private static let maxImageFiles = 10
  private static let pngSignature: [UInt8] = [0x89, 0x50, 0x4E, 0x47]
  private static let webSchemes: Set<String> = ["http", "https"]
  private static let imageSourcePattern = try? NSRegularExpression(
    pattern: "<img[^>]+src=[\"']([^\"']+)",
    options: .caseInsensitive
  )

  private let pasteboard: NSPasteboard
  private let onCopy: (Clip) -> Void
  private var lastChangeCount: Int
  private var timer: Timer?

  init(pasteboard: NSPasteboard, onCopy: @escaping (Clip) -> Void) {
    self.pasteboard = pasteboard
    self.onCopy = onCopy
    // Starts from now, so whatever was already copied isn't recorded.
    lastChangeCount = pasteboard.changeCount
  }

  func start() {
    timer = Timer.scheduledTimer(withTimeInterval: Self.checkInterval, repeats: true) {
      [weak self] _ in
      self?.checkForChange()
    }
  }

  private func checkForChange() {
    guard pasteboard.changeCount != lastChangeCount else {
      return
    }
    lastChangeCount = pasteboard.changeCount
    let types = pasteboard.types ?? []
    let frontApp = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""
    let isIgnored =
      types.contains { Self.ignoredTypes.contains($0.rawValue) }
      || Self.ignoredApps.contains(frontApp)
    guard !isIgnored else {
      logSkip("ignored source", types)
      return
    }
    // A copied file carries its name as text and its icon as an image. Neither is what was copied.
    if types.contains(.fileURL) {
      let images = readCopiedImageFiles()
      if images.isEmpty {
        logSkip("no image among the copied files", types)
      }
      for (image, name) in images {
        recordImage(image, name: name)
      }
      return
    }
    let text = pasteboard.string(forType: .string)
    let image = readImageData()
    // Text wins, because apps like Excel also add a picture of the cells you copied. A browser's
    // image comes with its address as text, and there the image is what was copied.
    if let text, image == nil || !Self.isOnlyAddress(text) {
      onCopy(.text(text))
    } else if let image {
      recordImage(image, name: readImageName(copiedText: text))
    } else {
      logSkip("no text or image data", types)
    }
  }

  /// Type names only, so copied content never reaches the log.
  private func logSkip(_ reason: String, _ types: [NSPasteboard.PasteboardType]) {
    let names = types.map(\.rawValue).joined(separator: ", ")
    NSLog("Medea skipped a copy, \(reason): \(names)")
  }

  private static func isOnlyAddress(_ text: String) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let isOneWord = !trimmed.isEmpty && !trimmed.contains { $0.isWhitespace }
    return isOneWord && URL(string: trimmed)?.scheme != nil
  }

  /// PNG and TIFF are the common cases. NSImage reads the rest, like JPEG, GIF and PDF.
  private func readImageData() -> Data? {
    pasteboard.data(forType: .png)
      ?? pasteboard.data(forType: .tiff)
      ?? NSImage(pasteboard: pasteboard)?.tiffRepresentation
  }

  /// Only a file has a name of its own. A browser's image has one inside its web address, and a
  /// screenshot has neither.
  private func readImageName(copiedText: String?) -> String? {
    let addresses = [
      pasteboard.string(forType: .html).flatMap(Self.findImageSource),
      pasteboard.string(forType: .URL),
      copiedText,
    ]
    return addresses.compactMap { $0 }.lazy.compactMap(Self.toFileName).first
  }

  private static func findImageSource(html: String) -> String? {
    let wholeText = NSRange(html.startIndex..., in: html)
    guard let match = imageSourcePattern?.firstMatch(in: html, range: wholeText),
      let source = Range(match.range(at: 1), in: html)
    else {
      return nil
    }
    return String(html[source])
  }

  /// Addresses like data: and blob: hold no name.
  private static func toFileName(address: String) -> String? {
    let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
      webSchemes.contains(scheme)
    else {
      return nil
    }
    let name = url.lastPathComponent
    return name.isEmpty || name == "/" ? nil : name
  }

  private func readCopiedImageFiles() -> [(Data, String)] {
    let options: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
    let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: options) as? [URL] ?? []
    return urls.prefix(Self.maxImageFiles).compactMap(readImageFile)
  }

  private func readImageFile(_ url: URL) -> (Data, String)? {
    guard let values = try? url.resourceValues(forKeys: [.contentTypeKey, .fileSizeKey]),
      values.contentType?.conforms(to: .image) == true,
      (values.fileSize ?? .max) <= Self.maxImageFileBytes
    else {
      return nil
    }
    return (try? Data(contentsOf: url)).map { ($0, url.lastPathComponent) }
  }

  /// Converting a large photo takes a moment, and this thread also answers hotkeys.
  private func recordImage(_ image: Data, name: String?) {
    DispatchQueue.global(qos: .utility).async { [onCopy] in
      guard let png = Self.toPng(image) else {
        NSLog("Medea skipped a copy, could not read the image data")
        return
      }
      DispatchQueue.main.async { onCopy(.image(png, name: name)) }
    }
  }

  private static func toPng(_ image: Data) -> Data? {
    if image.starts(with: pngSignature) {
      return image
    }
    // Bitmaps convert directly. Formats like SVG and PDF have to be drawn first.
    let bitmap = NSBitmapImageRep(data: image) ?? NSImage(data: image)?.tiffRepresentation.flatMap(NSBitmapImageRep.init)
    return bitmap?.representation(using: .png, properties: [:])
  }
}

// MARK: - Menu bar

/// Owns the menu bar item and its menu. The CLI makes all the decisions.
final class StatusItemController: NSObject, NSMenuDelegate {
  private let cliCommand: [String]
  // The CLI's socket sits next to this binary in .build.
  private let cliSocketPath = URL(fileURLWithPath: CommandLine.arguments[0])
    .deletingLastPathComponent()
    .appendingPathComponent("cli.sock")
    .path
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let menu = NSMenu()
  private let terminalMenu = NSMenu()
  private var clipsToRecord: [Clip] = []
  private var isRecordingClip = false

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
    let socketPath = cliSocketPath
    DispatchQueue.global(qos: .userInteractive).async { [weak self] in
      guard !focusRunningCli(socketPath: socketPath) else {
        return
      }
      DispatchQueue.main.async { self?.runCli(["show"]) }
    }
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

  /// One at a time, so two quick copies can't overwrite each other in the history file.
  func recordClip(_ clip: Clip) {
    clipsToRecord.append(clip)
    recordNextClip()
  }

  private func recordNextClip() {
    guard !isRecordingClip, !clipsToRecord.isEmpty else {
      return
    }
    isRecordingClip = true
    let command: String
    let input: Data
    var environment: [String: String] = [:]
    switch clipsToRecord.removeFirst() {
    case .text(let text):
      command = "record-clipboard"
      input = Data(text.utf8)
    case .image(let png, let name):
      command = "record-clipboard-image"
      input = png
      // Stdin holds the image, and arguments can be read by anyone running "ps".
      environment["MEDEA_IMAGE_NAME"] = name
    }
    runCli([command], input: input, environment: environment) { [weak self] _ in
      self?.isRecordingClip = false
      self?.recordNextClip()
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

  private func runCli(
    _ arguments: [String],
    input: Data? = nil,
    environment: [String: String] = [:],
    onFinish: ((Data) -> Void)? = nil
  ) {
    let process = Process()
    let output = Pipe()
    let inputPipe = Pipe()
    process.executableURL = URL(fileURLWithPath: cliCommand[0])
    process.arguments = Array(cliCommand.dropFirst()) + arguments
    process.standardOutput = output
    process.environment = ProcessInfo.processInfo.environment.merging(environment) { $1 }
    if input != nil {
      process.standardInput = inputPipe
    }
    process.terminationHandler = { _ in
      let data = output.fileHandleForReading.readDataToEndOfFile()
      DispatchQueue.main.async { onFinish?(data) }
    }
    do {
      try process.run()
    } catch {
      NSLog("Medea could not run the CLI: \(error.localizedDescription)")
      onFinish?(Data())
      return
    }
    if let input {
      // Off the main thread, because a large write waits for the CLI to read it.
      DispatchQueue.global().async {
        try? inputPipe.fileHandleForWriting.write(contentsOf: input)
        try? inputPipe.fileHandleForWriting.close()
      }
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

app.run()
