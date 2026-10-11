//! DeviceProfile on Windows: RAM, free disk, battery (laptops; desktops report mains power), CPU
//! topology (performance cores from the efficiency class of each core, so inference threads match
//! the P-cores of hybrid CPUs). Thermal state is not exposed to user mode on Windows: "nominal".
//! macOS (Phase 3b-0): RAM and performance cores from sysctl, free disk from statvfs; battery and
//! thermal state are not read yet (mains power, "nominal").

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSnapshot {
    pub total_ram_mb: u64,
    pub free_ram_mb: u64,
    pub free_disk_mb: u64,
    pub battery_pct: f64,
    pub charging: bool,
    pub thermal: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub cores: u32,
    pub performance_cores: u32,
    pub performance_core_ids: Vec<u32>,
}

#[cfg(windows)]
pub fn memory_mb() -> (u64, u64) {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut m = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    // SAFETY: m is a properly sized MEMORYSTATUSEX with dwLength set.
    if unsafe { GlobalMemoryStatusEx(&mut m) }.is_err() {
        return (0, 0);
    }
    (m.ullTotalPhys / (1024 * 1024), m.ullAvailPhys / (1024 * 1024))
}

#[cfg(windows)]
pub fn free_disk_bytes(path: &Path) -> Option<u64> {
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::HSTRING;
    let mut free = 0u64;
    let dir = if path.is_dir() { path.to_path_buf() } else { path.parent()?.to_path_buf() };
    // SAFETY: the out pointer is a live u64; the path is a valid wide string.
    unsafe { GetDiskFreeSpaceExW(&HSTRING::from(dir.as_os_str()), Some(&mut free), None, None) }.ok()?;
    Some(free)
}

#[cfg(windows)]
fn battery() -> (f64, bool) {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    // SAFETY: s is a live SYSTEM_POWER_STATUS.
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() {
        return (100.0, true);
    }
    // 255 = unknown / no battery: a desktop on mains power.
    let pct = if s.BatteryLifePercent == 255 { 100.0 } else { f64::from(s.BatteryLifePercent) };
    (pct, s.ACLineStatus == 1 || s.BatteryFlag == 128)
}

#[cfg(windows)]
pub fn cpu_info() -> CpuInfo {
    use windows::Win32::System::SystemInformation::{
        GetLogicalProcessorInformationEx, RelationProcessorCore, SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX,
    };
    let logical = std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(1);
    let mut len = 0u32;
    // SAFETY: first call with no buffer only reports the needed length.
    let _ = unsafe { GetLogicalProcessorInformationEx(RelationProcessorCore, None, &mut len) };
    let mut buf = vec![0u8; len as usize];
    // SAFETY: buf has `len` bytes as requested by the first call.
    if len == 0 || unsafe { GetLogicalProcessorInformationEx(RelationProcessorCore, Some(buf.as_mut_ptr().cast()), &mut len) }.is_err() {
        return CpuInfo { cores: logical, performance_cores: logical.div_ceil(2).max(1), performance_core_ids: Vec::new() };
    }
    // One record per physical core: (efficiency class, first logical processor id).
    let mut cores: Vec<(u8, u32)> = Vec::new();
    let mut offset = 0usize;
    while offset < len as usize {
        // SAFETY: records are variable-sized and self-describing (Size); offset stays within buf.
        let rec = unsafe { &*(buf.as_ptr().add(offset) as *const SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX) };
        if rec.Size == 0 {
            break;
        }
        if rec.Relationship == RelationProcessorCore {
            // SAFETY: Relationship says the union holds a PROCESSOR_RELATIONSHIP.
            let p = unsafe { &rec.Anonymous.Processor };
            let mask = p.GroupMask[0].Mask as u64;
            let first = mask.trailing_zeros();
            cores.push((p.EfficiencyClass, u32::from(p.GroupMask[0].Group) * 64 + first));
        }
        offset += rec.Size as usize;
    }
    let best = cores.iter().map(|c| c.0).max().unwrap_or(0);
    let mut ids: Vec<u32> = cores.iter().filter(|c| c.0 == best).map(|c| c.1).collect();
    ids.sort_unstable();
    CpuInfo { cores: logical, performance_cores: ids.len().max(1) as u32, performance_core_ids: ids }
}

#[cfg(target_os = "macos")]
fn sysctl_u64(name: &str) -> Option<u64> {
    let cname = std::ffi::CString::new(name).ok()?;
    let mut buf = [0u8; 8];
    let mut len: libc::size_t = buf.len();
    // SAFETY: buf is a live 8-byte buffer and len holds its size; sysctl writes at most len bytes.
    let rc = unsafe { libc::sysctlbyname(cname.as_ptr(), buf.as_mut_ptr().cast(), &mut len, std::ptr::null_mut(), 0) };
    match (rc, len) {
        (0, 8) => Some(u64::from_ne_bytes(buf)),
        (0, 4) => Some(u64::from(u32::from_ne_bytes([buf[0], buf[1], buf[2], buf[3]]))),
        _ => None,
    }
}

/// Total RAM (`hw.memsize`) and available RAM: total × `kern.memorystatus_level` (the kernel's percentage
/// of memory available before pressure, the figure Activity Monitor's memory pressure is based on).
#[cfg(target_os = "macos")]
pub fn memory_mb() -> (u64, u64) {
    let Some(total) = sysctl_u64("hw.memsize") else { return (0, 0) };
    let level = sysctl_u64("kern.memorystatus_level").unwrap_or(0).min(100);
    (total / (1024 * 1024), total / 100 * level / (1024 * 1024))
}

#[cfg(target_os = "macos")]
pub fn free_disk_bytes(path: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let dir = if path.is_dir() { path.to_path_buf() } else { path.parent()?.to_path_buf() };
    let c = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    let mut st = std::mem::MaybeUninit::<libc::statvfs>::zeroed();
    // SAFETY: c is a NUL-terminated path; st is a writable statvfs.
    if unsafe { libc::statvfs(c.as_ptr(), st.as_mut_ptr()) } != 0 {
        return None;
    }
    // SAFETY: statvfs returned 0, so st is initialised.
    let st = unsafe { st.assume_init() };
    Some(u64::from(st.f_bavail) * st.f_frsize)
}

#[cfg(target_os = "macos")]
fn battery() -> (f64, bool) {
    (100.0, true)
}

/// Apple silicon: `hw.perflevel0.*` is the performance cluster (P-cores); Intel Macs have one level.
#[cfg(target_os = "macos")]
pub fn cpu_info() -> CpuInfo {
    let logical = std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(1);
    let levels = sysctl_u64("hw.nperflevels").unwrap_or(1);
    let performance = if levels > 1 { sysctl_u64("hw.perflevel0.logicalcpu").map(|n| n as u32) } else { None };
    let performance_cores = performance.unwrap_or(logical).clamp(1, logical);
    CpuInfo { cores: logical, performance_cores, performance_core_ids: Vec::new() }
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn memory_mb() -> (u64, u64) {
    (0, 0)
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn free_disk_bytes(_path: &Path) -> Option<u64> {
    None
}

#[cfg(not(any(windows, target_os = "macos")))]
fn battery() -> (f64, bool) {
    (100.0, true)
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn cpu_info() -> CpuInfo {
    let n = std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(1);
    CpuInfo { cores: n, performance_cores: n, performance_core_ids: Vec::new() }
}

pub fn snapshot(content_root: &Path) -> DeviceSnapshot {
    let (total, free) = memory_mb();
    let (pct, charging) = battery();
    DeviceSnapshot {
        total_ram_mb: total,
        free_ram_mb: free,
        free_disk_mb: free_disk_bytes(content_root).unwrap_or(0) / (1024 * 1024),
        battery_pct: pct,
        charging,
        thermal: "nominal",
    }
}

#[cfg(all(test, any(windows, target_os = "macos")))]
mod tests {
    use super::*;

    #[test]
    fn reports_plausible_values() {
        let (total, free) = memory_mb();
        assert!(total > 1024 && free <= total);
        let cpu = cpu_info();
        assert!(cpu.performance_cores >= 1 && cpu.performance_cores <= cpu.cores);
        assert!(free_disk_bytes(Path::new(env!("CARGO_MANIFEST_DIR"))).is_some_and(|b| b > 0));
        let s = snapshot(Path::new(env!("CARGO_MANIFEST_DIR")));
        assert!(s.battery_pct > 0.0 && s.battery_pct <= 100.0);
    }
}
