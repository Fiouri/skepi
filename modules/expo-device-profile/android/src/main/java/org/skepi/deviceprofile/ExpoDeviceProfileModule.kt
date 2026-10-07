package org.skepi.deviceprofile

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoDeviceProfileModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val meter by lazy { EnergyMeter(context) }

  override fun definition() = ModuleDefinition {
    Name("ExpoDeviceProfile")

    AsyncFunction("getSnapshot") { DeviceProbes.snapshot(context) }

    AsyncFunction("getMemoryInfo") { DeviceProbes.memory(context) }

    AsyncFunction("getCpuInfo") { DeviceProbes.cpu() }

    AsyncFunction("getDeviceInfo") { DeviceProbes.device() }

    AsyncFunction("getBattery") { DeviceProbes.battery(context) }

    /** Starts sampling the battery current for one action; false where the device reports none. */
    Function("startEnergyMeter") { id: String -> meter.start(id) }

    /** Stops it: { durationMs, meanCurrentUa, chargeUah, samples } or null. */
    Function("stopEnergyMeter") { id: String -> meter.stop(id) }
  }
}
