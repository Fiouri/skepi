//! llama.cpp through the worker on the tiny eval model (Qwen2.5-0.5B Q4_0, scripts/content.lock.json
//! `evalTinyModel`): JSON-schema constrained output, KV prefix reuse, abort, GPU offload with a
//! Vulkan device. Needs the model file, so it runs explicitly:
//!   cargo test -p desktop-core --test inference -- --ignored

use desktop_core::inference::{ChatMessage, GenerateRequest, Inference, LoadOptions, gpu_devices};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

fn tiny_model() -> PathBuf {
    let dir = std::env::var_os("SKEPI_CACHE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("LOCALAPPDATA").expect("LOCALAPPDATA")).join("skepi").join("cache"));
    let p = dir.join("qwen2.5-0.5b-instruct-q4_0.gguf");
    assert!(p.is_file(), "missing {} (scripts/provision.ps1 -DownloadOnly)", p.display());
    p
}

fn schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "covered": { "type": "boolean" },
            "sentences": { "type": "array", "minItems": 1, "maxItems": 2, "items": {
                "type": "object",
                "properties": { "text": { "type": "string", "maxLength": 120 }, "source": { "type": "string", "enum": ["S1"] } },
                "required": ["text", "source"], "additionalProperties": false } }
        },
        "required": ["covered", "sentences"], "additionalProperties": false
    })
}

fn request(question: &str) -> GenerateRequest {
    GenerateRequest {
        messages: vec![
            ChatMessage { role: "system".into(), content: "Answer only from the sources. Reply in JSON.".into() },
            ChatMessage {
                role: "user".into(),
                content: format!("<source id=\"S1\" title=\"Canberra\">Canberra is the capital city of Australia.</source>\n{question}"),
            },
        ],
        max_tokens: 120,
        temperature: 0.2,
        stop: Vec::new(),
        json_schema: Some(schema()),
    }
}

#[test]
#[ignore = "needs the tiny eval GGUF in the cache; run with --ignored"]
fn json_answers_prefix_reuse_abort_and_gpu() {
    let engine = Inference::start().expect("worker");
    let gpus = gpu_devices();
    let loaded = engine
        .load(
            "qwen2.5-0.5b-instruct-q4_0.gguf".into(),
            tiny_model(),
            LoadOptions { context_size: 2048, threads: 4, use_mmap: true, use_mlock: false, gpu_layers: 99 },
            None,
        )
        .expect("load");
    eprintln!("loaded: {loaded:?}; devices: {gpus:?}");
    assert_eq!(loaded.gpu, !gpus.is_empty(), "{}", loaded.reason_no_gpu);

    let mut streamed = String::new();
    let tokens = Arc::new(std::sync::Mutex::new(String::new()));
    let t2 = tokens.clone();
    let first = engine
        .generate(
            request("What is the capital of Australia?"),
            Box::new(move |t| t2.lock().expect("lock").push_str(t)),
            Arc::new(AtomicBool::new(false)),
        )
        .expect("generate");
    streamed.push_str(&tokens.lock().expect("lock"));
    let v: serde_json::Value = serde_json::from_str(&first.text).unwrap_or_else(|e| panic!("not JSON ({e}): {}", first.text));
    assert!(v["sentences"].as_array().is_some_and(|s| !s.is_empty()));
    assert_eq!(streamed, first.text, "streamed tokens equal the final text");
    assert_eq!(first.stop_reason, "eos");

    let second =
        engine.generate(request("Which city is the capital?"), Box::new(|_| {}), Arc::new(AtomicBool::new(false))).expect("second");
    assert!(second.cached_prompt_tokens > 10, "system prompt prefix reused: {}", second.cached_prompt_tokens);

    let abort = Arc::new(AtomicBool::new(false));
    let a2 = abort.clone();
    let stopped =
        engine.generate(request("Tell me about Canberra."), Box::new(move |_| a2.store(true, Ordering::Relaxed)), abort).expect("abort");
    assert_eq!(stopped.stop_reason, "abort");
    engine.unload();
    assert!(engine.current().is_none());
}
