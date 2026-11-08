import AppKit
import Carbon.HIToolbox

private let columnCount = 8
private let cellSize: CGFloat = 84
private let gridPadding: CGFloat = 14
private let emojiPointSize: CGFloat = 56
private let tileInset: CGFloat = 3
private let tileRadius: CGFloat = 14
private let tileOpacity: CGFloat = 0.16
private let windowHeight: CGFloat = 640
private let windowWidth = CGFloat(columnCount) * cellSize + gridPadding * 2
// Clears the hidden title bar, which still takes up room at the top of the window.
private let topInset: CGFloat = 30
private let sideInset: CGFloat = 24
private let hintText = "↵ copy      ⌃V paste      esc close"

struct EmojiRow {
  let character: String
  let name: String
  let searchName: String
  let keywords: [String]
}

/// Each line is "character|name|keyword|keyword", already in the order to show them.
func parseEmojiRows(_ text: String) -> [EmojiRow] {
  text.split(separator: "\n").compactMap { line in
    let fields = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
    guard fields.count >= 2 else {
      return nil
    }
    return EmojiRow(
      character: fields[0],
      name: fields[1],
      searchName: fields[1].lowercased(),
      keywords: Array(fields.dropFirst(2))
    )
  }
}

/// Lower is better. A name beats a keyword, and a whole word beats part of one.
private func matchScore(_ row: EmojiRow, query: String) -> Int? {
  if row.searchName == query { return 0 }
  if row.searchName.hasPrefix(query) { return 1 }
  if row.searchName.contains(" \(query)") { return 2 }
  if row.keywords.contains(query) { return 3 }
  if row.keywords.contains(where: { $0.hasPrefix(query) }) { return 4 }
  if row.searchName.contains(query) { return 5 }
  if row.keywords.contains(where: { $0.contains(query) }) { return 6 }
  return nil
}

/// Equal matches keep the order they came in, so a recent pick wins a tie.
func rankEmojiRows(_ rows: [EmojiRow], query: String) -> [EmojiRow] {
  let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  guard !normalized.isEmpty else {
    return rows
  }
  return rows.enumerated()
    .compactMap { index, row in matchScore(row, query: normalized).map { ($0, index, row) } }
    .sorted { ($0.0, $0.1) < ($1.0, $1.1) }
    .map { $0.2 }
}

/// Draws only the rows on screen, because there are about 2,000 emoji and each is a big glyph.
final class EmojiGridView: NSView {
  private(set) var rows: [EmojiRow] = []
  private(set) var selected = 0
  var onSelectionChange: ((EmojiRow?) -> Void)?
  var onClick: ((EmojiRow) -> Void)?

  private let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: emojiPointSize),
    .foregroundColor: NSColor.labelColor,
  ]

  override var isFlipped: Bool { true }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  var selectedRow: EmojiRow? {
    rows.indices.contains(selected) ? rows[selected] : nil
  }

  func show(_ newRows: [EmojiRow], minimumHeight: CGFloat) {
    rows = newRows
    let rowCount = (rows.count + columnCount - 1) / columnCount
    let contentHeight = CGFloat(rowCount) * cellSize + gridPadding * 2
    setFrameSize(NSSize(width: windowWidth, height: max(contentHeight, minimumHeight)))
    select(0)
    needsDisplay = true
  }

  /// Moving down from a short last row lands on its final emoji, as long as that's a row lower.
  func moveSelection(columns: Int, rows rowDelta: Int) {
    guard !rows.isEmpty else {
      return
    }
    let last = rows.count - 1
    var target = selected + columns + rowDelta * columnCount
    if target > last, rowDelta > 0, last / columnCount > selected / columnCount {
      target = last
    }
    guard (0...last).contains(target) else {
      return
    }
    select(target)
  }

  private func select(_ index: Int) {
    let rowsToRedraw = [selected, index].filter(rows.indices.contains)
    selected = index
    for changed in rowsToRedraw {
      setNeedsDisplay(cellRect(changed))
    }
    onSelectionChange?(selectedRow)
    if rows.indices.contains(index) {
      // The padding is included so the first and last rows don't end up against the edge.
      scrollToVisible(cellRect(index).insetBy(dx: 0, dy: -gridPadding))
    }
  }

  private func cellRect(_ index: Int) -> NSRect {
    NSRect(
      x: gridPadding + CGFloat(index % columnCount) * cellSize,
      y: gridPadding + CGFloat(index / columnCount) * cellSize,
      width: cellSize,
      height: cellSize
    )
  }

  override func draw(_ dirtyRect: NSRect) {
    let firstRow = max(0, Int((dirtyRect.minY - gridPadding) / cellSize))
    let lastRow = Int((dirtyRect.maxY - gridPadding) / cellSize)
    let first = firstRow * columnCount
    let end = min(rows.count, (lastRow + 1) * columnCount)
    guard first < end else {
      return
    }
    for index in first..<end {
      drawCell(index)
    }
  }

  private func drawCell(_ index: Int) {
    let rect = cellRect(index)
    if index == selected {
      NSColor.labelColor.withAlphaComponent(tileOpacity).setFill()
      let tile = rect.insetBy(dx: tileInset, dy: tileInset)
      NSBezierPath(roundedRect: tile, xRadius: tileRadius, yRadius: tileRadius).fill()
    }
    let glyph = NSAttributedString(string: rows[index].character, attributes: attributes)
    let size = glyph.size()
    glyph.draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2))
  }

  override func mouseDown(with event: NSEvent) {
    let point = convert(event.locationInWindow, from: nil)
    let column = Int((point.x - gridPadding) / cellSize)
    let row = Int((point.y - gridPadding) / cellSize)
    let index = row * columnCount + column
    guard point.x >= gridPadding, point.y >= gridPadding, column < columnCount,
      rows.indices.contains(index)
    else {
      return
    }
    select(index)
    onClick?(rows[index])
  }
}

/// Shows the grid, then prints "copy <character>" or "paste <character>" and exits. It prints
/// nothing when cancelled. What happens to the pick is up to the CLI.
final class EmojiPickerController: NSObject, NSApplicationDelegate, NSTextFieldDelegate {
  private let allRows: [EmojiRow]
  private let searchField = NSTextField()
  private let nameLabel = NSTextField(labelWithString: "")
  private let hintLabel = NSTextField(labelWithString: hintText)
  private let noResultsLabel = NSTextField(labelWithString: "No results")
  private let grid = EmojiGridView()
  private let scrollView = NSScrollView()
  private var panel: NSPanel?

  init(rows: [EmojiRow]) {
    allRows = rows
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    let panel = makePanel()
    self.panel = panel
    panel.center()
    panel.makeKeyAndOrderFront(nil)
    panel.makeFirstResponder(searchField)
    NSApp.activate(ignoringOtherApps: true)
    applyQuery()

    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      self?.handleKey(code: Int(event.keyCode), flags: event.modifierFlags) == true ? nil : event
    }
  }

  // Clicking away cancels, so a forgotten window can't linger.
  func applicationDidResignActive(_ notification: Notification) {
    exit(0)
  }

  func controlTextDidChange(_ notification: Notification) {
    applyQuery()
  }

  private func applyQuery() {
    let results = rankEmojiRows(allRows, query: searchField.stringValue)
    noResultsLabel.isHidden = !results.isEmpty
    grid.show(results, minimumHeight: scrollView.contentSize.height)
  }

  /// Returns true when the key was used here. Anything else goes on to the search field.
  private func handleKey(code: Int, flags: NSEvent.ModifierFlags) -> Bool {
    switch code {
    case kVK_Escape:
      exit(0)
    case kVK_Return, kVK_ANSI_KeypadEnter:
      finish("copy", grid.selectedRow)
    case kVK_ANSI_V where flags.contains(.control):
      finish("paste", grid.selectedRow)
    case kVK_LeftArrow:
      grid.moveSelection(columns: -1, rows: 0)
    case kVK_RightArrow:
      grid.moveSelection(columns: 1, rows: 0)
    case kVK_UpArrow:
      grid.moveSelection(columns: 0, rows: -1)
    case kVK_DownArrow:
      grid.moveSelection(columns: 0, rows: 1)
    case kVK_Tab:
      break  // Focus stays in the search field, so typing always filters.
    default:
      return false
    }
    return true
  }

  // With nothing listed there's nothing to pick, and the search carries on.
  private func finish(_ action: String, _ row: EmojiRow?) {
    guard let row else {
      return
    }
    print("\(action) \(row.character)")
    fflush(stdout)
    exit(0)
  }

  private func makePanel() -> NSPanel {
    let panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: windowWidth, height: windowHeight),
      styleMask: [.titled, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    panel.titleVisibility = .hidden
    panel.titlebarAppearsTransparent = true
    panel.level = .floating
    panel.isMovableByWindowBackground = true
    panel.appearance = NSAppearance(named: .darkAqua)

    configureLabels()
    grid.onSelectionChange = { [weak self] row in
      self?.nameLabel.stringValue = row?.name ?? ""
    }
    grid.onClick = { [weak self] row in
      self?.finish("copy", row)
    }
    scrollView.documentView = grid
    scrollView.hasVerticalScroller = true
    scrollView.autohidesScrollers = true
    scrollView.drawsBackground = false
    panel.contentView = makeContent()
    return panel
  }

  private func configureLabels() {
    searchField.placeholderString = "Search emoji and symbols"
    searchField.font = .systemFont(ofSize: 22)
    searchField.isBordered = false
    searchField.drawsBackground = false
    searchField.focusRingType = .none
    searchField.delegate = self

    nameLabel.font = .systemFont(ofSize: 15, weight: .medium)
    nameLabel.lineBreakMode = .byTruncatingTail
    nameLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    hintLabel.font = .systemFont(ofSize: 12)
    hintLabel.textColor = .secondaryLabelColor
    noResultsLabel.font = .systemFont(ofSize: 15)
    noResultsLabel.textColor = .secondaryLabelColor
    noResultsLabel.isHidden = true
  }

  private func makeContent() -> NSView {
    let content = NSView(frame: NSRect(x: 0, y: 0, width: windowWidth, height: windowHeight))
    for view in [searchField, scrollView, nameLabel, hintLabel, noResultsLabel] as [NSView] {
      view.translatesAutoresizingMaskIntoConstraints = false
      content.addSubview(view)
    }
    NSLayoutConstraint.activate([
      searchField.topAnchor.constraint(equalTo: content.topAnchor, constant: topInset),
      searchField.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: sideInset),
      searchField.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -sideInset),

      scrollView.topAnchor.constraint(equalTo: searchField.bottomAnchor, constant: 10),
      scrollView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: nameLabel.topAnchor, constant: -8),

      nameLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: sideInset),
      nameLabel.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -16),
      nameLabel.trailingAnchor.constraint(lessThanOrEqualTo: hintLabel.leadingAnchor, constant: -16),
      hintLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -sideInset),
      hintLabel.firstBaselineAnchor.constraint(equalTo: nameLabel.firstBaselineAnchor),

      noResultsLabel.centerXAnchor.constraint(equalTo: scrollView.centerXAnchor),
      noResultsLabel.centerYAnchor.constraint(equalTo: scrollView.centerYAnchor),
    ])
    return content
  }
}

// MARK: - Start

let inputData = FileHandle.standardInput.readDataToEndOfFile()
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = EmojiPickerController(rows: parseEmojiRows(String(decoding: inputData, as: UTF8.self)))
app.delegate = controller
app.run()
