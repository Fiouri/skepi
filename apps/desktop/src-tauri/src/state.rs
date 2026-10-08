//! Process-wide state of the desktop app: app.db, the content store, open archives, places packs, the
//! inference worker, downloads in flight and Station mode.

use desktop_core::content::{ContentStore, EmbeddedCatalog};
use desktop_core::db::AppDb;
use desktop_core::download::Http;
use desktop_core::inference::Inference;
use desktop_core::places::Places;
use desktop_core::station::Station;
use desktop_core::zim::ZimRegistry;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

#[cfg(debug_assertions)]
mod embedded {
    pub const CATALOG: &[u8] = include_bytes!("../../../../catalog/embedded/debug/catalog.json");
    pub const SIGNATURE: &str = include_str!("../../../../catalog/embedded/debug/catalog.json.sig");
    pub const KEYS: &str = include_str!("../../../../catalog/keys/test.json");
    pub const SOURCES: Option<&str> = Some(include_str!("../../../../catalog/sources/debug.json"));
}

#[cfg(not(debug_assertions))]
mod embedded {
    pub const CATALOG: &[u8] = include_bytes!("../../../../catalog/embedded/release/catalog.json");
    pub const SIGNATURE: &str = include_str!("../../../../catalog/embedded/release/catalog.json.sig");
    pub const KEYS: &str = include_str!("../../../../catalog/keys/release.json");
    pub const SOURCES: Option<&str> = None;
}

pub fn embedded_catalog() -> EmbeddedCatalog {
    let update_urls = embedded::SOURCES
        .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
        .and_then(|v| v.get("updateUrls").and_then(|u| u.as_array()).cloned())
        .map(|a| a.iter().filter_map(|u| u.as_str()).filter(|u| u.starts_with("https://")).map(str::to_owned).collect())
        .unwrap_or_default();
    EmbeddedCatalog {
        catalog: embedded::CATALOG.to_vec(),
        signature: embedded::SIGNATURE.to_owned(),
        pinned_keys: embedded::KEYS.to_owned(),
        update_urls,
    }
}

pub struct AppState {
    pub store: Arc<ContentStore>,
    pub zim: Arc<ZimRegistry>,
    pub places: Places,
    pub http: Http,
    inference: OnceLock<Inference>,
    pub abort: Mutex<Arc<AtomicBool>>,
    pub downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub station: Station,
    pub apk: Mutex<Option<PathBuf>>,
    pub viewer_dark: AtomicBool,
}

impl AppState {
    pub fn open(app_data: &Path, default_root: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(app_data).map_err(|e| e.to_string())?;
        let key = desktop_core::keystore::load_or_create(&app_data.join("db.key")).map_err(|e| format!("app.db key: {e}"))?;
        let db = Arc::new(AppDb::open(&app_data.join("app.db"), &key, desktop_core::content::now_ms()).map_err(|e| e.to_string())?);
        // Content folder: SKEPI_CONTENT_ROOT (portable/E2E), the folder the user chose, or the default.
        let root = std::env::var_os("SKEPI_CONTENT_ROOT")
            .map(PathBuf::from)
            .or_else(|| {
                db.get_setting("desktop.contentRoot").ok().flatten().and_then(|v| v.as_str().map(PathBuf::from)).filter(|p| p.is_dir())
            })
            .unwrap_or_else(|| default_root.to_path_buf());
        let store = Arc::new(ContentStore::new(db, app_data.to_path_buf(), root, embedded_catalog()).map_err(|e| e.to_string())?);
        let zim = Arc::new(ZimRegistry::new());
        zim.set_roots(vec![store.root()]);
        Ok(Self {
            store,
            zim,
            places: Places::default(),
            http: Http::new().map_err(|e| e.to_string())?,
            inference: OnceLock::new(),
            abort: Mutex::new(Arc::new(AtomicBool::new(false))),
            downloads: Mutex::new(HashMap::new()),
            station: Station::default(),
            apk: Mutex::new(None),
            viewer_dark: AtomicBool::new(false),
        })
    }

    /// The llama.cpp worker, started on the first AI request (the library works without it).
    pub fn inference(&self) -> Result<&Inference, String> {
        if let Some(i) = self.inference.get() {
            return Ok(i);
        }
        let started = Inference::start()?;
        Ok(self.inference.get_or_init(|| started))
    }

    pub fn new_abort(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        *self.abort.lock().unwrap_or_else(|p| p.into_inner()) = flag.clone();
        flag
    }

    pub fn abort_generation(&self) {
        self.abort.lock().unwrap_or_else(|p| p.into_inner()).store(true, Ordering::Relaxed);
    }
}
