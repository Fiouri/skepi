import Foundation
import SkepiZim
import XCTest

/// Fixtures are read from the repository checkout: simulator test processes can read host paths, so the
/// committed files are used as they are (no copies that could drift from their pinned hashes).
enum Fixtures {
  static let repoRoot: URL = {
    // <repo>/modules/expo-zim/ios/Tests/TestSupport.swift
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { url.deleteLastPathComponent() }
    return url
  }()

  static func repo(_ relative: String) -> URL {
    repoRoot.appendingPathComponent(relative)
  }

  /// The rag-eval fixture ZIMs (CC BY-SA), the same files crates/zim-ffi and rag-eval test.
  static func evalZim(_ name: String) -> URL {
    repo("tools/rag-eval/fixtures/\(name)")
  }

  /// The CC0 sealing fixture of the Android SealingTest (fixtures/README.md there).
  static let sealingZim = repo("modules/expo-zim/android/src/androidTest/assets/sealing-fixture.zim")

  /// Copies a fixture into the app's content folder (Application Support/skepi/zim), where the module
  /// is allowed to open files, and returns the copy.
  static func install(_ source: URL, file: StaticString = #filePath, line: UInt = #line) throws -> URL {
    ZimRegistry.shared.ensureInitialised()
    let root = try XCTUnwrap(ZimRegistry.contentRoot(), file: file, line: line)
    let target = root.appendingPathComponent("zim", isDirectory: true).appendingPathComponent(source.lastPathComponent)
    if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
    try FileManager.default.copyItem(at: source, to: target)
    return target
  }
}

/// Records SealedWebView events (main thread).
final class Recorder: SealedWebViewListener {
  var blocked: [(url: String, reason: String)] = []
  var external: [String] = []
  var finished: [(url: String, title: String)] = []
  var onFinish: (() -> Void)?

  func onBlockedRequest(url: String, reason: String) {
    blocked.append((url, reason))
  }

  func onExternalLink(url: String) {
    external.append(url)
  }

  func onLoadEnd(url: String, title: String) {
    finished.append((url, title))
    onFinish?()
  }
}

extension XCTestCase {
  /// Runs the main run loop for `seconds` (lets WebKit deliver callbacks that should not arrive).
  func spin(_ seconds: TimeInterval) {
    let done = expectation(description: "spin")
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { done.fulfill() }
    wait(for: [done], timeout: seconds + 5)
  }
}
