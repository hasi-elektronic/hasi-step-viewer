#!/usr/bin/env python3
"""Packt den nativen Kern für die App: Programm + benötigte dynamische Bibliotheken (OCCT, dynamisch gelinkt).

Aufruf: kern-paket.py <hasi-kern> <occt-installation> <ausgabe-ordner> [--triple T]
Ergebnis: <aus>/hasi-kern-<triple>[.exe] (Tauri externalBin) und <aus>/kern/<bibliotheken> (Tauri resources).
Nur Bibliotheken aus der OCCT-Installation werden mitgenommen (unter Windows zusätzlich die MSVC-Laufzeit, app-lokal), Systembibliotheken nicht. Dynamisch gelinkt (LGPL).
"""
import os, re, shutil, subprocess, sys

def deps_macho(p):
    out = subprocess.run(['otool', '-L', p], capture_output=True, text=True, check=True).stdout.splitlines()[1:]
    return [l.strip().split(' (')[0] for l in out if l.strip()]

def deps_elf(p):
    out = subprocess.run(['readelf', '-d', p], capture_output=True, text=True, check=True).stdout
    return re.findall(r'\(NEEDED\)\s+Shared library: \[(.+?)\]', out)

def deps_pe(p):
    import pefile
    pe = pefile.PE(p, fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT']])
    return [e.dll.decode() for e in getattr(pe, 'DIRECTORY_ENTRY_IMPORT', [])]

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
                if win:
                    continue  # Windows-Systembibliothek
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
    shutil.copyfile(exe, os.path.join(out, name))
    os.chmod(os.path.join(out, name), 0o755)
    if mac:
        for n in kopiert:  # eigene Bibliotheken finden sich gegenseitig im selben Ordner
            p = os.path.join(out, 'kern', n)
            subprocess.run(['install_name_tool', '-id', '@rpath/' + n, p], check=True)
            subprocess.run(['install_name_tool', '-add_rpath', '@loader_path', p], capture_output=True)
    if win and os.environ.get('VCToolsRedistDir'):
        import glob
        for crt in glob.glob(os.path.join(os.environ['VCToolsRedistDir'], 'x64', 'Microsoft.VC*.CRT', '*.dll')):
            shutil.copyfile(crt, os.path.join(out, 'kern', os.path.basename(crt)))
            kopiert.append(os.path.basename(crt))
    if mac:  # nach install_name_tool neu signieren (ad hoc), sonst startet arm64 nicht
        for n in kopiert:
            subprocess.run(['codesign', '-f', '-s', '-', os.path.join(out, 'kern', n)], check=True)
        subprocess.run(['codesign', '-f', '-s', '-', os.path.join(out, name)], check=True)
    groesse = sum(os.path.getsize(os.path.join(out, 'kern', n)) for n in kopiert)
    print(f'{len(kopiert)} Bibliotheken, {groesse / 1e6:.1f} MB')
    for n in sorted(kopiert):
        print('  ' + n)

if __name__ == '__main__':
    main()
