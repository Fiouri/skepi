package org.skepi.hash

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** Streaming hash on the device: whole-file and chunk digests match a one-shot digest, cancel stops it. */
@RunWith(AndroidJUnit4::class)
class FileHasherTest {
  private val dir = InstrumentationRegistry.getInstrumentation().targetContext.cacheDir

  private fun sha(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  private fun file(name: String, size: Int): Pair<File, ByteArray> {
    val bytes = ByteArray(size) { (it * 31 % 251).toByte() }
    val f = File(dir, name)
    f.writeBytes(bytes)
    return f to bytes
  }

  @Test
  fun wholeFileAndChunkDigestsMatchOneShotDigests() {
    val (f, bytes) = file("hash-a.bin", 3 * 1024 * 1024 + 123)
    val chunk = 1024L * 1024
    val d = FileHasher.hash(f, chunk)
    assertEquals(bytes.size.toLong(), d.sizeBytes)
    assertEquals(sha(bytes), d.sha256)
    assertEquals(4, d.chunkSha256.size)
    assertEquals(sha(bytes.copyOfRange(0, chunk.toInt())), d.chunkSha256[0])
    assertEquals(sha(bytes.copyOfRange(3 * chunk.toInt(), bytes.size)), d.chunkSha256[3])
  }

  @Test
  fun exactMultipleOfTheChunkSizeHasNoEmptyTrailingChunk() {
    val (f, bytes) = file("hash-b.bin", 2 * 65536)
    val d = FileHasher.hash(f, 65536)
    assertEquals(2, d.chunkSha256.size)
    assertEquals(sha(bytes), d.sha256)
  }

  @Test
  fun reportsProgressAndCanBeCancelled() {
    val (f, _) = file("hash-c.bin", 4 * 1024 * 1024)
    val seen = mutableListOf<Long>()
    FileHasher.hash(f, 1024L * 1024, progressEveryBytes = 1024L * 1024) { hashed, _ -> seen.add(hashed) }
    assertTrue(seen.size >= 4)
    assertEquals(f.length(), seen.last())
    val cancelled = AtomicBoolean(true)
    assertThrows(HashCancelledException::class.java) { FileHasher.hash(f, 1024L * 1024, cancelled) }
  }
}
