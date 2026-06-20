package expo.modules.stampcamera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.LinearLayout
import androidx.camera.core.CameraEffect
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.effects.OverlayEffect
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * A CameraX-backed preview that burns the stamp overlay into photos and video as
 * they're captured (no post-processing). Controlled via props from React:
 * `facing`, `overlayUri`, `recording`, `photoRequestId`; reports back via the
 * `onRecordingFinished` / `onPhotoCaptured` / `onCaptureError` events.
 */
class StampCameraView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext), LifecycleOwner {

  private val onRecordingFinished by EventDispatcher()
  private val onPhotoCaptured by EventDispatcher()
  private val onCaptureError by EventDispatcher()
  private val onCameraReady by EventDispatcher()

  private val lifecycleRegistry = LifecycleRegistry(this)
  override fun getLifecycle(): Lifecycle = lifecycleRegistry

  // Opt into Android's layout pass: Fabric otherwise leaves this LinearLayout
  // unmeasured, so the preview gets zero size and the camera can't configure.
  override val shouldUseAndroidLayout = true

  private val previewView = PreviewView(context).apply {
    // TextureView-backed preview composites correctly inside the React Native
    // (Fabric) view tree; the default SurfaceView mode renders black here.
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.MATCH_PARENT,
    )
  }.also { addView(it) }
  private val overlay = StampOverlay()
  private val mainExecutor = ContextCompat.getMainExecutor(context)
  // Off-main work: photo decode/composite/encode.
  private val ioExecutor = Executors.newSingleThreadExecutor()

  private var cameraProvider: ProcessCameraProvider? = null
  private var imageCapture: ImageCapture? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var overlayEffect: OverlayEffect? = null
  private var activeRecording: Recording? = null

  private var lensFacing = CameraSelector.LENS_FACING_BACK
  private var isRecording = false
  private var lastPhotoId = 0
  private var bound = false

  companion object {
    private const val TAG = "StampCamera"
  }

  init {
    lifecycleRegistry.currentState = Lifecycle.State.CREATED
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    lifecycleRegistry.currentState = Lifecycle.State.RESUMED
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      cameraProvider = future.get()
      if (isAttachedToWindow) bindUseCases()
    }, mainExecutor)
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    runCatching { activeRecording?.stop() }
    activeRecording = null
    isRecording = false
    cameraProvider?.unbindAll()
    bound = false
    overlayEffect?.close()
    overlayEffect = null
    lifecycleRegistry.currentState = Lifecycle.State.CREATED
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    super.onLayout(changed, l, t, r, b)
    Log.d(TAG, "onLayout ${r - l}x${b - t}, preview ${previewView.width}x${previewView.height}")
  }

  private fun bindUseCases() {
    val provider = cameraProvider ?: return
    try {
      provider.unbindAll()
      overlayEffect?.close()

      val preview = Preview.Builder().build().also {
        it.surfaceProvider = previewView.surfaceProvider
      }
      val image = ImageCapture.Builder().build()
      val recorder = Recorder.Builder()
        .setQualitySelector(
          QualitySelector.from(Quality.FHD, FallbackStrategy.higherQualityOrLowerThan(Quality.SD)),
        )
        .build()
      val video = VideoCapture.withOutput(recorder)

      // The effect can only target IMAGE_CAPTURE alongside PREVIEW, which would
      // double the stamp on the live preview. So burn video live via the effect
      // and composite photos separately (see takePhoto).
      val effect = OverlayEffect(
        CameraEffect.VIDEO_CAPTURE,
        0,
        Handler(Looper.getMainLooper()),
        Consumer { /* effect processing error; non-fatal */ },
      )
      effect.setOnDrawListener { frame -> overlay.draw(frame) }

      val group = UseCaseGroup.Builder()
        .addUseCase(preview)
        .addUseCase(image)
        .addUseCase(video)
        .addEffect(effect)
        .build()

      val selector = CameraSelector.Builder().requireLensFacing(lensFacing).build()
      provider.bindToLifecycle(this, selector, group)
      imageCapture = image
      videoCapture = video
      overlayEffect = effect
      bound = true
      Log.d(TAG, "camera bound (facing=$lensFacing)")
      onCameraReady(mapOf())
    } catch (e: Throwable) {
      Log.e(TAG, "bind failed", e)
      onCaptureError(mapOf("message" to (e.message ?: "camera bind failed")))
    }
  }

  fun setFacing(value: String) {
    val facing =
      if (value == "front") CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
    if (facing == lensFacing) return
    lensFacing = facing
    if (bound) bindUseCases()
  }

  fun setOverlayUri(uri: String?) = overlay.setOverlayUri(uri)

  fun setRecording(value: Boolean) {
    if (value && !isRecording) startRecording()
    else if (!value && isRecording) stopRecording()
  }

  fun requestPhoto(id: Int) {
    if (id == lastPhotoId) return
    lastPhotoId = id
    takePhoto(id)
  }

  private fun takePhoto(id: Int) {
    val capture = imageCapture ?: run {
      onCaptureError(mapOf("message" to "camera not ready", "requestId" to id))
      return
    }
    // Capture in-memory so we can rotate upright and composite the stamp before
    // saving — a single image, so this is effectively instant.
    capture.takePicture(ioExecutor, object : ImageCapture.OnImageCapturedCallback() {
      override fun onCaptureSuccess(image: ImageProxy) {
        try {
          val degrees = image.imageInfo.rotationDegrees
          val raw = image.toBitmap()
          image.close()
          val upright = if (degrees != 0) {
            val m = Matrix().apply { postRotate(degrees.toFloat()) }
            Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
          } else raw
          val out = if (upright.isMutable) upright else upright.copy(Bitmap.Config.ARGB_8888, true)
          overlay.stampInto(out)
          val file = File(context.cacheDir, "stamp-photo-${System.currentTimeMillis()}.jpg")
          FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.JPEG, 92, it) }
          post { onPhotoCaptured(mapOf("uri" to "file://${file.absolutePath}", "requestId" to id)) }
        } catch (e: Throwable) {
          post { onCaptureError(mapOf("message" to (e.message ?: "photo failed"), "requestId" to id)) }
        }
      }

      override fun onError(exc: ImageCaptureException) {
        post { onCaptureError(mapOf("message" to (exc.message ?: "photo failed"), "requestId" to id)) }
      }
    })
  }

  private fun startRecording() {
    val video = videoCapture ?: return
    val file = File(context.cacheDir, "stamp-video-${System.currentTimeMillis()}.mp4")
    val opts = FileOutputOptions.Builder(file).build()
    val audioGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED

    var pending = video.output.prepareRecording(context, opts)
    if (audioGranted) pending = pending.withAudioEnabled()
    isRecording = true
    activeRecording = pending.start(mainExecutor) { event ->
      if (event is VideoRecordEvent.Finalize) {
        isRecording = false
        activeRecording = null
        if (event.hasError()) {
          onCaptureError(mapOf("message" to "recording error ${event.error}"))
        } else {
          onRecordingFinished(mapOf("uri" to "file://${file.absolutePath}"))
        }
      }
    }
  }

  private fun stopRecording() {
    runCatching { activeRecording?.stop() }
    isRecording = false
  }
}
