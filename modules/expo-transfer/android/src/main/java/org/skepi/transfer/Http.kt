package org.skepi.transfer

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

/**
 * The small HTTP/1.1 subset the P2P server and client speak: one request per connection
 * (`Connection: close`), GET only, bounded header size. Kept here so both sides parse the same way.
 */
internal object Http {
  const val MAX_HEADER_BYTES = 8 * 1024

  class Request(val method: String, val path: String, val headers: Map<String, String>)

  class Response(val status: Int, val headers: Map<String, String>)

  /** Reads up to the blank line; lowercase header names. Throws on oversized or malformed input. */
  fun readHead(input: InputStream): List<String> {
    val buf = ByteArrayOutputStream()
    var last4 = 0
    while (true) {
      val b = input.read()
      if (b < 0) throw IOException("connection closed before the end of the headers")
      buf.write(b)
      if (buf.size() > MAX_HEADER_BYTES) throw IOException("headers too large")
      last4 = (last4 shl 8) or b
      if (last4 == 0x0d0a0d0a) break
    }
    return buf.toString(Charsets.ISO_8859_1.name()).split("\r\n").filter { it.isNotEmpty() }
  }

  private fun headers(lines: List<String>): Map<String, String> =
    lines.drop(1).mapNotNull { line ->
      val i = line.indexOf(':')
      if (i <= 0) null else line.substring(0, i).trim().lowercase() to line.substring(i + 1).trim()
    }.toMap()

  fun readRequest(input: InputStream): Request {
    val lines = readHead(input)
    val parts = lines.firstOrNull()?.split(' ') ?: throw IOException("empty request")
    if (parts.size != 3 || !parts[2].startsWith("HTTP/1.")) throw IOException("malformed request line")
    return Request(parts[0], parts[1], headers(lines))
  }

  fun readResponse(input: InputStream): Response {
    val lines = readHead(input)
    val parts = lines.firstOrNull()?.split(' ', limit = 3) ?: throw IOException("empty response")
    val status = parts.getOrNull(1)?.toIntOrNull() ?: throw IOException("malformed status line")
    return Response(status, headers(lines))
  }

  fun writeHead(out: OutputStream, status: Int, reason: String, headers: Map<String, String>) {
    val sb = StringBuilder("HTTP/1.1 ").append(status).append(' ').append(reason).append("\r\n")
    for ((k, v) in headers) sb.append(k).append(": ").append(v).append("\r\n")
    sb.append("Connection: close\r\n\r\n")
    out.write(sb.toString().toByteArray(Charsets.ISO_8859_1))
  }

  /** `bytes=a-b` or `bytes=a-` within a file of `size` bytes; null when absent, IllegalArgument when invalid. */
  fun parseRange(header: String?, size: Long): LongRange? {
    if (header == null) return null
    val m = Regex("^bytes=(\\d{1,19})-(\\d{0,19})$").matchEntire(header.trim()) ?: throw IllegalArgumentException("unsupported range")
    val start = m.groupValues[1].toLong()
    val end = if (m.groupValues[2].isEmpty()) size - 1 else minOf(m.groupValues[2].toLong(), size - 1)
    if (start >= size || end < start) throw IllegalArgumentException("unsatisfiable range")
    return start..end
  }
}
