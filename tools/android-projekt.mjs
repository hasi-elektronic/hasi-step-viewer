// Je Marke ein reproduzierbar erzeugtes Android-Projekt. Der gemeinsame App-Code
// bleibt unverändert; nur der von Tauri erwartete aktive Projektordner wechselt.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const brand=process.argv[2];assert(['hasi','sickinger'].includes(brand),'Marke hasi oder sickinger angeben');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const gen=path.join(root,'src-tauri','gen'),active=path.join(gen,'android');
const marker=dir=>path.join(dir,'.hasi-brand.json');
const samePath=(a,b)=>{const normal=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);return normal(a)===normal(b)};
const safe=dir=>{
  assert(path.dirname(path.resolve(dir))===gen&&['android','android-hasi','android-sickinger'].includes(path.basename(dir)));
  assert(samePath(fs.realpathSync(gen),gen),'Projektwurzel darf kein Junction/Symlink sein');
  if(fs.existsSync(dir))assert(samePath(fs.realpathSync(dir),dir),'Projekt darf kein Junction/Symlink sein');
  return dir;
};
const identifierFor=mark=>JSON.parse(fs.readFileSync(path.join(root,'src-tauri','tauri.mobile-'+mark+'.conf.json'),'utf8')).identifier;
const validate=dir=>{
  safe(dir);
  const file=marker(dir),gradle=path.join(dir,'app','build.gradle.kts');
  for(const entry of [file,gradle])assert(samePath(fs.realpathSync(entry),entry),'Projektdatei darf kein Junction/Symlink sein');
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  assert(['hasi','sickinger'].includes(saved.brand),'Unbekannte Projektmarke');
  const identifier=identifierFor(saved.brand),build=fs.readFileSync(gradle,'utf8');
  assert.equal(saved.identifier,identifier,'Veraltete Projektkennung');
  const fields=new Map([...build.matchAll(/\b(namespace|applicationId)\s*=\s*"([^"]+)"/g)].map(m=>[m[1],m[2]]));
  for(const field of ['namespace','applicationId'])assert.equal(fields.get(field),identifier,'Gradle '+field+' stimmt nicht mit der Marke überein');
  return saved.brand;
};
if(fs.existsSync(active)){
  assert(fs.existsSync(marker(active)),'Vorhandenes Android-Projekt ohne Markenkennung wird nicht verschoben.');
  const previous=validate(active);
  if(previous!==brand){const parked=safe(path.join(gen,'android-'+previous));assert(!fs.existsSync(parked),'Zielprojekt existiert bereits');fs.renameSync(safe(active),parked)}
}
if(!fs.existsSync(active)&&fs.existsSync(path.join(gen,'android-'+brand))){const parked=path.join(gen,'android-'+brand);assert.equal(validate(parked),brand);fs.renameSync(safe(parked),safe(active))}
const configs=brand==='sickinger'?['--config','src-tauri/tauri.sickinger.conf.json']:[];
configs.push('--config','src-tauri/tauri.mobile-'+brand+'.conf.json');
if(!fs.existsSync(active)){
  const result=spawnSync(process.execPath,[path.join(root,'node_modules/@tauri-apps/cli/tauri.js'),'android','init','--ci','--skip-targets-install',...configs],{cwd:root,stdio:'inherit',env:{...process.env,MARKE:brand,MOBIL:'1'}});
  assert.equal(result.status,0,'Tauri Android init fehlgeschlagen');
  fs.writeFileSync(marker(active),JSON.stringify({brand,identifier:identifierFor(brand)},null,2)+'\n');
}
assert.equal(validate(active),brand);
// Native system-bar/keyboard layout is shared by both generated brand hosts.
const activity=path.join(active,'app','src','main','java',...identifierFor(brand).split('.'),'MainActivity.kt');
assert(samePath(fs.realpathSync(activity),activity));
const activityTemplate=fs.readFileSync(path.join(root,'src-tauri','android','MainActivity.kt.in'),'utf8');
assert.equal(activityTemplate.match(/\{\{PACKAGE\}\}/g)?.length,1,'Unbekanntes Activity-Template');
fs.writeFileSync(activity,activityTemplate.replace('{{PACKAGE}}',identifierFor(brand)));
// Die vom CLI-Template vorgeschlagene SDK kann eine noch nicht veröffentlichte
// Plattform sein. Der Pilot verwendet ausdrücklich die verfügbare API36.
const gradle=path.join(active,'app','build.gradle.kts');
let build=fs.readFileSync(gradle,'utf8');
assert(/compileSdk = \d+/.test(build)&&/targetSdk = \d+/.test(build),'Unbekanntes Android-Gradle-Template');
build=build.replace(/compileSdk = \d+/,'compileSdk = 36').replace(/targetSdk = \d+/,'targetSdk = 36');
fs.writeFileSync(gradle,build);
const wrapper=path.join(active,'gradle','wrapper','gradle-wrapper.properties');
assert(samePath(fs.realpathSync(wrapper),wrapper));
let properties=fs.readFileSync(wrapper,'utf8');
assert(properties.includes('gradle-9.6.1-bin.zip'),'Ungeprüfte Gradle-Version im CLI-Template');
properties=properties.replace(/^distributionSha256Sum=.*\r?\n/gm,'');
fs.writeFileSync(wrapper,properties.trimEnd()+'\ndistributionSha256Sum=9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14\n');
// Bei einem aus Node gestarteten init schreibt das CLI-Template sonst
// `node tauri ...`; Gradle läuft aber unter src-tauri und findet dieses Modul
// nicht. Die verwaltete Aufgabe verwendet das echte lokale CLI-Skript.
const task=path.join(active,'buildSrc','src','main','java',...identifierFor(brand).split('.'),'kotlin','BuildTask.kt');
assert(samePath(fs.realpathSync(task),task));
let taskSource=fs.readFileSync(task,'utf8');
assert(/val executable = [^;]+;/.test(taskSource)&&/val args = listOf\([^;]+;/.test(taskSource),'Unbekanntes Gradle-Rust-Template');
const kotlinString=value=>JSON.stringify(value).replaceAll('$','\\$');
taskSource=taskSource.replace(/val executable = [^;]+;/,()=>'val executable = '+kotlinString(process.execPath)+';')
  .replace(/val args = listOf\([^;]+;/,()=>'val args = listOf('+kotlinString(path.join(root,'node_modules','@tauri-apps','cli','tauri.js'))+', "android", "android-studio-script");');
fs.writeFileSync(task,taskSource);
console.log('Android-Projekt bereit: '+brand);
