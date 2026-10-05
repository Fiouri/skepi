package org.skepi.tools

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.location.GnssStatus
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper

/** The back camera's flash as a torch (no CAMERA permission needed for setTorchMode). */
internal class Torch(context: Context) {
  private val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
  private val cameraId: String? = try {
    manager.cameraIdList.firstOrNull { id ->
      manager.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
    }
  } catch (e: Exception) {
    null
  }

  val available: Boolean get() = cameraId != null

  fun set(on: Boolean) {
    val id = cameraId ?: throw ToolsException("ERR_TORCH_UNAVAILABLE", "No camera flash on this device")
    try {
      manager.setTorchMode(id, on)
    } catch (e: Exception) {
      throw ToolsException("ERR_TORCH", "Torch failed: ${e.message}")
    }
  }
}

/**
 * Magnetic heading in degrees (0 = magnetic north), from the rotation-vector sensor or, if missing,
 * accelerometer + magnetometer. The app is portrait-only, so no screen-rotation remap is needed.
 */
internal class Compass(context: Context, private val onHeading: (Double, Int) -> Unit) : SensorEventListener {
  private val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val rotation = manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
  private val accel = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
  private val magnet = manager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
  private val gravity = FloatArray(3)
  private val geomagnetic = FloatArray(3)
  private var haveGravity = false
  private var haveMagnet = false
  private var accuracy = SensorManager.SENSOR_STATUS_UNRELIABLE
  private var lastEmit = 0L
  private var lastHeading = -1000.0

  val available: Boolean get() = rotation != null || (accel != null && magnet != null)

  fun start() {
    if (rotation != null) {
      manager.registerListener(this, rotation, SensorManager.SENSOR_DELAY_UI)
    } else {
      accel?.let { manager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
      magnet?.let { manager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }
  }

  fun stop() {
    manager.unregisterListener(this)
  }

  override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
    if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD || sensor.type == Sensor.TYPE_ROTATION_VECTOR) this.accuracy = accuracy
  }

  override fun onSensorChanged(event: SensorEvent) {
    val matrix = FloatArray(9)
    when (event.sensor.type) {
      Sensor.TYPE_ROTATION_VECTOR -> SensorManager.getRotationMatrixFromVector(matrix, event.values)
      Sensor.TYPE_ACCELEROMETER -> {
        System.arraycopy(event.values, 0, gravity, 0, 3)
        haveGravity = true
        return emitFromPair(matrix)
      }
      Sensor.TYPE_MAGNETIC_FIELD -> {
        System.arraycopy(event.values, 0, geomagnetic, 0, 3)
        haveMagnet = true
        return emitFromPair(matrix)
      }
      else -> return
    }
    emit(matrix)
  }

  private fun emitFromPair(matrix: FloatArray) {
    if (!haveGravity || !haveMagnet) return
    if (SensorManager.getRotationMatrix(matrix, null, gravity, geomagnetic)) emit(matrix)
  }

  private fun emit(matrix: FloatArray) {
    val orientation = FloatArray(3)
    SensorManager.getOrientation(matrix, orientation)
    val heading = (Math.toDegrees(orientation[0].toDouble()) + 360.0) % 360.0
    val now = System.currentTimeMillis()
    val delta = Math.abs(((heading - lastHeading + 540.0) % 360.0) - 180.0)
    // At most ~5 updates per second, and only on a visible change: the UI does no work otherwise.
    if (now - lastEmit < 200 || delta < 1.0) return
    lastEmit = now
    lastHeading = heading
    onHeading(heading, accuracy)
  }
}

/**
 * One GNSS fix from the GPS provider only (works offline, no Play Services, no network location).
 * Location updates stop as soon as the fix arrives or the timeout passes: GPS is on only on tap.
 */
internal class GnssFix(
  private val context: Context,
  private val onStatus: (visible: Int, used: Int) -> Unit,
) {
  private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
  private val handler = Handler(Looper.getMainLooper())
  private var listener: LocationListener? = null
  private var statusCallback: GnssStatus.Callback? = null
  private var timeout: Runnable? = null
  private var pending: ((Result<Location>) -> Unit)? = null

  val hasPermission: Boolean
    get() = context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  val gpsEnabled: Boolean
    get() = try {
      manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
    } catch (e: Exception) {
      false
    }

  @SuppressLint("MissingPermission")
  fun request(timeoutMs: Long, maxAgeMs: Long, done: (Result<Location>) -> Unit) {
    handler.post {
      cancel()
      if (!hasPermission) return@post done(Result.failure(ToolsException("ERR_LOCATION_PERMISSION", "Location permission not granted")))
      if (!gpsEnabled) return@post done(Result.failure(ToolsException("ERR_GPS_DISABLED", "Location (GPS) is turned off")))
      val last = try {
        manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
      } catch (e: Exception) {
        null
      }
      if (last != null && System.currentTimeMillis() - last.time <= maxAgeMs) return@post done(Result.success(last))
      pending = done
      val l = object : LocationListener {
        override fun onLocationChanged(location: Location) {
          finish(Result.success(location))
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        override fun onProviderEnabled(provider: String) = Unit
        override fun onProviderDisabled(provider: String) {
          finish(Result.failure(ToolsException("ERR_GPS_DISABLED", "Location (GPS) was turned off")))
        }
      }
      listener = l
      val cb = object : GnssStatus.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatus) {
          var used = 0
          for (i in 0 until status.satelliteCount) if (status.usedInFix(i)) used += 1
          onStatus(status.satelliteCount, used)
        }
      }
      statusCallback = cb
      try {
        manager.registerGnssStatusCallback(cb, handler)
        manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, l, Looper.getMainLooper())
      } catch (e: Exception) {
        return@post finish(Result.failure(ToolsException("ERR_GNSS", "GNSS request failed: ${e.message}")))
      }
      val t = Runnable { finish(Result.failure(ToolsException("ERR_GNSS_TIMEOUT", "No GNSS fix within ${timeoutMs / 1000} s"))) }
      timeout = t
      handler.postDelayed(t, timeoutMs)
    }
  }

  private fun finish(result: Result<Location>) {
    val done = pending
    pending = null
    stopUpdates()
    done?.invoke(result)
  }

  private fun stopUpdates() {
    listener?.let { manager.removeUpdates(it) }
    listener = null
    statusCallback?.let { manager.unregisterGnssStatusCallback(it) }
    statusCallback = null
    timeout?.let { handler.removeCallbacks(it) }
    timeout = null
  }

  fun cancel() {
    if (pending != null) finish(Result.failure(ToolsException("ERR_GNSS_CANCELLED", "GNSS request cancelled")))
    stopUpdates()
  }

  companion object {
    fun toMap(location: Location): Map<String, Any?> = mapOf(
      "latitude" to location.latitude,
      "longitude" to location.longitude,
      "accuracyM" to if (location.hasAccuracy()) location.accuracy.toDouble() else null,
      "altitudeM" to if (location.hasAltitude()) location.altitude else null,
      "timeMs" to location.time.toDouble(),
      "ageMs" to (System.currentTimeMillis() - location.time).toDouble(),
      "provider" to (location.provider ?: "gps"),
    )

    @Suppress("unused")
    val sdk = Build.VERSION.SDK_INT
  }
}
