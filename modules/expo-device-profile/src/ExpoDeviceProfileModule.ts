import { NativeModule, requireNativeModule } from 'expo';
import type { DeviceSnapshot } from '@skepi/contracts';
import type { CpuInfo, DeviceInfo, MemoryInfo } from './ExpoDeviceProfile.types';

declare class ExpoDeviceProfileNativeModule extends NativeModule {
  getSnapshot(): Promise<DeviceSnapshot>;
  getMemoryInfo(): Promise<MemoryInfo>;
  getCpuInfo(): Promise<CpuInfo>;
  getDeviceInfo(): Promise<DeviceInfo>;
}

export default requireNativeModule<ExpoDeviceProfileNativeModule>('ExpoDeviceProfile');
