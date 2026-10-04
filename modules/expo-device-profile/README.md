# expo-device-profile

Android (Kotlin) Expo module with the device probes used for tier selection, guards and the bench.

- `createDeviceProfile()` implements the `DeviceProfile` contract from `@skepi/contracts`:
  `snapshot()` → total/free RAM, free storage (app content dir), battery %, charging, thermal state.
- `ExpoDeviceProfile.getMemoryInfo()` (incl. this process's peak RSS), `getCpuInfo()` (performance-core
  cluster from `cpuinfo_max_freq`), `getDeviceInfo()` (model, SoC, SDK).

No permissions; nothing leaves the device.
