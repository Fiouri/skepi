//! SKEPI desktop engines (Phase 3a, Windows), exposed to the UI only through the narrow Tauri
//! commands of apps/desktop/src-tauri, which implement the `@skepi/contracts` interfaces.
//!
//! - `zim` / `text` / `viewer`: KnowledgeEngine over libzim and the sealed `zim://` article viewer
//! - `inference`: llama.cpp in-process (Vulkan offload, CPU fallback)
//! - `content` / `download` / `catalog` / `hash`: ContentStore, signed catalog, the only internet code
//! - `db` / `keystore`: SQLCipher app.db with the shared migrations, key protected by DPAPI
//! - `places` / `range`: read-only places packs, PMTiles range reads
//! - `station`: Station mode, the P2P protocol of modules/expo-transfer as a LAN server
//! - `device`: DeviceProfile (RAM, disk, battery, P-cores)

pub mod catalog;
pub mod content;
pub mod db;
pub mod device;
pub mod download;
pub mod hash;
pub mod inference;
pub mod keystore;
pub mod places;
pub mod range;
pub mod station;
pub mod text;
pub mod viewer;
pub mod zim;

/// rustls needs one process-wide crypto provider (ring; no aws-lc build dependency).
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}
