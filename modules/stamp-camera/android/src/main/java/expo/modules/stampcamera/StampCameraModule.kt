package expo.modules.stampcamera

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StampCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StampCamera")

    View(StampCameraView::class) {
      Events("onRecordingFinished", "onPhotoCaptured", "onCaptureError", "onCameraReady")

      Prop("facing") { view: StampCameraView, value: String ->
        view.setFacing(value)
      }
      Prop("overlayUri") { view: StampCameraView, value: String? ->
        view.setOverlayUri(value)
      }
      Prop("recording") { view: StampCameraView, value: Boolean ->
        view.setRecording(value)
      }
      Prop("photoRequestId") { view: StampCameraView, value: Int ->
        view.requestPhoto(value)
      }
    }
  }
}
