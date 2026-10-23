# Windows-CI: Die Vorschau mit altem Produktnamen und alter Programmdatei installieren, dann das neue
# Setup.exe still darüber installieren. Erwartet: alte Vorschau weg, neue Programmdatei, Dateizuordnung
# auf die neue Programmdatei, Einstellungen (gleiche Kennung) bleiben, zweites Setup lässt die neue Installation stehen.
$ErrorActionPreference = 'Stop'
if ($env:ALT_OK -ne 'success') { Write-Output '::warning::Vorschau-Installer von #13 nicht verfügbar, Ersetzungs-Test übersprungen'; exit 0 }
if ($env:MARKE -eq 'sickinger') {
  $alt = 'Sickinger STEP-Viewer'; $altExe = 'sickinger-step-viewer.exe'
  $neu = 'MS3D'; $neuExe = 'ms3d.exe'; $klasse = 'SickingerStep'; $kennung = 'de.sickinger.stepviewer'
} else {
  $alt = 'Hasi STEP-Betrachter'; $altExe = 'hasi-step-betrachter.exe'
  $neu = 'Hasi 3D'; $neuExe = 'hasi-3d.exe'; $klasse = 'HasiStep'; $kennung = 'de.hasi-elektronic.stepviewer'
}
$uninst = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
function Pruefe($ok, $text) { if (-not $ok) { throw $text }; Write-Output "OK: $text" }
function Installiere($setup) {
  $p = Start-Process -Wait -PassThru -FilePath $setup -ArgumentList '/S'
  Pruefe ($p.ExitCode -eq 0) "$([IO.Path]::GetFileName($setup)) /S beendet mit 0 (Code $($p.ExitCode))"
}

$altSetup = Get-ChildItem -Recurse alt-vorschau -Filter '*-setup.exe' | Select-Object -First 1
$neuSetup = Get-ChildItem src-tauri/target/release/bundle/nsis -Filter '*-setup.exe' | Select-Object -First 1
Pruefe ($altSetup -and $altSetup.Name -like "$alt*") "alter Installer $($altSetup.Name)"
Pruefe ($neuSetup -and $neuSetup.Name -like "$neu*") "neuer Installer $($neuSetup.Name)"

# 1) Alte Vorschau installieren
Installiere $altSetup.FullName
Pruefe (Test-Path "$uninst\$alt") 'alte Vorschau eingetragen'
$altDir = (Get-ItemProperty "$uninst\$alt").InstallLocation.Trim('"')
Pruefe (Test-Path (Join-Path $altDir $altExe)) "alte Programmdatei $altDir\$altExe"
$cmd = (Get-ItemProperty "HKCU:\Software\Classes\$klasse\shell\open\command").'(default)'
Pruefe ($cmd -like "*\$altExe*") "Zuordnung zeigt zunächst auf $altExe"
$daten = Join-Path $env:APPDATA $kennung
New-Item -ItemType Directory -Force $daten | Out-Null
Set-Content (Join-Path $daten 'ci-marker.txt') 'bleibt'

# 2) Neues Setup darüber
Installiere $neuSetup.FullName
Pruefe (-not (Test-Path "$uninst\$alt")) 'alter Eintrag in Apps entfernt'
Pruefe (-not (Test-Path (Join-Path $altDir $altExe))) 'alte Programmdatei entfernt'
Pruefe (-not (Test-Path $altDir)) "alter Ordner $altDir entfernt"
Pruefe (-not (Test-Path "HKCU:\Software\Hasi Elektronic\$alt")) 'alter Installationsort-Schlüssel entfernt'
Pruefe (-not (Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\$alt.lnk")) 'alte Startmenü-Verknüpfung entfernt'
Pruefe (Test-Path "$uninst\$neu") 'neuer Eintrag in Apps'
$e = Get-ItemProperty "$uninst\$neu"
$neuDir = $e.InstallLocation.Trim('"')
Pruefe ($e.MainBinaryName -eq $neuExe) "MainBinaryName $($e.MainBinaryName)"
Pruefe (Test-Path (Join-Path $neuDir $neuExe)) "neue Programmdatei $neuDir\$neuExe"
Pruefe (Test-Path (Join-Path $neuDir 'hasi-kern.exe')) 'Kern neben der Programmdatei'
Pruefe (Test-Path (Join-Path $neuDir 'uninstall.exe')) 'neuer Deinstaller'
$cmd = (Get-ItemProperty "HKCU:\Software\Classes\$klasse\shell\open\command").'(default)'
Pruefe ($cmd -eq "`"$neuDir\$neuExe`" `"%1`"" -or $cmd -eq "$neuDir\$neuExe `"%1`"") "Doppelklick-Befehl: $cmd"
foreach ($ext in 'step', 'stp') {
  $k = (Get-ItemProperty "HKCU:\Software\Classes\.$ext").'(default)'
  Pruefe ($k -eq $klasse) ".$ext -> $k"
}
Pruefe (Test-Path (Join-Path $daten 'ci-marker.txt')) 'Einstellungen unter der Kennung bleiben erhalten'

# 3) Gleiches Setup noch einmal (Update auf sich selbst): der Hook darf die aktuelle Installation nicht entfernen
Installiere $neuSetup.FullName
Pruefe (Test-Path (Join-Path $neuDir $neuExe)) 'neue Installation nach zweitem Setup noch da'
Pruefe (Test-Path "$uninst\$neu") 'neuer Eintrag nach zweitem Setup noch da'
$cmd = (Get-ItemProperty "HKCU:\Software\Classes\$klasse\shell\open\command").'(default)'
Pruefe ($cmd -like "*\$neuExe*") "Zuordnung nach zweitem Setup: $cmd"
