package org.skepi.zim

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.StatFs
import java.io.File

/**
 * Spike-only device probes (RAM, CPU clusters, battery, thermal, disk). Will move to
 * modules/expo-device-profile in Phase 1.
 */
internal object DeviceInfo {
  private const val MB = 1024L * 1024L

  fun memory(context: Context): Map<String, Any> {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val info = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
    val status = readProcStatus()
    return mapOf(
      "totalRamMb" to info.totalMem / MB,
      "availRamMb" to info.availMem / MB,
      "lowMemory" to info.lowMemory,
      "thresholdMb" to info.threshold / MB,
      // Peak resident set size of this process (VmHWM) and current RSS, in MB.
      "peakRssMb" to (status["VmHWM"] ?: 0L) / 1024L,
      "rssMb" to (status["VmRSS"] ?: 0L) / 1024L,
      "nativeHeapMb" to android.os.Debug.getNativeHeapAllocatedSize() / MB,
    )
  }

  private fun readProcStatus(): Map<String, Long> = try {
    File("/proc/self/status").readLines().mapNotNull { line ->
      val parts = line.split(':', limit = 2)
      if (parts.size != 2) return@mapNotNull null
      val kb = parts[1].trim().removeSuffix("kB").trim().toLongOrNull() ?: return@mapNotNull null
      parts[0] to kb
    }.toMap()
  } catch (e: Exception) {
    emptyMap()
  }

  /**
   * Performance cores = cores outside the lowest-frequency cluster (big.LITTLE). When all cores
   * share one max frequency, all of them count.
   */
  fun cpu(): Map<String, Any> {
    val cores = Runtime.getRuntime().availableProcessors()
    val maxFreqs = (0 until cores).map { i ->
      try {
        File("/sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq").readText().trim().toLong()
      } catch (e: Exception) {
        0L
      }
    }
    val known = maxFreqs.filter { it > 0 }
    val lowest = known.minOrNull() ?: 0L
    val performance = if (known.isEmpty() || known.all { it == lowest }) cores else known.count { it > lowest }
    return mapOf(
      "cores" to cores,
      "performanceCores" to performance,
      "maxFreqKhz" to maxFreqs,
      "abi" to (Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown"),
    )
  }

  fun device(): Map<String, Any> = mapOf(
    "manufacturer" to Build.MANUFACTURER,
    "model" to Build.MODEL,
    "device" to Build.DEVICE,
    "soc" to (if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL else Build.HARDWARE),
    "sdkInt" to Build.VERSION.SDK_INT,
    "release" to Build.VERSION.RELEASE,
  )

  /** Matches the DeviceProfile contract in packages/contracts. */
  fun snapshot(context: Context): Map<String, Any> {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val mem = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
    val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
    val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
    val plugged = (battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
    val pct = if (level >= 0 && scale > 0) level * 100.0 / scale else -1.0
    val root = ZimRegistry.contentRoot(context) ?: context.filesDir
    val freeDiskMb = StatFs(root.path).availableBytes / MB
    return mapOf(
      "totalRamMb" to mem.totalMem / MB,
      "freeRamMb" to mem.availMem / MB,
      "freeDiskMb" to freeDiskMb,
      "batteryPct" to pct,
      "charging" to plugged,
      "thermal" to thermal(context),
    )
  }

  private fun thermal(context: Context): String {
    if (Build.VERSION.SDK_INT < 29) return "nominal"
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return when (pm.currentThermalStatus) {
      PowerManager.THERMAL_STATUS_NONE -> "nominal"
      PowerManager.THERMAL_STATUS_LIGHT, PowerManager.THERMAL_STATUS_MODERATE -> "fair"
      PowerManager.THERMAL_STATUS_SEVERE -> "serious"
      else -> "critical"
    }
  }
}
