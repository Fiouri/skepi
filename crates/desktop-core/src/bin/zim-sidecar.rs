//! The desktop knowledge engine (libzim through zim-ffi + `text::extract_sections`) behind the
//! JSON-lines protocol of tools/rag-eval/zim_sidecar.py, so `rag-eval parity --engine desktop` runs
//! `@skepi/core` probeRetrieval on exactly the code the Windows app uses (retrieval parity).
//!
//! Request:  {"id": 1, "op": "open" | "search" | "suggest" | "plainText" | "html" | "exists", ...}
//! Response: {"id": 1, "ok": true, "result": ...} or {"id": 1, "ok": false, "error": "..."}

use desktop_core::zim::{ZimRegistry, dunce_canonical};
use serde_json::{Value, json};
use std::io::{BufRead, Write};
use std::path::Path;

fn ids(v: &Value) -> Option<Vec<String>> {
    v.get("archiveIds").and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_owned)).collect())
}

fn str_arg<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v.get(key).and_then(Value::as_str).ok_or_else(|| format!("missing {key}"))
}

fn handle(reg: &ZimRegistry, req: &Value) -> Result<Value, String> {
    let op = str_arg(req, "op")?;
    let limit = req.get("limit").and_then(Value::as_u64).unwrap_or(8) as u32;
    match op {
        "open" => {
            let path = Path::new(str_arg(req, "path")?);
            // The eval opens files from its cache: that folder is the content root here.
            let canonical = dunce_canonical(path).ok_or_else(|| format!("not found: {}", path.display()))?;
            let mut roots = vec![canonical.parent().map(Path::to_path_buf).unwrap_or_default()];
            roots.extend(OPENED.with(|o| o.borrow().clone()));
            reg.set_roots(roots.clone());
            OPENED.with(|o| *o.borrow_mut() = roots);
            let a = reg.open(path).map_err(|e| e.to_string())?;
            Ok(json!({
                "archiveId": a.archive_id,
                "name": a.name,
                "title": a.title,
                "language": a.language,
                "articleCount": a.article_count,
                "hasFulltextIndex": a.has_fulltext_index,
                "sizeBytes": a.size_bytes,
            }))
        }
        "search" => {
            Ok(serde_json::to_value(reg.search(str_arg(req, "query")?, limit, ids(req).as_deref(), false).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?)
        }
        "suggest" => Ok(serde_json::to_value(reg.suggest(str_arg(req, "query")?, limit, ids(req).as_deref()).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?),
        "plainText" => {
            let t = reg.plain_text(str_arg(req, "archiveId")?, str_arg(req, "path")?).map_err(|e| e.to_string())?;
            Ok(json!({ "archiveId": t.archive_id, "path": t.path, "title": t.title, "sections": t.sections }))
        }
        "html" => Ok(serde_json::to_value(reg.article_html(str_arg(req, "archiveId")?, str_arg(req, "path")?).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?),
        "exists" => match reg.read_item(str_arg(req, "archiveId")?, str_arg(req, "path")?) {
            Ok(item) => Ok(json!({ "path": item.path, "title": item.title })),
            Err(_) => Ok(Value::Null),
        },
        other => Err(format!("unknown op: {other}")),
    }
}

thread_local! {
    static OPENED: std::cell::RefCell<Vec<std::path::PathBuf>> = const { std::cell::RefCell::new(Vec::new()) };
}

fn main() {
    let reg = ZimRegistry::new();
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let (id, reply) = match serde_json::from_str::<Value>(&line) {
            Ok(req) => {
                let id = req.get("id").cloned().unwrap_or(Value::Null);
                match handle(&reg, &req) {
                    Ok(result) => (id, json!({ "ok": true, "result": result })),
                    Err(e) => (id, json!({ "ok": false, "error": e })),
                }
            }
            Err(e) => (Value::Null, json!({ "ok": false, "error": e.to_string() })),
        };
        let mut msg = reply;
        msg["id"] = id;
        if writeln!(out, "{msg}").and_then(|()| out.flush()).is_err() {
            break;
        }
    }
}
