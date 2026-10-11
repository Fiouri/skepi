import ExpoModulesCore
import Foundation

private func unsupported(_ what: String) -> Exception {
  Exception(
    name: "TransferUnsupported",
    description: "\(what) is not supported on this platform (iOS: no LocalOnlyHotspot; P2P sharing arrives in a later phase)",
    code: "ERR_TRANSFER_UNSUPPORTED")
}

/// expo-transfer on iOS (Phase 3b-0): no P2P yet. iOS cannot open a hotspot from an app and this phase
/// adds no iOS features, so every operation reports "not supported on this platform" and `capabilities`
/// says so; the app hides Share / Receive. `isLocalAddress` keeps the same rule as Android (pure logic).
public class ExpoTransferModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoTransfer")
    Events("onHostStopped")

    Function("capabilities") { () -> [String: Any] in
      ["apiLevel": 0, "hotspot": false, "joinHotspot": false, "faultInjection": false]
    }

    AsyncFunction("startHost") { (_: [String: Any]) -> [String: Any] in
      throw unsupported("Sharing packs")
    }

    Function("stopHost") {}

    Function("hostStatus") { () -> [String: Any] in
      ["running": false]
    }

    Function("setFaults") { (_: [String: Any]) in }

    AsyncFunction("writePairingForTests") { (_: String) in
      throw unsupported("The test pairing file")
    }

    AsyncFunction("readPairingForTests") { () -> String? in
      nil
    }

    AsyncFunction("connect") { (_: [String: Any]) -> String in
      throw unsupported("Receiving packs")
    }

    AsyncFunction("fetchManifest") { (_: String) -> String in
      throw unsupported("Receiving packs")
    }

    AsyncFunction("fetchChunk") { (_: String, _: String, _: String, _: Double, _: Double, _: String) -> [String: Any] in
      throw unsupported("Receiving packs")
    }

    AsyncFunction("truncatePartial") { (_: String, _: Double) -> Double in
      throw unsupported("Receiving packs")
    }

    Function("cancel") { (_: String) in }

    Function("disconnect") { (_: String) in }

    AsyncFunction("encodeQr") { (_: String, _: Double) -> String in
      throw unsupported("Pairing QR codes")
    }

    /// Site-local and link-local literals only (the same rule as TransferClient.isLocal on Android).
    Function("isLocalAddress") { (host: String) -> Bool in
      TransferRules.isLocalAddress(host)
    }

    View(QrScannerView.self) {
      Events("onScanned", "onError")
    }
  }
}

enum TransferRules {
  static func isLocalAddress(_ host: String) -> Bool {
    if host.contains(":") {
      // IPv6 literal: link-local fe80::/10 or unique local fc00::/7 (Inet6Address checks on Android).
      let h = host.lowercased()
      guard h.range(of: "^[0-9a-f:.]+$", options: .regularExpression) != nil, let first = h.split(separator: ":").first,
            let word = UInt16(first, radix: 16) else { return false }
      return (word & 0xffc0) == 0xfe80 || (word & 0xfe00) == 0xfc00
    }
    let parts = host.split(separator: ".", omittingEmptySubsequences: false).compactMap { UInt8($0) }
    guard parts.count == 4, host.split(separator: ".").count == 4 else { return false }
    switch (parts[0], parts[1]) {
    case (10, _): return true
    case (172, 16...31): return true
    case (192, 168): return true
    case (169, 254): return true
    default: return false
    }
  }
}

/// No camera QR scanning on iOS in this phase: the view reports an error as soon as it appears.
final class QrScannerView: ExpoView {
  let onScanned = EventDispatcher()
  let onError = EventDispatcher()

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      onError(["message": "QR scanning is not supported on this platform"])
    }
  }
}
