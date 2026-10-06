package org.skepi.transfer

import android.util.Log
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "SkepiApkServer"

/**
 * App propagation (Android only): a phone without SKEPI opens `http://<host>:<port>/` in any browser
 * and downloads the host's own APK. This is the only cleartext server in the app; it serves exactly
 * two resources (`/` and `/skepi.apk`), never packs or user data, and only while the user shares
 * the app. The page shows the signing-certificate SHA-256 so the user can compare it with the one
 * the project publishes. The app never installs anything itself (no REQUEST_INSTALL_PACKAGES).
 */
class ApkServer(
  private val apk: File,
  private val appName: String,
  private val versionName: String,
  private val signingSha256: String,
  private val bindAddress: InetAddress? = null,
) {
  private val running = AtomicBoolean(false)
  private var server: ServerSocket? = null
  private val pool = Executors.newFixedThreadPool(2) { r -> Thread(r, "skepi-apk-conn").apply { isDaemon = true } }

  val port: Int
    get() = server?.localPort ?: -1

  fun start(port: Int = 0): Int {
    check(running.compareAndSet(false, true)) { "already running" }
    val ss = ServerSocket()
    ss.reuseAddress = true
    ss.bind(InetSocketAddress(bindAddress, port), 4)
    server = ss
    Thread({
      while (running.get()) {
        val s = try {
          ss.accept()
        } catch (_: IOException) {
          break
        }
        try {
          pool.execute { serve(s) }
        } catch (_: RejectedExecutionException) {
          s.close()
        }
      }
    }, "skepi-apk-accept").apply { isDaemon = true }.start()
    return ss.localPort
  }

  fun stop() {
    if (!running.compareAndSet(true, false)) return
    try {
      server?.close()
    } catch (_: IOException) {
    }
    pool.shutdownNow()
  }

  private fun page(): ByteArray {
    val fingerprint = signingSha256.uppercase().chunked(2).joinToString(":")
    val mb = String.format(java.util.Locale.US, "%.1f", apk.length() / 1_048_576.0)
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(appName)} — install</title>
<style>body{font-family:sans-serif;max-width:40em;margin:1em auto;padding:0 1em;line-height:1.5}a.button{display:inline-block;padding:.8em 1.2em;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:600}code{word-break:break-all;font-size:.9em}</style>
</head><body>
<h1>${esc(appName)} ${esc(versionName)}</h1>
<p>Offline survival knowledge, maps and emergency cards. This copy comes from the phone next to you, over the local network.</p>
<p><a class="button" href="/skepi.apk" download="skepi.apk">Download the app (${mb} MB)</a></p>
<p>Then open the downloaded file and allow installing from your browser or file manager when Android asks.</p>
<h2>Check the signature</h2>
<p>Signing certificate SHA-256 of this APK:</p>
<p><code>${esc(fingerprint)}</code></p>
<p>Compare it with the fingerprint the SKEPI project publishes. If it differs, do not install. Android also refuses later updates signed with another key.</p>
</body></html>
""".toByteArray(Charsets.UTF_8)
  }

  private fun serve(socket: Socket) {
    socket.use { s ->
      try {
        s.soTimeout = 30_000
        val req = Http.readRequest(s.getInputStream())
        val out = s.getOutputStream()
        when {
          req.method != "GET" -> text(out, 405, "Method Not Allowed")
          req.path == "/" -> {
            val body = page()
            Http.writeHead(out, 200, "OK", mapOf("Content-Type" to "text/html; charset=utf-8", "Content-Length" to body.size.toString(), "Content-Security-Policy" to "default-src 'none'; style-src 'unsafe-inline'"))
            out.write(body)
          }
          req.path == "/skepi.apk" -> {
            Http.writeHead(
              out,
              200,
              "OK",
              mapOf(
                "Content-Type" to "application/vnd.android.package-archive",
                "Content-Length" to apk.length().toString(),
                "Content-Disposition" to "attachment; filename=\"skepi.apk\"",
              ),
            )
            FileInputStream(apk).use { it.copyTo(out, 256 * 1024) }
          }
          else -> text(out, 404, "Not Found")
        }
        out.flush()
      } catch (e: IOException) {
        Log.w(TAG, "connection: ${e.message}")
      }
    }
  }

  private fun text(out: OutputStream, status: Int, reason: String) {
    val body = reason.toByteArray(Charsets.UTF_8)
    Http.writeHead(out, status, reason, mapOf("Content-Type" to "text/plain; charset=utf-8", "Content-Length" to body.size.toString()))
    out.write(body)
  }

  private fun esc(s: String): String = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
}
