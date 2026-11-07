import AppKit
import Foundation

private func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

private func coordinateRead(_ source: URL, into destination: URL) throws {
  let coordinator = NSFileCoordinator(filePresenter: nil)
  var coordinationError: NSError?
  var copyError: Error?
  coordinator.coordinate(readingItemAt: source, options: [], error: &coordinationError) { readable in
    do {
      let values = try readable.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
      if values.ubiquitousItemDownloadingStatus == .notDownloaded {
        throw NSError(domain: "MedeaSync", code: 1, userInfo: [NSLocalizedDescriptionKey: "File is not downloaded yet"])
      }
      try FileManager.default.createDirectory(
        at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
      let data = try Data(contentsOf: readable)
      try data.write(to: destination, options: .atomic)
    } catch {
      copyError = error
    }
  }
  if let error = coordinationError ?? copyError { throw error }
}

private func coordinateWrite(_ source: URL, into destination: URL) throws {
  try FileManager.default.createDirectory(
    at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
  let coordinator = NSFileCoordinator(filePresenter: nil)
  var coordinationError: NSError?
  var copyError: Error?
  coordinator.coordinate(
    writingItemAt: destination, options: [], error: &coordinationError
  ) { writable in
    do {
      if !FileManager.default.fileExists(atPath: writable.path) {
        try Data(contentsOf: source).write(to: writable, options: .atomic)
      }
    } catch {
      copyError = error
    }
  }
  if let error = coordinationError ?? copyError { throw error }
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else { fail("Usage: medea-sync-bridge choose|read|write") }
do {
  switch arguments[1] {
  case "choose":
    // A bare command-line process can't become active, so its panel never turns key and the first
    // click on it ends the modal session as a cancel.
    NSApplication.shared.setActivationPolicy(.accessory)
    NSApplication.shared.activate(ignoringOtherApps: true)
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    panel.allowsMultipleSelection = false
    panel.message = "Choose or create a Medea Sync folder in iCloud Drive"
    guard panel.runModal() == .OK, let folder = panel.url else { exit(2) }
    guard FileManager.default.isUbiquitousItem(at: folder) else {
      fail("Choose a folder inside iCloud Drive")
    }
    print(folder.path)
  case "read", "write":
    guard arguments.count == 4 else { fail("Expected source and destination paths") }
    let source = URL(fileURLWithPath: arguments[2])
    let destination = URL(fileURLWithPath: arguments[3])
    if arguments[1] == "read" {
      try coordinateRead(source, into: destination)
    } else {
      try coordinateWrite(source, into: destination)
    }
  default:
    fail("Unknown sync bridge command")
  }
} catch {
  fail(String(describing: error))
}
