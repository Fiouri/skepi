export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';

export interface DeviceSnapshot {
  totalRamMb: number;
  freeRamMb: number;
  freeDiskMb: number;
  batteryPct: number;
  charging: boolean;
  thermal: ThermalState;
}

export interface DeviceProfile {
  snapshot(): Promise<DeviceSnapshot>;
}
