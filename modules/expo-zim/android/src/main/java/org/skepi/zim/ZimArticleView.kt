package org.skepi.zim

import android.content.Context
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/** Expo view around [SealedWebView]: forwards its events to JS and nothing else. */
class ZimArticleView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLoadStart by EventDispatcher()
  private val onLoadEnd by EventDispatcher()
  private val onBlockedRequest by EventDispatcher()
  private val onExternalLink by EventDispatcher()

  private var currentUrl: String? = null

  private val webView = SealedWebView(
    context,
    object : SealedWebView.Listener {
      override fun onLoadStart(url: String) {
        currentUrl = url
        onLoadStart(mapOf("url" to url))
      }

      override fun onLoadEnd(url: String, title: String) {
        onLoadEnd(mapOf("url" to url, "title" to title))
      }

      override fun onBlockedRequest(url: String, reason: String) {
        onBlockedRequest(mapOf("url" to url, "reason" to reason))
      }

      override fun onExternalLink(url: String) {
        onExternalLink(mapOf("url" to url))
      }
    },
  ).apply {
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
  }

  init {
    addView(webView)
  }

  fun setUrl(url: String?) {
    if (url == null || url == currentUrl) return
    currentUrl = url
    webView.loadZim(url)
  }

  fun destroy() {
    webView.stopLoading()
    webView.destroy()
  }
}
