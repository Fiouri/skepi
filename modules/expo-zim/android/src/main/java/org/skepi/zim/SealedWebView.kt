package org.skepi.zim

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * WebView that can only ever show `zim://<archiveId>/<path>` content served from open archives.
 *
 * Guarantees (covered by instrumentation tests in src/androidTest):
 * - every non-zim request is answered with 403 by [SealedClient.shouldInterceptRequest] and logged;
 * - non-zim navigations never load and are reported as external links;
 * - the public load entry points refuse anything that is not a valid zim:// URL;
 * - JavaScript is disabled and no JavaScript interface can be attached;
 * - file/content access, Safe Browsing, storage, geolocation and multiple windows are off.
 *
 * Kept free of Expo types so tests can create it without a React/Expo runtime.
 */
@SuppressLint("ViewConstructor")
class SealedWebView(context: Context, private val listener: Listener) : WebView(context) {
  interface Listener {
    fun onLoadStart(url: String) {}
    fun onLoadEnd(url: String, title: String) {}
    fun onBlockedRequest(url: String, reason: String) {}
    fun onExternalLink(url: String) {}
  }

  val client = SealedClient()
  private val mainHandler = Handler(Looper.getMainLooper())

  init {
    applySealedSettings(settings)
    isLongClickable = false
    webViewClient = client
  }

  /** Loads a zim:// URL. Returns false (and logs) when the URL is not an allowed zim:// target. */
  fun loadZim(url: String): Boolean {
    if (ZimSchemeHandler.parse(Uri.parse(url)) == null) {
      refuse(url, "invalid-source")
      return false
    }
    super.loadUrl(url)
    return true
  }

  override fun loadUrl(url: String) {
    loadZim(url)
  }

  override fun loadUrl(url: String, additionalHttpHeaders: MutableMap<String, String>) {
    loadZim(url)
  }

  override fun postUrl(url: String, postData: ByteArray) {
    refuse(url, "post")
  }

  override fun loadData(data: String, mimeType: String?, encoding: String?) {
    refuse("data:", "load-data")
  }

  override fun loadDataWithBaseURL(
    baseUrl: String?,
    data: String,
    mimeType: String?,
    encoding: String?,
    historyUrl: String?,
  ) {
    refuse(baseUrl ?: "data:", "load-data")
  }

  /** No JS bridge, ever: the viewer renders untrusted article HTML. */
  override fun addJavascriptInterface(obj: Any, name: String) {
    ZimRegistry.recordBlocked("javascript-interface:$name", "js-interface")
    throw UnsupportedOperationException("SealedWebView never exposes a JavaScript interface")
  }

  private fun refuse(url: String, reason: String) {
    ZimSchemeHandler.blocked(url, reason)
    listener.onBlockedRequest(url, reason)
  }

  inner class SealedClient : WebViewClient() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
      val uri = request.url
      if (uri.scheme == ZimSchemeHandler.SCHEME) return ZimSchemeHandler.handle(uri)
      val url = uri.toString()
      val reason = "scheme:${uri.scheme}"
      // Called on a WebView background thread; listeners run on the UI thread. (View.post would
      // be deferred until the view is attached to a window.)
      mainHandler.post { listener.onBlockedRequest(url, reason) }
      return ZimSchemeHandler.blocked(url, reason)
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      val uri = request.url
      if (uri.scheme == ZimSchemeHandler.SCHEME && ZimSchemeHandler.parse(uri) != null) return false
      // External links (http, intent, mailto, …) are never opened automatically; the UI shows them.
      ZimRegistry.recordBlocked(uri.toString(), "navigation:${uri.scheme}")
      listener.onExternalLink(uri.toString())
      return true
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      listener.onLoadStart(url)
    }

    override fun onPageFinished(view: WebView, url: String) {
      listener.onLoadEnd(url, view.title ?: "")
    }
  }

  companion object {
    @Suppress("DEPRECATION")
    fun applySealedSettings(settings: WebSettings) {
      settings.apply {
        javaScriptEnabled = false
        javaScriptCanOpenWindowsAutomatically = false
        allowFileAccess = false
        allowContentAccess = false
        allowFileAccessFromFileURLs = false
        allowUniversalAccessFromFileURLs = false
        blockNetworkLoads = true
        blockNetworkImage = true
        domStorageEnabled = false
        databaseEnabled = false
        setGeolocationEnabled(false)
        setSupportMultipleWindows(false)
        if (android.os.Build.VERSION.SDK_INT >= 26) safeBrowsingEnabled = false
        cacheMode = WebSettings.LOAD_NO_CACHE
        mediaPlaybackRequiresUserGesture = true
        builtInZoomControls = true
        displayZoomControls = false
      }
    }
  }
}
