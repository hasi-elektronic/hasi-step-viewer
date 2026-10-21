#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Das Plugin muss zuerst stehen: ein zweiter Start (Doppelklick) reicht die Argumente hierher und beendet sich.
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            fenster_vorholen(app);
            if let Some(pfad) = step_aus_args(&argv) {
                datei_an_fenster(app, &pfad);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(KernZustand(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![save_text, save_bytes, kern_verfuegbar, kern_laden, kern_laden_pfad, datei_lesen, kern_brep, start_pfad])
        .setup(|app| {
            ziehereignis(app.handle());
            #[cfg(target_os = "macos")]
            mac_menu(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Fehler beim Starten von Hasi 3D");
    app.run(|app, event| match event {
        tauri::RunEvent::Ready => {
            if let Some(pfad) = step_aus_args(&std::env::args().collect::<Vec<_>>()) {
                datei_an_fenster(app, &pfad);
            }
        }
        // macOS: Finder übergibt die Datei per Apple-Event, nicht als Kommandozeile.
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Opened { urls } => {
            if let Some(pfad) = urls.into_iter().find_map(|url| {
                url.to_file_path().ok().filter(|p| ist_step(p) && p.is_file())
            }) {
                datei_an_fenster(app, &pfad.to_string_lossy());
            }
        }
        _ => {}
    });
}

// ---------- Nativer Kern (Sidecar hasi-kern, OCCT dynamisch gelinkt) ----------
/// Letzter Lauf: Ordner mit modell.bin/modell.brep. Der Kern schreibt modell.brep (für das Messen) erst nach modell.bin;
/// `ende` meldet, wenn der Prozess fertig ist. Ein Lauf aus dem Zwischenspeicher wird nie gelöscht.
struct Lauf {
    ordner: std::path::PathBuf,
    ende: Option<std::sync::mpsc::Receiver<Result<(), String>>>,
    aus_speicher: bool,
    speicher_ziel: Option<std::path::PathBuf>,
}
struct KernZustand(std::sync::Mutex<Option<Lauf>>);

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

fn lauf_aufraeumen(lauf: Lauf) {
    if lauf.aus_speicher {
        return;
    }
    // Läuft der Kern noch (modell.brep), erst nach seinem Ende löschen
    if let Some(rx) = lauf.ende {
        let ordner = lauf.ordner;
        std::thread::spawn(move || {
            let _ = rx.recv();
            let _ = std::fs::remove_dir_all(&ordner);
        });
    } else {
        let _ = std::fs::remove_dir_all(&lauf.ordner);
    }
}

fn kern_ordner(zustand: &tauri::State<'_, KernZustand>) -> Result<std::path::PathBuf, String> {
    let ordner = std::env::temp_dir().join(format!("hasi-kern-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    std::fs::create_dir_all(&ordner).map_err(|e| format!("Temporärer Ordner: {e}"))?;
    if let Some(alt) = zustand.0.lock().unwrap().take() {
        lauf_aufraeumen(alt);
    }
    Ok(ordner)
}

fn kern_befehl(app: &tauri::AppHandle, prog: &std::path::Path, ein: &std::path::Path, ordner: &std::path::Path) -> std::process::Command {
    let mut cmd = std::process::Command::new(prog);
    cmd.arg(ein).arg(ordner);
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
    cmd.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    cmd
}

/// Zerlegt eine Fortschrittszeile des Kerns („STUFE heilen 3/20“) in Name, k, n.
fn stufe_lesen(zeile: &str) -> Option<(String, i64, i64)> {
    let mut teile = zeile.strip_prefix("STUFE ")?.split_whitespace();
    let name = teile.next()?.to_string();
    let (k, n) = teile.next().and_then(|t| t.split_once('/')).and_then(|(a, b)| Some((a.parse::<i64>().ok()?, b.parse::<i64>().ok()?))).unwrap_or((-1, -1));
    Some((name, k, n))
}

fn stufe_melden(app: &tauri::AppHandle, zeile: &str) {
    use tauri::Manager;
    let Some((name, k, n)) = stufe_lesen(zeile) else { return };
    if let Some(fenster) = app.get_webview_window("main") {
        let _ = fenster.eval(&format!("window.__kernStufe&&window.__kernStufe({},{k},{n})", js_string(&name)));
    }
}

enum Meldung {
    Bin,
    Ende(Result<(), String>),
}

async fn kern_auswerten(app: tauri::AppHandle, mut cmd: std::process::Command, ein: std::path::PathBuf, ordner: std::path::PathBuf, loesche_eingabe: bool, speicher_ziel: Option<std::path::PathBuf>, zustand: tauri::State<'_, KernZustand>) -> Result<tauri::ipc::Response, String> {
    let mut kind = cmd.spawn().map_err(|e| format!("Nativer Kern konnte nicht gestartet werden: {e}"))?;
    let stdout = kind.stdout.take();
    let stderr = kind.stderr.take();
    let (tx, rx) = std::sync::mpsc::channel::<Meldung>();
    let (tx_ende, rx_ende) = std::sync::mpsc::channel::<Result<(), String>>();
    let app2 = app.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, Read};
        let fehlertext = std::thread::spawn(move || {
            let mut t = String::new();
            if let Some(mut e) = stderr {
                let _ = e.read_to_string(&mut t);
            }
            t
        });
        if let Some(out) = stdout {
            for zeile in std::io::BufReader::new(out).lines().map_while(Result::ok) {
                if zeile.starts_with("STUFE ") {
                    stufe_melden(&app2, &zeile);
                } else if zeile.starts_with("BIN") {
                    let _ = tx.send(Meldung::Bin);
                }
            }
        }
        let status = kind.wait();
        let text = fehlertext.join().unwrap_or_default();
        if loesche_eingabe {
            let _ = std::fs::remove_file(&ein);
        }
        let erg = match status {
            Ok(s) if s.success() => Ok(()),
            Ok(_) => Err(format!("Nativer Kern: {}", text.lines().find(|l| l.starts_with("FEHLER")).unwrap_or("Abbruch"))),
            Err(e) => Err(format!("Nativer Kern: {e}")),
        };
        let _ = tx.send(Meldung::Ende(erg.clone()));
        let _ = tx_ende.send(erg);
    });
    // Warten, bis modell.bin fertig ist (Zeile BIN) oder der Kern endet
    let erste = tauri::async_runtime::spawn_blocking(move || rx.recv()).await.map_err(|e| e.to_string())?.map_err(|_| "Nativer Kern: keine Antwort".to_string())?;
    let mut ende = Some(rx_ende);
    if let Meldung::Ende(erg) = erste {
        if let Err(e) = erg {
            let _ = std::fs::remove_dir_all(&ordner);
            return Err(e);
        }
        ende = None; // Prozess ist schon fertig
    }
    let bin = std::fs::read(ordner.join("modell.bin")).map_err(|e| format!("Ergebnis fehlt: {e}"))?;
    *zustand.0.lock().unwrap() = Some(Lauf { ordner, ende, aus_speicher: false, speicher_ziel });
    Ok(tauri::ipc::Response::new(bin))
}

// ---------- Zwischenspeicher: dieselbe, unveränderte Datei öffnet beim zweiten Mal sofort ----------
const SPEICHER_MAX: usize = 4;
fn speicher_wurzel() -> std::path::PathBuf {
    std::env::temp_dir().join("hasi-kern-speicher")
}
fn speicher_schluessel(ein: &std::path::Path, prog: &std::path::Path) -> Option<String> {
    use std::hash::{Hash, Hasher};
    let m = std::fs::metadata(ein).ok()?;
    let k = std::fs::metadata(prog).ok()?;
    let zeit = |t: std::io::Result<std::time::SystemTime>| t.ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_nanos()).unwrap_or(0);
    let mut h = std::collections::hash_map::DefaultHasher::new();
    std::fs::canonicalize(ein).unwrap_or_else(|_| ein.to_path_buf()).hash(&mut h);
    m.len().hash(&mut h);
    zeit(m.modified()).hash(&mut h);
    k.len().hash(&mut h);
    zeit(k.modified()).hash(&mut h);
    env!("CARGO_PKG_VERSION").hash(&mut h);
    Some(format!("{:016x}", h.finish()))
}
fn speicher_aufraeumen(wurzel: &std::path::Path, max: usize) {
    let Ok(rd) = std::fs::read_dir(wurzel) else { return };
    let mut e: Vec<(std::time::SystemTime, std::path::PathBuf)> = rd
        .filter_map(|d| d.ok())
        .filter(|d| d.path().is_dir())
        .map(|d| (std::fs::metadata(d.path().join("fertig")).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), d.path()))
        .collect();
    e.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in e.into_iter().skip(max) {
        let _ = std::fs::remove_dir_all(p);
    }
}

/// Lädt eine STEP-Datei (Rohdaten im Body) mit dem nativen Kern und liefert modell.bin als Binärantwort.
#[tauri::command]
async fn kern_laden(app: tauri::AppHandle, request: tauri::ipc::Request<'_>, zustand: tauri::State<'_, KernZustand>) -> Result<tauri::ipc::Response, String> {
    let tauri::ipc::InvokeBody::Raw(daten) = request.body() else {
        return Err("Nativer Kern: keine Dateidaten erhalten".into());
    };
    let prog = kern_programm().ok_or("Nativer Kern nicht vorhanden")?;
    let ordner = kern_ordner(&zustand)?;
    let ein = ordner.join("ein.step");
    std::fs::write(&ein, daten).map_err(|e| format!("Temporäre Datei: {e}"))?;
    let cmd = kern_befehl(&app, &prog, &ein, &ordner);
    kern_auswerten(app, cmd, ein, ordner, true, None, zustand).await
}

/// Lädt eine STEP-Datei über ihren Pfad. Die Originaldatei bleibt liegen, der Kern schreibt nur in einen temporären Ordner.
/// Ein Ergebnis für dieselbe, unveränderte Datei kommt aus dem Zwischenspeicher.
#[tauri::command]
async fn kern_laden_pfad(app: tauri::AppHandle, pfad: String, zustand: tauri::State<'_, KernZustand>) -> Result<tauri::ipc::Response, String> {
    let ein = std::path::PathBuf::from(&pfad);
    if !ist_step(&ein) {
        return Err("Nur STEP-Dateien (.step, .stp)".into());
    }
    if !ein.is_file() {
        return Err(format!("Datei nicht gefunden: {}", ein.display()));
    }
    let prog = kern_programm().ok_or("Nativer Kern nicht vorhanden")?;
    let ziel = if std::env::var("HASI_KERN_SPEICHER").map(|v| v == "aus").unwrap_or(false) { None } else { speicher_schluessel(&ein, &prog).map(|k| speicher_wurzel().join(k)) };
    if let Some(z) = &ziel {
        if z.join("fertig").is_file() && z.join("modell.brep").is_file() {
            if let Ok(bin) = std::fs::read(z.join("modell.bin")) {
                if let Some(alt) = zustand.0.lock().unwrap().take() {
                    lauf_aufraeumen(alt);
                }
                let _ = std::fs::write(z.join("fertig"), b"1"); // Änderungszeit = zuletzt benutzt
                *zustand.0.lock().unwrap() = Some(Lauf { ordner: z.clone(), ende: None, aus_speicher: true, speicher_ziel: None });
                return Ok(tauri::ipc::Response::new(bin));
            }
        }
    }
    let ordner = kern_ordner(&zustand)?;
    let cmd = kern_befehl(&app, &prog, &ein, &ordner);
    kern_auswerten(app, cmd, ein, ordner, false, ziel, zustand).await
}

/// Liest die Rohbytes einer STEP-Datei (für Einheiten und den WASM-Rückfall). Andere Endungen werden abgelehnt.
#[tauri::command]
fn datei_lesen(pfad: String) -> Result<tauri::ipc::Response, String> {
    let ein = std::path::PathBuf::from(&pfad);
    if !ist_step(&ein) {
        return Err("Nur STEP-Dateien (.step, .stp)".into());
    }
    if !ein.is_file() {
        return Err(format!("Datei nicht gefunden: {}", ein.display()));
    }
    let daten = std::fs::read(&ein).map_err(|e| format!("Datei konnte nicht gelesen werden: {e}"))?;
    Ok(tauri::ipc::Response::new(daten))
}

/// Liefert die Unikate des letzten Laufs als BREP-Text (für das Messen im WASM-Kern). Wartet, bis der Kern fertig ist,
/// legt das Ergebnis in den Zwischenspeicher oder räumt auf.
#[tauri::command]
async fn kern_brep(zustand: tauri::State<'_, KernZustand>) -> Result<String, String> {
    let lauf = zustand.0.lock().unwrap().take().ok_or("Kein Lauf des nativen Kerns vorhanden")?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(rx) = &lauf.ende {
            if let Ok(Err(e)) = rx.recv() {
                let _ = std::fs::remove_dir_all(&lauf.ordner);
                return Err(e);
            }
        }
        let text = std::fs::read_to_string(lauf.ordner.join("modell.brep")).map_err(|e| format!("Messdaten fehlen: {e}"));
        if lauf.aus_speicher {
            return text;
        }
        let mut abgelegt = false;
        if let (Ok(_), Some(ziel)) = (&text, &lauf.speicher_ziel) {
            let _ = std::fs::create_dir_all(speicher_wurzel());
            let _ = std::fs::remove_dir_all(ziel);
            if std::fs::rename(&lauf.ordner, ziel).is_ok() {
                abgelegt = std::fs::write(ziel.join("fertig"), b"1").is_ok();
                speicher_aufraeumen(&speicher_wurzel(), SPEICHER_MAX);
            }
        }
        if !abgelegt {
            let _ = std::fs::remove_dir_all(&lauf.ordner);
        }
        text
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Pfad aus einem zweiten Start, solange die Oberfläche ihn noch nicht abgeholt hat.
static START_PFAD: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

fn ist_step(pfad: &std::path::Path) -> bool {
    pfad.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("step") || e.eq_ignore_ascii_case("stp"))
        .unwrap_or(false)
}

fn prozent_decodieren(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut aus = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(wert) = u8::from_str_radix(&text[i + 1..i + 3], 16) {
                aus.push(wert);
                i += 3;
                continue;
            }
        }
        aus.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&aus).into_owned()
}

fn datei_url(arg: &str) -> Option<std::path::PathBuf> {
    let rest = arg.strip_prefix("file://")?;
    let rest = prozent_decodieren(rest);
    #[cfg(windows)]
    {
        Some(std::path::PathBuf::from(rest.trim_start_matches('/')))
    }
    #[cfg(not(windows))]
    {
        if rest.starts_with('/') {
            Some(std::path::PathBuf::from(rest))
        } else {
            Some(std::path::PathBuf::from(format!("/{rest}")))
        }
    }
}

fn pfad_aus_argument(arg: &str) -> Option<std::path::PathBuf> {
    let arg = arg.trim().trim_matches('"');
    if arg.is_empty() || arg.starts_with('-') {
        return None;
    }
    let kandidat = if arg.starts_with("file:") { datei_url(arg)? } else { std::path::PathBuf::from(arg) };
    (ist_step(&kandidat) && kandidat.is_file()).then_some(kandidat)
}

fn step_aus_args(args: &[String]) -> Option<String> {
    args.iter().skip(1).find_map(|arg| pfad_aus_argument(arg).map(|p| p.to_string_lossy().into_owned()))
}

fn js_string(text: &str) -> String {
    let mut aus = String::from("\"");
    for c in text.chars() {
        match c {
            '\\' => aus.push_str("\\\\"),
            '"' => aus.push_str("\\\""),
            '\n' => aus.push_str("\\n"),
            '\r' => aus.push_str("\\r"),
            c if c.is_control() => aus.push_str(&format!("\\u{:04x}", c as u32)),
            c => aus.push(c),
        }
    }
    aus.push('"');
    aus
}

fn fenster_vorholen(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(fenster) = app.get_webview_window("main") {
        let _ = fenster.unminimize();
        let _ = fenster.show();
        let _ = fenster.set_focus();
    }
}

fn datei_an_fenster(app: &tauri::AppHandle, pfad: &str) {
    use tauri::Manager;
    if let Ok(mut slot) = START_PFAD.lock() {
        *slot = Some(pfad.to_string());
    }
    if let Some(fenster) = app.get_webview_window("main") {
        let _ = fenster.eval(&format!("window.__oeffnePfad&&window.__oeffnePfad({})", js_string(pfad)));
    }
}

fn ziehinweis(app: &tauri::AppHandle, an: bool) {
    use tauri::Manager;
    if let Some(fenster) = app.get_webview_window("main") {
        let _ = fenster.eval(&format!("window.__dateiZiehen&&window.__dateiZiehen({})", if an { "true" } else { "false" }));
    }
}

fn status_setzen(app: &tauri::AppHandle, text: &str) {
    use tauri::Manager;
    if let Some(fenster) = app.get_webview_window("main") {
        let _ = fenster.eval(&format!("document.getElementById('status').textContent={}", js_string(text)));
    }
}

/// Natives Ziehen ins Webview (dragDropEnabled). HTML5-Drop kommt in der Desktop-App nicht an.
fn ziehereignis(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(fenster) = app.get_webview_window("main") else { return };
    let app = app.clone();
    fenster.on_webview_event(move |event| match event {
        tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Enter { paths, .. }) => {
            let zeigen = paths.is_empty() || paths.iter().any(|p| ist_step(p));
            ziehinweis(&app, zeigen);
        }
        tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
            ziehinweis(&app, false);
            if let Some(pfad) = paths.iter().find(|p| ist_step(p)) {
                datei_an_fenster(&app, &pfad.to_string_lossy());
            } else if !paths.is_empty() {
                status_setzen(&app, "Nur STEP-Dateien (.step, .stp)");
            }
        }
        tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Leave) => ziehinweis(&app, false),
        _ => {}
    });
}

/// Pfad, den der Start (Kommandozeile oder Apple-Event) gemerkt hat. Einmalig.
#[tauri::command]
fn start_pfad() -> Option<String> {
    START_PFAD.lock().ok().and_then(|mut slot| slot.take())
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
    let produkt = h.config().product_name.clone().unwrap_or_else(|| "Hasi 3D".into());
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

#[cfg(test)]
mod pruefen {
    use super::*;

    #[test]
    fn endung() {
        assert!(ist_step(std::path::Path::new("a.step")));
        assert!(ist_step(std::path::Path::new("a.STP")));
        assert!(ist_step(std::path::Path::new("teil.stp")));
        assert!(!ist_step(std::path::Path::new("a.iges")));
        assert!(!ist_step(std::path::Path::new("step")));
    }

    #[test]
    fn kern_stufe() {
        assert_eq!(stufe_lesen("STUFE heilen 3/20"), Some(("heilen".to_string(), 3, 20)));
        assert_eq!(stufe_lesen("STUFE lesen"), Some(("lesen".to_string(), -1, -1)));
        assert_eq!(stufe_lesen("BIN 512"), None);
    }

    #[test]
    fn speicher_begrenzt() {
        let wurzel = std::env::temp_dir().join(format!("hasi-speicher-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&wurzel);
        for i in 0..6 {
            let d = wurzel.join(format!("e{i}"));
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join("fertig"), b"1").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        speicher_aufraeumen(&wurzel, 4);
        let mut rest: Vec<String> = std::fs::read_dir(&wurzel).unwrap().map(|d| d.unwrap().file_name().to_string_lossy().into_owned()).collect();
        rest.sort();
        assert_eq!(rest, vec!["e2", "e3", "e4", "e5"]);
        let _ = std::fs::remove_dir_all(&wurzel);
    }

    #[test]
    fn speicher_schluessel_aendert_sich() {
        let dir = std::env::temp_dir().join(format!("hasi-schluessel-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("teil.step");
        let prog = dir.join("kern");
        std::fs::write(&prog, b"x").unwrap();
        std::fs::write(&f, b"ISO-10303-21;").unwrap();
        let a = speicher_schluessel(&f, &prog).unwrap();
        assert_eq!(a, speicher_schluessel(&f, &prog).unwrap());
        std::fs::write(&f, b"ISO-10303-21; geaendert").unwrap();
        assert_ne!(a, speicher_schluessel(&f, &prog).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn js_text() {
        assert_eq!(js_string("a\\b\"c"), "\"a\\\\b\\\"c\"");
    }

    #[test]
    fn argumente() {
        let dir = std::env::temp_dir().join(format!("hasi-oeffnen-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let datei = dir.join("teil datei.stp");
        std::fs::write(&datei, b"ISO-10303-21;").unwrap();
        let text = datei.to_string_lossy().replace('\\', "/");
        let url = if text.starts_with('/') {
            format!("file://{}", text.replace(' ', "%20"))
        } else {
            format!("file:///{}", text.replace(' ', "%20"))
        };
        let aus_pfad = step_aus_args(&["app".into(), "--dev".into(), "fehlt.step".into(), datei.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(std::path::PathBuf::from(&aus_pfad), datei);
        let aus_url = step_aus_args(&["app".into(), url]).unwrap();
        assert_eq!(std::path::PathBuf::from(&aus_url), datei);
        let txt = dir.join("notiz.txt");
        std::fs::write(&txt, b"x").unwrap();
        assert!(step_aus_args(&["app".into(), txt.to_string_lossy().into_owned()]).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
