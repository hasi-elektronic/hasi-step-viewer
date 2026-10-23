/**
 * Serialisiert Dateiwechsel: Ein neuer Auftrag wartet auf die Messdaten des alten
 * Modells. Währenddessen bleibt nur der zuletzt angeforderte Dateiwechsel übrig.
 * Identische gleichzeitige OS-/Webview-Ereignisse öffnen die Datei genau einmal.
 * @template T
 * @param {(error: unknown) => void} onError
 */
export function createOpenQueue(onError) {
  /** @type {{key: unknown, run: () => Promise<T>, promise: Promise<T|null>, resolve: (value: T|null) => void} | null} */
  let active = null, pending = null;

  async function drain() {
    while (pending) {
      active = pending;
      pending = null;
      try { active.resolve(await active.run()); }
      catch (error) { onError(error); active.resolve(null); }
      active = null;
    }
  }

  /** @param {unknown} key @param {() => Promise<T>} run */
  return function enqueue(key, run) {
    if (pending?.key === key) return pending.promise;
    if (active?.key === key) {
      if (pending) pending.resolve(null);
      pending = null;
      return active.promise;
    }
    if (pending) pending.resolve(null);
    let resolve;
    const promise = new Promise(res => { resolve = res; });
    pending = { key, run, promise, resolve };
    if (!active) void drain();
    return promise;
  };
}

/** @param {string} name */
export const isStepFile = name => /\.(step|stp)$/i.test(name);

/**
 * HTML5-Fallback für Browser und Webviews, die Dateidrops als DOM-Ereignis liefern.
 * Der Handler gilt für das gesamte Fenster, auch für Baum, Kopfzeile und Panels.
 * @param {Document} doc
 * @param {{open: (file: File) => unknown, hint: (visible: boolean) => void, invalid: () => void}} handlers
 */
export function installFileDrop(doc, handlers) {
  let depth = 0;
  const isFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  const reset = () => { depth = 0; handlers.hint(false); };
  const enter = event => { if (isFileDrag(event)) { event.preventDefault(); depth++; handlers.hint(true); } };
  const over = event => { if (isFileDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } };
  const leave = event => { if (isFileDrag(event) && --depth <= 0) reset(); };
  const drop = event => {
    if (!isFileDrag(event) && !event.dataTransfer?.files?.length) return;
    event.preventDefault();
    reset();
    const files = Array.from(event.dataTransfer?.files || []);
    const file = files.find(file => isStepFile(file.name));
    if (file) handlers.open(file);
    else handlers.invalid();
  };
  for (const [type, listener] of Object.entries({dragenter:enter, dragover:over, dragleave:leave, drop})) doc.addEventListener(type, listener);
  doc.defaultView?.addEventListener('blur', reset);
  return () => {
    for (const [type, listener] of Object.entries({dragenter:enter, dragover:over, dragleave:leave, drop})) doc.removeEventListener(type, listener);
    doc.defaultView?.removeEventListener('blur', reset);
    reset();
  };
}
