//! InferenceEngine on the desktop: llama.cpp in-process (llama-cpp-2), no HTTP server. One worker
//! thread owns the backend, the model and its context (llama contexts borrow the model, so the
//! model's lifetime is a lexical scope of that thread). Same contract as `LlamaEngine` on mobile:
//! the JSON schema from `@skepi/core` is compiled to a GBNF grammar by llama.cpp's own converter
//! (the one llama.rn uses), the KV cache of the previous request is reused for the longest common
//! token prefix (the fixed system prompt), streaming tokens, abort. GPU offload through Vulkan when
//! a device is present; a failed GPU load falls back to the CPU and says why.

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{LlamaChatMessage, LlamaChatTemplate, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use llama_cpp_2::token::LlamaToken;
use llama_cpp_2::{LlamaBackendDeviceType, json_schema_to_grammar, list_llama_ggml_backend_devices};
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::time::Instant;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadOptions {
    pub context_size: u32,
    pub threads: i32,
    pub use_mmap: bool,
    pub use_mlock: bool,
    pub gpu_layers: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedModel {
    pub model_id: String,
    pub context_size: u32,
    pub load_ms: u64,
    pub description: String,
    pub gpu: bool,
    pub devices: Vec<String>,
    pub reason_no_gpu: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub messages: Vec<ChatMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
    #[serde(default)]
    pub stop: Vec<String>,
    pub json_schema: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub text: String,
    pub prompt_tokens: u32,
    pub cached_prompt_tokens: u32,
    pub generated_tokens: u32,
    pub time_to_first_token_ms: Option<u64>,
    pub tokens_per_second: Option<f64>,
    pub stop_reason: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuDevice {
    /// ggml backend device index (`LlamaModelParams::with_devices`).
    pub index: usize,
    pub name: String,
    pub description: String,
    pub backend: String,
    pub vram_mb: u64,
    pub integrated: bool,
}

pub type TokenSink = Box<dyn FnMut(&str) + Send>;
pub type ProgressSink = Box<dyn FnMut(f32) + Send>;

enum Cmd {
    Load { model_id: String, path: PathBuf, opts: LoadOptions, progress: Option<ProgressSink>, reply: Sender<Result<LoadedModel, String>> },
    Generate { req: GenerateRequest, on_token: TokenSink, abort: Arc<AtomicBool>, reply: Sender<Result<GenerateResult, String>> },
    Unload { reply: Sender<()> },
}

/// Handle to the inference worker (cheap to clone).
#[derive(Clone)]
pub struct Inference {
    tx: Sender<Cmd>,
    current: Arc<std::sync::Mutex<Option<LoadedModel>>>,
}

impl Inference {
    pub fn start() -> Result<Self, String> {
        let (tx, rx) = channel::<Cmd>();
        let current = Arc::new(std::sync::Mutex::new(None));
        let cur = current.clone();
        let (ready_tx, ready_rx) = channel::<Result<(), String>>();
        std::thread::Builder::new()
            .name("skepi-inference".into())
            .spawn(move || worker(rx, cur, ready_tx))
            .map_err(|e| e.to_string())?;
        ready_rx.recv().map_err(|e| e.to_string())??;
        Ok(Self { tx, current })
    }

    pub fn current(&self) -> Option<LoadedModel> {
        self.current.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    /// Blocking: call from a blocking task.
    pub fn load(&self, model_id: String, path: PathBuf, opts: LoadOptions, progress: Option<ProgressSink>) -> Result<LoadedModel, String> {
        let (reply, rx) = channel();
        self.tx.send(Cmd::Load { model_id, path, opts, progress, reply }).map_err(|_| "inference worker stopped".to_string())?;
        rx.recv().map_err(|_| "inference worker stopped".to_string())?
    }

    /// Blocking: call from a blocking task. `abort` stops generation (stop reason "abort").
    pub fn generate(&self, req: GenerateRequest, on_token: TokenSink, abort: Arc<AtomicBool>) -> Result<GenerateResult, String> {
        let (reply, rx) = channel();
        self.tx.send(Cmd::Generate { req, on_token, abort, reply }).map_err(|_| "inference worker stopped".to_string())?;
        rx.recv().map_err(|_| "inference worker stopped".to_string())?
    }

    pub fn unload(&self) {
        let (reply, rx) = channel();
        if self.tx.send(Cmd::Unload { reply }).is_ok() {
            let _ = rx.recv();
        }
    }
}

/// The device to offload to: the discrete GPU with the most memory, else an integrated one.
pub fn best_gpu() -> Option<GpuDevice> {
    let mut all = gpu_devices();
    all.sort_by_key(|d| (d.integrated, std::cmp::Reverse(d.vram_mb)));
    all.into_iter().next()
}

/// GPUs llama.cpp can offload to (Vulkan devices on Windows), for desktop tier detection.
pub fn gpu_devices() -> Vec<GpuDevice> {
    list_llama_ggml_backend_devices()
        .into_iter()
        .filter(|d| matches!(d.device_type, LlamaBackendDeviceType::Gpu | LlamaBackendDeviceType::IntegratedGpu))
        .map(|d| GpuDevice {
            index: d.index,
            integrated: matches!(d.device_type, LlamaBackendDeviceType::IntegratedGpu),
            name: d.name,
            description: d.description,
            backend: d.backend,
            vram_mb: (d.memory_total / (1024 * 1024)) as u64,
        })
        .collect()
}

fn worker(rx: Receiver<Cmd>, current: Arc<std::sync::Mutex<Option<LoadedModel>>>, ready: Sender<Result<(), String>>) {
    let mut backend = match LlamaBackend::init() {
        Ok(b) => b,
        Err(e) => {
            let _ = ready.send(Err(format!("llama backend: {e}")));
            return;
        }
    };
    backend.void_logs();
    let _ = ready.send(Ok(()));
    let mut pending: Option<Cmd> = None;
    loop {
        let cmd = match pending.take() {
            Some(c) => c,
            None => match rx.recv() {
                Ok(c) => c,
                Err(_) => return,
            },
        };
        match cmd {
            Cmd::Unload { reply } => {
                *current.lock().unwrap_or_else(|p| p.into_inner()) = None;
                let _ = reply.send(());
            }
            Cmd::Generate { reply, .. } => {
                let _ = reply.send(Err("model not loaded".into()));
            }
            Cmd::Load { model_id, path, opts, progress, reply } => {
                let start = Instant::now();
                let (model, gpu, reason) = match load_model(&backend, &path, &opts, progress) {
                    Ok(v) => v,
                    Err(e) => {
                        let _ = reply.send(Err(e));
                        continue;
                    }
                };
                let threads = opts.threads.max(1);
                let ctx_params = LlamaContextParams::default()
                    .with_n_ctx(NonZeroU32::new(opts.context_size.max(512)))
                    .with_n_batch(512)
                    .with_n_threads(threads)
                    .with_n_threads_batch(threads);
                let mut ctx = match model.new_context(&backend, ctx_params) {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = reply.send(Err(format!("context: {e}")));
                        continue;
                    }
                };
                let template = model.chat_template(None).ok();
                let devices: Vec<String> = if gpu { best_gpu().into_iter().map(|d| d.description).collect() } else { Vec::new() };
                let loaded = LoadedModel {
                    model_id: model_id.clone(),
                    context_size: ctx.n_ctx(),
                    load_ms: start.elapsed().as_millis() as u64,
                    description: format!("{} params, {} layers", model.n_params(), model.n_layer()),
                    gpu,
                    devices,
                    reason_no_gpu: reason,
                };
                *current.lock().unwrap_or_else(|p| p.into_inner()) = Some(loaded.clone());
                let _ = reply.send(Ok(loaded));
                // Tokens currently in the KV cache (sequence 0), for prefix reuse.
                let mut cached: Vec<LlamaToken> = Vec::new();
                loop {
                    let Ok(cmd) = rx.recv() else { return };
                    match cmd {
                        Cmd::Generate { req, on_token, abort, reply } => {
                            let r = generate(&model, &mut ctx, template.as_ref(), &mut cached, &req, on_token, &abort);
                            let _ = reply.send(r);
                        }
                        other => {
                            pending = Some(other);
                            break;
                        }
                    }
                }
                *current.lock().unwrap_or_else(|p| p.into_inner()) = None;
                // ctx and model drop here, before the next load.
            }
        }
    }
}

fn load_model(backend: &LlamaBackend, path: &std::path::Path, opts: &LoadOptions, progress: Option<ProgressSink>) -> Result<(LlamaModel, bool, String), String> {
    let gpu = best_gpu();
    let want_gpu = opts.gpu_layers > 0 && gpu.is_some();
    let params = |layers: u32, progress: Option<ProgressSink>| -> Result<LlamaModelParams, String> {
        let base = LlamaModelParams::default().with_n_gpu_layers(layers).with_use_mmap(opts.use_mmap).with_use_mlock(opts.use_mlock);
        // One device only: splitting layers between a discrete GPU and the iGPU is slower than either.
        let p = match (&gpu, layers > 0) {
            (Some(g), true) => base.with_devices(&[g.index]).map_err(|e| format!("device: {e}"))?,
            _ => base,
        };
        Ok(match progress {
            Some(mut sink) => p.with_progress_callback(move |f| {
                sink(f);
                true
            }),
            None => p,
        })
    };
    if want_gpu {
        match LlamaModel::load_from_file(backend, path, &params(opts.gpu_layers, progress)?) {
            Ok(m) => return Ok((m, true, String::new())),
            Err(e) => {
                let reason = format!("GPU load failed ({e}); running on the CPU");
                let m = LlamaModel::load_from_file(backend, path, &params(0, None)?).map_err(|e| format!("model: {e}"))?;
                return Ok((m, false, reason));
            }
        }
    }
    let reason = if opts.gpu_layers == 0 { "CPU selected".to_string() } else { "no GPU device found".to_string() };
    let m = LlamaModel::load_from_file(backend, path, &params(0, progress)?).map_err(|e| format!("model: {e}"))?;
    Ok((m, false, reason))
}

fn render_prompt(model: &LlamaModel, template: Option<&LlamaChatTemplate>, messages: &[ChatMessage]) -> Result<String, String> {
    let chat: Vec<LlamaChatMessage> = messages.iter().map(|m| LlamaChatMessage::new(m.role.clone(), m.content.clone())).collect::<Result<_, _>>().map_err(|e| e.to_string())?;
    let fallback;
    let tmpl = match template {
        Some(t) => t,
        None => {
            fallback = LlamaChatTemplate::new("chatml").map_err(|e| e.to_string())?;
            &fallback
        }
    };
    // add_ass = true: the prompt ends with the assistant header (llama.rn add_generation_prompt).
    model.apply_chat_template(tmpl, &chat, true).map_err(|e| e.to_string())
}

fn generate(
    model: &LlamaModel,
    ctx: &mut llama_cpp_2::context::LlamaContext<'_>,
    template: Option<&LlamaChatTemplate>,
    cached: &mut Vec<LlamaToken>,
    req: &GenerateRequest,
    mut on_token: TokenSink,
    abort: &AtomicBool,
) -> Result<GenerateResult, String> {
    let start = Instant::now();
    let prompt = render_prompt(model, template, &req.messages)?;
    let vocab = model.vocab();
    let tokens = vocab.tokenize(prompt.as_bytes(), vocab.should_add_bos(), true);
    let n_ctx = ctx.n_ctx() as usize;
    if tokens.len() + req.max_tokens as usize > n_ctx {
        return Err(format!("prompt of {} tokens + {} new tokens exceeds the context ({n_ctx})", tokens.len(), req.max_tokens));
    }
    // Longest common prefix with the KV cache; at least one token is decoded for fresh logits.
    let mut keep = cached.iter().zip(&tokens).take_while(|(a, b)| a == b).count();
    if keep == tokens.len() {
        keep -= 1;
    }
    ctx.kv_cache_seq_rm(0, Some(keep as u32), None).map_err(|e| e.to_string())?;
    cached.truncate(keep);
    let n_batch = ctx.n_batch() as usize;
    let mut batch = LlamaBatch::new(n_batch.max(1), 1);
    let mut pos = keep;
    while pos < tokens.len() {
        batch.clear();
        let end = (pos + n_batch).min(tokens.len());
        for (i, t) in tokens[pos..end].iter().enumerate() {
            let p = pos + i;
            batch.add(*t, p as i32, &[0], p == tokens.len() - 1).map_err(|e| e.to_string())?;
        }
        ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;
        cached.extend_from_slice(&tokens[pos..end]);
        pos = end;
        if abort.load(Ordering::Relaxed) {
            return Ok(GenerateResult { text: String::new(), prompt_tokens: tokens.len() as u32, cached_prompt_tokens: keep as u32, generated_tokens: 0, time_to_first_token_ms: None, tokens_per_second: None, stop_reason: "abort" });
        }
    }

    let mut chain = Vec::new();
    if let Some(schema) = &req.json_schema {
        let grammar = json_schema_to_grammar(&schema.to_string()).map_err(|e| format!("grammar: {e}"))?;
        chain.push(LlamaSampler::grammar(model, &grammar, "root").map_err(|e| format!("grammar: {e}"))?);
    }
    chain.extend([LlamaSampler::top_k(40), LlamaSampler::top_p(0.95, 1), LlamaSampler::min_p(0.05, 1), LlamaSampler::temp(req.temperature)]);
    chain.push(if req.temperature <= 0.0 { LlamaSampler::greedy() } else { LlamaSampler::dist(0x5EED) });
    let mut sampler = LlamaSampler::chain_simple(chain);

    let mut text = String::new();
    let mut pending_bytes: Vec<u8> = Vec::new();
    let mut generated = 0u32;
    let mut first: Option<Instant> = None;
    let mut stop_reason = "limit";
    let mut logits_index = batch.n_tokens() - 1;
    while generated < req.max_tokens {
        if abort.load(Ordering::Relaxed) {
            stop_reason = "abort";
            break;
        }
        // llama_sampler_sample also accepts the token (grammar state advances).
        let token = sampler.sample(ctx, logits_index);
        if vocab.is_eog(token) {
            stop_reason = "eos";
            break;
        }
        first.get_or_insert_with(Instant::now);
        generated += 1;
        pending_bytes.extend(vocab.token_to_piece(token, false, None));
        let valid = match std::str::from_utf8(&pending_bytes) {
            Ok(s) => s.len(),
            Err(e) => e.valid_up_to(),
        };
        if valid > 0 {
            let piece = String::from_utf8_lossy(&pending_bytes[..valid]).into_owned();
            pending_bytes.drain(..valid);
            text.push_str(&piece);
            on_token(&piece);
        }
        if req.stop.iter().any(|s| !s.is_empty() && text.ends_with(s.as_str())) {
            stop_reason = "stop";
            break;
        }
        batch.clear();
        batch.add(token, cached.len() as i32, &[0], true).map_err(|e| e.to_string())?;
        ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;
        cached.push(token);
        logits_index = 0;
    }
    let gen_secs = first.map(|f| f.elapsed().as_secs_f64()).unwrap_or(0.0);
    Ok(GenerateResult {
        text,
        prompt_tokens: tokens.len() as u32,
        cached_prompt_tokens: keep as u32,
        generated_tokens: generated,
        time_to_first_token_ms: first.map(|f| f.duration_since(start).as_millis() as u64),
        tokens_per_second: (gen_secs > 0.0 && generated > 1).then(|| f64::from(generated - 1) / gen_secs),
        stop_reason,
    })
}
