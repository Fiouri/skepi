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
  /** Ground speed, m/s (null when the receiver gives none). */
  speedMps: number | null;
  /** Course over ground, degrees from true north (null when unknown). */
  bearingDeg: number | null;
  timeMs: number;
  ageMs: number;
  provider: string;
}

type ToolsEvents = {
  onHeading: (event: HeadingEvent) => void;
  onGnssStatus: (event: GnssStatusEvent) => void;
  onTorchError: (event: { message: string }) => void;
  /** Continuous fixes while startLocationUpdates runs (map tab in front only). */
  onLocation: (event: GnssFix) => void;
};

declare class ExpoEmergencyToolsNativeModule extends NativeModule<ToolsEvents> {
  torchAvailable(): boolean;
  setTorch(on: boolean): Promise<void>;
  startMorse(durations: number[], loop: boolean): void;
  stopMorse(): void;
  compassAvailable(): boolean;
  /** `minIntervalMs`: at most one onHeading per interval (default 200 ms). */
  startCompass(minIntervalMs?: number): void;
  stopCompass(): void;
  declination(latitude: number, longitude: number, altitudeM: number): number;
  locationPermissionGranted(): boolean;
  gpsEnabled(): boolean;
  getFix(timeoutMs: number, maxAgeMs: number): Promise<GnssFix>;
  cancelFix(): void;
  /** Continuous GNSS fixes (onLocation) every `intervalMs`, foreground only; GPS provider / CoreLocation. */
  startLocationUpdates(intervalMs: number): void;
  stopLocationUpdates(): void;
  setScreenBrightness(value: number | null): void;
}

export default requireNativeModule<ExpoEmergencyToolsNativeModule>('ExpoEmergencyTools');
