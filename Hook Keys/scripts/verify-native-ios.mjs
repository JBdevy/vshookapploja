import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const forbidden = /Capacitor|Cordova|CAPPlugin|CAPBridge|WKWebView|UIWebView|WebKit|CapApp-SPM/i;
const webFile = /\.(?:html?|[cm]?js|css|wasm)$/i;

// Inspect load commands, not just otool -L: that list does not distinguish
// LC_LOAD_DYLIB (mandatory at launch) from LC_LOAD_WEAK_DYLIB (optional).
// Build 98 aborted in dyld on iOS 16 because SwiftUICore was mandatory.
export function verifyIOSLoadCommands(output, executable = false) {
  const commands = output.split(/^Load command \d+\s*$/m).slice(1);
  assert(commands.length > 0, 'Comandos Mach-O ausentes: use otool -l.');
  for (const block of commands) {
    const command = block.match(/^\s*cmd (LC_\w+)\s*$/m)?.[1];
    const name = block.match(/^\s*name (.+?) \(offset \d+\)/m)?.[1];
    if (name?.includes('/SwiftUICore.framework/')) {
      assert.equal(command, 'LC_LOAD_WEAK_DYLIB',
        'SwiftUICore obrigatório impede abrir no iOS 16; use -weak_framework SwiftUICore.');
    }
  }
  if (executable) {
    const versions = commands.filter(block => /^\s*cmd LC_(BUILD_VERSION|VERSION_MIN_IPHONEOS)\s*$/m.test(block));
    assert(versions.length > 0, 'Executável sem versão mínima do iOS.');
    for (const block of versions) {
      if (/cmd LC_BUILD_VERSION/.test(block)) {
        assert(/^\s*platform (2|IOS)\s*$/m.test(block), 'IPA deve conter executável de dispositivo iOS, não simulador/macOS.');
      }
      const version = block.match(/^\s*(?:minos|version) (\d+)\.(\d+)(?:\.(\d+))?\s*$/m);
      assert(version, 'Versão mínima inválida no executável.');
      const [, major, minor, patch = '0'] = version;
      assert(Number(major) < 15 || (Number(major) === 15 && Number(minor) === 0 && Number(patch) === 0),
        `Executável exige iOS ${major}.${minor}.${patch}, acima do mínimo suportado 15.0.`);
    }
  }
}

export function verifyNativeBundle(bundle, inspectBinary) {
  const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const item = path.join(folder, entry.name);
    assert(!forbidden.test(entry.name), `Dependência web na IPA: ${item}`);
    assert(!webFile.test(entry.name), `Interface web na IPA: ${item}`);
    assert(!entry.isSymbolicLink(), `Link inesperado na IPA: ${item}`);
    return entry.isDirectory() ? walk(item) : [item];
  });
  const files = walk(bundle);
  const executable = path.join(bundle, 'App');
  assert(files.includes(executable), 'Executável App ausente na IPA.');
  let executableInspected = false;
  for (const folder of ['hook-b3', 'pads', 'loops', 'fx-1']) {
    assert(fs.statSync(path.join(bundle, folder)).isDirectory(), `Recurso ausente: ${folder}`);
  }
  for (const relative of requiredAudio()) {
    assert(fs.statSync(path.join(bundle, relative)).size > 0, `Áudio ausente/vazio: ${relative}`);
  }
  for (const file of files) {
    // Identify Mach-O binaries, including embedded Swift libraries, not only App.
    const fd = fs.openSync(file, 'r');
    const magic = Buffer.alloc(4);
    try { fs.readSync(fd, magic, 0, 4, 0); } finally { fs.closeSync(fd); }
    if (['cffaedfe', 'cefaedfe', 'cafebabe', 'bebafeca'].includes(magic.toString('hex'))) {
      const dependencies = inspectBinary(file);
      assert(!forbidden.test(dependencies), `Biblioteca web vinculada em ${file}: ${dependencies}`);
      verifyIOSLoadCommands(dependencies, file === executable);
      if (file === executable) executableInspected = true;
    }
  }
  assert(executableInspected, 'Executável App não é Mach-O válido.');
}

function requiredAudio() {
  return [
    ...['hook-b3', 'pads'].flatMap(folder => fs.readdirSync(path.join(root, 'native-engine/assets', folder))
      .filter(name => name.endsWith('.sf2')).map(name => `${folder}/${name}`)),
    ...['Beat 4-4', 'Beat 4-4 2', 'Beat 6-8'].map(name => `loops/${name}.mp3`),
    ...fs.readdirSync(path.join(root, 'public/assets/fx/fx-1'))
      .filter(name => name.endsWith('.mp3')).map(name => `fx-1/${name}`),
  ];
}

export function verifyNativeFrameworks(project) {
  const phase = project.match(/isa = PBXFrameworksBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/);
  assert(phase, 'Fase de linkagem dos frameworks ausente.');
  for (const name of ['AVFoundation', 'AudioToolbox', 'CoreMIDI']) {
    const file = [...project.matchAll(/([A-F0-9]{24}) \/\* [^\n]*? \*\/ = \{isa = PBXFileReference;([^\n]+)\};/g)]
      .find(([, , body]) => body.includes(`path = System/Library/Frameworks/${name}.framework;`) && body.includes('sourceTree = SDKROOT;'));
    assert(file, `Framework nativo ausente: ${name}`);
    const build = [...project.matchAll(/([A-F0-9]{24}) \/\* [^\n]*? \*\/ = \{isa = PBXBuildFile; fileRef = ([A-F0-9]{24})/g)]
      .find(([, , reference]) => reference === file[1]);
    assert(build && phase[1].includes(build[1]), `Framework fora da linkagem: ${name}`);
  }
}

export function verifyNativeProject() {
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  verifyNativeFrameworks(project);
  const definitions = new Set([...project.matchAll(/([A-F0-9]{24})\s+(?:\/\*[^\n]*?\*\/\s*)?=\s*\{/g)]
    .map(match => match[1]));
  for (const [id] of project.matchAll(/\b[A-F0-9]{24}\b/g)) {
    assert(definitions.has(id), `Referência Xcode órfã: ${id}`);
  }
  assert(!forbidden.test(project), 'O target iOS não pode vincular bibliotecas web.');
  // Keep the generated Skia flags inherited in both Debug and Release.
  assert.equal([...project.matchAll(/OTHER_LDFLAGS = \("\$\(inherited\)", "-weak_framework", SwiftUICore\);/g)].length, 2,
    'Debug e Release precisam manter SwiftUICore opcional sem perder as flags Skia.');
  assert(!/Main\.storyboard|capacitor\.config|config\.xml|\/\* public \*\//i.test(project),
    'O target iOS não pode empacotar a interface web.');
  const sources = [...project.matchAll(/path = ([\w.-]+\.(?:swift|mm|h));/g)].map(match => match[1]);
  for (const source of sources) {
    assert(!forbidden.test(read(`ios/App/App/${source}`)), `Dependência web em ${source}`);
  }
  assert.match(read('ios/App/App/AppDelegate.swift'), /rootViewController = BronzeNativeHostingController\(\)/);
  const audioFolders = { 'hook-b3': 'native-engine/assets/hook-b3', pads: 'native-engine/assets/pads',
    loops: 'public/assets/loops', 'fx-1': 'public/assets/fx/fx-1' };
  for (const [name, folder] of Object.entries(audioFolders)) {
    assert(project.includes(`../../${folder}`), `Referência Xcode ausente: ${name}`);
    assert(project.includes(`/* ${name} in Resources */`), `Recurso fora da build: ${name}`);
  }
  const required = requiredAudio();
  assert.equal(required.filter(f => f.startsWith('hook-b3/')).length, 9);
  assert.equal(required.filter(f => f.startsWith('pads/')).length, 2);
  assert.equal(required.filter(f => f.startsWith('fx-1/')).length, 12);
  for (const file of required) {
    const [folder, ...rest] = file.split('/');
    assert(fs.statSync(path.join(root, audioFolders[folder], ...rest)).size > 0, `Áudio vazio: ${file}`);
  }
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['native:sync:ios'], 'node scripts/verify-native-ios.mjs');
  console.log('IOS_NATIVE_PROJECT_OK: sem runtime web; SF2, Church e loops presentes.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyNativeProject();
  if (process.argv[2]) {
    assert.equal(process.argv[2], '--app');
    assert(process.argv[3], 'Use --app caminho/App.app');
    verifyNativeBundle(path.resolve(process.argv[3]), file => execFileSync('otool', ['-l', file], { encoding: 'utf8' }));
    console.log('IOS_NATIVE_BUNDLE_OK: sem runtime web; SwiftUICore não obrigatório; mínimo iOS 15.0.');
  }
}
