package org.skepi.transfer

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.SocketFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

class TransferClientException(val code: String, message: String) : IOException(message)

/**
 * The receiver's side of a session: TLS 1.3 to the host from the QR code, trusting exactly one
 * certificate (SHA-256 pin from the QR), never a CA. Only local-network addresses are contacted.
 * Each chunk is streamed into the partial file at its offset and hashed on the way; the caller
 * (`@skepi/core` receiveChunks) compares the hash with the signed catalog.
 */
class TransferClient(
  private val host: String,
  private val port: Int,
  private val token: String,
  private val certSha256: String,
  /** Network to open sockets on (the joined hotspot, or the LAN Wi-Fi); null = default routing. */
  private val socketFactory: SocketFactory? = null,
  /** Instrumentation tests only (server and client on one device); the module never sets it. */
  allowLoopback: Boolean = false,
) {
  private val address: InetAddress = parseLocal(host, allowLoopback)

  @Volatile private var current: Socket? = null

  private val sslContext: SSLContext = SSLContext.getInstance("TLSv1.3").apply {
    init(null, arrayOf(PinningTrustManager(certSha256)), SecureRandom())
  }

  /** Closes the request in flight (cancel from another thread). */
  fun abort() {
    try {
      current?.close()
    } catch (_: IOException) {
    }
  }

  private fun open(): SSLSocket {
    val raw = (socketFactory ?: SocketFactory.getDefault()).createSocket()
    raw.connect(InetSocketAddress(address, port), 10_000)
    raw.soTimeout = 30_000
    val tls = sslContext.socketFactory.createSocket(raw, host, port, true) as SSLSocket
    tls.enabledProtocols = arrayOf("TLSv1.3")
    current = tls
    tls.startHandshake()
    return tls
  }

  private fun request(s: SSLSocket, path: String, range: LongRange?) {
    val sb = StringBuilder("GET ").append(path).append(" HTTP/1.1\r\n")
      .append("Host: ").append(host).append(':').append(port).append("\r\n")
      .append("Authorization: Bearer ").append(token).append("\r\n")
      .append("User-Agent: SKEPI\r\n")
    if (range != null) sb.append("Range: bytes=").append(range.first).append('-').append(range.last).append("\r\n")
    sb.append("Connection: close\r\n\r\n")
    s.outputStream.write(sb.toString().toByteArray(Charsets.ISO_8859_1))
    s.outputStream.flush()
  }

  private fun fail(status: Int): Nothing = when (status) {
    401 -> throw TransferClientException("ERR_P2P_TOKEN", "the host refused the session token")
    404 -> throw TransferClientException("ERR_P2P_NOT_FOUND", "the host does not share this pack")
    else -> throw TransferClientException("ERR_P2P_HTTP", "host answered HTTP $status")
  }

  fun fetchManifest(maxBytes: Int = 4 * 1024 * 1024): String = open().use { s ->
    request(s, "/manifest", null)
    val res = Http.readResponse(s.inputStream)
    if (res.status != 200) fail(res.status)
    val length = res.headers["content-length"]?.toLongOrNull() ?: throw TransferClientException("ERR_P2P_HTTP", "manifest without length")
    if (length > maxBytes) throw TransferClientException("ERR_P2P_HTTP", "manifest too large")
    val out = ByteArrayOutputStream(length.toInt())
    val buf = ByteArray(16 * 1024)
    var left = length
    while (left > 0) {
      val n = s.inputStream.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
      if (n < 0) throw IOException("connection closed during the manifest")
      out.write(buf, 0, n)
      left -= n
    }
    out.toString(Charsets.UTF_8.name())
  }

  class Chunk(val sha256: String, val bytes: Long)

  /**
   * GET /pack/<id> for `length` bytes at `offset`, written to `partial` at `offset` and hashed while
   * writing. A short body throws (the caller resumes later); a wrong hash is the caller's decision.
   */
  fun fetchChunk(packId: String, offset: Long, length: Long, partial: File): Chunk = open().use { s ->
    require(length > 0 && offset >= 0) { "invalid range" }
    request(s, "/pack/$packId", offset until offset + length)
    val res = Http.readResponse(s.inputStream)
    if (res.status != 206) fail(res.status)
    val expectedRange = "bytes $offset-${offset + length - 1}/"
    if (res.headers["content-range"]?.startsWith(expectedRange) != true) throw TransferClientException("ERR_P2P_HTTP", "host answered another range")
    if (res.headers["content-length"]?.toLongOrNull() != length) throw TransferClientException("ERR_P2P_HTTP", "host answered another length")
    val digest = MessageDigest.getInstance("SHA-256")
    var written = 0L
    RandomAccessFile(partial, "rw").use { raf ->
      raf.seek(offset)
      val buf = ByteArray(256 * 1024)
      while (written < length) {
        val n = s.inputStream.read(buf, 0, minOf(buf.size.toLong(), length - written).toInt())
        if (n < 0) break
        raf.write(buf, 0, n)
        digest.update(buf, 0, n)
        written += n
      }
    }
    if (written < length) throw TransferClientException("ERR_P2P_INTERRUPTED", "connection closed after $written of $length bytes")
    Chunk(digest.digest().toHex(), written)
  }

  companion object {
    /** RFC 1918, link-local, IPv6 ULA/link-local only (same rule as `@skepi/core` isLocalNetworkAddress). */
    fun isLocal(a: InetAddress): Boolean = when (a) {
      is Inet4Address -> a.isSiteLocalAddress || a.isLinkLocalAddress
      is Inet6Address -> a.isLinkLocalAddress || (a.address[0].toInt() and 0xfe) == 0xfc
      else -> false
    }

    fun parseLocal(host: String, allowLoopback: Boolean = false): InetAddress {
      if (!Regex("^[0-9a-fA-F:.]+$").matches(host)) throw TransferClientException("ERR_P2P_HOST", "host must be an IP address")
      val a = InetAddress.getByName(host) // a literal: no DNS lookup
      if (!isLocal(a) && !(allowLoopback && a.isLoopbackAddress)) throw TransferClientException("ERR_P2P_HOST", "host must be a local network address")
      return a
    }
  }
}

/** Trusts exactly the certificate whose DER SHA-256 equals the pin from the QR code. */
class PinningTrustManager(private val pin: String) : X509TrustManager {
  override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
    throw CertificateException("client certificates are not used")
  }

  override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
    val leaf = chain?.firstOrNull() ?: throw CertificateException("no server certificate")
    val got = SessionCert.sha256Hex(leaf.encoded)
    if (!MessageDigest.isEqual(got.toByteArray(), pin.lowercase().toByteArray())) {
      throw CertificateException("certificate does not match the pairing code")
    }
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}
