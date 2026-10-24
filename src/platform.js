const WEB = Object.freeze({version:1,platform:'browser',desktopBackend:false,nativeKernel:false,nativeDocuments:false,nativeSave:false,multipleWindows:false});

/** @param {((command:string)=>Promise<unknown>)|undefined} invoke @param {boolean} mobileBuild */
export async function readHostCapabilities(invoke,mobileBuild=false) {
  if(!invoke)return {...WEB};
  try {
    const host=await invoke('app_faehigkeiten');
    if(!host||host.version!==1||typeof host.platform!=='string'||['desktopBackend','nativeKernel','nativeDocuments','nativeSave','multipleWindows'].some(k=>typeof host[k]!=='boolean'))throw new Error('Ungültige App-Fähigkeiten');
    if(mobileBuild&&host.desktopBackend)throw new Error('Mobiler Host meldet einen Desktop-Zugriff');
    return Object.freeze({...host});
  } catch(error) {
    // Bestehende Desktop-Test-/Alt-Hosts kennen den neuen Diagnosevertrag nicht.
    // Ein mobiles Paket darf nie auf privilegierte Desktop-Kommandos zurückfallen.
    if(mobileBuild)throw new Error('Mobiler App-Host konnte nicht initialisiert werden: '+(error.message||error));
    return Object.freeze({...WEB,platform:'desktop',desktopBackend:true,nativeKernel:true,nativeDocuments:true,nativeSave:true,multipleWindows:true});
  }
}
