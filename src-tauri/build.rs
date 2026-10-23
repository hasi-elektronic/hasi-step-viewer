use sha2::{Digest, Sha256};
use std::{fs, io, path::PathBuf};

fn main() {
    // tauri-codegen verwendet vorhandene komprimierte Dateien allein anhand des
    // Namens wieder. Ein abgebrochener Build kann eine halbe Brotli-Datei lassen.
    // Nur ungültige Dateien im eigenen OUT_DIR entfernen, bevor codegen läuft.
    let out = PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR fehlt"))
        .canonicalize().expect("OUT_DIR ist ungültig");
    let cache = out.join("tauri-codegen-assets");
    println!("cargo:rerun-if-changed={}", cache.display());
    if cache.exists() {
        let cache = cache.canonicalize().expect("Asset-Cache ist ungültig");
        assert_eq!(cache.parent(), Some(out.as_path()), "Asset-Cache liegt außerhalb von OUT_DIR");
        for entry in fs::read_dir(&cache).expect("Asset-Cache nicht lesbar") {
            let entry = entry.expect("Asset-Eintrag nicht lesbar");
            if !entry.file_type().expect("Asset-Dateityp fehlt").is_file() { continue; }
            let file = fs::File::open(entry.path()).expect("Asset nicht lesbar");
            if io::copy(&mut brotli::Decompressor::new(file, 4096), &mut io::sink()).is_err() {
                fs::remove_file(entry.path()).expect("Beschädigtes Asset nicht entfernbar");
                println!("cargo:warning=Unvollständiges eingebettetes Asset wird neu erzeugt: {}", entry.file_name().to_string_lossy());
            }
        }
    }
    let wasm = PathBuf::from("../dist/ocjs/opencascade.wasm.wasm");
    let bytes = fs::read(&wasm).expect("Messkern fehlt: zuerst npm run build ausführen");
    assert!(bytes.starts_with(b"\0asm\x01\0\0\0"), "Messkern ist keine gültige WASM-Datei");
    println!("cargo:rerun-if-changed={}", wasm.display());
    println!("cargo:rustc-env=HASI_WASM_SHA256={:x}", Sha256::digest(&bytes));
    tauri_build::build();
}
