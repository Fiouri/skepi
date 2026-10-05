package org.skepi.hash

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** Result of one pass over a file: whole-file SHA-256 and the SHA-256 of every `chunkSize` slice. */
data class FileDigest(val sizeBytes: Long, val sha256: String, val chunkSize: Long, val chunkSha256: List<String>)

class HashCancelledException : Exception("hash cancelled")

/**
 * Streaming SHA-256 (no Expo or Android types, so it is testable alone). Reads with a 1 MiB buffer,
 * feeds the whole-file digest and the current chunk digest, and reports progress at most every
 * `progressEveryBytes`. The catalog's `chunkSha256` uses 64 MiB chunks.
 */
object FileHasher {
  const val DEFAULT_CHUNK_SIZE = 64L * 1024 * 1024
  private const val BUFFER = 1 shl 20

  fun hash(
    file: File,
    chunkSize: Long = DEFAULT_CHUNK_SIZE,
    cancelled: AtomicBoolean = AtomicBoolean(false),
    progressEveryBytes: Long = 16L * 1024 * 1024,
    onProgress: (hashed: Long, total: Long) -> Unit = { _, _ -> },
  ): FileDigest {
    require(chunkSize > 0) { "chunkSize must be > 0" }
    val total = file.length()
    val whole = MessageDigest.getInstance("SHA-256")
    var chunk = MessageDigest.getInstance("SHA-256")
    val chunks = mutableListOf<String>()
    var inChunk = 0L
    var hashed = 0L
    var lastReport = 0L
    val buffer = ByteArray(BUFFER)
    FileInputStream(file).use { input ->
      while (true) {
        if (cancelled.get()) throw HashCancelledException()
        val read = input.read(buffer)
        if (read < 0) break
        whole.update(buffer, 0, read)
        var offset = 0
        while (offset < read) {
          val take = minOf(chunkSize - inChunk, (read - offset).toLong()).toInt()
          chunk.update(buffer, offset, take)
          inChunk += take
          offset += take
          if (inChunk == chunkSize) {
            chunks.add(chunk.digest().toHex())
            chunk = MessageDigest.getInstance("SHA-256")
            inChunk = 0
          }
        }
        hashed += read
        if (hashed - lastReport >= progressEveryBytes) {
          lastReport = hashed
          onProgress(hashed, total)
        }
      }
    }
    if (inChunk > 0 || chunks.isEmpty()) chunks.add(chunk.digest().toHex())
    onProgress(hashed, total)
    return FileDigest(hashed, whole.digest().toHex(), chunkSize, chunks)
  }

  private fun ByteArray.toHex(): String {
    val out = StringBuilder(size * 2)
    for (b in this) {
      val v = b.toInt() and 0xff
      out.append(HEX[v ushr 4]).append(HEX[v and 0x0f])
    }
    return out.toString()
  }

  private val HEX = "0123456789abcdef".toCharArray()
}
