!macro NSIS_HOOK_POSTINSTALL
  ; Der Anzeigename des Öffnen-Befehls ist in der Tauri-Vorlage englisch. Hier nur die Beschriftung, die Zuordnung selbst kommt aus fileAssociations.
  ReadRegStr $R8 HKCR "HasiStep\shell\open\command" ""
  StrCmp $R8 "" +2
  WriteRegStr HKCR "HasiStep\shell\open" "" "Öffnen"
  ReadRegStr $R8 HKCR "SickingerStep\shell\open\command" ""
  StrCmp $R8 "" +2
  WriteRegStr HKCR "SickingerStep\shell\open" "" "Öffnen"
!macroend
