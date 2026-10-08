package org.skepi.tools

import android.content.Context
import android.location.Location
import android.os.SystemClock
import org.json.JSONObject
import java.io.File

/**
 * Debug builds only (this source set is not compiled into release builds): a deterministic GNSS fix
 * for the E2E tools flow. `e2e/run-e2e.ps1 -MockLocation` pushes `<external files>/e2e/mock-location.json`
 * (`{ "latitude", "longitude", "accuracyM"?, "altitudeM"? }`) and removes it afterwards. Without the
 * file the real GPS provider is used, as in release builds.
 */
internal object MockLocation {
  const val AVAILABLE = true

  fun read(context: Context): Location? {
    val file = File(context.getExternalFilesDir(null) ?: return null, "e2e/mock-location.json")
    if (!file.isFile || file.length() > 4096) return null
    return try {
      val json = JSONObject(file.readText(Charsets.UTF_8))
      val lat = json.getDouble("latitude")
      val lon = json.getDouble("longitude")
      if (lat !in -90.0..90.0 || lon !in -180.0..180.0) return null
      Location("gps").apply {
        latitude = lat
        longitude = lon
        if (json.has("accuracyM")) accuracy = json.getDouble("accuracyM").toFloat()
        if (json.has("altitudeM")) altitude = json.getDouble("altitudeM")
        time = System.currentTimeMillis()
        elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
      }
    } catch (e: Exception) {
      null
    }
  }
}
