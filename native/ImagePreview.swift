import AppKit

private let maxSide: CGFloat = 520
private let gapFromWindow: CGFloat = 12
private let screenMargin: CGFloat = 12
private let cornerRadius: CGFloat = 10

/// Shows a real image in a floating window. It never takes focus, so keys stay in the terminal.
final class PreviewPanel {
  private let panel = NSPanel(
    contentRect: NSRect(x: 0, y: 0, width: 100, height: 100),
    styleMask: [.borderless, .nonactivatingPanel],
    backing: .buffered,
    defer: false
  )
  private let imageView = NSImageView()

  init() {
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
    guard let image = NSImage(contentsOfFile: path), let rep = image.representations.first else {
      hide()
      return
    }
    let size = fit(width: CGFloat(rep.pixelsWide), height: CGFloat(rep.pixelsHigh))
    imageView.image = image
    panel.setFrame(placeWindow(size: size), display: true)
    panel.orderFrontRegardless()
  }

  func hide() {
    panel.orderOut(nil)
  }

  private func fit(width: CGFloat, height: CGFloat) -> NSSize {
    let scale = min(maxSide / max(width, 1), maxSide / max(height, 1), 1)
    return NSSize(width: width * scale, height: height * scale)
  }

  /// The window of the app in front, which is the terminal. Reading bounds needs no permission.
  private func frontWindowFrame() -> NSRect? {
    guard let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier,
      let primaryHeight = NSScreen.screens.first?.frame.height
    else {
      return nil
    }
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
    for window in windows {
      let isFromApp = window[kCGWindowOwnerPID as String] as? pid_t == pid
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
    let anchor = frontWindowFrame()
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
let preview = PreviewPanel()

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
