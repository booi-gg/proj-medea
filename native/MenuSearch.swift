import AppKit

/// One row for the CLI. The shortcut is passed on as macOS reports it, and
/// src/redhot-apps/redhot-menu-items/format.ts writes it out.
private struct MenuEntry: Encodable {
  let path: [String]
  let isEnabled: Bool
  let key: String
  let glyph: Int
  let modifiers: Int
}

private struct MenuListing: Encodable {
  let app: String
  let pid: Int32
  let isPartial: Bool
  let items: [MenuEntry]
}

/// What Accessibility says about one menu or menu item.
private struct MenuElement {
  let element: AXUIElement
  let title: String
  let isEnabled: Bool
  let children: [AXUIElement]
  let key: String
  let glyph: Int
  let modifiers: Int
}

/// Reads the menu bar of the app you were using before Redhot's window, and presses its items.
final class MenuSearch {
  private static let requestPrefix = "menu-items "
  private static let listCommand = "list"
  private static let pressCommand = "press"
  private static let okReply = "ok"
  private static let noAccessReply = "no-access"
  private static let noAppReply = "no-app"
  private static let notFrontmostReply = "not-frontmost"
  private static let missingReply = "missing"
  private static let disabledReply = "disabled"
  private static let failedReply = "failed"

  // An app that has stopped responding would otherwise hold each call for the default six seconds.
  private static let messagingTimeout: Float = 0.5

  private static let attributes = [
    kAXTitleAttribute,
    kAXEnabledAttribute,
    kAXChildrenAttribute,
    kAXMenuItemCmdCharAttribute,
    kAXMenuItemCmdGlyphAttribute,
    kAXMenuItemCmdModifiersAttribute,
  ]

  // Accessibility calls wait on the other app, and the main thread also answers hotkeys.
  private let queue = DispatchQueue(label: "redhot.menu-search", qos: .userInitiated)
  private let previousApp: () -> NSRunningApplication?

  init(previousApp: @escaping () -> NSRunningApplication?) {
    self.previousApp = previousApp
  }

  /// Returns false when the request isn't about menus, so another handler can answer it.
  func answer(_ request: String, reply: @escaping (String) -> Void) -> Bool {
    let (trace, command) = RedhotLog.splitTrace(request)
    guard command.hasPrefix(Self.requestPrefix) else {
      return false
    }
    guard AXIsProcessTrusted() else {
      reply(Self.noAccessReply)
      return true
    }
    let parts = command.dropFirst(Self.requestPrefix.count).split(separator: " ").map(String.init)
    switch parts.first {
    case Self.listCommand:
      list(trace: trace, reply: reply)
    case Self.pressCommand where parts.count == 3:
      press(pid: parts[1], encodedPath: parts[2], trace: trace, reply: reply)
    default:
      reply(WindowFailure.badCommand.rawValue)
    }
    return true
  }

  private func list(trace: String?, reply: @escaping (String) -> Void) {
    // `previous` is only safe to read here, on the main thread.
    guard let target = previousApp(), !target.isTerminated else {
      reply(Self.noAppReply)
      return
    }
    queue.async {
      let span = RedhotLog.start("menu-items.list", trace: trace)
      let walk = MenuWalk()
      walk.read(target.processIdentifier)
      let listing = MenuListing(
        app: target.localizedName ?? "That app",
        pid: target.processIdentifier,
        isPartial: walk.isPartial,
        items: walk.entries
      )
      let json = (try? JSONEncoder().encode(listing)).map { String(decoding: $0, as: UTF8.self) }
      RedhotLog.end(span, ok: json != nil, fields: [
        "count": walk.entries.count, "partial": walk.isPartial,
      ])
      reply(json ?? Self.failedReply)
    }
  }

  private func press(
    pid: String,
    encodedPath: String,
    trace: String?,
    reply: @escaping (String) -> Void
  ) {
    guard let pid = pid_t(pid),
      let data = Data(base64Encoded: encodedPath),
      let path = try? JSONDecoder().decode([String].self, from: data),
      !path.isEmpty
    else {
      reply(WindowFailure.badCommand.rawValue)
      return
    }
    // The app listed, not the one before Redhot now: switching away and back mustn't aim this
    // at another app that happens to have an item of the same name.
    guard let target = NSRunningApplication(processIdentifier: pid), !target.isTerminated else {
      reply(Self.noAppReply)
      return
    }
    queue.async {
      let span = RedhotLog.start("menu-items.press", trace: trace)
      let result = Self.press(path, in: target)
      RedhotLog.end(span, ok: result == Self.okReply, fields: ["result": result])
      reply(result)
    }
  }

  private static func press(_ path: [String], in target: NSRunningApplication) -> String {
    guard PasteBack.bringToFront(target) else {
      return notFrontmostReply
    }
    // Looked up only now, because many apps work out what's available once they're in front.
    PasteBack.settle()
    let application = AXUIElementCreateApplication(target.processIdentifier)
    guard let item = find(path, in: application) else {
      return missingReply
    }
    guard item.isEnabled else {
      return disabledReply
    }
    AXUIElementSetMessagingTimeout(item.element, messagingTimeout)
    switch AXUIElementPerformAction(item.element, kAXPressAction as CFString) {
    // An item that opens a dialog doesn't answer until the dialog closes, so running out of time
    // means it was pressed.
    case .success, .cannotComplete:
      return okReply
    default:
      return failedReply
    }
  }

  /// Follows titles down from the menu bar. Menus can be rebuilt at any time, so nothing is kept
  /// from when they were listed.
  private static func find(_ path: [String], in application: AXUIElement) -> MenuElement? {
    var level = barItems(of: application)
    for (depth, title) in path.enumerated() {
      let matches = level.compactMap(read).filter { $0.title == title }
      let isLast = depth == path.count - 1
      if isLast {
        return matches.first(where: \.isEnabled) ?? matches.first
      }
      guard let submenu = matches.first?.children.first else {
        return nil
      }
      level = children(of: submenu)
    }
    return nil
  }

  /// The Apple menu comes first and belongs to macOS, not to the app.
  fileprivate static func barItems(of application: AXUIElement) -> [AXUIElement] {
    AXUIElementSetMessagingTimeout(application, messagingTimeout)
    var bar: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(application, kAXMenuBarAttribute as CFString, &bar)
    guard status == .success, let bar, CFGetTypeID(bar) == AXUIElementGetTypeID() else {
      return []
    }
    return Array(children(of: unsafeDowncast(bar, to: AXUIElement.self)).dropFirst())
  }

  fileprivate static func children(of element: AXUIElement) -> [AXUIElement] {
    AXUIElementSetMessagingTimeout(element, messagingTimeout)
    var children: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children)
    return children as? [AXUIElement] ?? []
  }

  /// Nil for a separator or an item with no text, which has nothing to search for.
  fileprivate static func read(_ element: AXUIElement) -> MenuElement? {
    AXUIElementSetMessagingTimeout(element, messagingTimeout)
    var raw: CFArray?
    let status = AXUIElementCopyMultipleAttributeValues(
      element,
      attributes as CFArray,
      AXCopyMultipleAttributeOptions(rawValue: 0),
      &raw
    )
    guard status == .success, let values = raw as? [Any], values.count == attributes.count,
      let title = values[0] as? String, !title.isEmpty
    else {
      return nil
    }
    return MenuElement(
      element: element,
      title: title,
      isEnabled: values[1] as? Bool ?? false,
      children: values[2] as? [AXUIElement] ?? [],
      key: values[3] as? String ?? "",
      glyph: values[4] as? Int ?? 0,
      modifiers: values[5] as? Int ?? 0
    )
  }
}

/// One read of an app's menus, stopping early if the app is too big or too slow.
private final class MenuWalk {
  private(set) var entries: [MenuEntry] = []
  private(set) var isPartial = false
  private let deadline = Date().addingTimeInterval(MenuSearchLimits.readBudgetSeconds)

  func read(_ pid: pid_t) {
    walk(MenuSearch.barItems(of: AXUIElementCreateApplication(pid)), under: [])
  }

  private func walk(_ elements: [AXUIElement], under path: [String]) {
    for element in elements {
      guard entries.count < MenuSearchLimits.maxItems, Date() < deadline else {
        isPartial = true
        return
      }
      guard let item = MenuSearch.read(element) else {
        continue
      }
      let itemPath = path + [item.title]
      if let submenu = item.children.first {
        if itemPath.count < MenuSearchLimits.maxDepth {
          walk(MenuSearch.children(of: submenu), under: itemPath)
        }
      } else {
        entries.append(
          MenuEntry(
            path: itemPath,
            isEnabled: item.isEnabled,
            key: item.key,
            glyph: item.glyph,
            modifiers: item.modifiers
          )
        )
      }
    }
  }
}

private enum MenuSearchLimits {
  // Well inside the CLI's wait, so a huge menu still comes back as the part that was read.
  static let readBudgetSeconds = 2.5
  static let maxItems = 5000
  static let maxDepth = 8
}
