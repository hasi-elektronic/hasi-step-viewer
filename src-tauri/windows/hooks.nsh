; Installer-Hooks (Tauri NSIS, bundle.windows.nsis.installerHooks), für beide Marken.
; Die Makros werden erst in der Install-Sektion eingesetzt, dort sind PRODUCTNAME, BUNDLEID usw. definiert.

!define HASI_UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall"

; Anführungszeichen am Anfang und Ende entfernen ("C:\x\uninstall.exe" -> C:\x\uninstall.exe)
!macro HASI_OHNE_ANFZ VAR
  StrCpy $R9 ${VAR} 1
  ${If} $R9 == '"'
    StrCpy ${VAR} ${VAR} "" 1
    StrCpy $R9 ${VAR} "" -1
    ${If} $R9 == '"'
      StrCpy ${VAR} ${VAR} -1
    ${EndIf}
  ${EndIf}
!macroend

; Alte Vorschau aus einem Tauri-Setup (NSIS) unter ROOT entfernen.
; Sie hat einen eigenen Deinstallations-Eintrag und Ordner, weil beide am alten Produktnamen hängen.
!macro HASI_ALTE_NSIS ROOT ALTNAME
  ReadRegStr $R5 ${ROOT} "${HASI_UNINST}\${ALTNAME}" "InstallLocation"
  ReadRegStr $R6 ${ROOT} "${HASI_UNINST}\${ALTNAME}" "UninstallString"
  ${If} "$R5$R6" != ""
    !insertmacro HASI_OHNE_ANFZ $R5
    !insertmacro HASI_OHNE_ANFZ $R6
    ${If} $R5 == ""
      ${GetParent} $R6 $R5
    ${EndIf}
    ${If} $R6 == ""
      StrCpy $R6 "$R5\uninstall.exe"
    ${EndIf}
    ${If} $R5 == $INSTDIR
      ; Gleicher Ordner wie die neue Installation: den alten Deinstaller NICHT starten, er würde die neue
      ; Installation treffen. Nur alte Programmdatei und alten Eintrag in „Apps“ entfernen.
      DetailPrint "Alte Vorschau „${ALTNAME}“ liegt im selben Ordner, nur der alte Eintrag wird entfernt."
      ReadRegStr $R7 ${ROOT} "${HASI_UNINST}\${ALTNAME}" "MainBinaryName"
      ${If} $R7 != ""
      ${AndIf} $R7 != "${MAINBINARYNAME}.exe"
        Delete "$R5\$R7"
      ${EndIf}
      DeleteRegKey ${ROOT} "${HASI_UNINST}\${ALTNAME}"
    ${ElseIf} ${FileExists} "$R6"
      DetailPrint "Alte Vorschau „${ALTNAME}“ wird entfernt: $R5"
      ClearErrors
      ; _?= lässt den Deinstaller an Ort und Stelle laufen, damit ExecWait wirklich wartet.
      ; Still (/S): Einstellungen und Daten unter der gleichen Kennung bleiben erhalten.
      ExecWait '"$R6" /S _?=$R5' $R7
      ${If} ${Errors}
        DetailPrint "Alte Vorschau „${ALTNAME}“ konnte nicht entfernt werden (Administratorrechte?). Bitte von Hand deinstallieren."
      ${ElseIf} $R7 <> 0
        DetailPrint "Alte Vorschau „${ALTNAME}“: Deinstallation endete mit Code $R7."
      ${Else}
        Delete "$R6"
        RMDir "$R5"
      ${EndIf}
    ${Else}
      ; Deinstaller fehlt (Ordner schon gelöscht): nur den verwaisten Eintrag entfernen
      DetailPrint "Verwaister Eintrag der alten Vorschau „${ALTNAME}“ wird entfernt."
      DeleteRegKey ${ROOT} "${HASI_UNINST}\${ALTNAME}"
    ${EndIf}
    ; Gemerkter Installationsordner der alten Vorschau (bleibt sonst beim stillen Deinstallieren stehen)
    DeleteRegKey ${ROOT} "Software\${MANUFACTURER}\${ALTNAME}"
  ${EndIf}
!macroend

; Alte Vorschau aus einem MSI. Normalfall MSI -> MSI erledigt MajorUpgrade über den festen Upgrade-Code.
; Hier nur der Fall „altes MSI, neues Setup.exe“. Pro Rechner installiert, daher fragt Windows nach Administratorrechten.
!macro HASI_ALTE_MSI ALTNAME
  StrCpy $R8 0
  ${Do}
    ClearErrors
    EnumRegKey $R5 HKLM "${HASI_UNINST}" $R8
    ${If} ${Errors}
    ${OrIf} $R5 == ""
      ${Break}
    ${EndIf}
    IntOp $R8 $R8 + 1
    ReadRegStr $R6 HKLM "${HASI_UNINST}\$R5" "DisplayName"
    ReadRegDWORD $R7 HKLM "${HASI_UNINST}\$R5" "WindowsInstaller"
    ${If} $R6 == "${ALTNAME}"
    ${AndIf} $R7 = 1
      DetailPrint "Alte Vorschau „${ALTNAME}“ (MSI $R5) wird entfernt."
      ExecWait '"$SYSDIR\msiexec.exe" /x $R5 /passive /norestart' $R7
      DetailPrint "msiexec: Code $R7"
      ${Break}
    ${EndIf}
  ${Loop}
!macroend

!macro HASI_ALTE_VORSCHAU_ENTFERNEN ALTNAME
  ; Nur alte Produktnamen: die aktuelle Installation (gleicher Name) fasst der Hook nie an.
  !if "${ALTNAME}" != "${PRODUCTNAME}"
    !insertmacro HASI_ALTE_NSIS HKCU "${ALTNAME}"
    !insertmacro HASI_ALTE_NSIS HKLM "${ALTNAME}"
    !insertmacro HASI_ALTE_MSI "${ALTNAME}"
  !endif
!macroend

; Läuft vor dem Kopieren der Dateien und vor der Dateizuordnung. Die alte Deinstallation entfernt die
; Zuordnung (ProgID HasiStep/SickingerStep), die neue Installation schreibt sie danach auf die neue Programmdatei.
!macro NSIS_HOOK_PREINSTALL
  !if "${BUNDLEID}" == "de.sickinger.stepviewer"
    !insertmacro HASI_ALTE_VORSCHAU_ENTFERNEN "Sickinger STEP-Viewer"
    !insertmacro HASI_ALTE_VORSCHAU_ENTFERNEN "Sickinger STEP-Betrachter"
  !else
    !insertmacro HASI_ALTE_VORSCHAU_ENTFERNEN "Hasi STEP-Betrachter"
  !endif
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Der Anzeigename des Öffnen-Befehls ist in der Tauri-Vorlage englisch. Hier nur die Beschriftung, die Zuordnung selbst kommt aus fileAssociations.
  ReadRegStr $R8 HKCR "HasiStep\shell\open\command" ""
  StrCmp $R8 "" +2
  WriteRegStr HKCR "HasiStep\shell\open" "" "Öffnen"
  ReadRegStr $R8 HKCR "SickingerStep\shell\open\command" ""
  StrCmp $R8 "" +2
  WriteRegStr HKCR "SickingerStep\shell\open" "" "Öffnen"
!macroend
