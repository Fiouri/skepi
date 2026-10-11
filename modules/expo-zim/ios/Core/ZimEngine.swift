import Foundation

/// Search and suggestion over the open archives (the logic of the Kotlin module's `suggest` / `search`
/// functions), shared by the Expo module and the XCTests.
public enum ZimEngine {
  public static let maxLimit = 100

  public struct Hit: Equatable {
    public let archiveId: String
    public let path: String
    public let title: String
    public let snippet: String?
    public let score: Int?
    public let rank: Int

    public var dictionary: [String: Any?] {
      ["archiveId": archiveId, "path": path, "title": title, "snippet": snippet, "score": score, "rank": rank]
    }
  }

  static func clamp(_ limit: Int) -> Int { min(max(limit, 1), maxLimit) }

  public static func targets(_ archiveIds: [String]?) throws -> [OpenArchive] {
    guard let ids = archiveIds, !ids.isEmpty else { return ZimRegistry.shared.all() }
    return try ids.map { try ZimRegistry.shared.get($0) }
  }

  static func suggestIn(_ open: OpenArchive, _ query: String, _ limit: Int) throws -> [Hit] {
    let hits = try open.archive.suggest(query, limit: limit)
    return hits.enumerated().map { i, h in
      Hit(archiveId: open.id, path: h.path, title: h.title, snippet: h.snippet, score: nil, rank: i)
    }
  }

  /// Title suggestions. Packs run in parallel (each archive serialises its own suggestion searcher);
  /// results keep the requested archive order, so latency follows the slowest pack.
  public static func suggest(_ query: String, limit: Int, archiveIds: [String]?) throws -> [Hit] {
    let archives = try targets(archiveIds)
    let perArchive = clamp(limit)
    if archives.count <= 1 {
      return try archives.flatMap { try suggestIn($0, query, perArchive) }
    }
    var results = [Result<[Hit], Error>](repeating: .success([]), count: archives.count)
    let lock = NSLock()
    DispatchQueue.concurrentPerform(iterations: archives.count) { i in
      let r = Result { try suggestIn(archives[i], query, perArchive) }
      lock.lock()
      results[i] = r
      lock.unlock()
    }
    return try results.flatMap { try $0.get() }
  }

  /// Xapian full-text search in every target archive that has a full-text index.
  public static func search(_ query: String, limit: Int, archiveIds: [String]?, withSnippets: Bool) throws -> (hits: [Hit], estimated: Int64) {
    var estimated: Int64 = 0
    var out: [Hit] = []
    for open in try targets(archiveIds) where open.archive.hasFulltextIndex {
      var matches: Int64 = 0
      let hits = try open.archive.search(query, limit: clamp(limit), withSnippets: withSnippets, estimatedMatches: &matches)
      estimated += matches
      out += hits.enumerated().map { i, h in
        Hit(archiveId: open.id, path: h.path, title: h.title, snippet: h.snippet, score: h.score, rank: i)
      }
    }
    return (out, estimated)
  }
}
