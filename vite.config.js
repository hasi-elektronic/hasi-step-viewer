const marke = process.env.MARKE || 'hasi';
if (marke !== 'hasi' && marke !== 'sickinger') throw new Error('MARKE muss hasi oder sickinger sein: ' + marke);

/** Sickinger-HTML nur beim Marken-Build. Ohne MARKE bleibt index.html unverändert. */
function markeHtml() {
  return {
    name: 'marke-html',
    transformIndexHtml(html) {
      if (marke !== 'sickinger') return html;
      return html
        .replace('<html lang="de">', '<html lang="de" data-marke="sickinger">')
        .replace('<title>Hasi 3D</title>', '<title>MS3D</title>')
        .replace('<link rel="icon" href="data:,">', '<link rel="icon" href="./marken/sickinger.png">')
        .replace(
          '<div class="brand">HASI <span>3D</span></div>',
          '<div class="brand"><img class="logo" src="./marken/sickinger.png" alt="">MS<span>3D</span></div><button class="btn" id="ueber" type="button" title="Über diese Anwendung">Über</button>',
        )
        .replace(
          '<div id="drop">STEP-Datei hierher ziehen</div>',
          '<div id="drop"><img class="logo" src="./marken/sickinger.png" alt=""><b>MS3D</b><span>STEP-Datei hierher ziehen</span></div>',
        )
        .replace(
          '</body>',
          '<div id="ueberDlg" hidden><div class="dhead"><span>Über MS3D</span><button id="ueberClose" type="button" title="Schließen">×</button></div><p><b>MS3D</b><br>Manfred Sickinger Apparatebau</p><p class="hint">Entwickelt von Hasi Elektronic</p></div></body>',
        );
    },
  };
}

export default {
  base: './',
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
  build: { outDir: 'dist', target: 'es2022' },
  define: { 'import.meta.env.VITE_MARKE': JSON.stringify(marke) },
  plugins: [markeHtml()],
};
