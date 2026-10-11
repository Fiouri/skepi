//! The app.db key (architecture: "256-bit random key per install"), protected with Windows DPAPI for
//! the current user (`CryptProtectData`, no UI). Only the encrypted blob is written to disk; another
//! Windows user, or the file copied to another machine, cannot unprotect it.
//! macOS (Phase 3b-0): the key itself is a generic password in the user's login Keychain; the file on
//! disk holds only the item's random account name, so the file alone reveals nothing.

use std::io;
use std::path::Path;

pub const KEY_LEN: usize = 32;
/// Extra entropy bound into the blob (not secret; it scopes the blob to this purpose).
const ENTROPY: &[u8] = b"SKEPI app.db key v1";

/// Reads and unprotects the key at `path`, or creates, protects and writes a new one (first start).
pub fn load_or_create(path: &Path) -> io::Result<[u8; KEY_LEN]> {
    if path.exists() {
        let blob = std::fs::read(path)?;
        let key = unprotect(&blob)?;
        return key.try_into().map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "app.db key has the wrong length"));
    }
    let mut key = [0u8; KEY_LEN];
    getrandom::fill(&mut key).map_err(|e| io::Error::other(e.to_string()))?;
    let blob = protect(&key)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &blob)?;
    std::fs::rename(&tmp, path)?;
    Ok(key)
}

#[cfg(windows)]
fn blob_in(data: &[u8]) -> windows::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
    windows::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
}

#[cfg(windows)]
fn take_blob(out: windows::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB) -> Vec<u8> {
    use windows::Win32::Foundation::{HLOCAL, LocalFree};
    // SAFETY: DPAPI returned a LocalAlloc'd buffer of cbData bytes; it is copied, then freed once.
    unsafe {
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out.pbData.cast())));
        v
    }
}

#[cfg(windows)]
pub fn protect(data: &[u8]) -> io::Result<Vec<u8>> {
    use windows::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData};
    let input = blob_in(data);
    let entropy = blob_in(ENTROPY);
    let mut out = CRYPT_INTEGER_BLOB::default();
    // SAFETY: input/entropy point to live slices for the duration of the call; out is written by DPAPI.
    unsafe { CryptProtectData(&input, windows::core::w!("SKEPI"), Some(&entropy), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out) }
        .map_err(|e| io::Error::other(format!("CryptProtectData: {e}")))?;
    Ok(take_blob(out))
}

#[cfg(windows)]
pub fn unprotect(blob: &[u8]) -> io::Result<Vec<u8>> {
    use windows::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData};
    let input = blob_in(blob);
    let entropy = blob_in(ENTROPY);
    let mut out = CRYPT_INTEGER_BLOB::default();
    // SAFETY: as in `protect`.
    unsafe { CryptUnprotectData(&input, None, Some(&entropy), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out) }
        .map_err(|e| io::Error::new(io::ErrorKind::PermissionDenied, format!("CryptUnprotectData: {e}")))?;
    Ok(take_blob(out))
}

#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "org.skepi.desktop.app-db-key";
#[cfg(target_os = "macos")]
const KEYCHAIN_REF_PREFIX: &[u8] = b"SKEPI keychain v1:";

#[cfg(target_os = "macos")]
pub fn protect(data: &[u8]) -> io::Result<Vec<u8>> {
    let mut id = [0u8; 16];
    getrandom::fill(&mut id).map_err(|e| io::Error::other(e.to_string()))?;
    let account: String = id.iter().map(|b| format!("{b:02x}")).collect();
    security_framework::passwords::set_generic_password(KEYCHAIN_SERVICE, &account, data)
        .map_err(|e| io::Error::other(format!("Keychain: {e}")))?;
    let mut reference = KEYCHAIN_REF_PREFIX.to_vec();
    reference.extend_from_slice(account.as_bytes());
    Ok(reference)
}

#[cfg(target_os = "macos")]
fn keychain_account(reference: &[u8]) -> io::Result<&str> {
    reference
        .strip_prefix(KEYCHAIN_REF_PREFIX)
        .filter(|a| a.len() == 32 && a.iter().all(u8::is_ascii_hexdigit))
        .and_then(|a| std::str::from_utf8(a).ok())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "not a SKEPI Keychain reference"))
}

#[cfg(target_os = "macos")]
pub fn unprotect(blob: &[u8]) -> io::Result<Vec<u8>> {
    let account = keychain_account(blob)?;
    security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, account)
        .map_err(|e| io::Error::new(io::ErrorKind::PermissionDenied, format!("Keychain: {e}")))
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn protect(_data: &[u8]) -> io::Result<Vec<u8>> {
    Err(io::Error::new(io::ErrorKind::Unsupported, "no key protection on this platform (Windows: DPAPI, macOS: Keychain)"))
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn unprotect(_blob: &[u8]) -> io::Result<Vec<u8>> {
    Err(io::Error::new(io::ErrorKind::Unsupported, "no key protection on this platform (Windows: DPAPI, macOS: Keychain)"))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_tamper_detection() {
        let blob = protect(b"secret key bytes").expect("protect");
        assert!(!blob.windows(16).any(|w| w == b"secret key bytes"));
        assert_eq!(unprotect(&blob).expect("unprotect"), b"secret key bytes");
        let mut bad = blob.clone();
        let last = bad.len() - 1;
        bad[last] ^= 0xff;
        assert!(unprotect(&bad).is_err());
    }

    #[test]
    fn creates_once_then_reuses_the_key() {
        let dir = tempfile::tempdir().expect("tmp");
        let path = dir.path().join("db.key");
        let a = load_or_create(&path).expect("create");
        let b = load_or_create(&path).expect("load");
        assert_eq!(a, b);
        assert_ne!(std::fs::read(&path).expect("read"), a.to_vec());
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    /// Removes the Keychain item a test created (the CI runner's login Keychain is shared).
    fn forget(reference: &[u8]) {
        if let Ok(account) = keychain_account(reference) {
            let _ = security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE, account);
        }
    }

    #[test]
    fn round_trip_and_wrong_reference() {
        let reference = protect(b"secret key bytes").expect("protect");
        assert!(!reference.windows(16).any(|w| w == b"secret key bytes"));
        assert_eq!(unprotect(&reference).expect("unprotect"), b"secret key bytes");
        let mut other = reference.clone();
        let last = other.len() - 1;
        other[last] = if other[last] == b'0' { b'1' } else { b'0' };
        assert!(unprotect(&other).is_err());
        assert!(unprotect(b"SKEPI keychain v1:../../etc").is_err());
        forget(&reference);
        assert!(unprotect(&reference).is_err());
    }

    #[test]
    fn creates_once_then_reuses_the_key() {
        let dir = tempfile::tempdir().expect("tmp");
        let path = dir.path().join("db.key");
        let a = load_or_create(&path).expect("create");
        let b = load_or_create(&path).expect("load");
        assert_eq!(a, b);
        let on_disk = std::fs::read(&path).expect("read");
        assert!(!on_disk.windows(KEY_LEN).any(|w| w == a));
        forget(&on_disk);
    }
}
