import {readFileSync} from 'node:fs';
const version=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version;
const mobile = process.env.MOBIL === '1' || ['android','ios'].includes(process.env.TAURI_ENV_PLATFORM);
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
          '<div class="brand"><img class="logo" src="./marken/sickinger.png" alt="">MS<span>3D</span></div>',
        )
        .replace(
          '<div id="drop">STEP-Datei hierher ziehen</div>',
          '<div id="drop"><img class="logo" src="./marken/sickinger.png" alt=""><b>MS3D</b><span>STEP-Datei hierher ziehen</span></div>',
        );
    },
  };
}

export default {
  base: './',
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
  build: { outDir: 'dist', target: 'es2022' },
  define: { 'import.meta.env.VITE_MARKE': JSON.stringify(marke), 'import.meta.env.VITE_MOBILE': JSON.stringify(mobile), __APP_VERSION__: JSON.stringify(version) },
  plugins: [markeHtml()],
};
