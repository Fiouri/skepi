import ExpoModulesCore
import SkepiZim
import UIKit

/// Expo view around SealedWebView: forwards its events to JS and nothing else.
final class ZimArticleView: ExpoView, SealedWebViewListener {
  // Named dispatchers: the property names differ from the listener methods of the same events.
  let loadStartEvent = EventDispatcher("onLoadStart")
  let loadEndEvent = EventDispatcher("onLoadEnd")
  let blockedRequestEvent = EventDispatcher("onBlockedRequest")
  let externalLinkEvent = EventDispatcher("onExternalLink")

  private var currentUrl: String?
  private lazy var webView: SealedWebView = {
    let view = SealedWebView(listener: self)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    return view
  }()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    webView.frame = bounds
    addSubview(webView)
  }

  func setUrl(_ url: String?) {
    guard let url, url != currentUrl else { return }
    currentUrl = url
    webView.loadZim(url)
  }

  func setDark(_ dark: Bool) {
    webView.dark = dark
  }

  override func removeFromSuperview() {
    webView.stopLoading()
    super.removeFromSuperview()
  }

  // MARK: - SealedWebViewListener

  func onLoadStart(url: String) {
    currentUrl = url
    loadStartEvent(["url": url])
  }

  func onLoadEnd(url: String, title: String) {
    loadEndEvent(["url": url, "title": title])
  }

  func onBlockedRequest(url: String, reason: String) {
    blockedRequestEvent(["url": url, "reason": reason])
  }

  func onExternalLink(url: String) {
    externalLinkEvent(["url": url])
  }
}
