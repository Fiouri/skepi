//! Custom protocols. WebView2 serves a scheme `x` as `http://x.localhost/...`.
//! - `zim`: the sealed article viewer only (the `viewer` webview; anything else gets 403). Every
//!   response carries the viewer CSP (desktop_core::viewer).
//! - `maps`: PMTiles bytes with HTTP Range for MapLibre + pmtiles JS in the main window, from verified
//!   map packs only (by pack id; no path ever comes from the page).

use crate::state::AppState;
use desktop_core::catalog::PackKind;
use desktop_core::range::parse_range;
use desktop_core::viewer::{ViewerResponse, parse_path};
use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::Ordering;
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext};

pub const VIEWER_LABEL: &str = "viewer";
pub const MAIN_LABEL: &str = "main";

fn to_http(r: ViewerResponse) -> Response<Vec<u8>> {
    let mut b = Response::builder().status(r.status).header("Content-Type", r.content_type);
    for (k, v) in r.headers {
        b = b.header(k, v);
    }
    b.body(r.body).unwrap_or_else(|_| Response::new(Vec::new()))
}

pub fn zim<R: Runtime>(ctx: &UriSchemeContext<'_, R>, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if ctx.webview_label() != VIEWER_LABEL {
        return to_http(ViewerResponse::forbidden());
    }
    if request.method() != "GET" && request.method() != "HEAD" {
        return to_http(ViewerResponse::forbidden());
    }
    let Some(target) = parse_path(request.uri().path()) else { return to_http(ViewerResponse::forbidden()) };
    let state = ctx.app_handle().state::<AppState>();
    if !state.zim.is_open(&target.archive_id) {
        return to_http(ViewerResponse::forbidden());
    }
    match state.zim.read_item(&target.archive_id, &target.path) {
        Ok(item) => to_http(ViewerResponse::ok(&item.mime, item.data, state.viewer_dark.load(Ordering::Relaxed))),
        Err(_) => to_http(ViewerResponse::not_found()),
    }
}

fn plain(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder().status(status).header("Cache-Control", "no-store").body(Vec::new()).unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Only the app's own origins may read map bytes (dev server in debug builds).
fn allowed_origin(origin: Option<&str>) -> Option<String> {
    let o = origin?;
    let ok = o == "http://tauri.localhost" || o == "tauri://localhost" || (cfg!(debug_assertions) && o == "http://localhost:1420");
    ok.then(|| o.to_owned())
}

pub fn maps<R: Runtime>(ctx: &UriSchemeContext<'_, R>, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if ctx.webview_label() != MAIN_LABEL {
        return plain(StatusCode::FORBIDDEN);
    }
    let origin = allowed_origin(request.headers().get("origin").and_then(|v| v.to_str().ok()));
    let cors = |b: tauri::http::response::Builder| match &origin {
        Some(o) => b
            .header("Access-Control-Allow-Origin", o.as_str())
            .header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
            .header("Access-Control-Allow-Headers", "Range")
            .header("Vary", "Origin"),
        None => b,
    };
    if request.method() == "OPTIONS" {
        return cors(Response::builder().status(204)).body(Vec::new()).unwrap_or_else(|_| plain(StatusCode::NO_CONTENT));
    }
    if request.method() != "GET" {
        return plain(StatusCode::METHOD_NOT_ALLOWED);
    }
    let id = request.uri().path().trim_start_matches('/');
    let state = ctx.app_handle().state::<AppState>();
    let Ok(Some(pack)) = state.store.db.get_pack(id) else { return plain(StatusCode::NOT_FOUND) };
    if pack.kind != PackKind::Pmtiles || !pack.verified {
        return plain(StatusCode::NOT_FOUND);
    }
    let Ok(mut file) = std::fs::File::open(&pack.path) else { return plain(StatusCode::NOT_FOUND) };
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let header = request.headers().get("range").and_then(|v| v.to_str().ok());
    let Ok(range) = parse_range(header, size) else {
        return cors(Response::builder().status(416).header("Content-Range", format!("bytes */{size}")))
            .body(Vec::new())
            .unwrap_or_else(|_| plain(StatusCode::RANGE_NOT_SATISFIABLE));
    };
    // MapLibre reads directories and tiles; a whole-file read is never needed (cap at 16 MiB).
    let (start, end) = range.unwrap_or((0, size.saturating_sub(1).min(16 << 20)));
    let len = (end - start + 1) as usize;
    let mut body = vec![0u8; len];
    if file.seek(SeekFrom::Start(start)).and_then(|_| file.read_exact(&mut body)).is_err() {
        return plain(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let b = Response::builder()
        .status(206)
        .header("Content-Type", "application/octet-stream")
        .header("Content-Range", format!("bytes {start}-{end}/{size}"))
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "no-store");
    cors(b).body(body).unwrap_or_else(|_| plain(StatusCode::INTERNAL_SERVER_ERROR))
}
