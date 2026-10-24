/// Mobiler Host für den gemeinsamen Renderer und den lokalen WASM-CAD-Kern.
/// Dateien werden durch den Webview-Dateiauswahldialog als File-Objekte gelesen.
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![crate::host::app_faehigkeiten])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Hasi 3D");
}
