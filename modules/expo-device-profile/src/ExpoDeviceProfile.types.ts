export interface MemoryInfo {
  totalRamMb: number;
  availRamMb: number;
  lowMemory: boolean;
  thresholdMb: number;
  /** Peak resident set size of this process (VmHWM). */
  peakRssMb: number;
  rssMb: number;
  nativeHeapMb: number;
}

export interface CpuInfo {
  cores: number;
  /** Cores outside the lowest-frequency cluster (all cores when they share one max frequency). */
  performanceCores: number;
  performanceCoreIds: number[];
  maxFreqKhz: number[];
  abi: string;
}

export interface BatteryInfo {
  /** Battery level in percent (EXTRA_LEVEL / EXTRA_SCALE), null if unknown. */
  levelPct: number | null;
  /** Remaining charge in µAh (BATTERY_PROPERTY_CHARGE_COUNTER), null where the device does not report it. */
  chargeCounterUah: number | null;
  charging: boolean;
  /** The OS battery saver is on. */
  powerSave: boolean;
  timestampMs: number;
}

/** Charge used during one action, integrated from the battery current (BATTERY_PROPERTY_CURRENT_NOW). */
export interface EnergyMeterResult {
  durationMs: number;
  meanCurrentUa: number;
  chargeUah: number;
  samples: number;
}

export interface DeviceInfo {
  manufacturer: string;
  model: string;
  device: string;
  soc: string;
  sdkInt: number;
  release: string;
}
