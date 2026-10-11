import Foundation
import WebKit

/// Serves `zim://<archiveId>/<path>` from open archives to a SealedWebView (`WKURLSchemeHandler`, the
/// iOS twin of ZimSchemeHandler.kt). Everything else is refused, and every response carries the CSP.
public final class ZimSchemeHandler: NSObject, WKURLSchemeHandler {
  public static let scheme = "zim"

  /// docs/architecture.md, "Sealed article reading" (identical on Android).
  public static let csp =
    "default-src 'none'; img-src zim: data:; style-src zim: 'unsafe-inline'; font-src zim:; media-src zim:"

  static let securityHeaders = [
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  ]

  /// Blackout theme: pure black for OLED panels. Inline style is already allowed by the CSP.
  public static let darkCss =
    "html,body{background:#000!important;color:#e5e7eb!important}"
    + "*{background-color:transparent!important;color:inherit!important;border-color:#525252!important}"
    + "a,a:visited{color:#93c5fd!important}img,video{opacity:.8}"

  private static let headOpen = try! NSRegularExpression(pattern: "<head(\\s[^>]*)?>", options: [.caseInsensitive])

  public struct Target: Equatable {
    public let archiveId: String
    public let path: String
  }

  public struct Response {
    public let status: Int
    public let mimeType: String
    public let charset: String?
    public let headers: [String: String]
    public let body: Data
  }

  /// Blackout theme for the pages this handler serves (set by the owning view).
  public var dark = false

  private let queue = DispatchQueue(label: "org.skepi.zim.scheme", qos: .userInitiated, attributes: .concurrent)
  private let lock = NSLock()
  private var stopped = Set<ObjectIdentifier>()

  // MARK: - Parsing

  /// Parses and validates a zim:// URL. Returns nil for anything malformed. ZIM paths are flat keys:
  /// NULs and every dot segment are rejected, also backslash-separated and double-encoded forms.
  public static func parse(_ url: URL?) -> Target? {
    guard let url, url.scheme == scheme else { return nil }
    guard let archiveId = url.host, !archiveId.isEmpty else { return nil }
    // URL.path is percent-decoded once (Uri.getPath on Android).
    var path = url.path
    if path.hasPrefix("/") { path.removeFirst() }
    if path.isEmpty || path.contains("\u{0}") { return nil }
    let segments = path.split(separator: "/", omittingEmptySubsequences: false)
      .flatMap { $0.split(separator: "\\", omittingEmptySubsequences: false) }
      .map(String.init)
    if segments.contains(where: { isDotSegment($0) || isDotSegment($0.removingPercentEncoding ?? $0) }) { return nil }
    return Target(archiveId: archiveId, path: path)
  }

  /// String form for callers holding raw text (the view's load entry points).
  public static func parse(_ raw: String) -> Target? {
    parse(URL(string: raw))
  }

  private static func isDotSegment(_ s: String) -> Bool { s == "." || s == ".." }

  // MARK: - Responses

  public static func blocked(_ url: String, _ reason: String) -> Response {
    ZimRegistry.shared.recordBlocked(url, reason)
    return Response(status: 403, mimeType: "text/plain", charset: "utf-8", headers: securityHeaders, body: Data())
  }

  private static func notFound() -> Response {
    Response(status: 404, mimeType: "text/plain", charset: "utf-8", headers: securityHeaders, body: Data())
  }

  /// The full answer for one request; `raw` is what gets logged when it is refused.
  public static func respond(to url: URL?, raw: String? = nil, dark: Bool = false) -> Response {
    let text = raw ?? url?.absoluteString ?? ""
    guard let target = parse(url) else { return blocked(text, "invalid-zim-url") }
    guard let open = ZimRegistry.shared.find(target.archiveId) else { return blocked(text, "archive-not-open") }
    do {
      let item = try ZimContent.readItem(open, target.path)
      let (mime, charset) = splitMime(item.mimeType)
      let body = mime == "text/html" ? injectHead(item.data, dark: dark) : item.data
      return Response(status: 200, mimeType: mime, charset: charset, headers: securityHeaders, body: body)
    } catch {
      NSLog("[ExpoZim] zim:// miss %@: %@", target.path, String(describing: error))
      return notFound()
    }
  }

  static func splitMime(_ mimeType: String) -> (String, String?) {
    let parts = mimeType.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
    let mime = (parts.first ?? "application/octet-stream").lowercased()
    let charset = parts.dropFirst().first { $0.lowercased().hasPrefix("charset=") }
      .map { String($0.split(separator: "=", maxSplits: 1).last ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "\"")) }
    return (mime, charset ?? (mime.hasPrefix("text/") ? "utf-8" : nil))
  }

  /// Defence in depth: the CSP also travels inside the document; the blackout CSS follows it.
  static func injectHead(_ html: Data, dark: Bool) -> Data {
    let text = String(decoding: html, as: UTF8.self)
    let meta = "<meta http-equiv=\"Content-Security-Policy\" content=\"\(csp)\">"
      + (dark ? "<style id=\"skepi-dark\">\(darkCss)</style>" : "")
    let range = NSRange(text.startIndex..., in: text)
    guard let match = headOpen.firstMatch(in: text, range: range), let end = Range(match.range, in: text)?.upperBound else {
      return Data((meta + text).utf8)
    }
    return Data((String(text[..<end]) + meta + String(text[end...])).utf8)
  }

  public static func httpResponse(_ r: Response, for url: URL) -> HTTPURLResponse {
    var headers = r.headers
    headers["Content-Type"] = r.charset.map { "\(r.mimeType); charset=\($0)" } ?? r.mimeType
    headers["Content-Length"] = String(r.body.count)
    return HTTPURLResponse(url: url, statusCode: r.status, httpVersion: "HTTP/1.1", headerFields: headers)!
  }

  // MARK: - WKURLSchemeHandler

  public func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    let request = urlSchemeTask.request
    let url = request.url ?? URL(string: "zim://invalid/")!
    let dark = self.dark
    let key = ObjectIdentifier(urlSchemeTask)
    let method = request.httpMethod?.uppercased() ?? "GET"
    queue.async { [weak self] in
      let response = method == "GET" || method == "HEAD"
        ? ZimSchemeHandler.respond(to: url, dark: dark)
        : ZimSchemeHandler.blocked(url.absoluteString, "method:\(method)")
      DispatchQueue.main.async {
        guard let self, self.claim(key) else { return }
        urlSchemeTask.didReceive(ZimSchemeHandler.httpResponse(response, for: url))
        if method != "HEAD" { urlSchemeTask.didReceive(response.body) }
        urlSchemeTask.didFinish()
      }
    }
  }

  public func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    lock.lock()
    defer { lock.unlock() }
    stopped.insert(ObjectIdentifier(urlSchemeTask))
  }

  /// True when the task was not stopped meanwhile (calling a stopped task raises in WebKit).
  private func claim(_ key: ObjectIdentifier) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return stopped.remove(key) == nil
  }
}
