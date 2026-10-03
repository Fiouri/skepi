package org.skepi.zim

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Sealed article viewer: loads only `zim://` URLs served from open archives, JavaScript off,
 * no file/content access, no network, no JS bridge.
 */
@SuppressLint("SetJavaScriptEnabled")
class ZimArticleView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLoadStart by EventDispatcher()
  private val onLoadEnd by EventDispatcher()
  private val onBlockedRequest by EventDispatcher()
  private val onExternalLink by EventDispatcher()

  private var currentUrl: String? = null

  private val webView: WebView = WebView(context).apply {
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    settings.apply {
      javaScriptEnabled = false
      javaScriptCanOpenWindowsAutomatically = false
      allowFileAccess = false
      allowContentAccess = false
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
    isLongClickable = false
    webViewClient = SealedClient()
  }

  init {
    addView(webView)
  }

  fun setUrl(url: String?) {
    if (url == null || url == currentUrl) return
    currentUrl = url
    val parsed = android.net.Uri.parse(url)
    if (ZimSchemeHandler.parse(parsed) == null) {
      ZimSchemeHandler.blocked(url, "invalid-source")
      onBlockedRequest(mapOf("url" to url, "reason" to "invalid-source"))
      return
    }
    webView.loadUrl(url)
  }

  fun destroy() {
    webView.stopLoading()
    webView.destroy()
  }

  private inner class SealedClient : WebViewClient() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
      val uri = request.url
      if (uri.scheme == ZimSchemeHandler.SCHEME) return ZimSchemeHandler.handle(uri)
      val url = uri.toString()
      post { onBlockedRequest(mapOf("url" to url, "reason" to "scheme:${uri.scheme}")) }
      return ZimSchemeHandler.blocked(url, "scheme:${uri.scheme}")
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      val uri = request.url
      if (uri.scheme == ZimSchemeHandler.SCHEME && ZimSchemeHandler.parse(uri) != null) {
        currentUrl = uri.toString()
        return false
      }
      // External links are never opened automatically; JS decides how to show them.
      onExternalLink(mapOf("url" to uri.toString()))
      return true
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      onLoadStart(mapOf("url" to url))
    }

    override fun onPageFinished(view: WebView, url: String) {
      onLoadEnd(mapOf("url" to url, "title" to (view.title ?: "")))
    }
  }
}
