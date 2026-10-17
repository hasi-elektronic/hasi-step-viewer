#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            mac_menu(_app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Hasi STEP-Betrachter");
}

/// Eigenes deutsches App-Menü, nur unter macOS. Windows bleibt ohne Menüleiste.
#[cfg(target_os = "macos")]
fn mac_menu(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
    use tauri::Manager;
    let h = app.handle();
    let app_menu = Submenu::with_items(h, "Hasi STEP-Betrachter", true, &[
        &PredefinedMenuItem::about(h, Some("Über Hasi STEP-Betrachter"), Some(AboutMetadata::default()))?,
        &PredefinedMenuItem::separator(h)?,
        &PredefinedMenuItem::hide(h, Some("Hasi STEP-Betrachter ausblenden"))?,
        &PredefinedMenuItem::hide_others(h, Some("Andere ausblenden"))?,
        &PredefinedMenuItem::show_all(h, Some("Alle einblenden"))?,
        &PredefinedMenuItem::separator(h)?,
        &PredefinedMenuItem::quit(h, Some("Hasi STEP-Betrachter beenden"))?,
    ])?;
    let ablage = Submenu::with_items(h, "Ablage", true, &[
        &MenuItem::with_id(h, "oeffnen", "Öffnen …", true, Some("CmdOrCtrl+O"))?,
        &PredefinedMenuItem::separator(h)?,
        &PredefinedMenuItem::close_window(h, Some("Fenster schließen"))?,
    ])?;
    let bearbeiten = Submenu::with_items(h, "Bearbeiten", true, &[
        &PredefinedMenuItem::undo(h, Some("Widerrufen"))?,
        &PredefinedMenuItem::redo(h, Some("Wiederholen"))?,
        &PredefinedMenuItem::separator(h)?,
        &PredefinedMenuItem::cut(h, Some("Ausschneiden"))?,
        &PredefinedMenuItem::copy(h, Some("Kopieren"))?,
        &PredefinedMenuItem::paste(h, Some("Einsetzen"))?,
        &PredefinedMenuItem::select_all(h, Some("Alles auswählen"))?,
    ])?;
    let fenster = Submenu::with_items(h, "Fenster", true, &[
        &PredefinedMenuItem::minimize(h, Some("Minimieren"))?,
        &PredefinedMenuItem::maximize(h, Some("Zoomen"))?,
        &PredefinedMenuItem::fullscreen(h, Some("Vollbild"))?,
    ])?;
    let menu = Menu::with_items(h, &[&app_menu, &ablage, &bearbeiten, &fenster])?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "oeffnen" {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.eval("document.getElementById('file').click()");
            }
        }
    });
    Ok(())
}
