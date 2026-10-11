import ExpoModulesCore
import Foundation
import SkepiZim

private let maxContentFileBytes = 4 * 1024 * 1024

/// JS errors keep the Kotlin module's codes (ERR_ZIM_*).
private func jsError(_ error: Error) -> Exception {
  if let z = error as? ZimError { return Exception(name: "ZimError", description: z.message, code: z.code) }
  return Exception(name: "ZimError", description: String(describing: error), code: "ERR_ZIM")
}

private func mapped<T>(_ body: () throws -> T) throws -> T {
  do {
    return try body()
  } catch {
    throw jsError(error)
  }
}

/// iOS side of expo-zim (Phase 3b-0): the same functions and results as ExpoZimModule.kt, over libzim
/// 9.7.0 from CoreKiwix.xcframework (SkepiZim pod).
public class ExpoZimModule: Module {
  /// Plain-text extraction is the expensive part of RAG; keep recent articles in memory.
  private let textCache: NSCache<NSString, NSDictionary> = {
    let cache = NSCache<NSString, NSDictionary>()
    cache.countLimit = 32
    return cache
  }()

  private func ready() {
    ZimRegistry.shared.ensureInitialised()
  }

  /// A path under the content dir; resolving `..` and symlinks defeats escapes.
  private func contentFile(_ relativePath: String) throws -> URL {
    guard let root = ZimRegistry.contentRoot()?.standardizedFileURL.resolvingSymlinksInPath() else {
      throw ZimError("ERR_ZIM_NO_STORAGE", "Application Support unavailable")
    }
    let target = root.appendingPathComponent(relativePath).standardizedFileURL
    if !target.path.hasPrefix(root.path + "/") {
      throw ZimError("ERR_ZIM_PATH", "Path escapes content dir: \(relativePath)")
    }
    return target
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoZim")

    AsyncFunction("getRuntimeInfo") { () -> [String: Any?] in
      self.ready()
      return [
        "contentDir": ZimRegistry.contentRoot()?.path ?? "",
        // ICU data is linked into CoreKiwix (no data directory to point at, unlike the Android AAR).
        "icuDataDir": nil,
        "nativeInitMs": ZimRegistry.shared.nativeInitMs,
      ]
    }

    AsyncFunction("listContent") { () -> [[String: Any]] in
      self.ready()
      guard let root = ZimRegistry.contentRoot() else { return [] }
      var out: [[String: Any]] = []
      for kind in ["zim", "models", "maps", "icu"] {
        let dir = root.appendingPathComponent(kind, isDirectory: true)
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey])) ?? []
        for f in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
          let values = try? f.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
          guard values?.isRegularFile == true else { continue }
          out.append(["kind": kind, "name": f.lastPathComponent, "path": f.path, "sizeBytes": values?.fileSize ?? 0])
        }
      }
      return out
    }

    AsyncFunction("openArchive") { (path: String) -> [String: Any?] in
      try mapped {
        self.ready()
        let file = try ZimRegistry.shared.requireAllowedFile(path, extension: ".zim")
        let start = DispatchTime.now()
        let open = try ZimRegistry.shared.open(file)
        let a = open.archive
        return [
          "archiveId": open.id,
          "path": open.path,
          "title": a.metadata("Title"),
          "language": a.metadata("Language"),
          "name": a.metadata("Name"),
          "flavour": a.metadata("Flavour"),
          "date": a.metadata("Date"),
          "articleCount": Int(a.articleCount),
          "hasFulltextIndex": a.hasFulltextIndex,
          "hasTitleIndex": a.hasTitleIndex,
          "mainPath": a.mainPath,
          "sizeBytes": Double(a.fileSize),
          "openMs": elapsedMs(since: start),
        ]
      }
    }

    AsyncFunction("closeArchive") { (archiveId: String) in
      ZimRegistry.shared.close(archiveId)
      self.textCache.removeAllObjects()
    }

    AsyncFunction("suggest") { (query: String, limit: Int, archiveIds: [String]?) -> [String: Any] in
      try mapped {
        self.ready()
        let start = DispatchTime.now()
        let hits = try ZimEngine.suggest(query, limit: limit, archiveIds: archiveIds)
        return ["hits": hits.map(\.dictionary), "nativeMs": elapsedMs(since: start)]
      }
    }

    AsyncFunction("search") { (query: String, limit: Int, archiveIds: [String]?, withSnippets: Bool) -> [String: Any] in
      try mapped {
        self.ready()
        let start = DispatchTime.now()
        let result = try ZimEngine.search(query, limit: limit, archiveIds: archiveIds, withSnippets: withSnippets)
        return ["hits": result.hits.map(\.dictionary), "nativeMs": elapsedMs(since: start), "estimatedMatches": Double(result.estimated)]
      }
    }

    AsyncFunction("getArticleHtml") { (archiveId: String, path: String) -> [String: Any] in
      try mapped {
        self.ready()
        let start = DispatchTime.now()
        let item = try ZimContent.readItem(try ZimRegistry.shared.get(archiveId), path)
        return [
          "archiveId": archiveId,
          "path": item.path,
          "title": item.title,
          "mimeType": item.mimeType,
          "html": String(decoding: item.data, as: UTF8.self),
          "nativeMs": elapsedMs(since: start),
        ]
      }
    }

    AsyncFunction("getPlainText") { (archiveId: String, path: String) -> [String: Any] in
      try mapped {
        self.ready()
        let key = "\(archiveId)\n\(path)" as NSString
        if let cached = self.textCache.object(forKey: key) as? [String: Any] {
          return cached.merging(["cached": true]) { $1 }
        }
        let start = DispatchTime.now()
        let item = try ZimContent.readItem(try ZimRegistry.shared.get(archiveId), path)
        if !item.mimeType.hasPrefix("text/html") {
          throw ZimError("ERR_ZIM_NOT_HTML", "Entry '\(path)' is \(item.mimeType)")
        }
        let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? path : item.title
        let sections = try ZimContent.extractSections(html: String(decoding: item.data, as: UTF8.self), title: title)
        let result: [String: Any] = [
          "archiveId": archiveId,
          "path": item.path,
          "title": title,
          "sections": sections.map { ["heading": $0.heading, "level": $0.level, "text": $0.text] },
          "nativeMs": elapsedMs(since: start),
        ]
        self.textCache.setObject(result as NSDictionary, forKey: key)
        return result.merging(["cached": false]) { $1 }
      }
    }

    AsyncFunction("getBlockedRequests") { () -> [[String: Any]] in
      ZimRegistry.shared.blockedRequests().map { ["url": $0.url, "reason": $0.reason, "atMs": Double($0.atMs)] }
    }

    AsyncFunction("clearBlockedRequests") {
      ZimRegistry.shared.clearBlocked()
    }

    /// Writes a UTF-8 file under the content dir (bench reports). Returns the absolute path.
    AsyncFunction("writeContentFile") { (relativePath: String, text: String) -> String in
      try mapped {
        self.ready()
        let target = try self.contentFile(relativePath)
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: target, options: .atomic)
        return target.path
      }
    }

    /// Reads a UTF-8 file under the content dir (bench inputs such as parity queries).
    AsyncFunction("readContentFile") { (relativePath: String) -> String? in
      try mapped {
        self.ready()
        let target = try self.contentFile(relativePath)
        guard let size = (try? target.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])).flatMap({ $0.isRegularFile == true ? $0.fileSize : nil }) else {
          return nil
        }
        if size > maxContentFileBytes {
          throw ZimError("ERR_ZIM_TOO_LARGE", "\(relativePath) is \(size) bytes (max \(maxContentFileBytes))")
        }
        return String(decoding: try Data(contentsOf: target), as: UTF8.self)
      }
    }

    View(ZimArticleView.self) {
      Events("onLoadStart", "onLoadEnd", "onBlockedRequest", "onExternalLink")

      Prop("url") { (view: ZimArticleView, url: String?) in
        view.setUrl(url)
      }

      Prop("dark") { (view: ZimArticleView, dark: Bool?) in
        view.setDark(dark ?? false)
      }
    }
  }
}
