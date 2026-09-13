import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
const resilientTap = readFileSync(new URL('../src/shared/gestures/ResilientTapController.ts', import.meta.url), 'utf8');
const nativeBridge = readFileSync(new URL('../src/platform/native/HookKeysNative.ts', import.meta.url), 'utf8');
const metronome = readFileSync(new URL('../src/features/metronome/MetronomeEngine.ts', import.meta.url), 'utf8');
const desktop = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
const androidCpp = readFileSync(new URL('../android/app/src/main/cpp/HookKeysNativeBridge.cpp', import.meta.url), 'utf8');
const androidJava = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
const iosEngine = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.mm', import.meta.url), 'utf8');
const iosPlugin = readFileSync(new URL('../ios/App/App/HookKeysNativePlugin.swift', import.meta.url), 'utf8');

function method(name, nextName) {
  const start = player.indexOf(`  private ${name}`);
  const end = player.indexOf(`  private ${nextName}`, start + 1);
  assert(start >= 0 && end > start, `Método ${name} não encontrado`);
  return player.slice(start, end);
}

const add = method('async importUserSoundfont', 'async renderUserSoundfonts');
assert.match(add, /soundLibrary\.addUser\(name, file, restoredId\)/);
assert.doesNotMatch(add, /moduleState|timbreId\s*=/,
  'Adicionar à biblioteca não pode selecionar o SF2 automaticamente');
assert.match(add, /Toque no timbre para selecionar neste módulo/);

const select = method('async selectUserSoundfont', 'async loadAcquireLicenseUrl');
assert.match(select, /moduleState\.timbreId\s*=\s*`user:/);
assert.match(select, /await this\.syncNativeEngine\(\)/,
  'A seleção deve aguardar o SF2 chegar ao motor');
assert(select.indexOf('await this.syncNativeEngine()') < select.lastIndexOf('this.closeModal()'),
  'O modal só pode fechar depois do carregamento');

assert.match(player,
  /Capacitor\.isNativePlatform\(\) \? 'application\/octet-stream,\.sf2' : '\.sf2'/,
  'iOS/Android precisam solicitar um documento, sem oferecer câmera ou fotos');
assert.match(player, /function moduleEmptySoundName[\s\S]*?return 'Sem timbre'/,
  'Arpeggiator e Sequencer não devem ocupar o botão da biblioteca');
assert.match(player, /classList\.toggle\('has-selected-timbre'/,
  'O botão do módulo deve receber a cor do timbre escolhido');

assert.match(resilientTap, /addEventListener\('scroll', this\.onScroll, true\)/,
  'Uma rolagem real precisa cancelar o toque');
assert.match(resilientTap, /elementFromPoint\(event\.clientX, event\.clientY\)/,
  'A soltura precisa terminar sobre o mesmo botão');
assert.match(resilientTap, /pending\.control\.click\(\)/,
  'O pointerup precisa executar o botão quando o WebView perder o click');
assert.match(resilientTap, /event\.stopImmediatePropagation\(\)/,
  'O click nativo posterior precisa ser deduplicado');

const nativeSync = method('async performNativeEngineSync', 'async syncNativeSoundfonts');
assert.match(nativeSync, /configurationTasks\.push\([\s\S]*configureModule/,
  'As rotas dos módulos precisam pertencer ao lote do motor');
assert.match(nativeSync, /configurationTasks\.push\([\s\S]*configureSynth/,
  'O Synth precisa estar pronto antes da primeira nota');
assert.match(nativeSync, /this\.metronome\.syncNativeState\(\)/,
  'O metrônomo precisa ser restaurado junto com o runtime');
assert(nativeSync.indexOf('await Promise.all(configurationTasks)') < nativeSync.indexOf('await this.syncNativeSoundfonts()'),
  'Os SF2 só podem entrar depois de módulos, master e metrônomo');

const nativeMidi = method('sendNativeMidi', 'async ensureNativeAudioReady');
assert.match(nativeMidi, /if \(this\.nativeEngineReady\)[\s\S]*hookKeysNative\.sendMidi/,
  'Notas ao vivo precisam do caminho direto, sem consulta de estado por toque');
assert.match(nativeMidi, /await this\.ensureNativeAudioReady\(\)/,
  'O primeiro toque deve aguardar a recuperação da saída');
assert.match(player, /Promise\.all\(\[[\s\S]*initializePromise[\s\S]*restorePromise/,
  'Boot e restauração precisam convergir antes da configuração final');

assert.match(nativeBridge, /audioOutputStatus\(\): Promise<NativeAudioOutputStatus>/);
assert.match(nativeBridge, /this\.lastAudioDeviceKey = null;[\s\S]*setAudioOutputDevice\('', 2, bufferSize\)/,
  'A recuperação precisa forçar a reabertura da saída padrão');
assert.match(metronome, /syncNativeState\(\): Promise<void>/,
  'A sincronização do metrônomo deve poder ser aguardada');
assert.match(desktop, /device\.default_output_config\(\)/,
  'Desktop deve preferir a configuração de saída validada pelo sistema');
assert.match(desktop, /callback_seen\.load\(Ordering::Acquire\)[\s\S]*\("ready", ready\), \("failed", !ready\)/,
  'Desktop precisa expor a saúde real do stream');
assert.match(androidCpp, /streamReady_[\s\S]*callbackSeen_[\s\S]*nativeAudioOutputReady/,
  'Android precisa detectar erro assíncrono do AAudio');
assert.match(androidJava, /public void audioOutputStatus\(PluginCall call\)/);
assert.match(iosEngine, /callbackSeen[\s\S]*audioOutputReady[\s\S]*_audioEngine\.isRunning/,
  'iOS precisa detectar a rota suspensa');
assert.match(iosPlugin, /CAPPluginMethod\(name: "audioOutputStatus"/);

console.log('SF2_FLOW_AND_RESILIENT_TAPS_OK');
