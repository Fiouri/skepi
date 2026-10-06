package org.skepi.transfer

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Base64
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.EncodeHintType
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.io.ByteArrayOutputStream

/** QR codes with ZXing core (pure Java, offline). */
object Qr {
  /** A PNG data URI of `text` (error correction M, quiet zone 2). */
  fun pngDataUri(text: String, size: Int): String {
    val px = size.coerceIn(128, 1024)
    val matrix = QRCodeWriter().encode(
      text,
      BarcodeFormat.QR_CODE,
      px,
      px,
      mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 2, EncodeHintType.CHARACTER_SET to "UTF-8"),
    )
    val pixels = IntArray(matrix.width * matrix.height) { i -> if (matrix.get(i % matrix.width, i / matrix.width)) Color.BLACK else Color.WHITE }
    val bmp = Bitmap.createBitmap(pixels, matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
    bmp.recycle()
    return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  private val reader = QRCodeReader()

  /** Decodes a QR code from a luminance (Y) plane, or null. */
  fun decode(y: ByteArray, rowStride: Int, width: Int, height: Int): String? {
    val source = PlanarYUVLuminanceSource(y, rowStride, height, 0, 0, width, height, false)
    return try {
      reader.decode(BinaryBitmap(HybridBinarizer(source)), mapOf(DecodeHintType.TRY_HARDER to true)).text
    } catch (_: NotFoundException) {
      null
    } catch (_: com.google.zxing.ReaderException) {
      null
    } finally {
      reader.reset()
    }
  }
}
