import Foundation

/// The one countdown, kept here so it carries on after Redhot's window closes. The CLI decides how
/// long it runs and what to say at the end. Starting another replaces it.
final class Countdown {
  private static let requestPrefix = "timer"
  private static let secondsPerMinute = 60
  private static let secondsPerHour = 3600
  // Waking this close to a whole second would only draw the same time again.
  private static let shortestWait: TimeInterval = 0.05

  /// Gets the time left as text like "24:59", or nil once nothing is counting down.
  var onTimeLeft: ((String?) -> Void)?

  // A date and not a count of ticks, so time spent asleep still counts.
  private var deadline: Date?
  private var doneNotice: NoticeRequest?
  private var nextTick: Timer?

  /// Answers "timer start <seconds> <base64 JSON>" and "timer cancel", with or without a trace in
  /// front. Returns nil when the request is for something else, so another handler can answer it.
  func answer(_ request: String) -> String? {
    let parts = request.split(separator: " ")
    let command = parts.first == "trace" ? Array(parts.dropFirst(2)) : parts
    guard command.first.map(String.init) == Self.requestPrefix else {
      return nil
    }
    if command.count == 2, command[1] == "cancel" {
      return cancel() ? "cancelled" : "none"
    }
    guard command.count == 4, command[1] == "start",
      let seconds = Int(command[2]), seconds > 0,
      let notice = NoticeRequest.decode(String(command[3]))
    else {
      return WindowFailure.badCommand.rawValue
    }
    let wasRunning = deadline != nil
    start(seconds: seconds, doneNotice: notice)
    return wasRunning ? "replaced" : "started"
  }

  private func start(seconds: Int, doneNotice: NoticeRequest) {
    RedhotLog.event("timer.start", fields: ["seconds": seconds])
    nextTick?.invalidate()
    deadline = Date().addingTimeInterval(TimeInterval(seconds))
    self.doneNotice = doneNotice
    tick()
  }

  /// Returns false when nothing was counting down.
  @discardableResult
  func cancel() -> Bool {
    guard deadline != nil else {
      return false
    }
    RedhotLog.event("timer.cancel")
    clear()
    return true
  }

  private func clear() {
    nextTick?.invalidate()
    nextTick = nil
    deadline = nil
    doneNotice = nil
    onTimeLeft?(nil)
  }

  private func tick() {
    guard let deadline else {
      return
    }
    let secondsLeft = deadline.timeIntervalSinceNow
    guard secondsLeft > 0 else {
      finish()
      return
    }
    onTimeLeft?(Self.toText(wholeSeconds: Int(secondsLeft.rounded(.up))))
    // Timed to the next whole second, so the display never skips one.
    let wait = max(secondsLeft.truncatingRemainder(dividingBy: 1), Self.shortestWait)
    let timer = Timer(timeInterval: wait, repeats: false) { [weak self] _ in self?.tick() }
    // The common modes keep it running while the menu is open.
    RunLoop.main.add(timer, forMode: .common)
    nextTick = timer
  }

  private func finish() {
    let notice = doneNotice
    RedhotLog.event("timer.done")
    clear()
    if let notice {
      NoticePanel.shared.show(
        title: notice.title,
        message: notice.message,
        isError: notice.isError,
        staysUntilClicked: true
      )
    }
  }

  private static func toText(wholeSeconds: Int) -> String {
    let hours = wholeSeconds / secondsPerHour
    let minutes = wholeSeconds % secondsPerHour / secondsPerMinute
    let seconds = wholeSeconds % secondsPerMinute
    return hours > 0
      ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
      : String(format: "%d:%02d", minutes, seconds)
  }
}
