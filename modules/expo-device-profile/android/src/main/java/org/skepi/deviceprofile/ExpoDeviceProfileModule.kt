package org.skepi.deviceprofile

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoDeviceProfileModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ExpoDeviceProfile")

    AsyncFunction("getSnapshot") { DeviceProbes.snapshot(context) }

    AsyncFunction("getMemoryInfo") { DeviceProbes.memory(context) }

    AsyncFunction("getCpuInfo") { DeviceProbes.cpu() }

    AsyncFunction("getDeviceInfo") { DeviceProbes.device() }

    AsyncFunction("getBattery") { DeviceProbes.battery(context) }
  }
}
