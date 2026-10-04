import type { DeviceProfile, DeviceSnapshot } from '@skepi/contracts';
import ExpoDeviceProfile from './ExpoDeviceProfileModule';

/** DeviceProfile adapter over the ExpoDeviceProfile native module (Android). */
export function createDeviceProfile(): DeviceProfile {
  return {
    snapshot(): Promise<DeviceSnapshot> {
      return ExpoDeviceProfile.getSnapshot();
    },
  };
}
