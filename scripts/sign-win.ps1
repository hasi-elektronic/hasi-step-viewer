# Windows-Dateien mit Microsoft Artifact Signing signieren ("Hasi-Elektronic") – über jsign.
# Die Umgebung (SIGN_TOKEN, JSIGN_JAR, …) setzt der Schritt "Signatur vorbereiten" im Release-Workflow.
# Ohne diese Umgebung (lokaler Build) wird nichts signiert.
# Aufruf: pwsh -NoProfile -File scripts/sign-win.ps1 <datei> [<datei> …]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Files)
$ErrorActionPreference = 'Stop'
if (-not $env:SIGN_TOKEN) {
  Write-Host "Signatur nicht eingerichtet – $($Files -join ', ') bleibt unsigniert"
  exit 0
}
foreach ($f in $Files) {
  $out = & java -jar $env:JSIGN_JAR --storetype TRUSTEDSIGNING --keystore $env:SIGN_HOST `
    --storepass $env:SIGN_TOKEN --alias "$($env:SIGN_ACCOUNT)/$($env:SIGN_PROFILE)" `
    --tsaurl http://timestamp.acs.microsoft.com --tsmode RFC3161 `
    --name $env:SIGN_NAME --url https://hasi-elektronic.de $f 2>&1
  $code = $LASTEXITCODE
  $out | ForEach-Object { Write-Host $_ }
  if ($code -ne 0) {
    $msg = ($out | Where-Object { "$_" -match 'jsign:|Caused by|Exception|HTTP' } | Select-Object -First 4) -join ' '
    Write-Host "::error title=Signatur fehlgeschlagen ($(Split-Path $f -Leaf))::$msg"
    exit 1
  }
}
