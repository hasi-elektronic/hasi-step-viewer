#!/usr/bin/env python3
"""Packt den nativen Kern für die App: Programm + benötigte dynamische Bibliotheken (OCCT, dynamisch gelinkt).

Aufruf: kern-paket.py <hasi-kern> <occt-installation> <ausgabe-ordner> [--triple T]
Ergebnis: <aus>/hasi-kern-<triple>[.exe] (Tauri externalBin) und <aus>/kern/<bibliotheken>.
Unter Windows legt Tauri die DLLs danach neben hasi-kern.exe (gleicher Ordner).
Unter macOS liegen die Bibliotheken im App-Bundle unter Contents/Resources/kern
und werden über @rpath/@loader_path gefunden. Für universal-apple-darwin entstehen
zusätzlich die Namen, die der Cargo-Build je Architektur verlangt.
Nur Bibliotheken aus der OCCT-Installation werden mitgenommen (unter Windows zusätzlich
die MSVC-Laufzeit, app-lokal), Systembibliotheken nicht. Dynamisch gelinkt (LGPL).
"""
import glob, os, re, shutil, subprocess, sys

def deps_macho(p):
    # otool -L schreibt bei Universal-Binaries je Architektur eine Kopfzeile
    # („… (architecture arm64):“). Die ist keine Abhängigkeit.
    out = subprocess.run(['otool', '-L', p], capture_output=True, text=True, check=True).stdout.splitlines()
    deps = []
    for zeile in out:
        s = zeile.strip()
        if not s or s.endswith(':') or '(architecture ' in s:
            continue
        deps.append(s.split(' (')[0])
    return deps

def deps_elf(p):
    out = subprocess.run(['readelf', '-d', p], capture_output=True, text=True, check=True).stdout
    return re.findall(r'\(NEEDED\)\s+Shared library: \[(.+?)\]', out)

def deps_pe(p):
    import pefile  # nur unter Windows installiert (pip), sonst nicht benötigt
    pe = pefile.PE(p, fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT']])
    return [e.dll.decode() for e in getattr(pe, 'DIRECTORY_ENTRY_IMPORT', [])]

def rpaths(p):
    out = subprocess.run(['otool', '-l', p], capture_output=True, text=True, check=True).stdout
    pfade, zeilen = [], out.splitlines()
    for i, zeile in enumerate(zeilen):
        if zeile.strip() != 'cmd LC_RPATH':
            continue
        for folge in zeilen[i + 1:i + 5]:
            if 'path ' in folge:
                pfade.append(folge.split('path ', 1)[1].split(' (', 1)[0].strip())
                break
    return pfade

def macho_umbinden(p, namen):
    """Eigene Bibliotheken auf @rpath umstellen, absolute Bau-Rpaths entfernen."""
    for dep in deps_macho(p):
        basis = os.path.basename(dep)
        neu = '@rpath/' + basis
        if basis not in namen or dep == neu:
            continue
        r = subprocess.run(['install_name_tool', '-change', dep, neu, p], capture_output=True, text=True)
        if r.returncode != 0 and os.path.basename(p) != basis:
            raise SystemExit(r.stderr.strip() or f'install_name_tool -change fehlgeschlagen: {p} ({dep})')
    if os.path.basename(p) in namen:
        subprocess.run(['install_name_tool', '-id', '@rpath/' + os.path.basename(p), p], check=True)
        subprocess.run(['install_name_tool', '-add_rpath', '@loader_path', p], capture_output=True)
    for rp in dict.fromkeys(rpaths(p)):
        if not rp.startswith('@'):
            subprocess.run(['install_name_tool', '-delete_rpath', rp, p], check=True)

def rpath_setzen(p, pfad):
    if pfad not in rpaths(p):
        subprocess.run(['install_name_tool', '-add_rpath', pfad, p], check=True)

def macho_pruefen(p, namen):
    for dep in deps_macho(p):
        basis = os.path.basename(dep)
        if basis in namen and not dep.startswith('@rpath/'):
            raise SystemExit(f'Bibliothek nicht über @rpath gebunden: {p} → {dep}')
    if not any(rp.startswith('@loader_path') or rp.startswith('@executable_path') for rp in rpaths(p)):
        raise SystemExit(f'kein @rpath/@loader_path: {p}')

def main():
    exe, prefix, out = sys.argv[1], os.path.abspath(sys.argv[2]), sys.argv[3]
    triple = sys.argv[sys.argv.index('--triple') + 1] if '--triple' in sys.argv else None
    os.makedirs(os.path.join(out, 'kern'), exist_ok=True)
    win, mac = sys.platform == 'win32', sys.platform == 'darwin'
    libdir = os.path.join(prefix, 'bin') if win else os.path.join(prefix, 'lib')
    seen, todo, kopiert = set(), [exe], []
    while todo:
        cur = todo.pop()
        ds = deps_pe(cur) if win else deps_macho(cur) if mac else deps_elf(cur)
        for d in ds:
            name = os.path.basename(d)
            if mac and not (d.startswith('@rpath/') or d.startswith(prefix)):
                continue  # Systembibliothek
            src = os.path.join(libdir, name)
            if not os.path.isfile(src):
                continue
            if name in seen:
                continue
            seen.add(name)
            dst = os.path.join(out, 'kern', name)
            shutil.copyfile(os.path.realpath(src), dst)
            os.chmod(dst, 0o755)
            kopiert.append(name)
            todo.append(src)
    name = 'hasi-kern' + (f'-{triple}' if triple else '') + ('.exe' if win else '')
    ziel = os.path.join(out, name)
    shutil.copyfile(exe, ziel)
    os.chmod(ziel, 0o755)
    if mac:
        for n in kopiert:
            macho_umbinden(os.path.join(out, 'kern', n), seen)
        macho_umbinden(ziel, seen)
        # Bibliotheken im Bundle: Contents/Resources/kern neben Contents/MacOS/hasi-kern
        rpath_setzen(ziel, '@executable_path/../Resources/kern')
        rpath_setzen(ziel, '@loader_path/../Resources/kern')
        for p in [ziel] + [os.path.join(out, 'kern', n) for n in kopiert]:
            macho_pruefen(p, seen)
    if win and os.environ.get('VCToolsRedistDir'):
        for crt in glob.glob(os.path.join(os.environ['VCToolsRedistDir'], 'x64', 'Microsoft.VC*.CRT', '*.dll')):
            shutil.copyfile(crt, os.path.join(out, 'kern', os.path.basename(crt)))
            kopiert.append(os.path.basename(crt))
    if mac:  # nach install_name_tool neu signieren (ad hoc), sonst startet arm64 nicht
        for n in kopiert:
            subprocess.run(['codesign', '-f', '-s', '-', os.path.join(out, 'kern', n)], check=True)
        subprocess.run(['codesign', '-f', '-s', '-', ziel], check=True)
        if triple == 'universal-apple-darwin':
            # Cargo baut universal in zwei Architekturen und sucht je den passenden Namen.
            # Der Bundler sucht zusätzlich hasi-kern-universal-apple-darwin.
            for arch in ('aarch64-apple-darwin', 'x86_64-apple-darwin'):
                k = os.path.join(out, f'hasi-kern-{arch}')
                shutil.copyfile(ziel, k)
                os.chmod(k, 0o755)
                subprocess.run(['codesign', '-f', '-s', '-', k], check=True)
    groesse = sum(os.path.getsize(os.path.join(out, 'kern', n)) for n in kopiert)
    print(f'{len(kopiert)} Bibliotheken, {groesse / 1e6:.1f} MB')
    for n in sorted(kopiert):
        print('  ' + n)

if __name__ == '__main__':
    main()
