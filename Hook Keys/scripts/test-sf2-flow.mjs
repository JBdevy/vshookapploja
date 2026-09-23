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
const soundStore = readFileSync(new URL('../src/features/sound-library/SoundLibraryStore.ts', import.meta.url), 'utf8');
const soundSelection = readFileSync(new URL('../src/features/player/SoundSelectionView.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const nativeEngine = readFileSync(new URL('../native-engine/src/HookKeysEngine.cpp', import.meta.url), 'utf8');
const tinySoundFont = readFileSync(new URL('../native-engine/src/TinySoundFontImplementation.cpp', import.meta.url), 'utf8');
const tinySoundFontLibrary = readFileSync(new URL('../native-engine/third_party/TinySoundFont/tsf.h', import.meta.url), 'utf8');
const tinyModule = readFileSync(new URL('../native-engine/src/TinySoundFontModule.cpp', import.meta.url), 'utf8');
const nativeRuntime = readFileSync(new URL('../native-engine/src/NativeEngineRuntime.cpp', import.meta.url), 'utf8');

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
assert.match(select, /classList\.toggle\('is-current-timbre', selected\)/,
  'O SF2 precisa ganhar o contorno imediatamente, antes do carregamento nativo terminar');

assert.match(player,
  /Capacitor\.isNativePlatform\(\) \? 'application\/octet-stream,\.sf2' : '\.sf2'/,
  'iOS/Android precisam solicitar um documento, sem oferecer câmera ou fotos');
assert.match(player, /function moduleEmptySoundName[\s\S]*?return 'Sem timbre'/,
  'Arpeggiator e Trance Gate não devem ocupar o botão da biblioteca');
assert.match(player, /classList\.toggle\('has-selected-timbre'/,
  'O botão do módulo deve receber a cor do timbre escolhido');
assert.match(soundStore, /storedCreationOrder\(left\) - storedCreationOrder\(right\)/,
  'SF2 do usuário precisam permanecer na ordem de inclusão');
assert.match(soundSelection, /selectedTimbreId === `fixed:\$\{sound\.id\}`[\s\S]*is-current-timbre/,
  'O timbre oficial selecionado precisa receber contorno próprio');
assert.match(player, /selectedTimbreId === `user:\$\{soundfont\.id\}`[\s\S]*is-current-timbre/,
  'O SF2 selecionado precisa receber contorno próprio');
assert.match(styles, /button\.is-current-timbre[\s\S]*border-color: #fff !important/,
  'O contorno do timbre atual precisa ser branco sobre qualquer cor');
assert.match(styles, /button\.is-current-timbre:disabled[\s\S]*opacity: 1 !important/,
  'O estado de carregamento não pode deixar o SF2 selecionado cinza');

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
assert.doesNotMatch(nativeSync, /await this\.syncNativeSoundfonts/,
  'A fila de parâmetros não pode aguardar a carga dos SF2');
assert.match(player, /nativeSoundfontSyncQueue[\s\S]*await configurationReady[\s\S]*await this\.syncNativeSoundfonts/,
  'Os SF2 entram por uma fila independente depois da configuração');
const soundfontSync = player.slice(player.indexOf('  private async syncNativeSoundfonts'));
assert.match(soundfontSync, /sourceByTimbre[\s\S]*hookKeysNative\.cloneSoundFont/,
  'O mesmo SF2 precisa ser transferido e interpretado uma vez antes de ser compartilhado');
assert.match(tinyModule, /tsf_copy\(source\.shareable_\)/,
  'As instâncias devem compartilhar apenas os dados imutáveis suportados pelo TinySoundFont');
assert.match(nativeRuntime, /cloneSoundFont[\s\S]*copySoundFontFrom/,
  'O runtime precisa entregar uma instância de reprodução separada a cada módulo');

const nativeMidi = method('sendNativeMidi', 'async ensureNativeAudioReady');
assert.match(nativeMidi, /if \(this\.nativeEngineReady \|\|[\s\S]*hookKeysNative\.sendMidi/,
  'Notas ao vivo precisam do caminho direto, sem consulta de estado por toque');
assert.match(nativeMidi, /!this\.liveMidiEnabled/,
  'Notas tocadas durante a animação de carregamento devem ser descartadas');
assert.doesNotMatch(nativeMidi, /nativeMidiQueue/,
  'Notas nunca podem ficar em fila aguardando o motor');
assert.match(nativeMidi, /this\.nativeRecoveryPromise = this\.ensureNativeAudioReady\(\)/,
  'Uma nota descartada pode iniciar recuperação, mas não ser reproduzida depois');
assert.match(player, /Promise\.all\(\[[\s\S]*initializePromise[\s\S]*restorePromise/,
  'Boot e restauração precisam convergir antes da configuração final');

assert.match(nativeBridge, /audioOutputStatus\(\): Promise<NativeAudioOutputStatus>/);
assert.match(nativeBridge, /if \(this\.initialized\) return send\(\)/,
  'Teclas da tela precisam entrar na ponte nativa sem await quando o motor já está pronto');
assert.match(nativeBridge, /this\.lastAudioDeviceKey = null;[\s\S]*setAudioOutputDevice\('', 2, bufferSize, sampleRate\)/,
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
assert.match(nativeBridge, /preserveEngine[\s\S]*if \(!preserveEngine\) this\.resetSynchronizationCache/,
  'Trocar somente o buffer não pode invalidar os SF2 já decodificados');
assert.match(desktop, /preserve_engine[\s\S]*reusable_engine/,
  'Desktop precisa reutilizar o motor ao trocar somente o buffer');
assert.match(androidCpp, /preserveRuntime[\s\S]*preservedRuntime/,
  'Android precisa reutilizar o motor ao trocar somente o buffer');
assert.match(iosEngine, /preserveEngine[\s\S]*_audioEngine pause/,
  'iOS precisa reiniciar o stream sem destruir o motor ao trocar somente o buffer');
for (const [name, source] of [['TypeScript', nativeBridge], ['desktop', desktop], ['Android C++', androidCpp],
  ['Android Java', androidJava], ['iOS engine', iosEngine], ['iOS plugin', iosPlugin]]) {
  assert.match(source, /[Mm]oduleAnalysis|module_analysis/, `${name} precisa encaminhar os medidores do compressor`);
  assert.match(source, /[Cc]loneSoundFont|clone_sound_font|clone_soundfont/,
    `${name} precisa encaminhar a cópia otimizada e independente do SF2`);
}
assert.match(desktop, /Result<\[f32; 24\], String>/,
  'Desktop precisa entregar módulos, soma dos módulos, Playlist, Click e Pads em estéreo');
assert.match(nativeBridge, /Array\.from\(\{ length: 24 \}/,
  'A interface precisa consumir os vinte e quatro níveis sem cortar Playlist, Click ou Pads');
assert.match(nativeEngine, /compressorInputPeaks_[\s\S]*publishProcessorLevels/,
  'Os medidores do compressor precisam nascer no sinal real do motor');
assert.match(nativeEngine, /settings_\.sampleRate \* 0\.03/,
  'Mudanças de fader precisam de rampa anti-zipper no callback');
assert.match(tinySoundFont, /TSF_RENDER_EFFECTSAMPLEBLOCK 64/,
  'SF2 precisa usar o bloco de controle nativo com interpolação interna, sem recalcular todo o DSP por amostra');
assert.match(tinySoundFontLibrary, /gainMonoStep[\s\S]*gainLeft \+= gainLeftStep/,
  'O ganho do envelope deve ser interpolado dentro do bloco para evitar tick no Note Off');
assert.match(tinySoundFontLibrary, /TSF_RENDER_SAMPLEEND_FADE 64[\s\S]*remaining \/ fadeDistance/,
  'O final físico da amostra SF2 precisa chegar a zero mesmo quando termina antes do Release');

assert.match(nativeBridge, /SOUNDFONT_CHUNK_BYTES = 4 \* 1024 \* 1024/,
  'SF2 grandes usam menos chamadas da WebView e leitura base64 pelo FileReader');
assert.match(nativeBridge, /reader\.readAsDataURL\(blob\)/);
for (const bridge of [desktop, androidJava, iosPlugin]) {
  assert.match(bridge, /assetKey|asset_key/, 'cache nativo é identificado pelo timbre, não pelo módulo');
  assert.match(bridge, /cached/, 'cache válido evita retransmitir o arquivo inteiro');
}
assert.match(nativeRuntime, /if \(!midiInputEnabled_\.load[\s\S]*return true;/,
  'MIDI físico também precisa ser descartado pelo motor durante o carregamento');
console.log('SF2_FLOW_AND_RESILIENT_TAPS_OK');
