#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppFaehigkeiten {
    version: u8,
    platform: &'static str,
    desktop_backend: bool,
    native_kernel: bool,
    native_documents: bool,
    native_save: bool,
    multiple_windows: bool,
}

/// Expliziter Host-Vertrag: ein Tauri-Webview ist nicht automatisch ein Desktop.
#[tauri::command]
pub fn app_faehigkeiten() -> AppFaehigkeiten {
    let desktop = !cfg!(any(target_os = "android", target_os = "ios"));
    AppFaehigkeiten {
        version: 1,
        platform: std::env::consts::OS,
        desktop_backend: desktop,
        native_kernel: desktop,
        native_documents: desktop,
        native_save: desktop,
        multiple_windows: desktop,
    }
}

