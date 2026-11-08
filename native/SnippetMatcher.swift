import Foundation

/// Finds a keyword at the end of what was just typed, with no system calls. What it holds is only
/// ever in memory, is as short as the longest keyword allows, and must never be logged.
struct SnippetMatcher {
  private var keywords: [[Character]] = []
  private var typed: [Character] = []
  private var capacity = 0

  init(keywords: [String] = []) {
    setKeywords(keywords)
  }

  mutating func setKeywords(_ newKeywords: [String]) {
    // Longest first, so a hand-edited file with overlapping keywords still has one answer.
    keywords = newKeywords.map(Array.init).sorted { $0.count > $1.count }
    // One extra, to see the character before the longest keyword.
    capacity = (keywords.first?.count ?? 0) + 1
    reset()
  }

  mutating func reset() {
    typed.removeAll(keepingCapacity: true)
  }

  mutating func deleteLast() {
    _ = typed.popLast()
  }

  /// Returns the keyword this text completes, and starts again if there is one.
  mutating func add(_ text: String) -> String? {
    for character in text {
      typed.append(character)
      if typed.count > capacity {
        typed.removeFirst(typed.count - capacity)
      }
      if let keyword = keywords.first(where: isCompleted) {
        reset()
        return String(keyword)
      }
    }
    return nil
  }

  /// A keyword like "btw" only counts at the start of a word, or it would fire inside "subtwo".
  private func isCompleted(_ keyword: [Character]) -> Bool {
    guard typed.count >= keyword.count, Array(typed.suffix(keyword.count)) == keyword else {
      return false
    }
    guard let first = keyword.first, first.isLetter || first.isNumber else {
      return true
    }
    guard let before = typed.dropLast(keyword.count).last else {
      return true
    }
    return !before.isLetter && !before.isNumber
  }
}

struct FilledSnippet: Equatable {
  let text: String
  /// How many left-arrow presses put the cursor where {cursor} was.
  let charactersAfterCursor: Int
}

// src/redhot-apps/redhot-snippets/placeholders.ts fills these too, and has to give the same result.
private let snippetPlaceholder = try? NSRegularExpression(
  pattern: "\\{(date|time|clipboard|cursor)\\}"
)

private func formatLocal(_ date: Date, as format: String) -> String {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.dateFormat = format
  return formatter.string(from: date)
}

/// Fills in one pass, so a {date} inside the copied text stays as it is. The first {cursor} sets
/// the cursor's place, and any others are dropped.
func fillSnippet(_ template: String, now: Date, clipboard: String) -> FilledSnippet {
  let wholeRange = NSRange(template.startIndex..., in: template)
  let matches = snippetPlaceholder?.matches(in: template, range: wholeRange) ?? []
  var filled = ""
  var textBeforeCursor: String?
  var position = template.startIndex
  for match in matches {
    guard let range = Range(match.range, in: template) else {
      continue
    }
    filled += template[position..<range.lowerBound]
    position = range.upperBound
    switch template[range] {
    case "{date}":
      filled += formatLocal(now, as: "yyyy-MM-dd")
    case "{time}":
      filled += formatLocal(now, as: "HH:mm")
    case "{clipboard}":
      filled += clipboard
    default:
      textBeforeCursor = textBeforeCursor ?? filled
    }
  }
  filled += template[position...]
  let charactersAfterCursor = textBeforeCursor.map { filled.count - $0.count } ?? 0
  return FilledSnippet(text: filled, charactersAfterCursor: charactersAfterCursor)
}
