package org.skepi.hash

import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

internal class HashException(code: String, message: String) : CodedException(code, message, null)

/**
 * Streaming SHA-256 on a native thread (architecture: "SHA-256 of large files runs natively"), with
 * progress events and cancellation. Only files inside the app's own storage can be hashed.
 */
class ExpoHashModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val jobs = ConcurrentHashMap<String, AtomicBoolean>()

  // One file at a time: hashing is I/O bound and two parallel passes over GB files only thrash.
  private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "skepi-hash").apply { isDaemon = true } }

  private fun allowedFile(rawPath: String): File {
    val file = File(rawPath).canonicalFile
    val roots = listOfNotNull(context.getExternalFilesDir(null), context.filesDir, context.cacheDir)
      .plus(context.getExternalFilesDirs(null).filterNotNull())
      .map { it.canonicalFile }
    if (roots.none { file.path.startsWith(it.path + File.separator) }) {
      throw HashException("ERR_HASH_PATH", "Path is outside app storage: $rawPath")
    }
    if (!file.isFile) throw HashException("ERR_HASH_NOT_FOUND", "File not found: $rawPath")
    return file
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoHash")
    Events("onHashProgress")

    AsyncFunction("hashFile") { path: String, chunkSize: Double, jobId: String ->
      val file = allowedFile(path)
      val size = chunkSize.toLong()
      if (size <= 0) throw HashException("ERR_HASH_ARGS", "chunkSize must be > 0")
      val cancelled = AtomicBoolean(false)
      if (jobs.putIfAbsent(jobId, cancelled) != null) throw HashException("ERR_HASH_JOB", "Job $jobId is already running")
      try {
        val start = System.nanoTime()
        val digest = worker.submit<FileDigest> {
          FileHasher.hash(file, size, cancelled) { hashed, total ->
            sendEvent("onHashProgress", mapOf("jobId" to jobId, "hashedBytes" to hashed.toDouble(), "totalBytes" to total.toDouble()))
          }
        }.get()
        mapOf(
          "sizeBytes" to digest.sizeBytes.toDouble(),
          "sha256" to digest.sha256,
          "chunkSize" to digest.chunkSize.toDouble(),
          "chunkSha256" to digest.chunkSha256,
          "ms" to (System.nanoTime() - start) / 1_000_000.0,
        )
      } catch (e: java.util.concurrent.ExecutionException) {
        if (e.cause is HashCancelledException) throw HashException("ERR_HASH_CANCELLED", "Hash of $path cancelled")
        throw HashException("ERR_HASH_IO", "Hash of $path failed: ${e.cause?.message ?: e.message}")
      } finally {
        jobs.remove(jobId)
      }
    }

    Function("cancel") { jobId: String ->
      jobs[jobId]?.set(true)
      Unit
    }
  }
}
