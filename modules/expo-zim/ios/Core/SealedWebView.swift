import Foundation
import WebKit

/// Events of a SealedWebView (all on the main thread).
public protocol SealedWebViewListener: AnyObject {
  func onLoadStart(url: String)
  func onLoadEnd(url: String, title: String)
  func onBlockedRequest(url: String, reason: String)
  func onExternalLink(url: String)
}

public extension SealedWebViewListener {
  func onLoadStart(url: String) {}
  func onLoadEnd(url: String, title: String) {}
  func onBlockedRequest(url: String, reason: String) {}
  func onExternalLink(url: String) {}
}

/// Refuses every JavaScript bridge: the viewer renders untrusted article HTML. Attempts are logged.
final class SealedUserContentController: WKUserContentController {
  override func add(_ scriptMessageHandler: WKScriptMessageHandler, name: String) {
    ZimRegistry.shared.recordBlocked("javascript-interface:\(name)", "js-interface")
  }

  override func add(_ scriptMessageHandler: WKScriptMessageHandler, contentWorld world: WKContentWorld, name: String) {
    ZimRegistry.shared.recordBlocked("javascript-interface:\(name)", "js-interface")
  }

  override func addScriptMessageHandler(_ scriptMessageHandlerWithReply: WKScriptMessageHandlerWithReply, contentWorld: WKContentWorld, name: String) {
    ZimRegistry.shared.recordBlocked("javascript-interface:\(name)", "js-interface")
  }

  override func addUserScript(_ userScript: WKUserScript) {
    ZimRegistry.shared.recordBlocked("user-script", "js-interface")
  }
}

/// WKWebView that can only ever show `zim://<archiveId>/<path>` content served from open archives (the
/// iOS twin of SealedWebView.kt). Guarantees, covered by the XCTests in ios/Tests:
/// - a content rule list blocks every load that is not `zim:` or `data:` (http, https, file, blob, …)
///   before it leaves WebKit; pages load only after the list is installed;
/// - non-zim navigations never load: main-frame ones are reported as external links, others logged;
/// - the load entry points refuse anything that is not a valid zim:// URL (HTML strings, data, files, POST);
/// - JavaScript is off for page content, no script message handler or user script can be added;
/// - non-persistent website data, no fraudulent-website lookups, no link previews, no new windows.
/// Kept free of Expo types so tests can create it without a React/Expo runtime.
public final class SealedWebView: WKWebView, WKNavigationDelegate, WKUIDelegate {
  /// Content blocker: block everything, then let `zim:` (articles) and `data:` (inline images) through.
  public static let ruleListIdentifier = "org.skepi.zim.sealed.v1"
  public static let blockRules = """
    [{"trigger":{"url-filter":".*"},"action":{"type":"block"}},
     {"trigger":{"url-filter":"^zim:"},"action":{"type":"ignore-previous-rules"}},
     {"trigger":{"url-filter":"^data:"},"action":{"type":"ignore-previous-rules"}}]
    """

  private static var compiled: WKContentRuleList?
  private static var waiting: [(WKContentRuleList?) -> Void] = []

  /// Compiles the rule list once per process; callbacks run on the main thread.
  public static func withRuleList(_ done: @escaping (WKContentRuleList?) -> Void) {
    dispatchPrecondition(condition: .onQueue(.main))
    if let compiled { return done(compiled) }
    waiting.append(done)
    if waiting.count > 1 { return }
    WKContentRuleListStore.default().compileContentRuleList(forIdentifier: ruleListIdentifier, encodedContentRuleList: blockRules) { list, error in
      DispatchQueue.main.async {
        if let error { NSLog("[ExpoZim] content rule list failed: %@", error.localizedDescription) }
        compiled = list
        let callbacks = waiting
        waiting = []
        callbacks.forEach { $0(list) }
      }
    }
  }

  /// The sealed configuration (also used by the tests to check the content blocker on its own).
  public static func makeConfiguration(handler: ZimSchemeHandler) -> WKWebViewConfiguration {
    let c = WKWebViewConfiguration()
    c.setURLSchemeHandler(handler, forURLScheme: ZimSchemeHandler.scheme)
    c.websiteDataStore = .nonPersistent()
    c.userContentController = SealedUserContentController()
    c.defaultWebpagePreferences.allowsContentJavaScript = false
    c.preferences.javaScriptCanOpenWindowsAutomatically = false
    c.preferences.isFraudulentWebsiteWarningEnabled = false
    c.suppressesIncrementalRendering = false
    c.allowsAirPlayForMediaPlayback = false
    c.mediaTypesRequiringUserActionForPlayback = .all
    #if os(iOS)
    c.dataDetectorTypes = []
    c.allowsPictureInPictureMediaPlayback = false
    #endif
    return c
  }

  public weak var listener: SealedWebViewListener?
  public let handler: ZimSchemeHandler
  /// True once the content rule list is installed; loads wait for it.
  public private(set) var sealed = false
  private var pending: URL?

  public init(listener: SealedWebViewListener?) {
    let handler = ZimSchemeHandler()
    self.handler = handler
    self.listener = listener
    super.init(frame: .zero, configuration: SealedWebView.makeConfiguration(handler: handler))
    navigationDelegate = self
    uiDelegate = self
    allowsLinkPreview = false
    allowsBackForwardNavigationGestures = false
    if #available(iOS 16.4, macOS 13.3, *) { isInspectable = false }
    SealedWebView.withRuleList { [weak self] list in
      guard let self else { return }
      guard let list else {
        // Without the blocker nothing loads (fail closed).
        self.refuse("rule-list", "rule-list-unavailable")
        return
      }
      self.configuration.userContentController.add(list)
      self.sealed = true
      if let url = self.pending {
        self.pending = nil
        self.start(url)
      }
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    nil
  }

  /// Blackout theme: dark article CSS and a black background (no white flash between pages).
  public var dark: Bool {
    get { handler.dark }
    set {
      if handler.dark == newValue { return }
      handler.dark = newValue
      isOpaque = !newValue
      backgroundColor = newValue ? .black : .white
      scrollView.backgroundColor = newValue ? .black : .white
      if let current = url, ZimSchemeHandler.parse(current) != nil { _ = loadZim(current.absoluteString) }
    }
  }

  /// Loads a zim:// URL. Returns false (and logs) when the URL is not an allowed zim:// target.
  @discardableResult
  public func loadZim(_ raw: String) -> Bool {
    guard ZimSchemeHandler.parse(raw) != nil, let url = URL(string: raw) else {
      refuse(raw, "invalid-source")
      return false
    }
    if sealed {
      start(url)
    } else {
      pending = url
    }
    return true
  }

  private func start(_ url: URL) {
    _ = super.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
  }

  // MARK: - Load entry points: only zim://

  override public func load(_ request: URLRequest) -> WKNavigation? {
    let raw = request.url?.absoluteString ?? ""
    if let method = request.httpMethod?.uppercased(), method != "GET" {
      refuse(raw, "post")
      return nil
    }
    loadZim(raw)
    return nil
  }

  override public func loadHTMLString(_ string: String, baseURL: URL?) -> WKNavigation? {
    refuse(baseURL?.absoluteString ?? "data:", "load-data")
    return nil
  }

  override public func load(_ data: Data, mimeType MIMEType: String, characterEncodingName: String, baseURL: URL) -> WKNavigation? {
    refuse(baseURL.absoluteString, "load-data")
    return nil
  }

  override public func loadFileURL(_ URL: URL, allowingReadAccessTo readAccessURL: URL) -> WKNavigation? {
    refuse(URL.absoluteString, "load-file")
    return nil
  }

  // loadFileRequest / loadSimulatedRequest are not overridden: their navigations reach the navigation
  // policy below like any other and are cancelled (file:, about:).

  private func refuse(_ url: String, _ reason: String) {
    ZimRegistry.shared.recordBlocked(url, reason)
    listener?.onBlockedRequest(url: url, reason: reason)
  }

  // MARK: - Navigation

  /// zim:// stays in the viewer; anything else never loads. Main-frame targets (links the reader tapped)
  /// are reported as external links for the UI to show as text; sub-frames are logged as blocked.
  public static func navigationPolicy(for url: URL?, mainFrame: Bool) -> (allow: Bool, reason: String) {
    let scheme = url?.scheme ?? ""
    if scheme == ZimSchemeHandler.scheme && ZimSchemeHandler.parse(url) != nil { return (true, "") }
    return (false, mainFrame ? "navigation:\(scheme)" : "scheme:\(scheme)")
  }

  public func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    let url = navigationAction.request.url
    let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
    let decision = SealedWebView.navigationPolicy(for: url, mainFrame: mainFrame)
    if decision.allow {
      decisionHandler(.allow)
      return
    }
    let raw = url?.absoluteString ?? ""
    ZimRegistry.shared.recordBlocked(raw, decision.reason)
    if mainFrame {
      listener?.onExternalLink(url: raw)
    } else {
      listener?.onBlockedRequest(url: raw, reason: decision.reason)
    }
    decisionHandler(.cancel)
  }

  public func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
    // Downloads never start: only responses WebKit can show are allowed.
    decisionHandler(navigationResponse.canShowMIMEType ? .allow : .cancel)
  }

  public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    listener?.onLoadStart(url: webView.url?.absoluteString ?? "")
  }

  public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    listener?.onLoadEnd(url: webView.url?.absoluteString ?? "", title: webView.title ?? "")
  }

  /// New windows (target=_blank, window.open) are never created; the link is reported instead.
  public func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    let raw = navigationAction.request.url?.absoluteString ?? ""
    ZimRegistry.shared.recordBlocked(raw, "new-window")
    listener?.onExternalLink(url: raw)
    return nil
  }
}
