import { NativeModule, requireNativeModule } from 'expo';

export interface HeadingEvent {
  /** Degrees from magnetic north, 0–360. */
  heading: number;
  /** SensorManager accuracy: 0 unreliable, 1 low, 2 medium, 3 high. */
  accuracy: number;
}

export interface GnssStatusEvent {
  visible: number;
  used: number;
}

export interface GnssFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  altitudeM: number | null;
  timeMs: number;
  ageMs: number;
  provider: string;
}

type ToolsEvents = {
  onHeading: (event: HeadingEvent) => void;
  onGnssStatus: (event: GnssStatusEvent) => void;
  onTorchError: (event: { message: string }) => void;
};

declare class ExpoEmergencyToolsNativeModule extends NativeModule<ToolsEvents> {
  torchAvailable(): boolean;
  setTorch(on: boolean): Promise<void>;
  startMorse(durations: number[], loop: boolean): void;
  stopMorse(): void;
  compassAvailable(): boolean;
  startCompass(): void;
  stopCompass(): void;
  declination(latitude: number, longitude: number, altitudeM: number): number;
  locationPermissionGranted(): boolean;
  gpsEnabled(): boolean;
  getFix(timeoutMs: number, maxAgeMs: number): Promise<GnssFix>;
  cancelFix(): void;
  setScreenBrightness(value: number | null): void;
}

export default requireNativeModule<ExpoEmergencyToolsNativeModule>('ExpoEmergencyTools');
