// Einzelteile als STEP: Hilfen für Namen (STEP-Kodierung, Windows-sichere Dateinamen) und das Nachbearbeiten der Datei.
// Wird von der Oberfläche (WASM-Weg) und den Tests benutzt; der native Weg setzt den Namen in Rust ein (gleiche Regeln).

/** Text als STEP-Zeichenkette (ISO 10303-21): ' verdoppelt, \ verdoppelt, Nicht-ASCII als \X2\…\X0\ (bzw. \X4\ außerhalb BMP). */
export function stepText(s) {
  let out = '', i = 0; const t = String(s ?? '');
  const cps = [...t].map(c => c.codePointAt(0));
  while (i < cps.length) {
    const c = cps[i];
    if (c >= 32 && c < 127) { const ch = String.fromCharCode(c); out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch; i++; continue; }
    if (c < 32 || c === 127) { out += ' '; i++; continue; }
    const vier = c > 0xffff; let hex = '';
    while (i < cps.length && cps[i] >= 127 && (cps[i] > 0xffff) === vier) { hex += cps[i].toString(16).toUpperCase().padStart(vier ? 8 : 4, '0'); i++; }
    out += (vier ? '\\X4\\' : '\\X2\\') + hex + '\\X0\\';
  }
  return out;
}

/** Teilname ohne die Nummerierung gleichnamiger Instanzen („Bolzen <2>“ → „Bolzen“). */
export const teilName = n => String(n || '').replace(/\s*<\d+>$/, '').trim() || 'Teil';

const RESERVIERT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
/** Windows-sicherer Dateiname (ohne Endung). Türkische und deutsche Zeichen bleiben. */
export function sichererName(n) {
  let s = String(n || '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!s) s = 'Teil';
  if (RESERVIERT.test(s.split('.')[0])) s = s + '_';
  if (s.length > 120) s = s.slice(0, 120).replace(/[. ]+$/, '');
  return s;
}

/** Eindeutige Dateinamen (Groß/Klein egal wie unter Windows): „Bolzen.step“, „Bolzen (2).step“ … */
export function eindeutigeNamen(namen, endung = '.step', belegt = []) {
  const seen = new Set(belegt.map(x => x.toLowerCase()));
  return namen.map(n => {
    const b = sichererName(n); let k = 1, f = b + endung;
    while (seen.has(f.toLowerCase())) f = `${b} (${++k})${endung}`;
    seen.add(f.toLowerCase()); return f;
  });
}

/** Produktnamen, Dateikopf und (im WASM-Weg mit OCCT 7.4) das Schema setzen. */
export function stepNachbearbeiten(text, { name, schema }) {
  const enc = stepText(name || 'Teil');
  let t = text.replace(/'(HASI_PRODUKTNAME|Open CASCADE STEP translator \d+\.\d+)(?: (\d+(?:\.\d+)*))?'/g, (_, __, z) => {
    const teile = (z || '').split('.'); return "'" + (teile.length > 1 ? `${enc} (${teile.at(-1)})` : enc) + "'";
  });
  t = t.replace(/FILE_NAME\('Open CASCADE Shape Model'/, `FILE_NAME('${enc}'`);
  if (schema === 'AP242' && !/AP242_MANAGED_MODEL_BASED/.test(t)) {
    t = t.replace(/FILE_SCHEMA\(\([\s\S]*?\)\);/, "FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }'));")
      .replace(/APPLICATION_PROTOCOL_DEFINITION\('international standard',\s*'automotive_design',\s*\d+,/, "APPLICATION_PROTOCOL_DEFINITION('international standard','ap242_managed_model_based_3d_engineering',2013,")
      .replace(/APPLICATION_CONTEXT\(\s*'core data for automotive mechanical design processes'\s*\)/, "APPLICATION_CONTEXT('Managed model based 3d engineering')");
  }
  return t;
}
