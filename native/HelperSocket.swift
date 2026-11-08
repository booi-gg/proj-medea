import Foundation

func toSocketAddress(path: String) -> sockaddr_un? {
  var address = sockaddr_un()
  address.sun_family = sa_family_t(AF_UNIX)
  let pathBytes = Array(path.utf8) + [0]
  guard pathBytes.count <= MemoryLayout.size(ofValue: address.sun_path) else {
    return nil
  }
  withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: pathBytes) }
  return address
}

/// Takes one line from the CLI and sends one line back. A helper that isn't running refuses the
/// connection, even if the socket file was left behind, so there is no stale state to clean up.
final class HelperSocket {
  private static let backlog: Int32 = 8
  // Room for a notification's text, which arrives encoded.
  private static let maxRequestBytes = 4096
  private static let ownerOnly: mode_t = 0o600

  private let path: String
  private let onRequest: (String, @escaping (String) -> Void) -> Void
  private var source: DispatchSourceRead?

  /// Requests arrive on the main thread, and every request must be replied to exactly once.
  init(path: String, onRequest: @escaping (String, @escaping (String) -> Void) -> Void) {
    self.path = path
    self.onRequest = onRequest
  }

  func start() -> Bool {
    guard var address = toSocketAddress(path: path) else {
      return false
    }
    unlink(path)
    let listener = socket(AF_UNIX, SOCK_STREAM, 0)
    guard listener >= 0 else {
      return false
    }
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(listener, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard bound == 0, chmod(path, Self.ownerOnly) == 0, listen(listener, Self.backlog) == 0 else {
      close(listener)
      return false
    }
    let source = DispatchSource.makeReadSource(
      fileDescriptor: listener,
      queue: .global(qos: .userInteractive)
    )
    source.setEventHandler { [weak self] in
      self?.acceptConnection(from: listener)
    }
    source.resume()
    self.source = source
    return true
  }

  private func acceptConnection(from listener: Int32) {
    let connection = accept(listener, nil, nil)
    guard connection >= 0 else {
      return
    }
    var timeout = timeval(tv_sec: 1, tv_usec: 0)
    let timeoutSize = socklen_t(MemoryLayout<timeval>.size)
    setsockopt(connection, SOL_SOCKET, SO_RCVTIMEO, &timeout, timeoutSize)
    setsockopt(connection, SOL_SOCKET, SO_SNDTIMEO, &timeout, timeoutSize)

    guard let request = readLine(from: connection) else {
      close(connection)
      return
    }
    DispatchQueue.main.async { [onRequest] in
      onRequest(request) { reply in
        let bytes = Array("\(reply)\n".utf8)
        send(connection, bytes, bytes.count, 0)
        close(connection)
      }
    }
  }

  private func readLine(from connection: Int32) -> String? {
    var bytes: [UInt8] = []
    var chunk = [UInt8](repeating: 0, count: Self.maxRequestBytes)
    while bytes.count < Self.maxRequestBytes {
      let received = recv(connection, &chunk, chunk.count, 0)
      guard received > 0 else {
        return nil
      }
      bytes.append(contentsOf: chunk.prefix(received))
      if bytes.contains(UInt8(ascii: "\n")) {
        return String(decoding: bytes, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
      }
    }
    return nil
  }
}
