// Unabhängige Metadaten aus den tatsächlich erzeugten, signierten Debug-APKs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const brand=process.argv[2],out=path.resolve(process.argv[3]||'output/android');assert(['hasi','sickinger'].includes(brand));fs.mkdirSync(out,{recursive:true});
const config=JSON.parse(fs.readFileSync('src-tauri/tauri.mobile-'+brand+'.conf.json','utf8')),version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const sdk=process.env.ANDROID_HOME;assert(sdk,'ANDROID_HOME fehlt');
const buildTools=path.join(sdk,'build-tools',process.env.ANDROID_BUILD_TOOLS||'36.0.0');
const aapt=path.join(buildTools,process.platform==='win32'?'aapt.exe':'aapt');
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
const apks=files('src-tauri/gen/android/app/build/outputs/apk').filter(f=>f.endsWith('-debug.apk'));assert.equal(apks.length,2,'Genau zwei getrennte Debug-APKs (ARM64/x86_64) erforderlich');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),results=[],abis=new Set();
for(const apk of apks){
  const badging=execFileSync(aapt,['dump','badging',apk],{encoding:'utf8',windowsHide:true});
  const manifest=execFileSync(aapt,['dump','xmltree',apk,'AndroidManifest.xml'],{encoding:'utf8',windowsHide:true});
  assert(badging.includes("name='"+config.identifier+"'"));assert(badging.includes("versionName='"+version+"'"));assert(badging.includes("versionCode='"+config.bundle.android.versionCode+"'"));
  assert(badging.includes("application-label:'"+config.productName+"'"));assert(badging.includes("sdkVersion:'28'"));assert(badging.includes("targetSdkVersion:'36'"));assert(badging.includes('application-debuggable'));
  assert(!/android.intent.action.(?:SEND|SEND_MULTIPLE|VIEW)"/.test(manifest),'Pilot darf nicht unterstützte externe Datei-Intents nicht anbieten');
  const certificates=execFileSync(java,['-jar',path.join(buildTools,'lib','apksigner.jar'),'verify','--verbose','--print-certs',apk],{encoding:'utf8',windowsHide:true});
  assert(certificates.includes('Verified using v2 scheme (APK Signature Scheme v2): true'));
  // zipfile liest ohne Extraktion; kein Archivpfad kann Dateien überschreiben.
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const libs=JSON.parse(execFileSync(python,['-c',"import zipfile,hashlib,json,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([{'name':n,'sha256':hashlib.sha256(z.read(n)).hexdigest(),'elf':z.read(n)[:20].hex()} for n in z.namelist() if n.startswith('lib/') and n.endswith('.so')]))",apk],{encoding:'utf8',windowsHide:true}));
  assert.equal(libs.length,1,'Jede Split-APK muss genau eine native App-Bibliothek enthalten');assert(libs.every(l=>l.name.endsWith('/libhasi_step_viewer_lib.so')),'Unerwartete native Bibliothek im mobilen Paket');
  for(const lib of libs){const abi=lib.name.split('/')[1],target={'arm64-v8a':'aarch64-linux-android',x86_64:'x86_64-linux-android'}[abi];assert(target,'Unerwartete ABI '+abi);abis.add(abi);assert(badging.includes("native-code: '"+abi+"'"),'aapt-ABI stimmt nicht überein');assert.equal(lib.sha256,sha(fs.readFileSync(path.join('src-tauri/target',target,'debug','libhasi_step_viewer_lib.so'))),'APK enthält nicht die gebaute Rust-Bibliothek');assert(lib.elf.startsWith('7f454c460201'),'ELF64 little endian erwartet');assert.equal(Buffer.from(lib.elf,'hex').readUInt16LE(18),abi==='arm64-v8a'?183:62,'ELF e_machine stimmt nicht mit ABI-Verzeichnis überein')}
  const stem=path.basename(apk);fs.writeFileSync(path.join(out,stem+'.badging.txt'),badging);fs.writeFileSync(path.join(out,stem+'.manifest.txt'),manifest);fs.writeFileSync(path.join(out,stem+'.certificates.txt'),certificates);
  results.push({apk:stem,sha256:sha(fs.readFileSync(apk)),bytes:fs.statSync(apk).size,identifier:config.identifier,version,versionCode:1007,minSdk:28,targetSdk:36,debug:true,libraries:libs});
}
assert.deepEqual([...abis].sort(),['arm64-v8a','x86_64'],'Beide Zielarchitekturen müssen vorhanden sein');
fs.writeFileSync(path.join(out,'apk-evidence.json'),JSON.stringify({brand,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),results},null,2)+'\n');
console.log('OK: '+results.length+' Debug-APKs, Marke/Version/SDK/Signatur/ELF/Quellbibliothek geprüft');
