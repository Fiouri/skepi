import AVFoundation
import CoreLocation
import ExpoModulesCore
import Foundation
import UIKit

private func toolsError(_ code: String, _ message: String) -> Exception {
  Exception(name: "ToolsError", description: message, code: code)
}

/// Plays an on/off timeline (ms, starting with "on"; @skepi/core `morseTimeline`) on the main queue,
/// optionally looping (the Swift twin of MorsePlayer.kt).
final class MorsePlayer {
  static let minMs = 20.0
  static let maxMs = 10_000.0
  static let maxSteps = 512

  private let setOn: (Bool) -> Void
  private var timeline: [Double] = []
  private var index = 0
  private var loop = true
  private var generation = 0
  private(set) var running = false

  init(setOn: @escaping (Bool) -> Void) {
    self.setOn = setOn
  }

  static func validate(_ durations: [Double]) throws {
    guard !durations.isEmpty, durations.count % 2 == 0 else {
      throw toolsError("ERR_MORSE_TIMELINE", "timeline must have an even number of steps (on/off pairs)")
    }
    guard durations.count <= maxSteps else { throw toolsError("ERR_MORSE_TIMELINE", "timeline too long") }
    guard durations.allSatisfy({ $0 >= minMs && $0 <= maxMs }) else {
      throw toolsError("ERR_MORSE_TIMELINE", "every step must be \(Int(minMs))..\(Int(maxMs)) ms")
    }
  }

  func start(_ durations: [Double], loop: Bool) throws {
    try MorsePlayer.validate(durations)
    stop()
    timeline = durations
    index = 0
    self.loop = loop
    running = true
    generation += 1
    step(generation)
  }

  private func step(_ gen: Int) {
    guard running, gen == generation else { return }
    if index >= timeline.count {
      if !loop {
        running = false
        setOn(false)
        return
      }
      index = 0
    }
    setOn(index % 2 == 0)
    let delay = timeline[index] / 1000
    index += 1
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.step(gen) }
  }

  /// Stops the timeline; the torch always ends off.
  func stop() {
    let wasRunning = running
    running = false
    generation += 1
    if wasRunning { setOn(false) }
  }
}

/// Tools that work without packs or network (Tools tab), iOS (Phase 3b-0): SOS torch with a Morse
/// timeline, compass (CoreLocation heading), one-shot location fix, screen brightness for the SOS screen.
/// Nothing runs in the background: everything stops when the app leaves the foreground. iOS exposes no
/// satellite counts (no onGnssStatus) and no on-device magnetic model (declination throws; the UI then
/// shows no declination).
public class ExpoEmergencyToolsModule: Module {
  private lazy var morse = MorsePlayer { [weak self] on in
    do {
      try self?.setTorchMode(on)
    } catch {
      // The camera may be busy: stop instead of blinking erratically.
      self?.morse.stop()
      self?.sendEvent("onTorchError", ["message": String(describing: error)])
    }
  }
  private let location = LocationTools()
  private var savedBrightness: CGFloat?

  private func torchDevice() -> AVCaptureDevice? {
    guard let device = AVCaptureDevice.default(for: .video), device.hasTorch, device.isTorchAvailable else { return nil }
    return device
  }

  private func setTorchMode(_ on: Bool) throws {
    guard let device = torchDevice() else { throw toolsError("ERR_TORCH_UNAVAILABLE", "No camera flash on this device") }
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    if on {
      try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
    } else {
      device.torchMode = .off
    }
  }

  private func stopAll() {
    morse.stop()
    location.stopHeading()
    location.cancelFix()
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoEmergencyTools")
    Events("onHeading", "onGnssStatus", "onTorchError")

    OnCreate {
      self.location.onHeading = { [weak self] heading, accuracy in
        self?.sendEvent("onHeading", ["heading": heading, "accuracy": accuracy])
      }
    }

    Function("torchAvailable") { () -> Bool in
      self.torchDevice() != nil
    }

    AsyncFunction("setTorch") { (on: Bool) in
      self.morse.stop()
      try self.setTorchMode(on)
    }.runOnQueue(.main)

    Function("startMorse") { (durations: [Double], loop: Bool) in
      guard self.torchDevice() != nil else { throw toolsError("ERR_TORCH_UNAVAILABLE", "No camera flash on this device") }
      try MorsePlayer.validate(durations)
      DispatchQueue.main.async {
        try? self.morse.start(durations, loop: loop)
      }
    }

    Function("stopMorse") {
      DispatchQueue.main.async { self.morse.stop() }
    }

    Function("compassAvailable") { () -> Bool in
      CLLocationManager.headingAvailable()
    }

    Function("startCompass") {
      guard CLLocationManager.headingAvailable() else { throw toolsError("ERR_COMPASS_UNAVAILABLE", "No compass on this device") }
      DispatchQueue.main.async { self.location.startHeading() }
    }

    Function("stopCompass") {
      DispatchQueue.main.async { self.location.stopHeading() }
    }

    /// iOS has no public World Magnetic Model API; CoreLocation's true heading needs a location fix.
    Function("declination") { (_: Double, _: Double, _: Double) -> Double in
      throw toolsError("ERR_DECLINATION_UNAVAILABLE", "Magnetic declination is not available on this platform")
    }

    Function("locationPermissionGranted") { () -> Bool in
      LocationTools.authorized(self.location.manager.authorizationStatus)
    }

    Function("gpsEnabled") { () -> Bool in
      CLLocationManager.locationServicesEnabled()
    }

    /// One fix (asks for "while in use" permission first when it was never asked).
    AsyncFunction("getFix") { (timeoutMs: Double, maxAgeMs: Double, promise: Promise) in
      let timeout = min(max(timeoutMs, 5_000), 300_000) / 1000
      self.location.requestFix(timeout: timeout, maxAge: max(maxAgeMs, 0) / 1000) { result in
        switch result {
        case .success(let fix): promise.resolve(fix)
        case .failure(let error): promise.reject(error as? Exception ?? toolsError("ERR_GNSS", String(describing: error)))
        }
      }
    }.runOnQueue(.main)

    Function("cancelFix") {
      DispatchQueue.main.async { self.location.cancelFix() }
    }

    /// 0..1 for the screen, or null to restore the brightness from before (SOS screen mode).
    Function("setScreenBrightness") { (value: Double?) in
      DispatchQueue.main.async {
        let screen = UIScreen.main
        if let value {
          if self.savedBrightness == nil { self.savedBrightness = screen.brightness }
          screen.brightness = CGFloat(min(max(value, 0), 1))
        } else if let saved = self.savedBrightness {
          screen.brightness = saved
          self.savedBrightness = nil
        }
      }
    }

    OnAppEntersBackground {
      DispatchQueue.main.async { self.stopAll() }
    }

    OnDestroy {
      DispatchQueue.main.async { self.stopAll() }
    }
  }
}

/// CoreLocation for the compass and the one-shot fix. Main thread only.
final class LocationTools: NSObject, CLLocationManagerDelegate {
  let manager = CLLocationManager()
  var onHeading: ((Double, Int) -> Void)?
  private var pending: ((Result<[String: Any?], Error>) -> Void)?
  private var maxAge: TimeInterval = 0
  private var timer: Timer?
  private var waitingForPermission = false
  private var timeout: TimeInterval = 0

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.headingFilter = 1
  }

  static func authorized(_ status: CLAuthorizationStatus) -> Bool {
    status == .authorizedWhenInUse || status == .authorizedAlways
  }

  func startHeading() {
    manager.startUpdatingHeading()
  }

  func stopHeading() {
    manager.stopUpdatingHeading()
  }

  func requestFix(timeout: TimeInterval, maxAge: TimeInterval, done: @escaping (Result<[String: Any?], Error>) -> Void) {
    cancelFix()
    pending = done
    self.maxAge = maxAge
    self.timeout = timeout
    switch manager.authorizationStatus {
    case .notDetermined:
      waitingForPermission = true
      manager.requestWhenInUseAuthorization()
    case .authorizedWhenInUse, .authorizedAlways:
      start()
    default:
      finish(.failure(toolsError("ERR_LOCATION_PERMISSION", "Location permission denied")))
    }
  }

  private func start() {
    guard CLLocationManager.locationServicesEnabled() else {
      finish(.failure(toolsError("ERR_GPS_DISABLED", "Location services are off")))
      return
    }
    if let last = manager.location, -last.timestamp.timeIntervalSinceNow <= maxAge, last.horizontalAccuracy >= 0 {
      finish(.success(LocationTools.fix(last)))
      return
    }
    timer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
      self?.finish(.failure(toolsError("ERR_GNSS_TIMEOUT", "No location fix in time")))
    }
    manager.startUpdatingLocation()
  }

  func cancelFix() {
    finish(.failure(toolsError("ERR_GNSS_CANCELLED", "Location fix cancelled")))
  }

  private func finish(_ result: Result<[String: Any?], Error>) {
    timer?.invalidate()
    timer = nil
    waitingForPermission = false
    manager.stopUpdatingLocation()
    let done = pending
    pending = nil
    done?(result)
  }

  static func fix(_ l: CLLocation) -> [String: Any?] {
    [
      "latitude": l.coordinate.latitude,
      "longitude": l.coordinate.longitude,
      "accuracyM": l.horizontalAccuracy >= 0 ? l.horizontalAccuracy : nil,
      "altitudeM": l.verticalAccuracy >= 0 ? l.altitude : nil,
      "timeMs": l.timestamp.timeIntervalSince1970 * 1000,
      "ageMs": -l.timestamp.timeIntervalSinceNow * 1000,
      "provider": "core-location",
    ]
  }

  // MARK: - CLLocationManagerDelegate

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard waitingForPermission, pending != nil else { return }
    switch manager.authorizationStatus {
    case .notDetermined:
      return
    case .authorizedWhenInUse, .authorizedAlways:
      waitingForPermission = false
      start()
    default:
      finish(.failure(toolsError("ERR_LOCATION_PERMISSION", "Location permission denied")))
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard pending != nil, let last = locations.last(where: { $0.horizontalAccuracy >= 0 }) else { return }
    finish(.success(LocationTools.fix(last)))
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if (error as? CLError)?.code == .locationUnknown { return }
    if (error as? CLError)?.code == .denied {
      finish(.failure(toolsError("ERR_LOCATION_PERMISSION", "Location permission denied")))
    } else {
      finish(.failure(toolsError("ERR_GNSS", error.localizedDescription)))
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    let a = newHeading.headingAccuracy
    // SensorManager accuracy scale: 0 unreliable, 1 low, 2 medium, 3 high.
    let accuracy = a < 0 ? 0 : a <= 10 ? 3 : a <= 30 ? 2 : 1
    onHeading?(newHeading.magneticHeading, accuracy)
  }
}
