import AppKit

private let maxSide: CGFloat = 520
private let gapFromWindow: CGFloat = 12
private let screenMargin: CGFloat = 12
private let cornerRadius: CGFloat = 10

private func parentPid(of pid: pid_t) -> pid_t? {
  var info = kinfo_proc()
  var size = MemoryLayout<kinfo_proc>.stride
  var query = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
  guard sysctl(&query, UInt32(query.count), &info, &size, nil, 0) == 0, size > 0 else {
    return nil
  }
  return info.kp_eproc.e_ppid
}

/// The app running this terminal, found through the parent processes: the app in front can already
/// be another one by now. Inside tmux the chain ends without an app, so the front app is the best guess.
private func findTerminalPid() -> pid_t? {
  var pid = getppid()
  while pid > 1 {
    if NSRunningApplication(processIdentifier: pid)?.activationPolicy == .regular {
      return pid
    }
    guard let parent = parentPid(of: pid) else {
      break
    }
    pid = parent
  }
  return NSWorkspace.shared.frontmostApplication?.processIdentifier
}

/// A window that can't take focus, however it comes on screen, so keys always stay in the terminal.
final class UnfocusablePanel: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

/// Shows a real image in a floating window while the terminal is the app in use.
final class PreviewPanel {
  private let panel = UnfocusablePanel(
    contentRect: NSRect(x: 0, y: 0, width: 100, height: 100),
    styleMask: [.borderless, .nonactivatingPanel],
    backing: .buffered,
    defer: false
  )
  private let imageView = NSImageView()
  private let terminalPid: pid_t?
  private var imagePath: String?

  init(terminalPid: pid_t?) {
    self.terminalPid = terminalPid
    imageView.imageScaling = .scaleProportionallyUpOrDown
    imageView.wantsLayer = true
    imageView.layer?.cornerRadius = cornerRadius
    imageView.layer?.masksToBounds = true

    panel.contentView = imageView
    panel.level = .floating
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.ignoresMouseEvents = true
    panel.hidesOnDeactivate = false
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
  }

  func show(path: String) {
    imagePath = path
    refresh()
  }

  func hide() {
    imagePath = nil
    refresh()
  }

  /// Also runs when another app comes to the front, so the image leaves with the terminal and
  /// returns with it, showing whatever is selected by then.
  func refresh() {
    let isTerminalInFront = NSWorkspace.shared.frontmostApplication?.processIdentifier == terminalPid
    guard isTerminalInFront, let imagePath, let image = NSImage(contentsOfFile: imagePath),
      let rep = image.representations.first
    else {
      panel.orderOut(nil)
      return
    }
    let size = fit(width: CGFloat(rep.pixelsWide), height: CGFloat(rep.pixelsHigh))
    imageView.image = image
    panel.setFrame(placeWindow(size: size), display: true)
    panel.orderFrontRegardless()
  }

  private func fit(width: CGFloat, height: CGFloat) -> NSSize {
    let scale = min(maxSide / max(width, 1), maxSide / max(height, 1), 1)
    return NSSize(width: width * scale, height: height * scale)
  }

  /// The terminal's front window. Reading bounds needs no permission.
  private func terminalWindowFrame() -> NSRect? {
    guard let terminalPid, let primaryHeight = NSScreen.screens.first?.frame.height else {
      return nil
    }
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
    for window in windows {
      let isFromApp = window[kCGWindowOwnerPID as String] as? pid_t == terminalPid
      let isNormalWindow = window[kCGWindowLayer as String] as? Int == 0
      guard isFromApp, isNormalWindow,
        let bounds = window[kCGWindowBounds as String] as? NSDictionary,
        let frame = CGRect(dictionaryRepresentation: bounds)
      else {
        continue
      }
      // Window lists measure from the top of the screen, and AppKit from the bottom.
      return NSRect(
        x: frame.minX,
        y: primaryHeight - frame.maxY,
        width: frame.width,
        height: frame.height
      )
    }
    return nil
  }

  /// Beside the terminal when there's room, so it never covers what you're reading.
  private func placeWindow(size: NSSize) -> NSRect {
    let anchor = terminalWindowFrame()
    let screen =
      NSScreen.screens.first { screen in
        anchor.map { screen.frame.intersects($0) } ?? false
      } ?? NSScreen.main
    let area = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
    guard let anchor else {
      return NSRect(
        x: area.maxX - size.width - screenMargin,
        y: area.maxY - size.height - screenMargin,
        width: size.width,
        height: size.height
      )
    }
    let rightSide = anchor.maxX + gapFromWindow
    let leftSide = anchor.minX - gapFromWindow - size.width
    let hasRoomOnRight = rightSide + size.width <= area.maxX
    let hasRoomOnLeft = leftSide >= area.minX
    let insideRightEdge = area.maxX - size.width - screenMargin
    let x = hasRoomOnRight ? rightSide : (hasRoomOnLeft ? leftSide : insideRightEdge)
    let top = min(anchor.maxY, area.maxY)
    let y = max(top - size.height, area.minY + screenMargin)
    return NSRect(x: x, y: y, width: size.width, height: size.height)
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let preview = PreviewPanel(terminalPid: findTerminalPid())

NSWorkspace.shared.notificationCenter.addObserver(
  forName: NSWorkspace.didActivateApplicationNotification,
  object: nil,
  queue: .main
) { _ in
  preview.refresh()
}

// One command per line: "show <path>" or "hide". When the CLI ends, its pipe closes and so does this.
DispatchQueue.global().async {
  while let line = readLine() {
    DispatchQueue.main.async {
      if line.hasPrefix("show ") {
        preview.show(path: String(line.dropFirst("show ".count)))
      } else {
        preview.hide()
      }
    }
  }
  DispatchQueue.main.async { exit(0) }
}

app.run()
