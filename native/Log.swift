import Foundation
import Darwin

struct MedeaSpan {
  let event: String
  let id: String
  let trace: String
  let parent: String?
  let startedAt: UInt64
  let fields: [String: Any]
}

/// Writes one metadata-only JSON line per call. Node owns rotation; the helper only appends.
enum MedeaLog {
  static let startupTrace = ProcessInfo.processInfo.environment["MEDEA_TRACE"]
  static let directory = ProcessInfo.processInfo.environment["MEDEA_LOG_DIR"]
    .map { URL(fileURLWithPath: $0, isDirectory: true) }
    ?? FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Logs/Medea", isDirectory: true)
  private static let file = directory.appendingPathComponent("medea.log")
  private static let maxLineBytes = 2048

  static func newTrace() -> String { UUID().uuidString.lowercased() }

  private static func newId() -> String {
    String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12)).lowercased()
  }

  static func safeItem(_ item: String) -> String {
    if item.hasPrefix("/") {
      return "app:" + String(URL(fileURLWithPath: item).lastPathComponent.prefix(96))
    }
    let allowed = item.range(of: "^(command|medea-[a-z-]+):[a-z0-9-]+$", options: .regularExpression)
    return allowed == nil ? "other" : String(item.prefix(96))
  }

  static func event(
    _ name: String,
    level: String = "info",
    trace: String? = nil,
    parent: String? = nil,
    fields: [String: Any] = [:]
  ) {
    write(name, level: level, trace: trace, id: newId(), parent: parent, fields: fields)
  }

  static func start(
    _ event: String,
    trace: String? = nil,
    parent: String? = nil,
    fields: [String: Any] = [:]
  ) -> MedeaSpan {
    let span = MedeaSpan(
      event: event,
      id: newId(),
      trace: trace ?? newTrace(),
      parent: parent,
      startedAt: DispatchTime.now().uptimeNanoseconds,
      fields: fields
    )
    write(event, trace: span.trace, id: span.id, parent: parent, phase: "start", fields: fields)
    return span
  }

  static func end(_ span: MedeaSpan, ok: Bool, fields: [String: Any] = [:]) {
    let duration = DispatchTime.now().uptimeNanoseconds - span.startedAt
    write(
      span.event,
      level: ok ? "info" : "warn",
      trace: span.trace,
      id: span.id,
      parent: span.parent,
      phase: "end",
      fields: span.fields.merging(fields) { _, latest in latest }.merging([
        "ok": ok,
        "durationMs": Int(duration / 1_000_000),
      ]) { _, latest in latest }
    )
  }

  private static func write(
    _ event: String,
    level: String = "info",
    trace: String?,
    id: String,
    parent: String?,
    phase: String? = nil,
    fields: [String: Any]
  ) {
    let formatter = ISO8601DateFormatter()
    formatter.timeZone = .current
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var entry: [String: Any] = [
      "ts": formatter.string(from: Date()),
      "level": level,
      "source": "helper",
      "pid": ProcessInfo.processInfo.processIdentifier,
      "ppid": getppid(),
      "trace": trace ?? newTrace(),
      "id": id,
      "event": event,
    ]
    if let parent { entry["parent"] = parent }
    if let phase { entry["phase"] = phase }
    entry.merge(fields) { _, latest in latest }
    guard var data = try? JSONSerialization.data(withJSONObject: entry) else { return }
    data.append(0x0a)
    guard data.count <= maxLineBytes else { return }
    try? FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700]
    )
    let descriptor = open(file.path, O_WRONLY | O_CREAT | O_APPEND, 0o600)
    guard descriptor >= 0 else { return }
    _ = data.withUnsafeBytes { bytes in
      Darwin.write(descriptor, bytes.baseAddress, bytes.count)
    }
    close(descriptor)
  }
}
