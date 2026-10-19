#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(KernZustand(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![save_text, save_bytes, kern_verfuegbar, kern_laden, kern_brep])
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            mac_menu(_app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Hasi STEP-Betrachter");
}

// ---------- Nativer Kern (Sidecar hasi-kern, OCCT dynamisch gelinkt) ----------
/// Ordner des letzten Laufs (enthält modell.brep für das Nachladen der Messdaten).
struct KernZustand(std::sync::Mutex<Option<std::path::PathBuf>>);

fn kern_programm() -> Option<std::path::PathBuf> {
    if std::env::var("HASI_KERN").map(|v| v == "aus").unwrap_or(false) {
        return None;
    }
    let exe = std::env::current_exe().ok()?;
    let p = exe.parent()?.join(format!("hasi-kern{}", std::env::consts::EXE_SUFFIX));
    p.is_file().then_some(p)
}

/// Ist der native Kern mitgeliefert? Sonst lädt die App über den WASM-Kern.
#[tauri::command]
fn kern_verfuegbar() -> bool {
    kern_programm().is_some()
}

/// Lädt eine STEP-Datei (Rohdaten im Body) mit dem nativen Kern und liefert modell.bin als Binärantwort.
#[tauri::command]
async fn kern_laden(app: tauri::AppHandle, request: tauri::ipc::Request<'_>, zustand: tauri::State<'_, KernZustand>) -> Result<tauri::ipc::Response, String> {
    let tauri::ipc::InvokeBody::Raw(daten) = request.body() else {
        return Err("Nativer Kern: keine Dateidaten erhalten".into());
    };
    let prog = kern_programm().ok_or("Nativer Kern nicht vorhanden")?;
    let ordner = std::env::temp_dir().join(format!("hasi-kern-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    std::fs::create_dir_all(&ordner).map_err(|e| format!("Temporärer Ordner: {e}"))?;
    if let Some(alt) = zustand.0.lock().unwrap().take() {
        let _ = std::fs::remove_dir_all(alt);
    }
    let ein = ordner.join("ein.step");
    std::fs::write(&ein, daten).map_err(|e| format!("Temporäre Datei: {e}"))?;
    let mut cmd = std::process::Command::new(&prog);
    cmd.arg(&ein).arg(&ordner);
    // Windows: OCCT-DLLs liegen neben hasi-kern.exe und werden vom Lader dort gefunden.
    // macOS: @rpath/@loader_path zeigen auf Contents/Resources/kern.
    // Linux: LD_LIBRARY_PATH auf die Ressourcen unter kern/.
    {
        use tauri::Manager;
        let mut lib_dirs: Vec<std::path::PathBuf> = Vec::new();
        if let Some(neben) = prog.parent() {
            lib_dirs.push(neben.to_path_buf());
        }
        if let Ok(res) = app.path().resource_dir() {
            let kern = res.join("kern");
            if kern.is_dir() {
                lib_dirs.push(kern);
            }
            if res.is_dir() {
                lib_dirs.push(res);
            }
        }
        if !lib_dirs.is_empty() {
            let alt = std::env::var_os("PATH").unwrap_or_default();
            let mut pfade = lib_dirs.clone();
            pfade.extend(std::env::split_paths(&alt));
            if let Ok(neu) = std::env::join_paths(pfade) {
                cmd.env("PATH", neu);
            }
            #[cfg(target_os = "linux")]
            if let Some(kern) = lib_dirs.iter().find(|p| p.ends_with("kern")) {
                cmd.env("LD_LIBRARY_PATH", kern);
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // kein Konsolenfenster
    }
    let aus = tauri::async_runtime::spawn_blocking(move || cmd.output()).await.map_err(|e| e.to_string())?.map_err(|e| format!("Nativer Kern konnte nicht gestartet werden: {e}"))?;
    let _ = std::fs::remove_file(&ein);
    if !aus.status.success() {
        let _ = std::fs::remove_dir_all(&ordner);
        let meldung = String::from_utf8_lossy(&aus.stderr).lines().find(|l| l.starts_with("FEHLER")).unwrap_or("Abbruch").to_string();
        return Err(format!("Nativer Kern: {meldung}"));
    }
    let bin = std::fs::read(ordner.join("modell.bin")).map_err(|e| format!("Ergebnis fehlt: {e}"))?;
    *zustand.0.lock().unwrap() = Some(ordner);
    Ok(tauri::ipc::Response::new(bin))
}

/// Liefert die Unikate des letzten Laufs als BREP-Text (für das Messen im WASM-Kern) und räumt auf.
#[tauri::command]
async fn kern_brep(zustand: tauri::State<'_, KernZustand>) -> Result<String, String> {
    let ordner = zustand.0.lock().unwrap().take().ok_or("Kein Lauf des nativen Kerns vorhanden")?;
    let text = std::fs::read_to_string(ordner.join("modell.brep")).map_err(|e| format!("Messdaten fehlen: {e}"));
    let _ = std::fs::remove_dir_all(&ordner);
    text
}

/// Speichert Text (z. B. DXF-Abwicklung) über den Speichern-Dialog des Systems.
#[tauri::command]
async fn save_text(app: tauri::AppHandle, name: String, content: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let pfad = app
        .dialog()
        .file()
        .set_title("Abwicklung speichern")
        .set_file_name(&name)
        .add_filter("DXF-Zeichnung", &["dxf"])
        .blocking_save_file();
    match pfad {
        Some(p) => {
            let p = p.into_path().map_err(|e| format!("Ungültiger Pfad: {e}"))?;
            std::fs::write(&p, content).map_err(|e| format!("Datei konnte nicht geschrieben werden: {e}"))?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Speichert Binärdaten (Biegetabelle als PDF oder XLSX) über den Speichern-Dialog des Systems.
#[tauri::command]
async fn save_bytes(app: tauri::AppHandle, name: String, data: Vec<u8>, filter: String, ext: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let pfad = app
        .dialog()
        .file()
        .set_title("Datei speichern")
        .set_file_name(&name)
        .add_filter(&filter, &[ext.as_str()])
        .blocking_save_file();
    match pfad {
        Some(p) => {
            let p = p.into_path().map_err(|e| format!("Ungültiger Pfad: {e}"))?;
            std::fs::write(&p, data).map_err(|e| format!("Datei konnte nicht geschrieben werden: {e}"))?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Eigenes deutsches App-Menü, nur unter macOS. Windows bleibt ohne Menüleiste.
#[cfg(target_os = "macos")]
fn mac_menu(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
    use tauri::Manager;
    let h = app.handle();
    let produkt = h.config().product_name.clone().unwrap_or_else(|| "Hasi STEP-Betrachter".into());
    let sickinger = h.config().identifier.to_string().contains("sickinger");
    let meta = if sickinger {
        AboutMetadata {
            name: Some(produkt.clone()),
            copyright: Some("© 2026 Manfred Sickinger Apparatebau".into()),
            credits: Some("Entwickelt von Hasi Elektronic".into()),
            ..AboutMetadata::default()
        }
    } else {
        AboutMetadata::default()
    };
    let ueber = format!("Über {produkt}");
    let ausblenden = format!("{produkt} ausblenden");
    let beenden = format!("{produkt} beenden");
    let app_menu = Submenu::with_items(h, &produkt, true, &[
        &PredefinedMenuItem::about(h, Some(&ueber), Some(meta))?,
        &PredefinedMenuItem::separator(h)?,
        &PredefinedMenuItem::hide(h, Some(&ausblenden))?,
        &PredefinedMenuItem::hide_others(h, Some("Andere ausblenden"))?,
        &PredefinedMenuItem::show_all(h, Some("Alle einblenden"))?,
        &PredefinedMenuItem::separator(h)?,
        &PredefinedMenuItem::quit(h, Some(&beenden))?,
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
