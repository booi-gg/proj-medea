import CoreServices
import Foundation

/// Prints the definition of the term it's given, or nothing when there isn't one. macOS searches
/// the dictionaries turned on in Dictionary.app, in that app's order. It's a program of its own so
/// that looking up a word doesn't need the menu bar item.
guard CommandLine.arguments.count == 2 else {
  exit(EXIT_FAILURE)
}

let term = CommandLine.arguments[1]
let wholeTerm = CFRange(location: 0, length: (term as NSString).length)
if let definition = DCSCopyTextDefinition(nil, term as CFString, wholeTerm)?.takeRetainedValue() {
  print(definition as String)
}
