import { NativeModule, requireNativeModule } from 'expo';
import type { DeviceSnapshot } from '@skepi/contracts';
import type { BatteryInfo, CpuInfo, DeviceInfo, EnergyMeterResult, MemoryInfo } from './ExpoDeviceProfile.types';

declare class ExpoDeviceProfileNativeModule extends NativeModule {
  getSnapshot(): Promise<DeviceSnapshot>;
  getMemoryInfo(): Promise<MemoryInfo>;
  getCpuInfo(): Promise<CpuInfo>;
  getDeviceInfo(): Promise<DeviceInfo>;
  getBattery(): Promise<BatteryInfo>;
  /** Starts sampling the battery current (every 200 ms) for one action; false when the device reports none. */
  startEnergyMeter(id: string): boolean;
  stopEnergyMeter(id: string): EnergyMeterResult | null;
}

export default requireNativeModule<ExpoDeviceProfileNativeModule>('ExpoDeviceProfile');
