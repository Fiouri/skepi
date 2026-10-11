import ExpoModulesCore
import Foundation
import SkepiHash

private func hashError(_ code: String, _ message: String) -> Exception {
  Exception(name: "HashError", description: message, code: code)
}

/// Streaming SHA-256 on a native thread (the iOS twin of ExpoHashModule.kt), with progress events and
/// cancellation. Only files inside the app's own storage can be hashed.
public class ExpoHashModule: Module {
  private let lock = NSLock()
  private var jobs: [String: CancelFlag] = [:]
  // One file at a time: hashing is I/O bound and two parallel passes over GB files only thrash.
  private let worker = DispatchQueue(label: "org.skepi.hash", qos: .utility)

  private func allowedFile(_ rawPath: String) throws -> URL {
    let file = URL(fileURLWithPath: rawPath).standardizedFileURL.resolvingSymlinksInPath()
    let fm = FileManager.default
    let roots = [
      fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("skepi", isDirectory: true),
      fm.urls(for: .documentDirectory, in: .userDomainMask).first,
      fm.urls(for: .cachesDirectory, in: .userDomainMask).first,
    ].compactMap { $0?.standardizedFileURL.resolvingSymlinksInPath().path }
    if !roots.contains(where: { file.path.hasPrefix($0 + "/") }) {
      throw hashError("ERR_HASH_PATH", "Path is outside app storage: \(rawPath)")
    }
    var isDir: ObjCBool = false
    if !fm.fileExists(atPath: file.path, isDirectory: &isDir) || isDir.boolValue {
      throw hashError("ERR_HASH_NOT_FOUND", "File not found: \(rawPath)")
    }
    return file
  }

  private func finish(_ jobId: String) {
    lock.lock()
    jobs.removeValue(forKey: jobId)
    lock.unlock()
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoHash")
    Events("onHashProgress")

    AsyncFunction("hashFile") { (path: String, chunkSize: Double, jobId: String, promise: Promise) in
      let file: URL
      do {
        file = try self.allowedFile(path)
      } catch {
        promise.reject(error as? Exception ?? hashError("ERR_HASH_PATH", String(describing: error)))
        return
      }
      let size = Int64(chunkSize)
      if size <= 0 {
        promise.reject(hashError("ERR_HASH_ARGS", "chunkSize must be > 0"))
        return
      }
      let cancel = CancelFlag()
      self.lock.lock()
      let running = self.jobs[jobId] != nil
      if !running { self.jobs[jobId] = cancel }
      self.lock.unlock()
      if running {
        promise.reject(hashError("ERR_HASH_JOB", "Job \(jobId) is already running"))
        return
      }
      self.worker.async {
        defer { self.finish(jobId) }
        let start = DispatchTime.now()
        do {
          let digest = try FileHasher.hash(file, chunkSize: size, cancel: cancel) { hashed, total in
            self.sendEvent("onHashProgress", ["jobId": jobId, "hashedBytes": Double(hashed), "totalBytes": Double(total)])
          }
          promise.resolve([
            "sizeBytes": Double(digest.sizeBytes),
            "sha256": digest.sha256,
            "chunkSize": Double(digest.chunkSize),
            "chunkSha256": digest.chunkSha256,
            "ms": Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000,
          ])
        } catch is HashCancelled {
          promise.reject(hashError("ERR_HASH_CANCELLED", "Hash of \(path) cancelled"))
        } catch {
          promise.reject(hashError("ERR_HASH_IO", "Hash of \(path) failed: \(error.localizedDescription)"))
        }
      }
    }

    Function("cancel") { (jobId: String) in
      self.lock.lock()
      let flag = self.jobs[jobId]
      self.lock.unlock()
      flag?.cancel()
    }
  }
}
