//! WebView2 settings that Tauri/wry do not expose (docs/threat-model.md, "WebView2 runtime egress").
//! The browser arguments (`commands::BROWSER_ARGS`) switch off the runtime's background services;
//! this turns off SmartScreen reputation checking for each webview through the WebView2 API
//! (`ICoreWebView2Settings8::IsReputationCheckingRequired`), so no navigation or download is ever
//! looked up with Microsoft. The app's pages are local, so nothing is lost.

/// Applies the settings to one webview; called from `Builder::on_page_load` for every navigation of
/// every webview (main window and article viewer), so no webview is missed. Failures are logged and
/// ignored: an older WebView2 Runtime without the interface keeps the browser-argument protections.
pub fn harden<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    let label = webview.label().to_string();
    let result = webview.with_webview(move |platform| {
        #[cfg(windows)]
        // SAFETY: COM calls on the controller tauri hands out, on the thread that owns the webview.
        match unsafe { windows_impl::apply(&platform.controller()) } {
            Ok(()) if cfg!(debug_assertions) => eprintln!("[skepi] WebView2 reputation checking off for '{label}'"),
            Ok(()) => {}
            Err(e) => eprintln!("[skepi] WebView2 settings for '{label}' not applied: {e}"),
        }
        #[cfg(not(windows))]
        let _ = (platform, &label);
    });
    if let Err(e) = result {
        eprintln!("[skepi] WebView2 handle unavailable: {e}");
    }
}

#[cfg(windows)]
mod windows_impl {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Controller, ICoreWebView2Settings8};
    use windows_core::Interface;

    pub unsafe fn apply(controller: &ICoreWebView2Controller) -> windows_core::Result<()> {
        // SAFETY: plain COM getters/setters on live interfaces (see `harden`).
        unsafe {
            let settings = controller.CoreWebView2()?.Settings()?;
            settings.cast::<ICoreWebView2Settings8>()?.SetIsReputationCheckingRequired(false)
        }
    }
}
