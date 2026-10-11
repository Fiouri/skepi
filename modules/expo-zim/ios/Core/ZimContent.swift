import Foundation
import SwiftSoup

public struct ResolvedItem {
  public let path: String
  public let title: String
  public let mimeType: String
  public let data: Data
}

public struct ZimSection: Equatable {
  public let heading: String
  public let level: Int
  public let text: String

  public init(heading: String, level: Int, text: String) {
    self.heading = heading
    self.level = level
    self.text = text
  }
}

/// Entry reads and HTML -> text for RAG: the Swift twin of ZimContent.kt (jsoup there, SwiftSoup here),
/// same selectors, dropped headings and one line per block element.
public enum ZimContent {
  /// Reads an entry (following redirects) with a hard size cap.
  public static func readItem(_ open: OpenArchive, _ path: String) throws -> ResolvedItem {
    do {
      let item = try open.archive.readItem(path, maxBytes: zimMaxItemBytes)
      return ResolvedItem(path: item.path, title: item.title, mimeType: item.mimeType, data: item.data)
    } catch let error as NSError where error.domain == "org.skepi.zim" && error.code == 3 {
      // SKZErrorTooLarge (SKZArchive.h)
      throw ZimError("ERR_ZIM_TOO_LARGE", error.localizedDescription)
    } catch {
      throw ZimError("ERR_ZIM_ENTRY_NOT_FOUND", "No entry '\(path)' in \(open.id): \(error.localizedDescription)")
    }
  }

  static let dropSelectors = [
    "script", "style", "noscript", "link", "meta", "iframe", "object", "embed", "svg", "math",
    "figure", "img", "audio", "video", "table", "sup.reference", "sup.noprint",
    ".infobox", ".navbox", ".vertical-navbox", ".navbox-styles", ".sidebar", ".metadata", ".ambox",
    ".hatnote", ".dablink", ".rellink", ".noprint", ".mw-editsection", ".mw-empty-elt",
    ".reflist", ".references", "ol.references", ".mw-references-wrap", ".refbegin", ".mw-cite-backlink",
    ".gallery", ".toc", "#toc", ".thumb", ".sistersitebox", ".portal", ".portalbox", ".catlinks",
    ".mwe-math-element", ".coordinates", "#coordinates", "footer", ".mw-footer",
  ].joined(separator: ",")

  /// Headings whose section is dropped entirely (Greek + English Wikipedia).
  static let dropHeadings = try! NSRegularExpression(
    pattern: "^(δείτε επίσης|δειτε επισης|παραπομπές|παραπομπες|σημειώσεις|σημειωσεις|εξωτερικοί σύνδεσμοι|"
      + "εξωτερικοι συνδεσμοι|βιβλιογραφία|βιβλιογραφια|πηγές|πηγες|περαιτέρω ανάγνωση|"
      + "see also|references|notes|external links|further reading|bibliography|sources|citations)$",
    options: [.caseInsensitive])

  static let blockTags: Set<String> = ["p", "li", "dd", "dt", "blockquote", "pre"]
  static let headingTags: Set<String> = ["h1", "h2", "h3", "h4", "h5", "h6"]
  /// ICU `\s` (NSRegularExpression is ICU-based, like `Regex("\\s+")` on Android).
  static let whitespace = try! NSRegularExpression(pattern: "\\s+")

  static func collapse(_ s: String) -> String {
    let range = NSRange(s.startIndex..., in: s)
    return whitespace.stringByReplacingMatches(in: s, range: range, withTemplate: " ").trimmingCharacters(in: .whitespaces)
  }

  static func matchesDropHeading(_ s: String) -> Bool {
    dropHeadings.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
  }

  /// HTML -> `{heading, level, text}[]` keeping section structure, without infobox, navigation,
  /// references and "See also".
  public static func extractSections(html: String, title: String) throws -> [ZimSection] {
    let doc = try SwiftSoup.parse(html)
    try doc.select(dropSelectors).remove()
    guard let body = doc.body() else { return [] }

    var sections: [ZimSection] = []
    var heading = ""
    var level = 1
    var dropping = false
    var dropLevel = 0
    var buffer = ""

    // One line per block element: paragraph breaks bound the structural injection filter
    // (@skepi/core sanitizeSourceText); chunking normalises whitespace afterwards.
    func flush() {
      let text = buffer.components(separatedBy: "\n").map(collapse).filter { !$0.isEmpty }.joined(separator: "\n")
      if !text.isEmpty && !dropping { sections.append(ZimSection(heading: heading, level: level, text: text)) }
      buffer = ""
    }

    let selector = (headingTags.sorted() + blockTags.sorted()).joined(separator: ",")
    for el in try body.select(selector).array() {
      let tag = el.tagNameNormal()
      if headingTags.contains(tag) {
        flush()
        let headingLevel = Int(tag.dropFirst()) ?? 1
        let headingText = collapse(try el.text())
        if headingLevel == 1 && headingText == title { continue }
        if dropping && headingLevel > dropLevel { continue }
        dropping = matchesDropHeading(headingText)
        dropLevel = headingLevel
        heading = headingText
        level = headingLevel
        continue
      }
      if dropping || hasBlockAncestor(el) { continue }
      let text = try el.text()
      if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { buffer += text + "\n" }
    }
    flush()
    return sections
  }

  static func hasBlockAncestor(_ el: Element) -> Bool {
    var parent = el.parent()
    while let p = parent {
      if blockTags.contains(p.tagNameNormal()) { return true }
      parent = p.parent()
    }
    return false
  }
}
