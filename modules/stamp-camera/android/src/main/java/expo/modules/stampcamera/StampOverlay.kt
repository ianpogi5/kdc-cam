package expo.modules.stampcamera

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.RectF
import android.net.Uri
import androidx.camera.effects.Frame

/**
 * Draws the stamp PNG into each captured/recorded frame via CameraX's
 * OverlayEffect. The PNG is produced in JS from the same `<Stamp>` component, so
 * the burned-in stamp matches the on-screen one exactly.
 */
class StampOverlay {
  @Volatile private var bitmap: Bitmap? = null
  private var currentUri: String? = null
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

  fun setOverlayUri(uri: String?) {
    if (uri == currentUri) return
    currentUri = uri
    val old = bitmap
    bitmap = uri?.let { decode(it) }
    old?.recycle()
  }

  private fun decode(uri: String): Bitmap? {
    val path = if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri.removePrefix("file://") else uri
    return runCatching { BitmapFactory.decodeFile(path) }.getOrNull()
  }

  /**
   * Draws the overlay along the bottom of the *displayed* video. The output
   * buffer is the camera's natural (landscape) orientation, and the app is
   * locked to portrait, so the displayed video is the buffer rotated 90° CW.
   * We therefore draw the stamp upright in portrait "display space" and map it
   * back into the buffer with a 90° CW pre-rotation, so it ends up upright.
   */
  fun draw(frame: Frame): Boolean {
    val canvas = frame.overlayCanvas
    canvas.drawColor(0, PorterDuff.Mode.CLEAR)
    val bmp = bitmap ?: return true

    val bw = frame.size.width.toFloat()
    val bh = frame.size.height.toFloat()

    // Displayed (portrait) dimensions are the buffer's, swapped.
    val displayW = bh
    val displayH = bw
    val scaledH = displayW * bmp.height / bmp.width
    val dst = RectF(0f, displayH - scaledH, displayW, displayH)

    // display -> buffer: rotate 90° CW, then shift back into [0, bw].
    val matrix = Matrix().apply {
      setRotate(90f)
      postTranslate(bw, 0f)
    }

    canvas.save()
    canvas.concat(matrix)
    canvas.drawBitmap(bmp, null, dst, paint)
    canvas.restore()
    return true
  }

  /** Composites the overlay onto a still photo bitmap (used for IMAGE capture). */
  fun stampInto(target: Bitmap) {
    val bmp = bitmap ?: return
    drawOnto(Canvas(target), target.width.toFloat(), target.height.toFloat(), bmp)
  }

  private fun drawOnto(canvas: Canvas, w: Float, h: Float, bmp: Bitmap) {
    val scaledH = w * bmp.height / bmp.width
    canvas.drawBitmap(bmp, null, RectF(0f, h - scaledH, w, h), paint)
  }
}
