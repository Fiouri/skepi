package org.skepi.contentstore

import java.io.File
import java.net.URI

/**
 * Rules of the ContentStore that need no Android services (instrumentation-tested alone):
 * which URLs may be requested and which paths may be written.
 */
object ContentRules {
  /** Generic User-Agent: no device model, OS build or app version (architecture: privacy). */
  const val USER_AGENT = "SKEPI"

  private val FILE_NAME = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$")
  private val CONTENT_DIRS = setOf("zim", "models", "maps", "tmp")

  /**
   * HTTPS only, a host, no user info, query string or fragment: a download request carries the file
   * URL and nothing else.
   */
  fun isAllowedUrl(url: String): Boolean {
    val uri = try {
      URI(url)
    } catch (e: Exception) {
      return false
    }
    return uri.scheme == "https" &&
      !uri.host.isNullOrEmpty() &&
      uri.rawUserInfo == null &&
      uri.rawQuery == null &&
      uri.rawFragment == null &&
      !url.contains('?') &&
      !url.contains('#')
  }

  fun isAllowedFileName(name: String): Boolean = FILE_NAME.matches(name) && !name.contains("..")

  /**
   * `<dir>/<file>` under `root`, with `dir` one of the content folders. Canonical paths defeat `..`
   * and symlink escapes.
   */
  fun resolve(root: File, relativePath: String): File {
    val parts = relativePath.split('/')
    require(parts.size == 2 && parts[0] in CONTENT_DIRS && isAllowedFileName(parts[1])) { "invalid content path: $relativePath" }
    val base = root.canonicalFile
    val file = File(base, relativePath).canonicalFile
    require(file.path.startsWith(base.path + File.separator)) { "path escapes the content root: $relativePath" }
    return file
  }

  /** Free space needed before a download starts: the file, 10% headroom and 1 GiB for the OS. */
  fun requiredFreeBytes(sizeBytes: Long): Long = sizeBytes + sizeBytes / 10 + 1024L * 1024 * 1024
}
