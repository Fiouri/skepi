import SkepiZim
import XCTest

/// libzim 9.7.0 through the Objective-C++ binding on the committed rag-eval fixtures: the same checks as
/// crates/zim-ffi/tests/archive.rs (desktop) so the three bindings agree on one engine.
final class ZimArchiveTests: XCTestCase {
  private var smoke: OpenArchive!

  override func setUpWithError() throws {
    let file = try Fixtures.install(Fixtures.evalZim("eval-smoke-en.zim"))
    smoke = try ZimRegistry.shared.open(ZimRegistry.shared.requireAllowedFile(file.path, extension: ".zim"))
  }

  func testOpensAndReadsMetadata() throws {
    let a = smoke.archive
    XCTAssertEqual(smoke.id.count, 36, smoke.id)
    XCTAssertTrue(smoke.id.allSatisfy { $0 == "-" || $0.isHexDigit })
    XCTAssertEqual(a.metadata("Language"), "eng")
    XCTAssertEqual(a.metadata("No-such-metadata"), "")
    XCTAssertGreaterThan(a.articleCount, 10)
    XCTAssertTrue(a.hasFulltextIndex)
    XCTAssertTrue(a.hasTitleIndex)
    XCTAssertGreaterThan(a.fileSize, 0)
  }

  func testOpeningTheSameFileTwiceReusesTheArchive() throws {
    let again = try ZimRegistry.shared.open(URL(fileURLWithPath: smoke.path))
    XCTAssertTrue(again === smoke)
    XCTAssertTrue(try ZimRegistry.shared.get(smoke.id) === smoke)
  }

  func testFulltextAndSuggestionsFindTheArticle() throws {
    let result = try ZimEngine.search("canberra", limit: 8, archiveIds: [smoke.id], withSnippets: false)
    XCTAssertTrue(result.hits.contains { $0.path == "Canberra" }, "\(result.hits.map(\.path))")
    XCTAssertTrue(result.hits.allSatisfy { $0.score != nil && $0.snippet == nil })
    XCTAssertEqual(result.hits.map(\.rank), Array(0..<result.hits.count))
    XCTAssertGreaterThan(result.estimated, 0)
    let suggestions = try ZimEngine.suggest("canber", limit: 10, archiveIds: [smoke.id])
    XCTAssertEqual(suggestions.first?.path, "Canberra")
    XCTAssertTrue(suggestions.allSatisfy { $0.score == nil && $0.archiveId == smoke.id })
  }

  func testSuggestionsAcrossArchivesKeepTheRequestedOrder() throws {
    let el = try ZimRegistry.shared.open(try Fixtures.install(Fixtures.evalZim("eval-smoke-el.zim")))
    let hits = try ZimEngine.suggest("a", limit: 3, archiveIds: [el.id, smoke.id])
    let order = hits.map(\.archiveId)
    XCTAssertEqual(order, order.sorted { ($0 == el.id ? 0 : 1) < ($1 == el.id ? 0 : 1) })
    XCTAssertTrue(hits.count <= 6)
    XCTAssertThrowsError(try ZimEngine.suggest("a", limit: 3, archiveIds: ["not-open"])) { error in
      XCTAssertEqual((error as? ZimError)?.code, "ERR_ZIM_NOT_OPEN")
    }
  }

  func testReadsHtmlAndRejectsMissingEntries() throws {
    let item = try ZimContent.readItem(smoke, "Canberra")
    XCTAssertTrue(item.mimeType.hasPrefix("text/html"), item.mimeType)
    XCTAssertTrue(String(decoding: item.data, as: UTF8.self).contains("Canberra"))
    XCTAssertThrowsError(try ZimContent.readItem(smoke, "No_such_article_here")) { error in
      XCTAssertEqual((error as? ZimError)?.code, "ERR_ZIM_ENTRY_NOT_FOUND")
    }
    XCTAssertFalse(smoke.archive.hasEntry("No_such_article_here"))
    XCTAssertTrue(smoke.archive.hasEntry("Canberra"))
  }

  func testPlainTextKeepsSectionsAndDropsReferences() throws {
    let item = try ZimContent.readItem(smoke, "Canberra")
    let sections = try ZimContent.extractSections(html: String(decoding: item.data, as: UTF8.self), title: item.title)
    XCTAssertFalse(sections.isEmpty)
    XCTAssertTrue(sections.contains { $0.text.contains("Canberra") })
    XCTAssertFalse(sections.contains { ["References", "See also", "External links"].contains($0.heading) })
    XCTAssertTrue(sections.allSatisfy { !$0.text.isEmpty && !$0.text.contains("  ") })
  }

  func testTextExtractionMatchesTheAndroidRules() throws {
    let html = """
      <html><head><title>T</title><script>x()</script></head><body>
      <h1>Water</h1><p>First   paragraph<sup class="reference">[1]</sup>.</p>
      <table><tr><td>cell</td></tr></table><div class="infobox">box</div>
      <h2>Safety</h2><ul><li>Boil <b>water</b></li><li><p>nested</p></li></ul>
      <h2>See also</h2><p>dropped</p><h3>Sub of see also</h3><p>dropped too</p>
      <h2>After</h2><p>kept</p></body></html>
      """
    let sections = try ZimContent.extractSections(html: html, title: "Water")
    XCTAssertEqual(sections, [
      ZimSection(heading: "", level: 1, text: "First paragraph."),
      ZimSection(heading: "Safety", level: 2, text: "Boil water\nnested"),
      ZimSection(heading: "After", level: 2, text: "kept"),
    ])
  }

  func testOnlyFilesInsideAppStorageCanBeOpened() throws {
    XCTAssertThrowsError(try ZimRegistry.shared.requireAllowedFile(Fixtures.evalZim("eval-smoke-en.zim").path, extension: ".zim")) { error in
      XCTAssertEqual((error as? ZimError)?.code, "ERR_ZIM_PATH")
    }
    let root = try XCTUnwrap(ZimRegistry.contentRoot())
    XCTAssertThrowsError(try ZimRegistry.shared.requireAllowedFile(root.path + "/zim/../../../../etc/hosts.zim", extension: ".zim"))
    XCTAssertThrowsError(try ZimRegistry.shared.requireAllowedFile(root.path + "/zim/missing.zim", extension: ".zim")) { error in
      XCTAssertEqual((error as? ZimError)?.code, "ERR_ZIM_NOT_FOUND")
    }
    let notZim = root.appendingPathComponent("zim/not-a-zim.txt")
    try Data("x".utf8).write(to: notZim)
    XCTAssertThrowsError(try ZimRegistry.shared.requireAllowedFile(notZim.path, extension: ".zim"))
    let fake = root.appendingPathComponent("zim/fake.zim")
    try Data("not a zim".utf8).write(to: fake)
    XCTAssertThrowsError(try ZimRegistry.shared.open(try ZimRegistry.shared.requireAllowedFile(fake.path, extension: ".zim"))) { error in
      XCTAssertEqual((error as? ZimError)?.code, "ERR_ZIM_OPEN")
    }
  }

  func testContentRootIsExcludedFromBackup() throws {
    ZimRegistry.shared.ensureInitialised()
    let root = try XCTUnwrap(ZimRegistry.contentRoot())
    XCTAssertEqual(try root.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
    for dir in ["zim", "models", "maps"] {
      var isDir: ObjCBool = false
      XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent(dir).path, isDirectory: &isDir) && isDir.boolValue)
    }
  }

  func testConcurrentSearchesAreSafe() throws {
    let a = smoke!
    DispatchQueue.concurrentPerform(iterations: 8) { i in
      for _ in 0..<10 {
        let q = i % 2 == 0 ? "earthquake" : "water"
        XCTAssertFalse((try? a.archive.search(q, limit: 8, withSnippets: false, estimatedMatches: nil))?.isEmpty ?? true)
        XCTAssertFalse((try? a.archive.suggest(q, limit: 5))?.isEmpty ?? true)
      }
    }
  }
}
