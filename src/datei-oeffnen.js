/**
 * Serialisiert Datei-Aufträge, ohne wartende Dateien zu verwerfen.
 * Identische gleichzeitige OS-/Webview-Ereignisse öffnen die Datei genau einmal.
 * @template T
 * @param {(error: unknown) => void} onError
 */
export function createOpenQueue(onError) {
  /** @type {{key: unknown, run: () => Promise<T>, promise: Promise<T|null>, resolve: (value: T|null) => void} | null} */
  let active = null;
  const pending = [];

  async function drain() {
    while (pending.length) {
      active = pending.shift();
      try { active.resolve(await active.run()); }
      catch (error) { onError(error); active.resolve(null); }
      active = null;
    }
  }

  /** @param {unknown} key @param {() => Promise<T>} run */
  return function enqueue(key, run) {
    if (active?.key === key) return active.promise;
    const existing = pending.find(item => item.key === key);
    if (existing) return existing.promise;
    let resolve;
    const promise = new Promise(res => { resolve = res; });
    pending.push({ key, run, promise, resolve });
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
    const steps = files.filter(file => isStepFile(file.name));
    if (steps.length) steps.forEach(file => handlers.open(file));
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
