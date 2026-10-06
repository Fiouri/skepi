package org.skepi.transfer

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.ECGenParameterSpec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext

/**
 * A per-session TLS identity for the P2P host: a fresh EC P-256 key pair (memory only, never stored)
 * and a self-signed X.509 certificate for it. The receiver pins the certificate's SHA-256 from the QR
 * code, so no CA, name or validity check is involved; a new session means a new key and a new pin.
 * The certificate is encoded here (minimal DER) so no extra crypto library is needed.
 */
class SessionCert private constructor(val keyPair: KeyPair, val certificate: X509Certificate) {
  /** SHA-256 of the certificate's DER encoding, lowercase hex (the QR's `certSha256`). */
  val sha256: String = sha256Hex(certificate.encoded)

  /** TLS 1.3 server context with this identity. */
  fun serverContext(): SSLContext {
    val ks = KeyStore.getInstance("PKCS12").apply { load(null, null) }
    val password = CharArray(0)
    ks.setKeyEntry("session", keyPair.private, password, arrayOf(certificate))
    val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(ks, password) }
    return SSLContext.getInstance("TLSv1.3").apply { init(kmf.keyManagers, null, SecureRandom()) }
  }

  companion object {
    private val ECDSA_WITH_SHA256 = byteArrayOf(0x06, 0x08, 0x2a, 0x86.toByte(), 0x48, 0xce.toByte(), 0x3d, 0x04, 0x03, 0x02)
    private val OID_COMMON_NAME = byteArrayOf(0x06, 0x03, 0x55, 0x04, 0x03)

    fun create(commonName: String = "SKEPI P2P session", now: Long = System.currentTimeMillis()): SessionCert {
      val kpg = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1"), SecureRandom()) }
      val keyPair = kpg.generateKeyPair()
      val serial = ByteArray(16).also { SecureRandom().nextBytes(it) }
      serial[0] = (serial[0].toInt() and 0x7f).toByte() // positive INTEGER
      val name = seq(set(seq(OID_COMMON_NAME + der(0x0c, commonName.toByteArray(Charsets.UTF_8)))))
      // A short validity window around "now" (the receiver pins the key; dates are informative).
      val validity = seq(utcTime(now - 86_400_000L) + utcTime(now + 2 * 86_400_000L))
      val tbs = seq(
        der(0xa0, der(0x02, byteArrayOf(2))) + // [0] version v3
          der(0x02, BigInteger(1, serial).toByteArray()) +
          seq(ECDSA_WITH_SHA256) +
          name +
          validity +
          name +
          keyPair.public.encoded, // SubjectPublicKeyInfo, already DER
      )
      val signature = Signature.getInstance("SHA256withECDSA").run {
        initSign(keyPair.private)
        update(tbs)
        sign()
      }
      val cert = seq(tbs + seq(ECDSA_WITH_SHA256) + der(0x03, byteArrayOf(0) + signature))
      val x509 = CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(cert)) as X509Certificate
      x509.verify(keyPair.public)
      return SessionCert(keyPair, x509)
    }

    fun sha256Hex(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).toHex()

    private fun utcTime(ms: Long): ByteArray {
      val f = SimpleDateFormat("yyMMddHHmmss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
      return der(0x17, f.format(Date(ms)).toByteArray(Charsets.US_ASCII))
    }

    private fun seq(content: ByteArray): ByteArray = der(0x30, content)

    private fun set(content: ByteArray): ByteArray = der(0x31, content)

    private fun der(tag: Int, content: ByteArray): ByteArray {
      val out = ByteArrayOutputStream()
      out.write(tag)
      val n = content.size
      when {
        n < 0x80 -> out.write(n)
        n < 0x100 -> {
          out.write(0x81)
          out.write(n)
        }
        n < 0x10000 -> {
          out.write(0x82)
          out.write(n shr 8)
          out.write(n and 0xff)
        }
        else -> throw IllegalArgumentException("DER element too large")
      }
      out.write(content)
      return out.toByteArray()
    }
  }
}

internal fun ByteArray.toHex(): String {
  val hex = "0123456789abcdef"
  val sb = StringBuilder(size * 2)
  for (b in this) {
    val v = b.toInt() and 0xff
    sb.append(hex[v ushr 4]).append(hex[v and 0x0f])
  }
  return sb.toString()
}
