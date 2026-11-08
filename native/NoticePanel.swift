import AppKit

struct NoticeRequest: Decodable {
  let title: String
  let message: String
  let isError: Bool

  /// The socket reads one line, so a notice arrives as base64 JSON.
  static func decode(_ encoded: String) -> NoticeRequest? {
    Data(base64Encoded: encoded).flatMap { try? JSONDecoder().decode(NoticeRequest.self, from: $0) }
  }
}

/// Takes clicks while another app stays active, because the panel never becomes the key window.
private final class NoticeContentView: NSVisualEffectView {
  var onClick: (() -> Void)?

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  override func mouseDown(with event: NSEvent) {
    onClick?()
  }
}

/// Redhot's own notification, drawn by the helper. macOS shows a notification with the icon of the
/// app that sent it, and the helper is a bare binary with no icon, so this draws one with the logo.
/// It needs no permission. Everything goes through `show`, and a new one replaces the one on screen.
final class NoticePanel {
  static let shared = NoticePanel()

  private static let width: CGFloat = 340
  private static let screenMargin: CGFloat = 14
  private static let cornerRadius: CGFloat = 18
  private static let logoSize: CGFloat = 32
  // The room left for text after the logo and the padding around it.
  private static let textWidth: CGFloat = width - logoSize - 42
  private static let messageLines = 3
  private static let visibleSeconds = 3.5
  // An error may need acting on, so it stays longer.
  private static let visibleSecondsForError = 6.0
  private static let fadeSeconds = 0.18
  private static let requestPrefix = "notice"

  private let panel = NSPanel(
    contentRect: NSRect(x: 0, y: 0, width: width, height: 64),
    styleMask: [.borderless, .nonactivatingPanel],
    backing: .buffered,
    defer: true
  )
  private let content = NoticeContentView()
  private let titleLabel = NSTextField(labelWithString: "")
  private let messageLabel = NSTextField(wrappingLabelWithString: "")
  private var hideTask: DispatchWorkItem?
  // Stops the fade of an old notice from hiding the one that replaced it.
  private var showCount = 0

  private init() {
    panel.isFloatingPanel = true
    panel.level = .statusBar
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false

    content.material = .hudWindow
    content.blendingMode = .behindWindow
    content.state = .active
    content.maskImage = Self.roundedMask()
    content.onClick = { [weak self] in self?.hide() }
    panel.contentView = content

    let logo = NSImageView(
      image: RedhotLogo.image(canvas: NSSize(width: Self.logoSize, height: Self.logoSize))
    )
    logo.setAccessibilityElement(false)
    titleLabel.font = .systemFont(ofSize: 13, weight: .semibold)
    titleLabel.lineBreakMode = .byTruncatingTail
    titleLabel.maximumNumberOfLines = 1
    messageLabel.font = .systemFont(ofSize: 13)
    messageLabel.textColor = .labelColor
    // Truncating as a line break mode would stop the text at one line.
    messageLabel.lineBreakMode = .byWordWrapping
    messageLabel.cell?.truncatesLastVisibleLine = true
    messageLabel.maximumNumberOfLines = Self.messageLines
    messageLabel.preferredMaxLayoutWidth = Self.textWidth

    let text = NSStackView(views: [titleLabel, messageLabel])
    text.orientation = .vertical
    text.alignment = .leading
    text.spacing = 2
    text.setHuggingPriority(.required, for: .vertical)
    let row = NSStackView(views: [logo, text])
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 12
    row.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(row)

    NSLayoutConstraint.activate([
      content.widthAnchor.constraint(equalToConstant: Self.width),
      logo.widthAnchor.constraint(equalToConstant: Self.logoSize),
      logo.heightAnchor.constraint(equalToConstant: Self.logoSize),
      row.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 14),
      row.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -16),
      row.topAnchor.constraint(equalTo: content.topAnchor, constant: 12),
      row.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -12),
    ])
  }

  private static func roundedMask() -> NSImage {
    let edge = cornerRadius * 2 + 1
    let mask = NSImage(size: NSSize(width: edge, height: edge), flipped: false) { bounds in
      NSColor.black.setFill()
      NSBezierPath(roundedRect: bounds, xRadius: cornerRadius, yRadius: cornerRadius).fill()
      return true
    }
    mask.capInsets = NSEdgeInsets(
      top: cornerRadius, left: cornerRadius, bottom: cornerRadius, right: cornerRadius
    )
    mask.resizingMode = .stretch
    return mask
  }

  /// Shows a notice from a request like "notice <base64 JSON>", with or without a trace in front.
  /// Returns nil when the request isn't a notice, so another handler can answer it.
  func answer(_ request: String) -> String? {
    let parts = request.split(separator: " ")
    guard parts.count >= 2, parts[parts.count - 2] == Self.requestPrefix else {
      return nil
    }
    guard let notice = NoticeRequest.decode(String(parts[parts.count - 1])) else {
      return "bad-notice"
    }
    show(title: notice.title, message: notice.message, isError: notice.isError)
    return "ok"
  }

  /// A notice that stays until clicked is for news that could arrive while you're looking away.
  func show(title: String, message: String, isError: Bool = false, staysUntilClicked: Bool = false) {
    hideTask?.cancel()
    hideTask = nil
    showCount += 1
    titleLabel.stringValue = title
    messageLabel.stringValue = message
    messageLabel.isHidden = message.isEmpty
    messageLabel.textColor = isError ? .systemRed : .labelColor
    place()

    let wasVisible = panel.isVisible
    panel.alphaValue = wasVisible || Self.reducesMotion ? 1 : 0
    panel.orderFrontRegardless()
    if !wasVisible {
      fade(to: 1)
    }
    NSAccessibility.post(
      element: NSApp as Any,
      notification: .announcementRequested,
      userInfo: [
        .announcement: "\(title). \(message)",
        .priority: NSAccessibilityPriorityLevel.high.rawValue,
      ]
    )

    guard !staysUntilClicked else {
      return
    }
    let task = DispatchWorkItem { [weak self] in self?.hide() }
    hideTask = task
    let seconds = isError ? Self.visibleSecondsForError : Self.visibleSeconds
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: task)
  }

  private static var reducesMotion: Bool {
    NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
  }

  /// Under the menu bar at the top right of the screen the pointer is on, like a macOS notification.
  private func place() {
    let mouse = NSEvent.mouseLocation
    let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
    guard let area = screen?.visibleFrame else {
      return
    }
    content.layoutSubtreeIfNeeded()
    let height = content.fittingSize.height
    panel.setFrame(
      NSRect(
        x: area.maxX - Self.width - Self.screenMargin,
        y: area.maxY - height - Self.screenMargin,
        width: Self.width,
        height: height
      ),
      display: true
    )
  }

  private func fade(to alpha: CGFloat, then completion: (() -> Void)? = nil) {
    guard !Self.reducesMotion else {
      panel.alphaValue = alpha
      completion?()
      return
    }
    NSAnimationContext.runAnimationGroup({ context in
      context.duration = Self.fadeSeconds
      panel.animator().alphaValue = alpha
    }, completionHandler: completion)
  }

  private func hide() {
    hideTask?.cancel()
    let shownAtStart = showCount
    fade(to: 0) { [weak self] in
      guard let self, self.showCount == shownAtStart else {
        return
      }
      self.panel.orderOut(nil)
    }
  }
}
