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
   * buffer is the camera's natural (landscape) orientation, so we draw the stamp
   * upright in portrait "display space" and map it back into the buffer.
   *
   * Orientation is taken from the frame itself rather than hardcoded, so this
   * works for both lenses: `rotationDegrees` is how far the buffer is turned to
   * face upright (90° for the back camera in portrait), and `isMirroring` is set
   * for the front camera, where the recorded output is flipped horizontally — we
   * pre-flip the stamp so its text still reads correctly once the pipeline
   * mirrors the frame. With rot=90, no mirror, and a full-frame crop this is the
   * same transform the back camera used before.
   */
  fun draw(frame: Frame): Boolean {
    val canvas = frame.overlayCanvas
    canvas.drawColor(0, PorterDuff.Mode.CLEAR)
    val bmp = bitmap ?: return true

    val crop = frame.cropRect
    val cw = crop.width().toFloat()
    val ch = crop.height().toFloat()
    // rotationDegrees is how far the buffer is turned to face upright
    // (buffer -> display). We draw the other way (display -> buffer), so apply
    // the inverse rotation.
    val rot = (360 - (((frame.rotationDegrees % 360) + 360) % 360)) % 360

    // Upright (display) dimensions are the cropped buffer rotated by `rot`.
    val displayW = if (rot == 90 || rot == 270) ch else cw
    val displayH = if (rot == 90 || rot == 270) cw else ch
    val scaledH = displayW * bmp.height / bmp.width
    val dst = RectF(0f, displayH - scaledH, displayW, displayH)

    // display -> buffer: mirror first (front camera), then rotate by `rot` and
    // shift the rotated content into the buffer's cropped region.
    val matrix = Matrix()
    if (frame.isMirroring) matrix.postScale(-1f, 1f, displayW / 2f, displayH / 2f)
    matrix.postRotate(rot.toFloat())
    when (rot) {
      90 -> matrix.postTranslate(displayH, 0f)
      180 -> matrix.postTranslate(displayW, displayH)
      270 -> matrix.postTranslate(0f, displayW)
    }
    matrix.postTranslate(crop.left.toFloat(), crop.top.toFloat())

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
