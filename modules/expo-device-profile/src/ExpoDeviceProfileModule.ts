import { NativeModule, requireNativeModule } from 'expo';
import type { DeviceSnapshot } from '@skepi/contracts';
import type { BatteryInfo, CpuInfo, DeviceInfo, MemoryInfo } from './ExpoDeviceProfile.types';

declare class ExpoDeviceProfileNativeModule extends NativeModule {
  getSnapshot(): Promise<DeviceSnapshot>;
  getMemoryInfo(): Promise<MemoryInfo>;
  getCpuInfo(): Promise<CpuInfo>;
  getDeviceInfo(): Promise<DeviceInfo>;
  getBattery(): Promise<BatteryInfo>;
}

export default requireNativeModule<ExpoDeviceProfileNativeModule>('ExpoDeviceProfile');
