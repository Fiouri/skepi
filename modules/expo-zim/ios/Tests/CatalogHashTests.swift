import CryptoKit
import SkepiHash
import XCTest

/// "Every file verified against the signed catalog before opening": the committed catalogs and their
/// pinned Ed25519 keys checked with CryptoKit against catalog/verification-expectations.json (the cases
/// the TypeScript verifier and the Rust port agree on), and the fixture ZIMs hashed natively (SkepiHash,
/// the expo-hash core) against their signed catalog entries, whole file and every chunk.
final class CatalogHashTests: XCTestCase {
  private struct Key {
    let id: String
    let publicKey: Curve25519.Signing.PublicKey
  }

  private func json(_ relative: String) throws -> [String: Any] {
    let data = try Data(contentsOf: Fixtures.repo(relative))
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any], relative)
  }

  private func keys(_ relative: String) throws -> [Key] {
    let file = try json(relative)
    return try ["active", "backup"].map { slot in
      let k = try XCTUnwrap(file[slot] as? [String: Any])
      let raw = try XCTUnwrap(Data(base64Encoded: try XCTUnwrap(k["publicKey"] as? String)))
      return Key(id: try XCTUnwrap(k["keyId"] as? String), publicKey: try Curve25519.Signing.PublicKey(rawRepresentation: raw))
    }
  }

  /// Signature over the exact bytes by the trusted key named in `keyId`, then anti-rollback: the order
  /// and outcomes of verifyCatalog in @skepi/core (schema checks stay in TypeScript / Rust).
  private func verify(dir: String, keysFile: String, sequence: Int?, sha256: String?) throws -> (ok: Bool, reason: String?, sequence: Int?, sha256: String) {
    let bytes = try Data(contentsOf: Fixtures.repo("\(dir)/catalog.json"))
    let sigText = try String(contentsOf: Fixtures.repo("\(dir)/catalog.json.sig"), encoding: .utf8)
    let signature = try XCTUnwrap(Data(base64Encoded: sigText.components(separatedBy: .whitespacesAndNewlines).joined()))
    let doc = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
    let digest = FileHasher.hex(SHA256.hash(data: bytes))
    let keyId = doc["keyId"] as? String ?? ""
    guard let key = try keys(keysFile).first(where: { $0.id == keyId }) else { return (false, "unknown_key", nil, digest) }
    guard key.publicKey.isValidSignature(signature, for: bytes) else { return (false, "bad_signature", nil, digest) }
    let seq = try XCTUnwrap(doc["sequence"] as? Int)
    if let accepted = sequence {
      if seq < accepted { return (false, "rollback", seq, digest) }
      if seq == accepted, let known = sha256, known != digest { return (false, "sequence_reuse", seq, digest) }
    }
    return (true, nil, seq, digest)
  }

  func testCommittedCatalogsVerifyAsExpected() throws {
    let expectations = try json("catalog/verification-expectations.json")
    let cases = try XCTUnwrap(expectations["cases"] as? [[String: Any]])
    XCTAssertGreaterThanOrEqual(cases.count, 9)
    for c in cases {
      let dir = try XCTUnwrap(c["dir"] as? String)
      let keysFile = try XCTUnwrap(c["keys"] as? String)
      let state = try XCTUnwrap(c["state"] as? [String: Any])
      let expect = try XCTUnwrap(c["expect"] as? [String: Any])
      let got = try verify(dir: dir, keysFile: keysFile, sequence: state["sequence"] as? Int, sha256: state["sha256"] as? String)
      let label = "\(dir) with \(keysFile)"
      XCTAssertEqual(got.ok, expect["ok"] as? Bool, label)
      if got.ok {
        XCTAssertEqual(got.sequence, expect["sequence"] as? Int, label)
        XCTAssertEqual(got.sha256, expect["sha256"] as? String, label)
      } else {
        XCTAssertEqual(got.reason, expect["reason"] as? String, label)
      }
    }
  }

  func testOneFlippedByteBreaksTheSignature() throws {
    var bytes = try Data(contentsOf: Fixtures.repo("catalog/embedded/debug/catalog.json"))
    let sigText = try String(contentsOf: Fixtures.repo("catalog/embedded/debug/catalog.json.sig"), encoding: .utf8)
    let signature = try XCTUnwrap(Data(base64Encoded: sigText.trimmingCharacters(in: .whitespacesAndNewlines)))
    let key = try XCTUnwrap(try keys("catalog/keys/test.json").first)
    XCTAssertTrue(key.publicKey.isValidSignature(signature, for: bytes))
    bytes[bytes.count / 2] ^= 0x01
    XCTAssertFalse(key.publicKey.isValidSignature(signature, for: bytes))
  }

  func testFixtureZimsMatchTheirSignedCatalogEntries() throws {
    let catalog = try json("catalog/embedded/debug/catalog.json")
    let packs = try XCTUnwrap(catalog["packs"] as? [[String: Any]])
    var checked = 0
    for pack in packs where (pack["id"] as? String)?.hasPrefix("test-") == true {
      let file = try XCTUnwrap(pack["file"] as? String)
      let source = Fixtures.evalZim(file)
      guard FileManager.default.fileExists(atPath: source.path) else { continue }
      let chunkSize = try XCTUnwrap(pack["chunkSize"] as? Int)
      var progress: [Int64] = []
      let digest = try FileHasher.hash(source, chunkSize: Int64(chunkSize), progressEveryBytes: 64 * 1024) { hashed, _ in progress.append(hashed) }
      XCTAssertEqual(digest.sizeBytes, Int64(try XCTUnwrap(pack["sizeBytes"] as? Int)), file)
      XCTAssertEqual(digest.sha256, pack["sha256"] as? String, file)
      XCTAssertEqual(digest.chunkSha256, pack["chunkSha256"] as? [String], file)
      XCTAssertEqual(progress.last, digest.sizeBytes, file)
      XCTAssertEqual(progress, progress.sorted(), file)
      checked += 1
    }
    // test-smoke-en has 64 KiB chunks (several), the others one 64 MiB chunk.
    XCTAssertGreaterThanOrEqual(checked, 3)
  }

  func testHashingCanBeCancelled() throws {
    let cancel = CancelFlag()
    cancel.cancel()
    XCTAssertThrowsError(try FileHasher.hash(Fixtures.evalZim("eval-smoke-en.zim"), cancel: cancel)) { error in
      XCTAssertTrue(error is HashCancelled)
    }
  }

  func testEmptyFileHasOneEmptyChunk() throws {
    let empty = FileManager.default.temporaryDirectory.appendingPathComponent("skepi-empty-\(UUID().uuidString)")
    try Data().write(to: empty)
    defer { try? FileManager.default.removeItem(at: empty) }
    let digest = try FileHasher.hash(empty, chunkSize: 1024)
    let emptySha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    XCTAssertEqual(digest.sha256, emptySha)
    XCTAssertEqual(digest.chunkSha256, [emptySha])
  }
}
