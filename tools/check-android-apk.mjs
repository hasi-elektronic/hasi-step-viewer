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
  execFileSync(path.join(buildTools,process.platform==='win32'?'zipalign.exe':'zipalign'),['-c','-P','16','4',apk],{encoding:'utf8',windowsHide:true});
  // zipfile liest ohne Extraktion; kein Archivpfad kann Dateien überschreiben.
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const libs=JSON.parse(execFileSync(python,['-c',`
import zipfile,hashlib,json,sys,struct
libraries=[]
with zipfile.ZipFile(sys.argv[1]) as archive:
 for name in archive.namelist():
  if not (name.startswith('lib/') and name.endswith('.so')): continue
  data=archive.read(name)
  assert data[:6]==b'\\x7fELF\\x02\\x01', 'ELF64 little endian required'
  offset=struct.unpack_from('<Q',data,32)[0]
  size,count=struct.unpack_from('<HH',data,54)
  assert size>=56 and count>0 and offset+size*count<=len(data), 'Invalid ELF program headers'
  headers=[struct.unpack_from('<IIQQQQQQ',data,offset+i*size) for i in range(count)]
  loads=[{'offset':h[2],'virtualAddress':h[3],'alignment':h[7]} for h in headers if h[0]==1]
  relro=[{'virtualAddress':h[3],'memorySize':h[6]} for h in headers if h[0]==0x6474e552]
  libraries.append({'name':name,'sha256':hashlib.sha256(data).hexdigest(),'elf':data[:20].hex(),'loadSegments':loads,'relroSegments':relro})
print(json.dumps(libraries))
`,apk],{encoding:'utf8',windowsHide:true}));
  assert.equal(libs.length,1,'Jede Split-APK muss genau eine native App-Bibliothek enthalten');assert(libs.every(l=>l.name.endsWith('/libhasi_step_viewer_lib.so')),'Unerwartete native Bibliothek im mobilen Paket');
  for(const lib of libs){
    assert(lib.loadSegments.length>0&&lib.loadSegments.every(s=>s.alignment>=16384&&s.offset%16384===s.virtualAddress%16384),'Native LOAD-Segmente müssen 16 KB unterstützen');
    assert(lib.relroSegments.length>0&&lib.relroSegments.every(s=>(s.virtualAddress+s.memorySize)%16384===0),'GNU_RELRO muss vorhanden und sein Ende 16 KB ausgerichtet sein');
  }
  for(const lib of libs){
    const abi=lib.name.split('/')[1],target={'arm64-v8a':'aarch64-linux-android',x86_64:'x86_64-linux-android'}[abi];assert(target,'Unerwartete ABI '+abi);abis.add(abi);assert(badging.includes("native-code: '"+abi+"'"),'aapt-ABI stimmt nicht überein');assert.equal(lib.sha256,sha(fs.readFileSync(path.join('src-tauri/target',target,'debug','libhasi_step_viewer_lib.so'))),'APK enthält nicht die gebaute Rust-Bibliothek');assert(lib.elf.startsWith('7f454c460201'),'ELF64 little endian erwartet');assert.equal(Buffer.from(lib.elf,'hex').readUInt16LE(18),abi==='arm64-v8a'?183:62,'ELF e_machine stimmt nicht mit ABI-Verzeichnis überein');
    assert(process.env.ANDROID_NATIVE_BUILD_LOG,'Verbose Cargo-Buildlog fehlt');
    const commands=fs.readFileSync(process.env.ANDROID_NATIVE_BUILD_LOG,'utf8').split(/\r?\n/).filter(line=>line.includes('--crate-name hasi_step_viewer_lib')&&line.includes('--target '+target));
    assert(commands.length>0&&commands.every(line=>line.includes('-Wl,-z,max-page-size=16384')&&line.includes('-Wl,-z,common-page-size=16384')),'16-KB-Flags fehlen im tatsächlichen rustc-Aufruf');
    const commandFile=path.join(out,path.basename(apk)+'.rustc-command.txt');fs.writeFileSync(commandFile,commands.join('\n')+'\n');
    lib.rustcCommandSha256=sha(fs.readFileSync(commandFile));
  }
  const stem=path.basename(apk);fs.writeFileSync(path.join(out,stem+'.badging.txt'),badging);fs.writeFileSync(path.join(out,stem+'.manifest.txt'),manifest);fs.writeFileSync(path.join(out,stem+'.certificates.txt'),certificates);
  fs.writeFileSync(path.join(out,stem+'.zipalign.txt'),'PASS: zipalign -c -P 16 4 (exit 0)\n');
  results.push({apk:stem,sha256:sha(fs.readFileSync(apk)),bytes:fs.statSync(apk).size,identifier:config.identifier,version,versionCode:1007,minSdk:28,targetSdk:36,debug:true,zipAligned16K:true,libraries:libs});
}
assert.deepEqual([...abis].sort(),['arm64-v8a','x86_64'],'Beide Zielarchitekturen müssen vorhanden sein');
fs.writeFileSync(path.join(out,'apk-evidence.json'),JSON.stringify({brand,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),results},null,2)+'\n');
console.log('OK: '+results.length+' Debug-APKs, Marke/Version/SDK/Signatur/ELF/Quellbibliothek geprüft');
