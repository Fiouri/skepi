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

export interface DeviceInfo {
  manufacturer: string;
  model: string;
  device: string;
  soc: string;
  sdkInt: number;
  release: string;
}
