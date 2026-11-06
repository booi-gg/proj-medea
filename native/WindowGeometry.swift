import CoreGraphics

// Everything here uses the Accessibility API's coordinates: the origin is the top left of the
// primary display, and y grows downward.

/// Fractions of a display's usable area, measured from its top left.
struct Placement {
  private static let wholeWidth: CGFloat = 0.999

  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat

  /// True for a placement against the far edge that doesn't also touch the near one.
  var touchesRightOnly: Bool { x > 0 && x + width >= Self.wholeWidth }
  var touchesBottomOnly: Bool { y > 0 && y + height >= Self.wholeWidth }
}

/// Edges are rounded rather than sizes, so neighbouring windows meet with no gap.
func toFrame(_ placement: Placement, in area: CGRect) -> CGRect {
  let left = (area.minX + area.width * placement.x).rounded()
  let top = (area.minY + area.height * placement.y).rounded()
  let right = (area.minX + area.width * (placement.x + placement.width)).rounded()
  let bottom = (area.minY + area.height * (placement.y + placement.height)).rounded()
  return CGRect(x: left, y: top, width: right - left, height: bottom - top)
}

/// Keeps the window's size, unless it's too big for the area.
func toCenteredFrame(_ frame: CGRect, in area: CGRect) -> CGRect {
  let width = min(frame.width, area.width)
  let height = min(frame.height, area.height)
  return CGRect(
    x: (area.midX - width / 2).rounded(),
    y: (area.midY - height / 2).rounded(),
    width: width,
    height: height
  )
}

/// Keeps the window's place and share of the display, so half a small display is half a big one.
func toCarriedFrame(_ frame: CGRect, from source: CGRect, to destination: CGRect) -> CGRect {
  let placement = Placement(
    x: (frame.minX - source.minX) / source.width,
    y: (frame.minY - source.minY) / source.height,
    width: frame.width / source.width,
    height: frame.height / source.height
  )
  return toFrame(placement, in: destination)
}

/// The index of the area holding most of the window, or the first one if it's on none of them.
func findAreaIndex(for frame: CGRect, in areas: [CGRect]) -> Int {
  let overlaps = areas.map { area -> CGFloat in
    let overlap = area.intersection(frame)
    return overlap.isNull ? 0 : overlap.width * overlap.height
  }
  let largest = overlaps.max() ?? 0
  return overlaps.firstIndex(of: largest) ?? 0
}

func isSameFrame(_ first: CGRect, _ second: CGRect) -> Bool {
  let tolerance: CGFloat = 1
  return abs(first.minX - second.minX) <= tolerance
    && abs(first.minY - second.minY) <= tolerance
    && abs(first.width - second.width) <= tolerance
    && abs(first.height - second.height) <= tolerance
}
