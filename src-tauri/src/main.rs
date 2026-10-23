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
        .manage(KernZustand::default())
        .manage(ExportZustand::default())
        .invoke_handler(tauri::generate_handler![save_text, save_bytes, kern_verfuegbar, kern_laden, kern_laden_pfad, datei_lesen, kern_brep, start_pfad, step_export, step_export_abbrechen, ordner_waehlen, datei_ablegen, einzelteil_fenster])
        .setup(|app| {
            ziehereignis(app.handle(), "main");
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
        // Geschlossenes Fenster: seinen Lauf und den behaltenen modell.brep-Ordner aufräumen
        tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } => {
            use tauri::Manager;
            fenster_aufraeumen(&app.state::<KernZustand>(), &label);
        }
        tauri::RunEvent::Exit => {
            use tauri::Manager;
            alles_aufraeumen(&app.state::<KernZustand>(), &einzelteil_ordner());
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
/// Je Fenster (Hauptfenster und Einzelteil-Fenster) ein eigener Lauf und ein eigener Ort von modell.brep (für den STEP-Export).
#[derive(Default)]
struct KernZustand {
    laeufe: std::sync::Mutex<std::collections::HashMap<String, Lauf>>,
    brep: std::sync::Mutex<std::collections::HashMap<String, BrepOrt>>,
    /// Einzelteil-Fenster → seine temporäre STEP-Datei (aus „Als Einzelteil öffnen“)
    einzel: std::sync::Mutex<std::collections::HashMap<String, std::path::PathBuf>>,
}
/// modell.brep des angezeigten Modells; `eigen` = eigener Ordner (nicht im Zwischenspeicher), wird beim nächsten Laden gelöscht.
struct BrepOrt {
    pfad: std::path::PathBuf,
    eigen: Option<std::path::PathBuf>,
}
fn brep_vergessen(zustand: &KernZustand, label: &str) {
    if let Some(alt) = zustand.brep.lock().unwrap().remove(label) {
        if let Some(o) = alt.eigen {
            let _ = std::fs::remove_dir_all(o);
        }
    }
}

/// Fenster geschlossen: Kernlauf, modell.brep-Ordner und die temporäre Einzelteil-Datei des Fensters löschen.
fn fenster_aufraeumen(zustand: &KernZustand, label: &str) {
    if let Some(alt) = zustand.laeufe.lock().unwrap().remove(label) {
        lauf_aufraeumen(alt);
    }
    brep_vergessen(zustand, label);
    if let Some(datei) = zustand.einzel.lock().unwrap().remove(label) {
        let _ = std::fs::remove_file(datei);
    }
}

/// Programmende: alles Temporäre sofort löschen (ein noch laufender Kern bekommt kurz Zeit, modell.brep fertigzuschreiben).
fn alles_aufraeumen(zustand: &KernZustand, einzelteile: &std::path::Path) {
    let laeufe: Vec<Lauf> = zustand.laeufe.lock().unwrap().drain().map(|(_, l)| l).collect();
    for l in laeufe {
        if l.aus_speicher {
            continue;
        }
        if let Some(rx) = &l.ende {
            let _ = rx.recv_timeout(std::time::Duration::from_secs(2));
        }
        let _ = std::fs::remove_dir_all(&l.ordner);
    }
    let labels: Vec<String> = zustand.brep.lock().unwrap().keys().cloned().collect();
    for l in labels {
        brep_vergessen(zustand, &l);
    }
    zustand.einzel.lock().unwrap().clear();
    let _ = std::fs::remove_dir_all(einzelteile);
}

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

fn kern_ordner(zustand: &tauri::State<'_, KernZustand>, label: &str) -> Result<std::path::PathBuf, String> {
    let ordner = std::env::temp_dir().join(format!("hasi-kern-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    std::fs::create_dir_all(&ordner).map_err(|e| format!("Temporärer Ordner: {e}"))?;
    if let Some(alt) = zustand.laeufe.lock().unwrap().remove(label) {
        lauf_aufraeumen(alt);
    }
    brep_vergessen(zustand, label);
    Ok(ordner)
}

fn kern_befehl(app: &tauri::AppHandle, prog: &std::path::Path, ein: &std::path::Path, ordner: &std::path::Path) -> std::process::Command {
    kern_befehl_mit(app, prog, &[ein.as_os_str(), ordner.as_os_str()])
}

fn kern_befehl_mit(app: &tauri::AppHandle, prog: &std::path::Path, args: &[&std::ffi::OsStr]) -> std::process::Command {
    let mut cmd = std::process::Command::new(prog);
    cmd.args(args);
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

fn stufe_melden(app: &tauri::AppHandle, label: &str, zeile: &str) {
    use tauri::Manager;
    let Some((name, k, n)) = stufe_lesen(zeile) else { return };
    if let Some(fenster) = app.get_webview_window(label) {
        let _ = fenster.eval(&format!("window.__kernStufe&&window.__kernStufe({},{k},{n})", js_string(&name)));
    }
}

enum Meldung {
    Bin,
    Ende(Result<(), String>),
}

async fn kern_auswerten(app: tauri::AppHandle, label: String, mut cmd: std::process::Command, ein: std::path::PathBuf, ordner: std::path::PathBuf, loesche_eingabe: bool, speicher_ziel: Option<std::path::PathBuf>, zustand: tauri::State<'_, KernZustand>) -> Result<tauri::ipc::Response, String> {
    let mut kind = cmd.spawn().map_err(|e| format!("Nativer Kern konnte nicht gestartet werden: {e}"))?;
    let stdout = kind.stdout.take();
    let stderr = kind.stderr.take();
    let (tx, rx) = std::sync::mpsc::channel::<Meldung>();
    let (tx_ende, rx_ende) = std::sync::mpsc::channel::<Result<(), String>>();
    let app2 = app.clone();
    let label2 = label.clone();
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
                    stufe_melden(&app2, &label2, &zeile);
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
    zustand.laeufe.lock().unwrap().insert(label, Lauf { ordner, ende, aus_speicher: false, speicher_ziel });
    Ok(tauri::ipc::Response::new(bin))
}

// ---------- Einzelteile als STEP (nativer Kern, OCCT STEPControl_Writer) ----------
/// Laufender Export (zum Abbrechen) je Fenster.
#[derive(Default)]
struct ExportZustand {
    kinder: std::sync::Mutex<std::collections::HashMap<String, std::process::Child>>,
    abgebrochen: std::sync::Mutex<std::collections::HashSet<String>>,
}

#[derive(serde::Deserialize)]
struct ExportTeil {
    u: usize,
    /// 3×4-Matrix zeilenweise (Baugruppenlage); fehlt = eigenes Koordinatensystem
    m: Option<Vec<f64>>,
    /// Farben für den Kern: „RRGGBB“ (Körper) und/oder „;Fläche:RRGGBB,…“; fehlt = ohne Farbe
    #[serde(default)]
    f: Option<String>,
}
#[derive(serde::Deserialize)]
struct ExportDatei {
    /// Dateiname ohne Endung (bereits Windows-tauglich und eindeutig)
    name: String,
    /// Produktname, schon STEP-kodiert (\X2\…\X0\)
    produkt: String,
    teile: Vec<ExportTeil>,
}

/// Setzt den Produktnamen anstelle des Platzhalters ein: 'HASI_PRODUKTNAME' / 'HASI_PRODUKTNAME 3' → Name,
/// 'HASI_PRODUKTNAME 3.2' (Teil eines Verbunds) → 'Name (2)'. Auch FILE_NAME bekommt den Namen.
fn produktname_einsetzen(text: &str, produkt: &str) -> String {
    const PLATZ: &str = "'HASI_PRODUKTNAME";
    let mut aus = String::with_capacity(text.len() + 256);
    let mut rest = text;
    while let Some(i) = rest.find(PLATZ) {
        aus.push_str(&rest[..i]);
        let nach = &rest[i + PLATZ.len()..];
        let Some(ende) = nach.find('\'') else {
            aus.push_str(&rest[i..]);
            rest = "";
            break;
        };
        let zusatz = nach[..ende].trim();
        if !zusatz.is_empty() && !zusatz.chars().all(|c| c.is_ascii_digit() || c == '.') {
            // kein Platzhalter von uns
            aus.push_str(&rest[i..i + PLATZ.len() + ende + 1]);
        } else if let Some((_, k)) = zusatz.split_once('.') {
            aus.push_str(&format!("'{produkt} ({k})'"));
        } else {
            aus.push_str(&format!("'{produkt}'"));
        }
        rest = &nach[ende + 1..];
    }
    aus.push_str(rest);
    aus.replacen("FILE_NAME('Open CASCADE Shape Model'", &format!("FILE_NAME('{produkt}'"), 1)
}

/// Nur druckbares ASCII ohne einzelnes Hochkomma (die JS-Seite kodiert schon); sonst ein neutraler Name.
fn produkt_pruefen(p: &str) -> String {
    let ok = !p.is_empty() && p.chars().all(|c| (' '..='~').contains(&c)) && p.replace("''", "").find('\'').is_none();
    if ok { p.to_string() } else { "Einzelteil".into() }
}

/// Windows-tauglicher Dateiname (ohne Endung); Umlaute und türkische Zeichen bleiben.
fn sicherer_dateiname(name: &str) -> String {
    let mut s: String = name.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    s = s.trim().trim_end_matches(['.', ' ']).to_string();
    if s.chars().count() > 120 {
        s = s.chars().take(120).collect::<String>().trim_end_matches(['.', ' ']).to_string();
    }
    if s.is_empty() {
        s = "Einzelteil".into();
    }
    let basis = s.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserviert = matches!(basis.as_str(), "CON" | "PRN" | "AUX" | "NUL") || ((basis.starts_with("COM") || basis.starts_with("LPT")) && basis.len() == 4 && basis.as_bytes()[3].is_ascii_digit());
    if reserviert {
        s.push('_');
    }
    s
}

/// Freier Pfad in `ordner`: „Name.step“, sonst „Name (2).step“ … (Groß/Klein egal, wie unter Windows).
fn freier_pfad(ordner: &std::path::Path, name: &str, ext: &str, belegt: &mut std::collections::HashSet<String>) -> std::path::PathBuf {
    if belegt.is_empty() {
        if let Ok(rd) = std::fs::read_dir(ordner) {
            for d in rd.flatten() {
                belegt.insert(d.file_name().to_string_lossy().to_lowercase());
            }
        }
        belegt.insert(String::new());
    }
    let mut n = 1;
    loop {
        let kandidat = if n == 1 { format!("{name}{ext}") } else { format!("{name} ({n}){ext}") };
        if !belegt.contains(&kandidat.to_lowercase()) && !ordner.join(&kandidat).exists() {
            belegt.insert(kandidat.to_lowercase());
            return ordner.join(kandidat);
        }
        n += 1;
    }
}

/// Auftrag für `hasi-kern --step-export`, je Datei eine Zeile (Tab-getrennt):
/// Datei, Schema, Anzahl Teile, dann je Teil Unikat und Matrix (12 Werte, Komma-getrennt) oder „-“.
fn auftrag_text(dateien: &[ExportDatei], schema: &str) -> String {
    let mut auftrag = String::new();
    for (k, d) in dateien.iter().enumerate() {
        auftrag.push_str(&format!("t{k}.step\t{schema}\t{}", d.teile.len()));
        for t in &d.teile {
            let m = match &t.m {
                Some(m) if m.len() == 12 && m.iter().all(|v| v.is_finite()) => m.iter().map(|v| format!("{v:e}")).collect::<Vec<_>>().join(","),
                _ => "-".into(),
            };
            // Farbfeld nur aus erlaubten Zeichen (kein Tabulator/Zeilenumbruch im Auftrag)
            let f = t.f.as_deref().filter(|f| !f.is_empty() && f.chars().all(|c| c.is_ascii_hexdigit() || ";:,-".contains(c))).unwrap_or("-");
            auftrag.push_str(&format!("\t{}\t{m}\t{f}", t.u));
        }
        auftrag.push('\n');
    }
    auftrag
}

/// Liest t{k}.step aus dem Arbeitsordner, setzt den Produktnamen ein und schreibt an den Zielpfad.
fn export_fertigstellen(arbeit: &std::path::Path, dateien: &[ExportDatei], pfade: &[std::path::PathBuf]) -> Result<Vec<String>, String> {
    let mut fertig = Vec::new();
    for (k, d) in dateien.iter().enumerate() {
        let roh = std::fs::read(arbeit.join(format!("t{k}.step"))).map_err(|e| format!("STEP-Datei fehlt: {e}"))?;
        let text = produktname_einsetzen(&String::from_utf8_lossy(&roh), &produkt_pruefen(&d.produkt));
        std::fs::write(&pfade[k], text).map_err(|e| format!("Datei konnte nicht geschrieben werden: {e}"))?;
        fertig.push(pfade[k].to_string_lossy().into_owned());
    }
    Ok(fertig)
}

fn export_stufe(fenster: &tauri::WebviewWindow, k: i64, n: i64) {
    let _ = fenster.eval(&format!("window.__exportStufe&&window.__exportStufe({k},{n})"));
}

/// Schreibt Einzelteile über den nativen Kern als STEP. `ziel`: "datei" (Speichern-Dialog, eine Datei),
/// "ordner" (Ordner wählen, je Eintrag eine Datei, nie überschreiben) oder "temp" (für „Als Einzelteil öffnen“).
/// Ergebnis: geschriebene Pfade; None = Dialog abgebrochen. Fehler "abgebrochen" = vom Benutzer abgebrochen.
#[tauri::command]
async fn step_export(app: tauri::AppHandle, fenster: tauri::WebviewWindow, dateien: Vec<ExportDatei>, schema: String, ziel: String, zustand: tauri::State<'_, KernZustand>, export: tauri::State<'_, ExportZustand>) -> Result<Option<Vec<String>>, String> {
    use tauri_plugin_dialog::DialogExt;
    let label = fenster.label().to_string();
    let prog = kern_programm().ok_or("Nativer Kern nicht vorhanden")?;
    let brep = zustand.brep.lock().unwrap().get(&label).map(|o| o.pfad.clone()).filter(|p| p.is_file()).ok_or("Geometrie des nativen Kerns nicht mehr vorhanden")?;
    if dateien.is_empty() {
        return Err("Keine Teile gewählt".into());
    }
    let schema = if schema == "AP242" { "AP242" } else { "AP214" };
    // Zielpfade festlegen, bevor gerechnet wird
    let mut pfade: Vec<std::path::PathBuf> = Vec::new();
    match ziel.as_str() {
        "datei" => {
            let p = app.dialog().file().set_title("Als STEP speichern").set_file_name(format!("{}.step", sicherer_dateiname(&dateien[0].name))).add_filter("STEP-Datei", &["step", "stp"]).blocking_save_file();
            let Some(p) = p else { return Ok(None) };
            pfade.push(p.into_path().map_err(|e| format!("Ungültiger Pfad: {e}"))?);
        }
        "ordner" => {
            let p = app.dialog().file().set_title("Ordner für die Einzelteile wählen").blocking_pick_folder();
            let Some(p) = p else { return Ok(None) };
            let ordner = p.into_path().map_err(|e| format!("Ungültiger Pfad: {e}"))?;
            let mut belegt = std::collections::HashSet::new();
            for d in &dateien {
                pfade.push(freier_pfad(&ordner, &sicherer_dateiname(&d.name), ".step", &mut belegt));
            }
        }
        _ => {
            let ordner = einzelteil_temp()?;
            let mut belegt = std::collections::HashSet::new();
            for d in &dateien {
                pfade.push(freier_pfad(&ordner, &sicherer_dateiname(&d.name), ".step", &mut belegt));
            }
        }
    }
    let arbeit = std::env::temp_dir().join(format!("hasi-export-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
    std::fs::create_dir_all(&arbeit).map_err(|e| format!("Temporärer Ordner: {e}"))?;
    let auftrag = auftrag_text(&dateien, schema);
    let auftrag_pfad = arbeit.join("auftrag.txt");
    std::fs::write(&auftrag_pfad, auftrag).map_err(|e| format!("Auftrag: {e}"))?;
    export.abgebrochen.lock().unwrap().remove(&label);
    let mut cmd = kern_befehl_mit(&app, &prog, &[std::ffi::OsStr::new("--step-export"), brep.as_os_str(), auftrag_pfad.as_os_str(), arbeit.as_os_str()]);
    cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    let mut kind = cmd.spawn().map_err(|e| format!("Nativer Kern konnte nicht gestartet werden: {e}"))?;
    let stdout = kind.stdout.take();
    let stderr = kind.stderr.take();
    export.kinder.lock().unwrap().insert(label.clone(), kind);
    let f2 = fenster.clone();
    let (ausgabe, fehler) = tauri::async_runtime::spawn_blocking(move || {
        use std::io::{BufRead, Read};
        let fehlertext = std::thread::spawn(move || {
            let mut s = String::new();
            if let Some(mut e) = stderr {
                let _ = e.read_to_string(&mut s);
            }
            s
        });
        let mut letzte = String::new();
        if let Some(o) = stdout {
            for zeile in std::io::BufReader::new(o).lines().map_while(Result::ok) {
                if let Some((_, k, n)) = stufe_lesen(&zeile) {
                    export_stufe(&f2, k, n);
                } else if !zeile.trim().is_empty() {
                    letzte = zeile;
                }
            }
        }
        (letzte, fehlertext.join().unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?;
    let status = export.kinder.lock().unwrap().remove(&label).map(|mut k| k.wait());
    let abgebrochen = export.abgebrochen.lock().unwrap().remove(&label);
    let ergebnis = (|| {
        if abgebrochen {
            return Err("abgebrochen".to_string());
        }
        match status {
            Some(Ok(s)) if s.success() => {}
            _ => {
                let text = [ausgabe.as_str(), fehler.as_str()].iter().flat_map(|t| t.lines()).find(|z| z.contains("FEHLER")).unwrap_or("STEP-Export fehlgeschlagen").trim().to_string();
                return Err(text);
            }
        }
        export_fertigstellen(&arbeit, &dateien, &pfade).map(Some)
    })();
    let _ = std::fs::remove_dir_all(&arbeit);
    ergebnis
}

/// Bricht den laufenden Export dieses Fensters ab; es wird nichts geschrieben.
#[tauri::command]
fn step_export_abbrechen(fenster: tauri::WebviewWindow, export: tauri::State<'_, ExportZustand>) {
    let label = fenster.label().to_string();
    if let Some(k) = export.kinder.lock().unwrap().get_mut(&label) {
        export.abgebrochen.lock().unwrap().insert(label);
        let _ = k.kill();
    }
}

fn einzelteil_ordner() -> std::path::PathBuf {
    std::env::temp_dir().join(format!("hasi-einzelteile-{}", std::process::id()))
}

/// Ordner für die Einzelteile von „Als Einzelteil öffnen“ (Datei wird mit ihrem Fenster gelöscht, der Ordner beim Beenden).
fn einzelteil_temp() -> Result<std::path::PathBuf, String> {
    let o = einzelteil_ordner();
    std::fs::create_dir_all(&o).map_err(|e| format!("Temporärer Ordner: {e}"))?;
    Ok(o)
}

/// Ordner wählen (WASM-Rückfall beim Speichern aller Einzelteile).
#[tauri::command]
async fn ordner_waehlen(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    match app.dialog().file().set_title("Ordner für die Einzelteile wählen").blocking_pick_folder() {
        Some(p) => Ok(Some(p.into_path().map_err(|e| format!("Ungültiger Pfad: {e}"))?.to_string_lossy().into_owned())),
        None => Ok(None),
    }
}

/// Legt Bytes (Rohdaten der Anfrage) als neue Datei ab, nie überschreibend (WASM-Rückfall).
/// Kopfzeilen: x-ordner (leer = temporärer Ordner), x-name (Dateiname ohne Endung), beide URL-kodiert.
#[tauri::command]
fn datei_ablegen(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let kopf = |n: &str| request.headers().get(n).and_then(|v| v.to_str().ok()).map(url_dekodieren).unwrap_or_default();
    let ordner = kopf("x-ordner");
    let ordner = if ordner.is_empty() { einzelteil_temp()? } else { std::path::PathBuf::from(ordner) };
    if !ordner.is_dir() {
        return Err("Ordner nicht gefunden".into());
    }
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else { return Err("Keine Daten".into()) };
    let pfad = freier_pfad(&ordner, &sicherer_dateiname(&kopf("x-name")), ".step", &mut std::collections::HashSet::new());
    std::fs::write(&pfad, data).map_err(|e| format!("Datei konnte nicht geschrieben werden: {e}"))?;
    Ok(pfad.to_string_lossy().into_owned())
}

fn url_dekodieren(s: &str) -> String {
    let b = s.as_bytes();
    let mut aus = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                aus.push(v);
                i += 3;
                continue;
            }
        }
        aus.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&aus).into_owned()
}

/// Öffnet eine (temporäre) STEP-Datei in einem eigenen Fenster „Einzelteil“.
#[tauri::command]
async fn einzelteil_fenster(app: tauri::AppHandle, pfad: String, titel: String, zustand: tauri::State<'_, KernZustand>) -> Result<(), String> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static NR: AtomicUsize = AtomicUsize::new(1);
    let p = std::path::PathBuf::from(&pfad);
    if !ist_step(&p) || !p.is_file() {
        return Err("Einzelteil-Datei nicht gefunden".into());
    }
    let produkt = app.config().product_name.clone().unwrap_or_else(|| "Hasi 3D".into());
    let url = format!("index.html?datei={}", url_kodieren(&pfad));
    let label = format!("einzelteil-{}", NR.fetch_add(1, Ordering::Relaxed));
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(url.into()))
        .title(format!("{titel} – Einzelteil – {produkt}"))
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| format!("Fenster konnte nicht geöffnet werden: {e}"))?;
    // Nur eigene Zwischendateien merken (nie eine Datei des Benutzers löschen)
    if p.starts_with(einzelteil_ordner()) {
        zustand.einzel.lock().unwrap().insert(label.clone(), p.clone());
    }
    // Datei hineinziehen öffnet sie in diesem Fenster (wie im Hauptfenster)
    ziehereignis(&app, &label);
    Ok(())
}

fn url_kodieren(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
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
async fn kern_laden(app: tauri::AppHandle, fenster: tauri::WebviewWindow, request: tauri::ipc::Request<'_>, zustand: tauri::State<'_, KernZustand>) -> Result<tauri::ipc::Response, String> {
    let label = fenster.label().to_string();
    let tauri::ipc::InvokeBody::Raw(daten) = request.body() else {
        return Err("Nativer Kern: keine Dateidaten erhalten".into());
    };
    let prog = kern_programm().ok_or("Nativer Kern nicht vorhanden")?;
    let ordner = kern_ordner(&zustand, &label)?;
    let ein = ordner.join("ein.step");
    std::fs::write(&ein, daten).map_err(|e| format!("Temporäre Datei: {e}"))?;
    let cmd = kern_befehl(&app, &prog, &ein, &ordner);
    kern_auswerten(app, label, cmd, ein, ordner, true, None, zustand).await
}

/// Lädt eine STEP-Datei über ihren Pfad. Die Originaldatei bleibt liegen, der Kern schreibt nur in einen temporären Ordner.
/// Ein Ergebnis für dieselbe, unveränderte Datei kommt aus dem Zwischenspeicher.
#[tauri::command]
async fn kern_laden_pfad(app: tauri::AppHandle, fenster: tauri::WebviewWindow, pfad: String, zustand: tauri::State<'_, KernZustand>) -> Result<tauri::ipc::Response, String> {
    let label = fenster.label().to_string();
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
                if let Some(alt) = zustand.laeufe.lock().unwrap().remove(&label) {
                    lauf_aufraeumen(alt);
                }
                brep_vergessen(&zustand, &label);
                let _ = std::fs::write(z.join("fertig"), b"1"); // Änderungszeit = zuletzt benutzt
                zustand.laeufe.lock().unwrap().insert(label, Lauf { ordner: z.clone(), ende: None, aus_speicher: true, speicher_ziel: None });
                return Ok(tauri::ipc::Response::new(bin));
            }
        }
    }
    let ordner = kern_ordner(&zustand, &label)?;
    let cmd = kern_befehl(&app, &prog, &ein, &ordner);
    kern_auswerten(app, label, cmd, ein, ordner, false, ziel, zustand).await
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
async fn kern_brep(fenster: tauri::WebviewWindow, zustand: tauri::State<'_, KernZustand>) -> Result<String, String> {
    let label = fenster.label().to_string();
    let lauf = zustand.laeufe.lock().unwrap().remove(&label).ok_or("Kein Lauf des nativen Kerns vorhanden")?;
    let (text, ort) = tauri::async_runtime::spawn_blocking(move || -> (Result<String, String>, Option<BrepOrt>) {
        if let Some(rx) = &lauf.ende {
            if let Ok(Err(e)) = rx.recv() {
                let _ = std::fs::remove_dir_all(&lauf.ordner);
                return (Err(e), None);
            }
        }
        let text = std::fs::read_to_string(lauf.ordner.join("modell.brep")).map_err(|e| format!("Messdaten fehlen: {e}"));
        if lauf.aus_speicher {
            let ort = BrepOrt { pfad: lauf.ordner.join("modell.brep"), eigen: None };
            return (text, Some(ort));
        }
        if text.is_err() {
            let _ = std::fs::remove_dir_all(&lauf.ordner);
            return (text, None);
        }
        // In den Zwischenspeicher legen; sonst den Ordner behalten (Export braucht modell.brep), bis das Fenster neu lädt
        if let Some(ziel) = &lauf.speicher_ziel {
            let _ = std::fs::create_dir_all(speicher_wurzel());
            let _ = std::fs::remove_dir_all(ziel);
            if std::fs::rename(&lauf.ordner, ziel).is_ok() && std::fs::write(ziel.join("fertig"), b"1").is_ok() {
                speicher_aufraeumen(&speicher_wurzel(), SPEICHER_MAX);
                return (text, Some(BrepOrt { pfad: ziel.join("modell.brep"), eigen: None }));
            }
        }
        let _ = std::fs::remove_file(lauf.ordner.join("modell.bin"));
        let ort = BrepOrt { pfad: lauf.ordner.join("modell.brep"), eigen: Some(lauf.ordner.clone()) };
        (text, Some(ort))
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(o) = ort {
        brep_vergessen(&zustand, &label);
        zustand.brep.lock().unwrap().insert(label, o);
    }
    text
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

fn ziehinweis(app: &tauri::AppHandle, label: &str, an: bool) {
    use tauri::Manager;
    if let Some(fenster) = app.get_webview_window(label) {
        let _ = fenster.eval(&format!("window.__dateiZiehen&&window.__dateiZiehen({})", if an { "true" } else { "false" }));
    }
}

fn status_setzen(app: &tauri::AppHandle, label: &str, text: &str) {
    use tauri::Manager;
    if let Some(fenster) = app.get_webview_window(label) {
        let _ = fenster.eval(&format!("document.getElementById('status').textContent={}", js_string(text)));
    }
}

/// Ziel eines Drops: das Fenster, in das gezogen wurde. Im Hauptfenster über START_PFAD (falls die Seite noch lädt),
/// im Einzelteil-Fenster direkt – es ersetzt dort das Einzelteil wie „Öffnen …“ im selben Fenster.
fn drop_oeffnen(app: &tauri::AppHandle, label: &str, pfad: &str) {
    use tauri::Manager;
    if label == "main" {
        return datei_an_fenster(app, pfad);
    }
    if let Some(fenster) = app.get_webview_window(label) {
        let name = std::path::Path::new(pfad).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let produkt = app.config().product_name.clone().unwrap_or_else(|| "Hasi 3D".into());
        let _ = fenster.set_title(&format!("{name} – {produkt}"));
        let _ = fenster.eval(&format!("window.__oeffnePfad&&window.__oeffnePfad({})", js_string(pfad)));
    }
}

/// Natives Ziehen ins Webview (dragDropEnabled), für Haupt- und Einzelteil-Fenster. HTML5-Drop kommt in der Desktop-App nicht an.
fn ziehereignis(app: &tauri::AppHandle, label: &str) {
    use tauri::Manager;
    let Some(fenster) = app.get_webview_window(label) else { return };
    let app = app.clone();
    let label = label.to_string();
    fenster.on_webview_event(move |event| match event {
        tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Enter { paths, .. }) => {
            let zeigen = paths.is_empty() || paths.iter().any(|p| ist_step(p));
            ziehinweis(&app, &label, zeigen);
        }
        tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
            ziehinweis(&app, &label, false);
            if let Some(pfad) = paths.iter().find(|p| ist_step(p)) {
                drop_oeffnen(&app, &label, &pfad.to_string_lossy());
            } else if !paths.is_empty() {
                status_setzen(&app, &label, "Nur STEP-Dateien (.step, .stp)");
            }
        }
        tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Leave) => ziehinweis(&app, &label, false),
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
    #[test]
    fn aufraeumen_fenster_und_ende() {
        let basis = std::env::temp_dir().join(format!("hasi-test-aufr-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&basis);
        let ordner = |n: &str| {
            let o = basis.join(n);
            std::fs::create_dir_all(&o).unwrap();
            std::fs::write(o.join("modell.brep"), b"x").unwrap();
            o
        };
        let einzelteile = basis.join("einzelteile");
        std::fs::create_dir_all(&einzelteile).unwrap();
        let teil = einzelteile.join("Winkel.step");
        std::fs::write(&teil, b"ISO-10303-21;").unwrap();
        let z = KernZustand::default();
        for l in ["main", "einzelteil-1"] {
            z.laeufe.lock().unwrap().insert(l.into(), Lauf { ordner: ordner(&format!("lauf-{l}")), ende: None, aus_speicher: false, speicher_ziel: None });
            let b = ordner(&format!("brep-{l}"));
            z.brep.lock().unwrap().insert(l.into(), BrepOrt { pfad: b.join("modell.brep"), eigen: Some(b) });
        }
        z.einzel.lock().unwrap().insert("einzelteil-1".into(), teil.clone());
        // Einzelteil-Fenster schließen: nur seine Dateien weg, das Hauptfenster bleibt
        fenster_aufraeumen(&z, "einzelteil-1");
        assert!(!basis.join("lauf-einzelteil-1").exists() && !basis.join("brep-einzelteil-1").exists() && !teil.exists());
        assert!(basis.join("lauf-main").exists() && basis.join("brep-main").exists());
        // ein noch laufender Kern im Hauptfenster: Ende wartet kurz und löscht dann
        let (tx, rx) = std::sync::mpsc::channel();
        let lauf2 = ordner("lauf-main-2");
        z.laeufe.lock().unwrap().insert("einzelteil-2".into(), Lauf { ordner: lauf2.clone(), ende: Some(rx), aus_speicher: false, speicher_ziel: None });
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(50));
            let _ = tx.send(Ok(()));
        });
        alles_aufraeumen(&z, &einzelteile);
        for n in ["lauf-main", "brep-main", "lauf-main-2", "einzelteile"] {
            assert!(!basis.join(n).exists(), "{n} nach dem Beenden noch da");
        }
        assert!(z.laeufe.lock().unwrap().is_empty() && z.brep.lock().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&basis);
    }

    #[test]
    fn produktname_platzhalter() {
        let t = "FILE_NAME('Open CASCADE Shape Model','2026',('Author'),(''),'x','y','');\n#7 = PRODUCT('HASI_PRODUKTNAME 1',\n  'HASI_PRODUKTNAME 1','',(#8));\n#9 = PRODUCT('HASI_PRODUKTNAME','HASI_PRODUKTNAME','',(#8));\n#11 = PRODUCT('HASI_PRODUKTNAME 1.2','HASI_PRODUKTNAME 1.2','',(#8));\n#12 = PRODUCT('HASI_PRODUKTNAMEX','',(#8));";
        let a = produktname_einsetzen(t, "Winkel \\X2\\00D6\\X0\\l");
        assert!(a.starts_with("FILE_NAME('Winkel \\X2\\00D6\\X0\\l','2026'"));
        assert!(a.contains("#7 = PRODUCT('Winkel \\X2\\00D6\\X0\\l',\n  'Winkel \\X2\\00D6\\X0\\l',''"));
        assert!(a.contains("#9 = PRODUCT('Winkel \\X2\\00D6\\X0\\l','Winkel"));
        assert!(a.contains("#11 = PRODUCT('Winkel \\X2\\00D6\\X0\\l (2)','Winkel \\X2\\00D6\\X0\\l (2)'"));
        assert!(a.contains("'HASI_PRODUKTNAMEX'"));
        assert_eq!(produkt_pruefen("O'Neil"), "Einzelteil");
        assert_eq!(produkt_pruefen("O''Neil"), "O''Neil");
        assert_eq!(produkt_pruefen("Ölçü"), "Einzelteil");
    }

    /// Mit HASI_TEST_KERN (hasi-kern) und HASI_TEST_BREP (modell.brep eines Laufs): Auftrag → Kern → fertige Dateien.
    #[test]
    fn export_mit_kern() {
        let (Ok(kern), Ok(brep)) = (std::env::var("HASI_TEST_KERN"), std::env::var("HASI_TEST_BREP")) else { return };
        let arbeit = std::env::temp_dir().join(format!("hasi-test-export-{}", std::process::id()));
        std::fs::create_dir_all(&arbeit).unwrap();
        let mut m = vec![0.0; 12];
        m[0] = 1.0; m[5] = 1.0; m[10] = 1.0; m[3] = 10.0;
        let dateien = vec![
            ExportDatei { name: "Grundplatte".into(), produkt: "Grundplatte".into(), teile: vec![ExportTeil { u: 0, m: None, f: None }] },
            ExportDatei { name: "Paar".into(), produkt: "\\X2\\015E\\X0\\asi".into(), teile: vec![ExportTeil { u: 1, m: Some(m.clone()), f: Some("ff0000;0:00ff00".into()) }, ExportTeil { u: 2, m: None, f: None }] },
        ];
        let auftrag = arbeit.join("auftrag.txt");
        std::fs::write(&auftrag, auftrag_text(&dateien, "AP242")).unwrap();
        let st = std::process::Command::new(kern).arg("--step-export").arg(&brep).arg(&auftrag).arg(&arbeit).status().unwrap();
        assert!(st.success());
        let pfade = vec![arbeit.join("a.step"), arbeit.join("b.step")];
        export_fertigstellen(&arbeit, &dateien, &pfade).unwrap();
        let a = std::fs::read_to_string(&pfade[0]).unwrap();
        assert!(a.contains("PRODUCT('Grundplatte','Grundplatte'"), "{}", &a[..a.len().min(3000)]);
        assert!(a.contains("AP242_MANAGED_MODEL_BASED"));
        let b = std::fs::read_to_string(&pfade[1]).unwrap();
        assert!(b.contains("PRODUCT('\\X2\\015E\\X0\\asi','\\X2\\015E\\X0\\asi'"));
        assert!(b.contains("'\\X2\\015E\\X0\\asi (1)'") && b.contains("'\\X2\\015E\\X0\\asi (2)'"));
        assert!(!b.contains("HASI_PRODUKTNAME"));
        std::fs::remove_dir_all(&arbeit).unwrap();
    }

    #[test]
    fn dateinamen_windows() {
        assert_eq!(sicherer_dateiname("Şasi: Ölçü/ÄÖÜß?"), "Şasi_ Ölçü_ÄÖÜß_");
        assert_eq!(sicherer_dateiname("CON"), "CON_");
        assert_eq!(sicherer_dateiname("lpt1.teil"), "lpt1.teil_");
        assert_eq!(sicherer_dateiname("  Teil. . "), "Teil");
        assert_eq!(sicherer_dateiname(""), "Einzelteil");
        assert_eq!(sicherer_dateiname(&"x".repeat(300)).chars().count(), 120);
        let d = std::env::temp_dir().join(format!("hasi-test-namen-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("Bolzen.step"), b"").unwrap();
        let mut b = std::collections::HashSet::new();
        assert_eq!(freier_pfad(&d, "bolzen", ".step", &mut b).file_name().unwrap(), "bolzen (2).step");
        assert_eq!(freier_pfad(&d, "Bolzen", ".step", &mut b).file_name().unwrap(), "Bolzen (3).step");
        assert_eq!(freier_pfad(&d, "Platte", ".step", &mut b).file_name().unwrap(), "Platte.step");
        std::fs::remove_dir_all(&d).unwrap();
        assert_eq!(url_dekodieren("Bolzen%20%C3%96%2"), "Bolzen Ö%2");
        assert_eq!(url_kodieren("C:\\a b"), "C%3A%5Ca%20b");
    }

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
