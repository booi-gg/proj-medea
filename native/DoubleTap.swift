import Foundation

/// Tells the second quick press of a hotkey from an ordinary press.
struct DoubleTapDetector {
  private static let maxGap: TimeInterval = 0.4

  private var lastPress: (value: String, time: TimeInterval)?

  /// A third quick press starts over as a first press, so tapping fast can't flood the screen.
  mutating func isDoubleTap(of value: String, at time: TimeInterval) -> Bool {
    if let lastPress, lastPress.value == value, time - lastPress.time <= Self.maxGap {
      self.lastPress = nil
      return true
    }
    lastPress = (value, time)
    return false
  }
}
