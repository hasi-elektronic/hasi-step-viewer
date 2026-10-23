// Nur die letzte Auswahl mit den letzten Optionen darf Ergebnis oder Fehler anzeigen.
export function createMessauftraege() {
  let revision=0;
  return {
    invalidate(){revision++},
    async run({bereit,ausfuehren,ergebnis,fehler,warten}) {
      const id=++revision,aktuell=()=>id===revision;
      warten?.();
      try{
        await bereit;
        if(!aktuell())return;
        const r=await ausfuehren();
        if(!aktuell())return;
        ergebnis(r);return r;
      }catch(e){if(aktuell())fehler(e)}
    },
  };
}
