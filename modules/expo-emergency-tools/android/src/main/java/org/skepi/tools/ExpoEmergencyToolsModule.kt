package org.skepi.tools

import android.content.Context
import android.hardware.GeomagneticField
import android.os.Handler
import android.os.HandlerThread
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal class ToolsException(code: String, message: String) : CodedException(code, message, null)

/**
 * Tools that work without packs or network (Tools tab): SOS torch with a Morse timeline, compass,
 * one-shot GNSS fix, and screen brightness for the SOS screen mode. Nothing here runs in the
 * background: the torch stops and sensors unregister when the app leaves the foreground.
 */
class ExpoEmergencyToolsModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val torchThread = HandlerThread("skepi-torch").apply { start() }
  private val torchHandler = Handler(torchThread.looper)
  private var torch: Torch? = null
  private var morse: MorsePlayer? = null
  private var compass: Compass? = null
  private var gnss: GnssFix? = null

  private fun torch(): Torch = torch ?: Torch(context).also { torch = it }

  private fun morse(): MorsePlayer = morse ?: MorsePlayer(torchHandler) { on ->
    try {
      torch().set(on)
    } catch (e: Exception) {
      // The camera may be taken by another app: stop instead of blinking erratically.
      morse?.stop()
      sendEvent("onTorchError", mapOf("message" to (e.message ?: "torch failed")))
    }
  }.also { morse = it }

  private fun gnss(): GnssFix = gnss ?: GnssFix(context) { visible, used ->
    sendEvent("onGnssStatus", mapOf("visible" to visible, "used" to used))
  }.also { gnss = it }

  private fun stopAll() {
    morse?.stop()
    compass?.stop()
    gnss?.cancel()
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoEmergencyTools")
    Events("onHeading", "onGnssStatus", "onTorchError")

    Function("torchAvailable") { torch().available }

    AsyncFunction("setTorch") { on: Boolean ->
      morse?.stop()
      torch().set(on)
    }

    Function("startMorse") { durations: List<Double>, loop: Boolean ->
      if (!torch().available) throw ToolsException("ERR_TORCH_UNAVAILABLE", "No camera flash on this device")
      try {
        morse().start(durations.map { it.toLong() }.toLongArray(), loop)
      } catch (e: IllegalArgumentException) {
        throw ToolsException("ERR_MORSE_TIMELINE", e.message ?: "invalid timeline")
      }
    }

    Function("stopMorse") { morse?.stop() }

    Function("compassAvailable") { Compass(context) { _, _ -> }.available }

    Function("startCompass") {
      val c = compass ?: Compass(context) { heading, accuracy ->
        sendEvent("onHeading", mapOf("heading" to heading, "accuracy" to accuracy))
      }.also { compass = it }
      if (!c.available) throw ToolsException("ERR_COMPASS_UNAVAILABLE", "No compass sensor on this device")
      c.start()
    }

    Function("stopCompass") { compass?.stop() }

    /** Magnetic declination (degrees, east positive) from the on-device World Magnetic Model. */
    Function("declination") { latitude: Double, longitude: Double, altitudeM: Double ->
      GeomagneticField(latitude.toFloat(), longitude.toFloat(), altitudeM.toFloat(), System.currentTimeMillis()).declination.toDouble()
    }

    Function("locationPermissionGranted") { gnss().hasPermission }

    Function("gpsEnabled") { gnss().gpsEnabled }

    AsyncFunction("getFix") { timeoutMs: Double, maxAgeMs: Double, promise: Promise ->
      gnss().request(timeoutMs.toLong().coerceIn(5_000L, 300_000L), maxAgeMs.toLong().coerceAtLeast(0L)) { result ->
        result.fold(
          onSuccess = { promise.resolve(GnssFix.toMap(it)) },
          onFailure = { e -> promise.reject(e as? CodedException ?: ToolsException("ERR_GNSS", e.message ?: "GNSS failed")) },
        )
      }
    }

    Function("cancelFix") { gnss?.cancel() }

    /** 0..1 for the current window, or null to follow the system again (SOS screen mode). */
    Function("setScreenBrightness") { value: Double? ->
      val activity = appContext.currentActivity ?: return@Function
      activity.runOnUiThread {
        val params = activity.window.attributes
        params.screenBrightness = value?.toFloat()?.coerceIn(0f, 1f) ?: WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        activity.window.attributes = params
      }
    }

    OnActivityEntersBackground { stopAll() }

    OnDestroy {
      stopAll()
      torchThread.quitSafely()
    }
  }
}
