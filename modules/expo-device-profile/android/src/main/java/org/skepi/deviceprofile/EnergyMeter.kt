package org.skepi.deviceprofile

import android.content.Context
import android.os.BatteryManager
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/**
 * Battery charge used during one action, from the battery current (BATTERY_PROPERTY_CURRENT_NOW)
 * sampled every 200 ms and integrated over time. Needed because many phones update the charge counter
 * only every ~30 s in steps of ~0.1% (Galaxy S23: 3.7 mAh), so a 10 s action reads as 0. The current
 * is the whole device's (screen included), like the charge counter it refines.
 */
class EnergyMeter(private val context: Context) {
  private class Run(val startMs: Long) {
    @Volatile var lastMs: Long = startMs
    @Volatile var chargeUas: Double = 0.0 // µA·s, with the device's sign convention made positive for discharge
    @Volatile var samples: Int = 0
    @Volatile var sumUa: Double = 0.0
    @Volatile var maxAbs: Long = 0
    var future: ScheduledFuture<*>? = null
  }

  private val runs = ConcurrentHashMap<String, Run>()
  private val scheduler = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "skepi-energy").apply { isDaemon = true } }
  private val manager: BatteryManager
    get() = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager

  /** Discharge current now, in µA (positive while discharging), or null where the device has none. */
  private fun dischargeNow(): Long? {
    val raw = manager.getLongProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
    if (raw == Long.MIN_VALUE || raw == 0L) return null
    // Most devices report negative while discharging; a few report positive. Discharge is what we
    // measure (nothing is recorded while charging), so the magnitude is the draw.
    return abs(raw)
  }

  fun start(id: String): Boolean {
    stop(id)
    val first = dischargeNow() ?: return false
    val run = Run(System.currentTimeMillis())
    run.sumUa = first.toDouble()
    run.samples = 1
    run.maxAbs = first
    run.future = scheduler.scheduleWithFixedDelay({
      val now = System.currentTimeMillis()
      val ua = dischargeNow() ?: return@scheduleWithFixedDelay
      run.chargeUas += ua * (now - run.lastMs) / 1000.0
      run.lastMs = now
      run.samples += 1
      run.sumUa += ua
      if (ua > run.maxAbs) run.maxAbs = ua
    }, 200, 200, TimeUnit.MILLISECONDS)
    runs[id] = run
    return true
  }

  /** Stops a run: duration, mean current and charge used (µAh), or null when there was none. */
  fun stop(id: String): Map<String, Any>? {
    val run = runs.remove(id) ?: return null
    run.future?.cancel(false)
    val end = System.currentTimeMillis()
    val mean = run.sumUa / run.samples
    // Some Samsung kernels report mA instead of µA: an active phone never draws under 20 mA.
    val unit = if (run.maxAbs < 20_000) 1000.0 else 1.0
    val charge = (run.chargeUas + mean * (end - run.lastMs) / 1000.0) * unit / 3600.0
    return mapOf(
      "durationMs" to (end - run.startMs).toDouble(),
      "meanCurrentUa" to mean * unit,
      "chargeUah" to charge,
      "samples" to run.samples.toDouble(),
    )
  }
}
