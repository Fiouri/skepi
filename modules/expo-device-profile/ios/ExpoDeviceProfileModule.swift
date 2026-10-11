import Darwin
import ExpoModulesCore
import Foundation
import os
import UIKit

private let mb: UInt64 = 1024 * 1024

/// Device probes on iOS (Phase 3b-0): the same results as DeviceProbes.kt. Differences, all documented in
/// docs/phase-3b0-report.md: total RAM is the full physical memory (Android reports less than the
/// marketed size), performance cores come from `hw.perflevel0` without core ids (iOS has no thread
/// pinning), the battery current is not readable (no energy meter), and an unknown battery (Simulator)
/// counts as mains power like a desktop.
enum DeviceProbes {
  static func sysctlInt(_ name: String) -> Int? {
    var value: Int64 = 0
    var size = MemoryLayout<Int64>.size
    guard sysctlbyname(name, &value, &size, nil, 0) == 0 else { return nil }
    return size == 4 ? Int(Int32(truncatingIfNeeded: value)) : Int(value)
  }

  static func availableMemory() -> UInt64 {
    let avail = os_proc_available_memory()
    if avail > 0 { return UInt64(avail) }
    // Simulator / no jetsam limit: free + inactive pages of the host.
    var stats = vm_statistics64()
    var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.stride / MemoryLayout<integer_t>.stride)
    let result = withUnsafeMutablePointer(to: &stats) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count) }
    }
    guard result == KERN_SUCCESS else { return 0 }
    return (UInt64(stats.free_count) + UInt64(stats.inactive_count)) * UInt64(vm_kernel_page_size)
  }

  static func taskInfo() -> task_vm_info_data_t? {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.stride / MemoryLayout<natural_t>.stride)
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
    }
    return result == KERN_SUCCESS ? info : nil
  }

  static func freeDiskMb() -> UInt64 {
    let home = URL(fileURLWithPath: NSHomeDirectory())
    let values = try? home.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    return UInt64(max(0, values?.volumeAvailableCapacityForImportantUsage ?? 0)) / mb
  }

  static func thermal() -> String {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "nominal"
    }
  }

  /// Level in percent and charging; nil level when the device reports none (Simulator).
  @MainActor
  static func batteryState() -> (levelPct: Double?, charging: Bool) {
    let device = UIDevice.current
    device.isBatteryMonitoringEnabled = true
    let level = device.batteryLevel
    switch device.batteryState {
    case .unknown: return (nil, true)
    case .charging, .full: return (level >= 0 ? Double(level) * 100 : nil, true)
    case .unplugged: return (level >= 0 ? Double(level) * 100 : nil, false)
    @unknown default: return (nil, true)
    }
  }

  static func machine() -> String {
    if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
    var info = utsname()
    uname(&info)
    return withUnsafeBytes(of: &info.machine) { raw in
      String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
    }
  }
}

public class ExpoDeviceProfileModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoDeviceProfile")

    /// Matches the DeviceProfile contract in packages/contracts.
    AsyncFunction("getSnapshot") { () -> [String: Any] in
      let battery = MainActor.assumeIsolated { DeviceProbes.batteryState() }
      return [
        "totalRamMb": Double(ProcessInfo.processInfo.physicalMemory / mb),
        "freeRamMb": Double(DeviceProbes.availableMemory() / mb),
        "freeDiskMb": Double(DeviceProbes.freeDiskMb()),
        "batteryPct": battery.levelPct ?? (battery.charging ? 100 : -1),
        "charging": battery.charging,
        "thermal": DeviceProbes.thermal(),
      ]
    }.runOnQueue(.main)

    AsyncFunction("getMemoryInfo") { () -> [String: Any] in
      let info = DeviceProbes.taskInfo()
      var zone = malloc_statistics_t()
      malloc_zone_statistics(nil, &zone)
      return [
        "totalRamMb": Double(ProcessInfo.processInfo.physicalMemory / mb),
        "availRamMb": Double(DeviceProbes.availableMemory() / mb),
        "lowMemory": false,
        "thresholdMb": 0,
        "peakRssMb": Double((info?.resident_size_peak ?? 0) / mb),
        "rssMb": Double((info?.phys_footprint ?? 0) / mb),
        "nativeHeapMb": Double(UInt64(zone.size_in_use) / mb),
      ]
    }

    AsyncFunction("getCpuInfo") { () -> [String: Any] in
      let cores = ProcessInfo.processInfo.activeProcessorCount
      let levels = DeviceProbes.sysctlInt("hw.nperflevels") ?? 1
      let performance = levels > 1 ? DeviceProbes.sysctlInt("hw.perflevel0.logicalcpu") : nil
      #if arch(arm64)
      let abi = "arm64"
      #else
      let abi = "x86_64"
      #endif
      return [
        "cores": cores,
        "performanceCores": min(max(performance ?? cores, 1), cores),
        "performanceCoreIds": [Int](),
        "maxFreqKhz": [Int](),
        "abi": abi,
      ]
    }

    AsyncFunction("getDeviceInfo") { () -> [String: Any] in
      let version = ProcessInfo.processInfo.operatingSystemVersion
      let (device, release) = MainActor.assumeIsolated { (UIDevice.current.model, UIDevice.current.systemVersion) }
      return [
        "manufacturer": "Apple",
        "model": DeviceProbes.machine(),
        "device": device,
        "soc": "",
        "sdkInt": version.majorVersion,
        "release": release,
      ]
    }.runOnQueue(.main)

    AsyncFunction("getBattery") { () -> [String: Any?] in
      let battery = MainActor.assumeIsolated { DeviceProbes.batteryState() }
      return [
        "levelPct": battery.levelPct,
        // iOS exposes neither a charge counter nor the battery current.
        "chargeCounterUah": nil,
        "charging": battery.charging,
        "powerSave": ProcessInfo.processInfo.isLowPowerModeEnabled,
        "timestampMs": Date().timeIntervalSince1970 * 1000,
      ]
    }.runOnQueue(.main)

    /// No battery current on iOS: the app falls back to battery-level deltas (energy.ts).
    Function("startEnergyMeter") { (_: String) -> Bool in
      false
    }

    Function("stopEnergyMeter") { (_: String) -> [String: Any]? in
      nil
    }
  }
}
