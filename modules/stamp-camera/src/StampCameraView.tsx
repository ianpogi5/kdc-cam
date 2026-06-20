import { requireNativeView } from 'expo';
import { ViewProps } from 'react-native';

export type RecordingFinishedEvent = { nativeEvent: { uri: string } };
export type PhotoCapturedEvent = { nativeEvent: { uri: string; requestId: number } };
export type CaptureErrorEvent = { nativeEvent: { message: string; requestId?: number } };

export interface StampCameraViewProps extends ViewProps {
  /** Which camera to use. */
  facing?: 'back' | 'front';
  /** file:// URI of the transparent stamp PNG to burn into captures. */
  overlayUri?: string | null;
  /** Toggle to start (true) / stop (false) video recording. */
  recording?: boolean;
  /** Bump to a new value to capture a photo. */
  photoRequestId?: number;

  onRecordingFinished?: (e: RecordingFinishedEvent) => void;
  onPhotoCaptured?: (e: PhotoCapturedEvent) => void;
  onCaptureError?: (e: CaptureErrorEvent) => void;
  onCameraReady?: (e: { nativeEvent: Record<string, never> }) => void;
}

const StampCameraView = requireNativeView<StampCameraViewProps>('StampCamera');

export default StampCameraView;
