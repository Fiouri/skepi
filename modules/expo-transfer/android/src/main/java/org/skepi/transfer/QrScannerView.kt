package org.skepi.transfer

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Camera preview that reads the host's pairing QR code (CameraX + ZXing, on-device only). The camera
 * runs only while this view is on screen and stops after the first code is read.
 */
class QrScannerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onScanned by EventDispatcher<Map<String, String>>()
  private val onError by EventDispatcher<Map<String, String>>()
  private val preview = PreviewView(context).also { addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }
  private val analyzer: ExecutorService = Executors.newSingleThreadExecutor { r -> Thread(r, "skepi-qr").apply { isDaemon = true } }
  private val done = AtomicBoolean(false)
  private var provider: ProcessCameraProvider? = null

  override val shouldUseAndroidLayout: Boolean = true

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    start()
  }

  override fun onDetachedFromWindow() {
    stop()
    super.onDetachedFromWindow()
  }

  private fun start() {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      onError(mapOf("message" to "camera permission not granted"))
      return
    }
    val owner = appContext.currentActivity as? LifecycleOwner ?: run {
      onError(mapOf("message" to "no activity for the camera"))
      return
    }
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        val p = future.get()
        provider = p
        val previewUse = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
        val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        analysis.setAnalyzer(analyzer) { image ->
          image.use { img ->
            if (done.get()) return@use
            val plane = img.planes[0]
            val buf = plane.buffer
            val bytes = ByteArray(buf.remaining()).also { buf.get(it) }
            val text = Qr.decode(bytes, plane.rowStride, img.width, img.height)
            if (text != null && done.compareAndSet(false, true)) {
              post {
                onScanned(mapOf("data" to text))
                stop()
              }
            }
          }
        }
        p.unbindAll()
        p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, previewUse, analysis)
      } catch (e: Exception) {
        Log.w("SkepiQr", "camera: ${e.message}")
        onError(mapOf("message" to (e.message ?: "camera unavailable")))
      }
    }, ContextCompat.getMainExecutor(context))
  }

  fun stop() {
    provider?.unbindAll()
    provider = null
  }
}
