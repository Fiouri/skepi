import CryptoKit
import Foundation

/// Result of one pass over a file: whole-file SHA-256 and the SHA-256 of every `chunkSize` slice.
public struct FileDigest: Equatable {
  public let sizeBytes: Int64
  public let sha256: String
  public let chunkSize: Int64
  public let chunkSha256: [String]
}

public struct HashCancelled: Error {}

/// Thread-safe cancel flag shared between the caller and a running hash.
public final class CancelFlag {
  private let lock = NSLock()
  private var value = false

  public init() {}

  public var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return value
  }

  public func cancel() {
    lock.lock()
    value = true
    lock.unlock()
  }
}

/// Streaming SHA-256 (the Swift twin of FileHasher.kt; no Expo types, so it is testable alone). Reads
/// with a 1 MiB buffer, feeds the whole-file digest and the current chunk digest, and reports progress at
/// most every `progressEveryBytes`. The catalog's `chunkSha256` uses 64 MiB chunks.
public enum FileHasher {
  public static let defaultChunkSize: Int64 = 64 * 1024 * 1024
  static let bufferSize = 1 << 20

  public static func hash(
    _ file: URL,
    chunkSize: Int64 = defaultChunkSize,
    cancel: CancelFlag = CancelFlag(),
    progressEveryBytes: Int64 = 16 * 1024 * 1024,
    onProgress: (Int64, Int64) -> Void = { _, _ in }
  ) throws -> FileDigest {
    precondition(chunkSize > 0, "chunkSize must be > 0")
    let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
    let total = (attributes[.size] as? NSNumber)?.int64Value ?? 0
    let handle = try FileHandle(forReadingFrom: file)
    defer { try? handle.close() }
    var whole = SHA256()
    var chunk = SHA256()
    var chunks: [String] = []
    var inChunk: Int64 = 0
    var hashed: Int64 = 0
    var lastReport: Int64 = 0
    while true {
      if cancel.isCancelled { throw HashCancelled() }
      let data = try autoreleasepool { try handle.read(upToCount: bufferSize) ?? Data() }
      if data.isEmpty { break }
      whole.update(data: data)
      var offset = 0
      while offset < data.count {
        let take = Int(min(chunkSize - inChunk, Int64(data.count - offset)))
        let from = data.startIndex + offset
        chunk.update(data: data[from ..< from + take])
        inChunk += Int64(take)
        offset += take
        if inChunk == chunkSize {
          chunks.append(hex(chunk.finalize()))
          chunk = SHA256()
          inChunk = 0
        }
      }
      hashed += Int64(data.count)
      if hashed - lastReport >= progressEveryBytes {
        lastReport = hashed
        onProgress(hashed, total)
      }
    }
    if inChunk > 0 || chunks.isEmpty { chunks.append(hex(chunk.finalize())) }
    onProgress(hashed, total)
    return FileDigest(sizeBytes: hashed, sha256: hex(whole.finalize()), chunkSize: chunkSize, chunkSha256: chunks)
  }

  public static func hex<D: Sequence>(_ digest: D) -> String where D.Element == UInt8 {
    digest.map { String(format: "%02x", $0) }.joined()
  }
}
