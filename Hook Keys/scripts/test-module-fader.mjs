import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const handleRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selector]) => selector.trim().endsWith('.player-module__fader-handle'));

test('toque longo não seleciona texto nem abre o callout do navegador', () => {
  assert.match(css, /\*\s*\{[\s\S]*?user-select:\s*none;[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?-webkit-touch-callout:\s*none;/);
  assert.match(css, /input,[\s\S]*?textarea,[\s\S]*?\[contenteditable="true"\][\s\S]*?user-select:\s*text;/);
});

test('módulos sem timbre descarregam o SF2 nas três plataformas', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('../src/platform/native/HookKeysNative.ts', import.meta.url), 'utf8');
  const desktop = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  const ios = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.h', import.meta.url), 'utf8');
  assert.match(player, /if \(!timbreId\)[\s\S]*?hookKeysNative\.unloadSoundFont\(moduleIndex\)/);
  assert.match(bridge, /async unloadSoundFont\(moduleIndex: number\)/);
  assert.match(desktop, /fn unload_sound_font\(/);
  assert.match(android, /public void unloadSoundFont\(PluginCall call\)/);
  assert.match(ios, /unloadSoundFontFromModule:/);
});

test('players temporários dos pads liberam a URL ao trocar arquivo ou fechar', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /URL\.revokeObjectURL\(pool\.url\)/);
  assert.match(player, /effectAudioLibrary\.save[\s\S]*?disposeEffectPadAudio/);
  assert.match(player, /for \(const key of \[\.\.\.this\.effectPadAudio\.keys\(\)\]\) this\.disposeEffectPadAudio\(key\)/);
});

test('Infinite Release cria vozes sobrepostas sem cortar o áudio anterior', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /effectPadAudio = new Map<string, \{\s*url: string;\s*objectUrl: boolean;\s*voices: Set<HTMLAudioElement>;\s*\}>/);
  assert.match(player, /const audio = new Audio\(pool\.url\);[\s\S]*?pool\.voices\.add\(audio\)/);
  assert.doesNotMatch(player, /const \{ audio \} = player;[\s\S]*?audio\.currentTime = 0/);
  assert.match(player, /releaseHeldEffectPads\(\)[\s\S]*?gateRelease === 'continue-press'/);
  assert.match(player, /finishEffectPadAudioVoice[\s\S]*?if \(pool\.voices\.size > 0\) return/);
});

test('Panic corta notas, pads, efeitos, música e metrônomo', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const tracks = readFileSync(new URL('../src/features/tracks/TrackTransport.ts', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../native-engine/src/HookKeysEngine.cpp', import.meta.url), 'utf8');
  assert.match(player, /data-action="toggle-module-output-mode"[\s\S]*?data-action="panic"[\s\S]*?>PANIC<\/button>/,
    'Panic fica em uma linha, imediatamente depois de Stereo/Mono');
  assert.match(player, /triggerPanic\(\)[\s\S]*?trackTransport\?\.stop\(\)[\s\S]*?metronome\.stop\(\)/);
  assert.match(player, /triggerPanic\(\)[\s\S]*?effectPadStates[\s\S]*?stopEffectPadAudio/);
  assert.match(player, /triggerPanic\(\)[\s\S]*?hookKeysNative\.stopAllNotes\(\)/);
  assert.match(tracks, /stop\(\): void \{[\s\S]*?this\.audio\.pause\(\)[\s\S]*?this\.clearQueuedTrack\(\)/);
  assert.match(engine, /applyAllNotesOff\(\)[\s\S]*?effects_\[index\]\.reset\(\)/);
});

test('pads de notas e efeitos ficam verdes com contorno branco enquanto ativos', () => {
  const pads = readFileSync(new URL('../src/features/player/PadsEffectsView.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(css, /\.performance-pad--note\.is-active,[\s\S]*?border-color:\s*#fff;[\s\S]*?linear-gradient\(160deg,\s*#24aa58,\s*#07572a\)/);
  assert.match(css, /\.performance-pad--effect\.is-active\s*\{[\s\S]*?border-color:\s*#fff;[\s\S]*?linear-gradient\(160deg,\s*#28b85e,\s*#075529\)/);
  assert.match(css, /\.performance-section\.is-editing \.performance-pad--effect\.is-active\s*\{[\s\S]*?border-color:\s*#fff;/);
  assert.match(player, /notesSection\.dataset\.activePadBank = this\.activePadBank/);
  for (const bank of ['A', 'B']) {
    assert.match(css, new RegExp(`data-pad-bank="${bank}"\\]\\:not\\(\\.is-selected\\)`));
    assert.match(css, new RegExp(`data-active-pad-bank="${bank}"\\] \\.performance-pad--note\\:not\\(\\.is-active\\)`));
  }
  for (const removedGreen of ['#9fd632', '#35d273', '#19c9aa']) {
    assert(!pads.includes(removedGreen), `a paleta de edição não deve oferecer o verde ${removedGreen}`);
  }
});

test('Playlist e Click chegam sem truncar; não confunde pad selecionado com áudio', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('../src/platform/native/HookKeysNative.ts', import.meta.url), 'utf8');
  assert.match(bridge, /Array\.from\(\{ length: 24 \}/);
  assert.match(player, /renderOutputMeter\('music', hookKeysNative\.tracksAvailable\(\)[\s\S]*?peaks\.slice\(18, 20\) : this\.trackTransport\?\.getOutputPeaks\(\)/);
  assert.match(player, /renderOutputMeter\('click', peaks\.slice\(20, 22\)\)/);
  assert.match(player, /renderOutputMeter\('effects', this\.effectMeterPeaks\(\)\)/);
  assert.match(player, /renderOutputMeter\('pads', peaks\.slice\(22, 24\)\)/);
});

test('knobs não deformam quando os 30% da Playlist estão abertos no desktop', () => {
  assert.match(css, /html\[data-runtime="desktop"\] \.player-screen--tablet\.is-tracks-split \.player-output-knob__face\s*\{[^}]*width:[^}]*height:/s);
  assert.match(css, /html\[data-runtime="desktop"\] \.player-screen--tablet\.is-tracks-split \.player-output-mini-meter\s*\{[^}]*height:/s);
});

test('dispositivo de áudio usa os nomes Módulos e Playlist', () => {
  const settings = readFileSync(new URL('../src/features/player/AppSettingsView.ts', import.meta.url), 'utf8');
  assert.match(settings, /Saídas - Módulos/);
  assert.match(settings, /Saídas - Playlist/);
  assert.doesNotMatch(settings, /Saídas - Timbres|Saídas - Músicas/);
});

test('somente o banco FX em edição recebe amarelo e selo EDIT', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /button\.classList\.toggle\('is-editing', this\.effectEditMode && isSelected\)/);
  assert.match(css, /\.pad-bank-button\.is-editing\s*\{[\s\S]*?background:\s*linear-gradient\(180deg,\s*#ffd84d,\s*#d99c0a\)/);
  assert.match(css, /\.pad-bank-button\.is-editing::after\s*\{[\s\S]*?content:\s*"EDIT"/);
});

test('visor flutuante do knob fecha após 2 s parado ou ao tocar fora', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /const KNOB_FOCUS_IDLE_MS = 2_000/);
  assert.match(player, /document\.addEventListener\('pointerdown', this\.handleKnobFocusOutsidePointerDown, true\)/);
  assert.match(player, /target\.closest\('\.knob-focus__card'\)[\s\S]*?this\.hideKnobFocus\(\)/);
  assert.match(player, /this\.syncKnobFocus\(input\);\s*this\.hideKnobFocus\(KNOB_FOCUS_IDLE_MS\)/);
});

test('botões de timbres mantêm dimensões fixas sem crescer no hover', () => {
  assert.match(css, /\.fixed-sound-grid\s*\{[\s\S]*?--fixed-sound-button-height:\s*46px;[\s\S]*?grid-auto-rows:\s*var\(--fixed-sound-button-height\)/);
  assert.match(css, /\.fixed-sound-grid button\s*\{[\s\S]*?height:\s*var\(--fixed-sound-button-height\);[\s\S]*?max-height:\s*var\(--fixed-sound-button-height\)/);
  assert.match(css, /\.sound-browser :is\(\.fixed-sound-grid button, \.user-sf2-list > button\):is\(:hover, :active, :focus\)[\s\S]*?transform:\s*none !important/);
  const selectedCategory = css.match(/\.sound-category-button\.is-selected\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.doesNotMatch(selectedCategory, /(?:min-height|padding|font-size)\s*:/);
  assert.match(css, /html\[data-runtime="desktop"\] \.sound-browser :is\(\.fixed-sound-grid button, \.user-sf2-list > button\):hover\s*\{[^}]*filter:\s*brightness\(1\.2\)/);
  assert.match(css, /\.performance-pad--effect:active\s*\{[^}]*filter:\s*brightness\(1\.25\)/);
});

test('Rotary do Organ tem ON/OFF no desktop e cursor dos knobs não usa quatro setas', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /kind === 'module-organ'[\s\S]*?this\.desktopRuntime \? `<button[\s\S]*?data-module-effect-power="rotary"/);
  assert.match(player, /pageKind\(\) === 'module-env-filter' \|\| kind === 'module-organ'/);
  assert.match(css, /html\[data-runtime="desktop"\] :is\(\.module-envelope-knob, \.module-effect-knob, \.player-output-knob\)\s*\{[^}]*cursor:\s*pointer/);
});

test('transporte superior e medidor da Playlist usam progresso e sinal reais', () => {
  const transport = readFileSync(new URL('../src/features/tracks/TrackTransport.ts', import.meta.url), 'utf8');
  assert.match(transport, /data-top-transport-progress/);
  assert.match(transport, /getOutputPeaks\(\): \[number, number\]/);
  assert.match(transport, /createChannelSplitter\(2\)/);
  assert.match(css, /\.track-transport__progress\s*\{[^}]*grid-column:\s*1 \/ -1/);
});

test('modal de posição oferece Play à esquerda do OK, sem Voltar', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const transport = readFileSync(new URL('../src/features/tracks/TrackTransport.ts', import.meta.url), 'utf8');
  const footer = player.match(/: kind === 'track-position'\s*\? `([\s\S]*?)`\s*: kind === 'compatibility-mode'/)?.[1] ?? '';
  assert.match(footer, /data-modal-action="play-track-position"/);
  assert.match(footer, /data-modal-action="confirm">OK/);
  assert.doesNotMatch(footer, />Voltar</);
  assert.match(player, /modalAction === 'play-track-position'[\s\S]*?playFromCurrentPosition\(\)/);
  assert.match(transport, /async playFromCurrentPosition\(\): Promise<void>/);
  assert.match(css, /\.player-modal--track-position \.player-modal__actions \{\s*justify-content: space-between;/);
});

test('medidor dos efeitos no desktop lê o áudio dos efeitos, não apenas o volume configurado', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /private effectMeterPeaks\(\): \[number, number\][\s\S]*?getFloatTimeDomainData\(samples\)/);
  assert.match(player, /private async attachEffectMeter\(audio: HTMLAudioElement\)/);
  assert.match(player, /await this\.attachEffectMeter\(audio\);\s*await audio\.play\(\)/);
});

test('app limita o custo dos pads e não reinicializa o player ao terminar um FX', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../native-engine/src/NativeEngineRuntime.cpp', import.meta.url), 'utf8');
  assert.match(runtime, /constexpr int kPadMaximumVoices = 128/);
  assert.match(runtime, /if \(!pad->hasActiveVoices\(\)\) continue;\s*pad->renderAdd/);
  const stopEffect = player.match(/private stopEffectPadAudio[\s\S]*?\n  }\n\n  private finishEffectPadAudioVoice/)?.[0] ?? '';
  const finishEffect = player.match(/private finishEffectPadAudioVoice[\s\S]*?\n  }\n\n  private disposeEffectPadAudio/)?.[0] ?? '';
  assert.doesNotMatch(stopEffect, /audio\.load\(\)/);
  assert.doesNotMatch(finishEffect, /audio\.load\(\)/);
});

test('FX 1 mantém o nome Church fixo, mas preserva cor, volume e Learn CC', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /const hasFixedEffectName = this\.activeEffectBank === '1'/);
  assert.match(player, /hasFixedEffectName \? '' : `[\s\S]*?data-effect-name-input/);
  assert.match(player, /if \(this\.activeEffectBank !== '1' && input\)[\s\S]*?effect\.name =/);
  assert.match(player, /if \(bank !== '1'\)[\s\S]*?openModal\('effect-bank-name'/);
  assert.match(player, /class="effect-pad-editor[\s\S]*?data-effect-pad-volume[\s\S]*?learn-effect-cc/);
  assert.match(css, /\.effect-pad-editor\.has-fixed-name\s*\{[\s\S]*?"preview preview"/);
});

test('metrônomo usa o azul do Click e Pads - Efects usa o dourado do Config', () => {
  assert.match(css, /\.player-metronome-button,[\s\S]*?\[data-action="toggle-metronome"\][\s\S]*?--button-color-a:\s*#24b8ff/);
  assert.match(css, /\.player-metronome-button\.is-active,[\s\S]*?--button-color-a:\s*#24b8ff/);
  assert.match(css, /\.player-navigation__pads-button,[\s\S]*?\[data-action="show-pads-effects"\][\s\S]*?--button-color-a:\s*var\(--gold-bright\)[\s\S]*?--button-color-b:\s*var\(--gold-deep\)[\s\S]*?color:\s*#090705/);
  assert.match(css, /\.player-module__settings-button\s*\{\s*--button-color-a:\s*var\(--gold-bright\)[^}]*--button-color-b:\s*var\(--gold-deep\)/);
});

test('FX escolhidos para os pads voltam do armazenamento local ao reabrir o app', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../src/features/effects/EffectAudioStore.ts', import.meta.url), 'utf8');
  assert.match(store, /async getFileName\(bank: EffectBankId, effectNumber: number\)/);
  assert.match(store, /getRecord\(bank, effectNumber\)\)\?\.fileName/);
  assert.match(player, /await this\.restoreEffectAudioAssignments\(\)/);
  assert.match(player, /effect\.audioFileName = fileName/);
});

test('iOS inicia diretamente no host nativo, sem registro de plugins', () => {
  const delegate = readFileSync(new URL('../ios/App/App/AppDelegate.swift', import.meta.url), 'utf8');
  assert.match(delegate, /rootViewController = BronzeNativeHostingController\(\)/);
  assert.doesNotMatch(delegate, /Capacitor|Bridge|registerPlugin/);
});
test('iOS generator and DSP use the same sample-rate clock negotiated by the route', () => {
  const engine = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.mm', import.meta.url), 'utf8');
  assert.match(engine, /outputFormat\s*=\s*\[_audioEngine\.outputNode inputFormatForBus:0\]/);
  assert.match(engine, /sampleRate\s*=\s*outputFormat\.sampleRate/);
  assert.match(engine, /makeSourceNode\(renderFormat, state\)/);
  assert.match(engine, /initWithFormat:format renderBlock:/);
  assert.match(engine, /connect:_sourceNode to:_audioEngine\.mainMixerNode format:renderFormat/);
  assert.doesNotMatch(engine, /connect:_sourceNode to:_audioEngine\.mainMixerNode format:nil/);
});


test('Android and desktop build their DSP clock from the actual 44.1/48 kHz stream', () => {
  const android = readFileSync(new URL('../android/app/src/main/cpp/HookKeysNativeBridge.cpp', import.meta.url), 'utf8');
  const desktop = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert.match(android, /sampleRate\s*=\s*static_cast<double>\(AAudioStream_getSampleRate\(stream_\)\)/);
  assert.match(android, /NativeEngineRuntime>\(sampleRate, kRenderChunkFrames\)/);
  assert.match(desktop, /sample_rate\s*=\s*selected\.sample_rate\(\)/);
  assert.match(desktop, /NativeRuntime::new\([\s\S]*sample_rate as f64/);
});

test('iOS batches MIDI paint and isolates dynamic keyboard and meter layers', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/platform/runtime.ts', import.meta.url), 'utf8');
  assert.match(runtime, /dataset\.platform\s*=\s*isNative \? Capacitor\.getPlatform\(\)/);
  assert.match(player, /iosRuntime[\s\S]*pendingKeyboardNoteStates[\s\S]*requestAnimationFrame/);
  assert.match(css, /html\[data-platform="ios"\] :is\(\.player-module__meter, \.performance-keyboard__key\)[\s\S]*contain:\s*paint/);
  assert.match(css, /html\[data-platform="ios"\] \.player-module__meter-fill[\s\S]*transition-property:\s*transform/);
});

test('mobile effects omitted from a call stay bypassed rather than activating compression', () => {
  const plugin = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  for (const effect of ['compressorMix', 'delayMix', 'reverbMix']) {
    assert(plugin.includes(`call.getFloat("${effect}", 0.0f)`), `${effect} deve nascer em zero`);
  }
});

test('module fader handles reach the inner edges without protruding in every layout', () => {
  assert(handleRules.length >= 3);
  const offsets = handleRules.filter(([, , declarations]) => /(?:left|right):/.test(declarations));
  assert(offsets.length >= 4);
  for (const [, selector, declarations] of offsets) {
    assert.match(declarations, /left:\s*[01]px;/, selector.trim());
    assert.match(declarations, /right:\s*[01]px;/, selector.trim());
    assert.doesNotMatch(declarations, /(?:left|right):\s*-/, selector.trim());
  }
  for (const railWidth of [20, 24, 27, 38, 42]) {
    const contentWidth = railWidth - 2; // Shared themed rail has a 1px border.
    const handleWidth = contentWidth;
    assert(handleWidth > 0);
    assert.equal(1 + handleWidth, railWidth - 1);
  }
});

test('all eight modules inherit the same darker Synth gray theme', () => {
  assert.match(css, /--module-accent:\s*#7b8390;/);
  assert.match(css, /--module-surface-a:\s*#1c1e22;/);
  assert.match(css, /--module-surface-b:\s*#0b0c0f;/);
  assert.doesNotMatch(css, /\.player-module:nth-child\(\d\)\s*\{\s*--module-accent:/);
});

test('module fader uses the vertical bronze-metal model with side lights and no dots', () => {
  const themed = handleRules.find(([, , declarations]) => declarations.includes('--module-fader-handle-half'))[2];
  assert.match(themed, /height:\s*var\(--module-fader-handle-height\)/);
  assert.match(themed, /border-radius:\s*2px;/);
  assert.match(themed, /#e3a66a/);
  assert.match(themed, /#c97832/);
  assert.match(css, /\.player-screen \.player-module__fader-rail\s*\{[^}]*#4a2818[^}]*#d99a5d/s);
  assert.match(css, /\.player-screen \.player-module__fader-handle::before\s*\{[^}]*border-radius:\s*999px;/s);
  assert.doesNotMatch(css, /\.player-screen \.player-module__fader-handle::after\s*\{/);
});

test('preset e banco ativos pulsam com contorno RGB sem trocar o preenchimento', () => {
  assert.match(css, /\.player-presets \.player-preset-button\.is-selected,[\s\S]*?\.player-presets \.player-navigation__bank-button\[data-action="show-bank"\]\.is-selected[\s\S]*?active-selection-rgb-border 2\.4s linear infinite/);
  assert.match(css, /@keyframes active-selection-rgb-border\s*\{[\s\S]*?#ff3b30[\s\S]*?#34c759[\s\S]*?#32ade6[\s\S]*?#bf5af2/);
});

test('modal flutuante do knob oferece ajuste fino acelerado por + e menos', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /data-knob-focus-step="1"[\s\S]*?data-knob-focus-step="-1"/);
  assert.match(player, /current >= 1_000[\s\S]*?Math\.floor\(current \/ 100\)[\s\S]*?Math\.ceil\(current \/ 100\)/,
    'os botões finos dos tempos passam de 1.0 para 1.1, 1.2 e 1.3 segundos');
  assert.match(player, /private bindKnobFocusStepButtons\(overlay: HTMLElement\)/);
  assert.match(player, /current \+ direction \* step/);
  assert.match(player, /repeatDelayMs = Math\.max\(110, repeatDelayMs - 18\)/);
  assert.match(css, /\.knob-focus__controls\s*\{[^}]*grid-template-columns:\s*34px 118px 34px/s);
});

test('audio meter fills the complete rail as independent stereo halves', () => {
  const meterRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector.trim().endsWith('.player-module__meter'));
  const themed = meterRules.find(([, , declarations]) => declarations.includes('z-index: 1'));
  assert(themed);
  assert.match(themed[2], /inset:\s*3px;/);
  assert.match(themed[2], /width:\s*auto;/);
  assert.match(themed[2], /overflow:\s*hidden;/);
  assert.match(css, /\.player-module__meter::after\s*\{[^}]*left:\s*50%;/s);
  assert.match(css, /width:\s*calc\(50% - \.5px\);/);
  // Degradê em altura total dentro de uma janela: os dois andam só com transform
  // (GPU), sem repintar e sem comprimir as cores.
  assert.match(css, /\.player-module__meter-fill > i\s*\{[^}]*#0db758[^}]*#ffe23b[^}]*var\(--meter-peak-color, #ff9b22\) 100%/s);
  assert.match(css, /#54d636 76\.7%,\s*#ffe23b 76\.7%,\s*#ffe23b 88\.3%,\s*#ff9b22 88\.3%/);
  assert.match(css, /\.player-module__fader\.is-clipping\s*\{\s*--meter-peak-color:\s*#ff3e32;/);
  assert.match(css, /\.player-module__meter-fill\s*\{[^}]*overflow:\s*hidden;[^}]*transform:\s*translate3d\(0, 100%, 0\);[^}]*transition:\s*transform 90ms linear/s);
  assert.doesNotMatch(css, /transition:\s*clip-path/);
  const fader = readFileSync(new URL('../src/features/player/ModuleFader.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /const db = peak > 0 \? Math\.max\(MODULE_FADER_MIN_DB, 20 \* Math\.log10\(peak\)\)/);
  assert.match(fader, /const clipping = leftDb > 0 \|\| rightDb > 0;/);
  assert.doesNotMatch(css.match(/\.player-module__meter-fill > i\s*\{[^}]*\}/s)?.[0] ?? '', /#ff3e32|#dc001b/);
  assert.match(fader, /window\.style\.transform = `translate3d\(0, \$\{hidden\}%, 0\)`/);
  assert.match(fader, /gradient\.style\.transform = `translate3d\(0, -\$\{hidden\}%, 0\)`/);
  assert.doesNotMatch(fader, /style\.clipPath|scaleY\(/);
  assert.match(css, /html\[data-runtime="native"\] \.player-module__meter-fill/);
  assert.match(css, /\.player-module__fader\.is-clipping \.player-module__meter-fill/);
});

test('live fader gain is forwarded by every native platform bridge', () => {
  for (const [path, marker] of [
    ['../src/platform/native/HookKeysNative.ts', 'setModuleGain'],
    ['../src-tauri/src/main.rs', 'set_module_gain'],
    ['../src-tauri/src/native_engine_bridge.cpp', 'hk_runtime_set_module_gain'],
    ['../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', 'setModuleGain'],
    ['../android/app/src/main/cpp/HookKeysNativeBridge.cpp', 'nativeSetModuleGain'],
    ['../ios/App/App/HookKeysNativeEngine.mm', 'setModuleGainDb'],
  ]) {
    assert(readFileSync(new URL(path, import.meta.url), 'utf8').includes(marker), path);
  }
});

test('library default and active module ON/HLD/MOD use darker greens without overwriting timbre colors or OFF red', () => {
  assert.match(css, /--module-button-green-a: #18874e;/);
  assert.match(css, /--module-button-green-b: #064526;/);
  for (const selector of ['.player-module__sound-button', '.player-screen .player-module__power-button.is-on', ':is(.player-screen, .player-modal) .player-module__filter-button:not(.is-blocked)']) {
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, candidate, declarations]) => candidate.trim().endsWith(selector) && declarations.includes('--module-button-green-a'));
    assert(rule, selector);
    assert.match(rule[2], /--button-color-a: var\(--module-button-green-a\) !important;/);
    assert.match(rule[2], /--button-color-b: var\(--module-button-green-b\) !important;/);
  }
  assert.match(css, /\.player-module__sound-button\.has-selected-timbre\s*\{[^}]*var\(--module-sound-color\)/);
  assert.match(css, /\.player-module__power-button\.is-off,[\s\S]*?--button-color-a: #f05a4f !important;/);
  assert.match(css, /\.player-screen \.player-module__action-button\.is-octave-active,\s*\.player-screen \.player-module__power-button\.is-on\s*\{[^}]*--button-color-a: var\(--module-button-green-a\) !important;/);
});

test('all module borders use the same gold identity without changing the common gray surfaces', () => {
  assert.match(css, /--module-border-color: var\(--gold-border\);/);
  assert.doesNotMatch(css, /\.player-module:nth-child\(\d\)\s*\{\s*--module-border-color:/);
  assert.match(css, /\.player-module\s*\{\s*border-color: var\(--module-border-color\);/);
  assert.doesNotMatch(css, /\.player-module:nth-child\(\d\)\s*\{[^}]*--module-surface/);
});

function transpile(path, modules = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const context = { exports: {}, require(specifier) {
    assert(specifier in modules, `Unexpected runtime import: ${specifier}`);
    return modules[specifier];
  } };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

test('module faders and output levels pass through -90 dB before -inf', () => {
  const fader = transpile('../src/features/player/ModuleFader.ts', {
    '../../shared/gestures/LongPressGesture': { LongPressGesture: class {} },
    '../../shared/gestures/DoubleTapTracker': { DoubleTapTracker: class {} },
    '../../platform/runtime': { isDesktopRuntime: () => true },
  });
  const output = transpile('../src/features/player/OutputControls.ts', { './ModuleFader': fader });
  assert.equal(fader.MODULE_FADER_MIN_DB, -90);
  assert.equal(fader.MODULE_FADER_MAX_DB, 0);
  assert.equal(fader.formatFaderDb(-90), '−∞ dB');
  assert.equal(fader.formatFaderDb(-89.9), '-89.9 dB');
  // Rail bottom (6% safe area) is silence; the tail reaches -60 dB at 6% of travel.
  assert.equal(fader.visualPositionToFaderDb(0.06), -90);
  assert.equal(fader.visualPositionToFaderDb(0.06 + 0.06 * 0.88), -60);
  assert(fader.visualPositionToFaderDb(0.06 + 0.03 * 0.88) < -60, 'fader has room between -60 dB and silence');
  assert.equal(fader.visualPositionToFaderDb(0.94) + 0, 0, '0 dB is the top of the fader');

  assert.equal(output.OUTPUT_MIN_DB, -90);
  assert.equal(output.MAX_OUTPUT_DB, 0);
  assert.equal(output.outputDbFromPosition(0), -90);
  assert.equal(output.outputDbFromPosition(3), -75);
  assert.equal(output.outputDbFromPosition(6), -60);
  assert.equal(output.outputDbFromPosition(100), 0, '0 dB is the end of the output knob');
  assert.equal(output.formatOutputDb(-90), '−∞ dB');
  assert.equal(output.formatOutputDb(-75), '-75.0 dB');
  assert.equal(output.outputPosition(-75), 3);
});

test('velocity limits are forwarded by every native platform bridge', () => {
  for (const [path, markers] of [
    ['../src/platform/native/HookKeysNative.ts', ["'configure_velocity_limits'", 'plugin.configureVelocityLimits']],
    ['../src-tauri/src/main.rs', ['fn configure_velocity_limits', '            configure_velocity_limits,']],
    ['../src-tauri/src/native_engine_bridge.cpp', ['hk_runtime_configure_velocity_limits', 'setVelocityLimits']],
    ['../ios/App/App/HookKeysNativeEngine.h', ['configureVelocityLimits:']],
    ['../ios/App/App/HookKeysNativeEngine.mm', ['configureVelocityLimits:', 'setVelocityLimits']],
    ['../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', ['public void configureVelocityLimits', 'nativeConfigureVelocityLimits(']],
    ['../android/app/src/main/cpp/HookKeysNativeBridge.cpp', ['nativeConfigureVelocityLimits', 'setVelocityLimits']],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const marker of markers) assert(source.includes(marker), `${path}: ${marker}`);
  }
});

test('metronome output route is forwarded by every native platform bridge', () => {
  for (const [path, markers] of [
    ['../src/platform/native/HookKeysNative.ts', ["'set_metronome_output'", 'plugin.setMetronomeOutput']],
    ['../src-tauri/src/main.rs', ['fn set_metronome_output', 'hk_runtime_set_metronome_output', '            set_metronome_output,']],
    ['../src-tauri/src/native_engine_bridge.cpp', ['hk_runtime_set_metronome_output', 'setMetronomeOutput']],
    ['../ios/App/App/HookKeysNativeEngine.h', ['setMetronomeOutputChannelStart:']],
    ['../ios/App/App/HookKeysNativeEngine.mm', ['setMetronomeOutputChannelStart:', 'setMetronomeOutput(']],
    ['../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', ['public void setMetronomeOutput', 'nativeSetMetronomeOutput(']],
    ['../android/app/src/main/cpp/HookKeysNativeBridge.cpp', ['nativeSetMetronomeOutput', 'setMetronomeOutput(']],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const marker of markers) assert(source.includes(marker), `${path}: ${marker}`);
  }
});

test('music plays inside the iOS engine with its own output', () => {
  for (const [path, markers] of [
    ['../src/platform/native/HookKeysNative.ts', ['plugin.beginTrackUpload', 'plugin.loadTrack', 'plugin.controlTrack',
      'plugin.trackStatus', 'plugin.configureTrackOutput', 'plugin.adoptPickedAudioFile']],
    ['../ios/App/App/HookKeysNativeEngine.h', ['loadTrackId:', 'controlTrackId:', 'trackStatus', 'configureTrackOutputChannelStart:']],
    ['../ios/App/App/HookKeysNativeEngine.mm', ['ExtAudioFileOpenURL', 'kExtAudioFileProperty_ClientDataFormat', 'tracks()']],
    ['../native-engine/src/NativeEngineRuntime.cpp', ['tracks_->render(output, frames, channels)']],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const marker of markers) assert(source.includes(marker), `${path}: ${marker}`);
  }
});

test('Glide mode and velocity gate are forwarded by every native platform bridge', () => {
  for (const [path, markers] of [
    ['../src/platform/native/HookKeysNative.ts', ["'configure_glide'", 'plugin.configureGlide']],
    ['../src-tauri/src/main.rs', ['fn configure_glide', 'hk_runtime_configure_glide', '            configure_glide,']],
    ['../src-tauri/src/native_engine_bridge.cpp', ['hk_runtime_configure_glide', 'setGlideBehavior']],
    ['../ios/App/App/HookKeysNativeEngine.h', ['configureGlide:']],
    ['../ios/App/App/HookKeysNativeEngine.mm', ['configureGlide:', 'setGlideBehavior']],
    ['../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', ['public void configureGlide', 'nativeConfigureGlide(']],
    ['../android/app/src/main/cpp/HookKeysNativeBridge.cpp', ['nativeConfigureGlide', 'setGlideBehavior']],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const marker of markers) assert(source.includes(marker), `${path}: ${marker}`);
  }
});

test('track waveform peaks follow the loudness of the music', () => {
  const transport = transpile('../src/features/tracks/TrackTransport.ts', {
    './TrackLibraryStore': {},
    './BundledLoops': { isTempoSyncedLoopTrack: () => false },
    '../../shared/gestures/LongPressGesture': { LongPressGesture: class {} },
    '../../platform/runtime': { isDesktopRuntime: () => false },
  });
  const quietThenLoud = new Float32Array(1000).map((_, index) => (index < 500 ? 0.1 : -0.8) * (index % 2 ? 1 : 0.5));
  const peaks = transport.waveformPeaksFromChannels([quietThenLoud], 4);
  assert.equal(peaks.length, 4);
  assert.equal(Math.max(...peaks), 1, 'a parte mais alta da música ocupa a altura toda');
  assert(peaks[0] < 0.2 && peaks[1] < 0.2 && peaks[2] === 1 && peaks[3] === 1, `picos: ${peaks.join(', ')}`);
  const left = new Float32Array(400).fill(0.25);
  const right = new Float32Array(400).fill(-0.5);
  assert.equal(JSON.stringify(transport.waveformPeaksFromChannels([left, right], 2)), '[1,1]', 'o pico junta os canais');
  assert.equal(JSON.stringify(transport.waveformPeaksFromChannels([new Float32Array(100)], 3)), '[0,0,0]', 'silêncio não divide por zero');
  assert.equal(JSON.stringify(transport.waveformPeaksFromChannels([], 3)), '[]');
  assert.equal(transport.TRACK_WAVEFORM_BARS, 96);
});


test('App Store icon has no alpha channel (Apple rejects transparent icons, error 90717)', () => {
  const png = readFileSync(new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url));
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  // PNG color type: 2 = RGB. 4 and 6 carry alpha; 3 (palette) can carry tRNS.
  assert.equal(png[25], 2, 'o ícone da loja precisa ser RGB, sem canal alfa');
  assert(!png.includes(Buffer.from('tRNS')), 'o ícone da loja não pode ter transparência');
});

test('Playlist aberta: tablet empilha a leitura e desktop mantém os cinco knobs compactos', () => {
  assert.match(css, /\n\.player-screen--tablet:not\(\.player-screen--cellular\)\.is-tracks-split \.player-output-knob \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-rows:\s*auto auto auto;/);
  assert.match(css, /html\[data-runtime="desktop"\] \.player-screen--tablet\.is-tracks-split \.player-output-knob \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(25px, \.72fr\);/);
});

test('Auto ligado fica amarelo e Repetir ligado pisca verde acima do tema geral', () => {
  assert.match(css, /\.player-screen \.tracks-split-controls button\[data-tracks-action="toggle-auto"\]:is\(\.is-selected, \[aria-pressed="true"\]\) \{[^}]*--button-color-a:\s*#ffe45c !important;/);
  assert.match(css, /\.player-screen \.tracks-split-controls button\[data-tracks-action="toggle-loop"\]:is\(\.is-selected, \[aria-pressed="true"\]\) \{[^}]*animation:\s*tracks-loop-blink/);
});

test('Modo Lite reduz o trabalho contínuo sem tirar a transição do meter', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const lite = css.match(/\.hook-keys-lite :is\(\.player-module__meter-fill, \.player-module__meter-fill > i\) \{([^}]*)\}/)[1];
  assert.doesNotMatch(lite, /transition:\s*none/);
  assert.match(player, /MOBILE_LITE_MODULE_METER_INTERVAL_MS = 180/);
  assert.match(player, /this\.liteMode \? MOBILE_LITE_MODULE_METER_INTERVAL_MS : MOBILE_MODULE_METER_INTERVAL_MS/);
  assert.match(css, /\.hook-keys-lite :is\([\s\S]*?\.performance-pad\.is-active[\s\S]*?animation: none !important;/);
});

test('iOS preserva o runtime ao reativar a sessão de áudio', () => {
  const ios = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.mm', import.meta.url), 'utf8');
  assert.match(ios, /if \(_audioEngine != nil && _audioState && _audioState->runtime\)/);
  assert.match(ios, /setCategory:AVAudioSessionCategoryPlayback/);
  assert.match(ios, /preserveEngine/);
});

test('música importada no iOS não grava Blob no IndexedDB', () => {
  const store = readFileSync(new URL('../src/features/tracks/TrackLibraryStore.ts', import.meta.url), 'utf8');
  const nativeAdd = store.match(/async addNativeFile[\s\S]*?\r?\n  \}\r?\n/)[0];
  assert.match(nativeAdd, /storage:\s*'native'/);
  assert.doesNotMatch(nativeAdd, /new Blob/);
  assert.match(store, /record\.storage === 'native'/);
});

test('iOS abre interface USB com mais de 2 saídas no formato exato da placa', () => {
  const engine = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.mm', import.meta.url), 'utf8');
  // Formato idêntico ao da placa primeiro: sem conversor de canais, L e R não somam.
  assert.match(engine, /hardware\.channelCount == channels && std::abs\(hardware\.sampleRate - sampleRate\) < 1\.0 &&[\s\S]*?\[formats addObject:hardware\];/);
  assert.match(engine, /kAudioChannelLayoutTag_DiscreteInOrder \| channels/, 'canais discretos só como reserva');
  assert.match(engine, /for \(AVAudioFormat \*renderFormat in renderFormatsFor\(hardware, state->sampleRate, channels\)\)/);
});

test('Android confere a placa aberta, reabre após desconectar e lista só saídas de música', () => {
  const bridge = readFileSync(new URL('../android/app/src/main/cpp/HookKeysNativeBridge.cpp', import.meta.url), 'utf8');
  const plugin = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  assert.match(bridge, /AAudioStream_getDeviceId\(stream_\) != requestedDeviceId/);
  assert.match(bridge, /error != AAUDIO_ERROR_DISCONNECTED[\s\S]*?std::thread/);
  assert.match(plugin, /if \(!isMusicOutput\(info\.getType\(\)\)\) continue;/);
  assert.match(plugin, /public void audioRouteLog\(PluginCall call\)/);
});

test('seletores do módulo usam o seletor próprio do app', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /APP_SELECT_QUERY = 'select\[data-setting\], select\[data-module-setting\]'/);
  assert.match(player, /kind === 'app-settings-audio' \|\| kind === 'module-settings'\) \{\s*this\.enhanceAppSelects\(modal\);/);
});

test('toque não vaza para a tela aberta pelo próprio toque', () => {
  const tap = readFileSync(new URL('../src/shared/gestures/ResilientTapController.ts', import.meta.url), 'utf8');
  assert.match(tap, /if \(!this\.duplicateControl\) return;\s*\/\/[\s\S]*?event\.preventDefault\(\);/);
  assert.match(tap, /if \(!down\.isConnected\) return true;/);
});

test('lista da Playlist reaproveita linhas e só sincroniza o que mudou', () => {
  const panel = readFileSync(new URL('../src/features/tracks/TracksPanelController.ts', import.meta.url), 'utf8');
  assert.match(panel, /listItemCache\.get\(item\.id\)/);
  assert.match(panel, /grid\.replaceChildren\(\.\.\.elements\)/);
  assert.match(panel, /button\.dataset\.playbackState !== state/);
  assert.doesNotMatch(css.match(/\n\.track-card__progress i \{[^}]*\}/)[0], /will-change/);
  assert.match(css, /\.track-card:is\(\.is-playing, \.is-queued\) \.track-card__progress i \{\s*will-change: transform;/);
});

test('ícone do Android cabe no recorte redondo do launcher', async () => {
  const png = readFileSync(new URL('../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 432);
});

test('listas da Playlist não têm efeito elástico nas pontas', () => {
  assert.match(css, /:is\(\.tracks-library-grid, \.tracks-playlists, \.tracks-playlist-selection-grid\) \{\s*overscroll-behavior: none;/);
  assert.doesNotMatch(css, /\.tracks-split-panel \.tracks-library-grid \{[^}]*overscroll-behavior: contain/);
});

test('listas da Library não têm efeito elástico nas pontas', () => {
  assert.match(css, /:is\(\.sound-browser__categories, \.sound-browser__content, \.user-sf2-list\) \{\s*overscroll-behavior: none;/);
  assert.doesNotMatch(css, /\.sound-browser__categories \{[^}]*overscroll-behavior: contain/);
});

test('Modo Lite corta a pintura dos botões no toque', () => {
  assert.match(css, /\.hook-keys-lite :is\(\.player-screen, \.player-modal\) :is\(button, \[role="button"\], \.app-select__toggle\) \{\s*text-shadow: none !important;\s*transition: none !important;/);
});

test('Android e desktop mostram RAM; desktop mantém CPU', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  // No desktop os dois ficam lado a lado; no app, só a RAM.
  assert.match(player, /this\.desktopRuntime \? `[\s\S]*?data-cpu-meter[\s\S]*?` : ''\}\s*\$\{this\.desktopRuntime \|\| Capacitor\.isNativePlatform\(\) \? `[\s\S]*?data-ram-meter/);
  const rust = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
  assert.match(rust, /fn memory_usage\(\) -> Result<HashMap<&'static str, f64>, String>/);
  assert.match(rust, /pub fn status_bytes\(\) -> \(u64, u64\)/);
  // A conta é do aparelho inteiro, não só do app.
  assert.match(android, /public void memoryUsage\(PluginCall call\)\s*\{\s*memoryExecutor\.execute/);
  assert.match(android, /used = Math\.max\(0, memory\.totalMem - memory\.availMem\);/);
  assert.match(player, /Memória usada no aparelho: \$\{formatGigabytes\(usage\.usedBytes\)\} de \$\{formatGigabytes\(usage\.limitBytes\)\}/);
});

test('só os dós (e o lá mais grave) levam o nome escrito na tecla', () => {
  const keyboard = readFileSync(new URL('../src/features/player/PerformanceKeyboard.ts', import.meta.url), 'utf8');
  assert.match(keyboard, /const named = !black && \(noteNumber % 12 === 0 \|\| noteNumber === firstNote\);/);
  assert.match(keyboard, /\$\{named \? `<span>\$\{formatMidiNote\(noteNumber\)\}<\/span>` : ''\}/);
  assert.match(keyboard, /aria-label="\$\{formatMidiNote\(noteNumber\)\}"/, 'todas as teclas seguem com o nome na acessibilidade');
  assert.match(css, /\.performance-keyboard__key--white > span \{/);
});

test('Reset do EQ/compressor no celular fica acima do contorno do painel', () => {
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 520px\) \{\s*\.module-processor-reset-button \{\s*top: 4px;[^}]*min-height: 26px;/);
});

test('16 presets em duas fileiras, seis bancos coloridos e a linha Copy/Bancos/Presets', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /const PRESET_COUNT = 16;/);
  assert.match(player, /const BANK_IDS: readonly BankId\[\] = \['A', 'B', 'C', 'D', 'E', 'F'\];/);
  assert.doesNotMatch(player, /VISIBLE_PRESET_COUNT/);
  assert.match(css, /\.player-presets__grid \{\s*display: grid;\s*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);/);
  // Uma linha só: Copy/Paste, os seis bancos e o botão Presets/Keyboard.
  assert.match(css, /\.player-presets__header \{\s*display: grid;\s*grid-auto-flow: column;/);
  for (const bank of ['C', 'D', 'E', 'F']) {
    assert.match(css, new RegExp(`\\.player-navigation__bank-button\\[data-bank="${bank}"\\] \\{ --button-color-a:`));
  }
  // Com o Keyboard à mostra, só Copy fica sem ação; os bancos continuam
  // disponíveis para troca e toque longo.
  assert.match(css, /\.player-presets\.is-keyboard \.player-presets__header \.player-preset-copy-button \{\s*opacity: \.34;\s*pointer-events: none;/);
  assert.doesNotMatch(css, /\.player-presets\.is-keyboard[^\{]*player-navigation__bank-button[^\{]*\{[^}]*pointer-events:\s*none/);
  // No desktop o Keyboard fica fixo, numa linha própria, e não existe o botão.
  assert.match(css, /\.player-presets--desktop \.performance-keyboard \{\s*grid-row: 3;/);
  assert.match(player, /\$\{createBankNavigationMarkup\(!this\.desktopRuntime\)\}/);
  assert.match(player, /const showingKeyboard = !this\.desktopRuntime && this\.bottomView === 'keyboard';/);
});

test('toque longo no botão Keyboard deixa o teclado em quatro oitavas (C2 a C5)', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  // Só vale com o Keyboard à mostra, e o clique que vem junto não troca a view.
  assert.match(player, /\[data-action="toggle-bottom-view"\]'\);\s*if \(bottomViewButton && this\.root\.contains\(bottomViewButton\) && this\.bottomView === 'keyboard'\) \{\s*this\.bottomViewHoldGesture\.start/);
  assert.match(player, /this\.keyboardOctaveSpan = this\.keyboardOctaveSpan === 'four' \? 'full' : 'four';/);
  assert.match(player, /keyboardOctaveSpan: this\.keyboardOctaveSpan,/);
  // O teclado curto é outro teclado, montado de C2 (48) a C5 com 37 teclas.
  const keyboard = readFileSync(new URL('../src/features/player/PerformanceKeyboard.ts', import.meta.url), 'utf8');
  assert.match(keyboard, /const SHORT_FIRST_NOTE = 48;\s*const SHORT_NOTE_COUNT = 37;/);
  assert.match(keyboard, /--white-key-width:\$\{whiteKeyWidth\.toFixed\(6\)\}%/);
  assert.match(player, /scroller\.innerHTML = createPerformanceKeysMarkup\(this\.keyboardOctaveSpan\);\s*scroller\.scrollLeft = 0;\s*this\.performanceKeyboard\?\.refreshKeys\(\);/);
});

test('teclado da tela também ensina o limite de notas do módulo', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /if \(pressed\) this\.learnNoteRangeFrom\(noteNumber, inputId\);/);
  assert.match(player, /if \(input\.pressed\) this\.learnNoteRangeFrom\(input\.noteNumber, input\.inputId\);/);
});

test('Lite mantém a tecla acesa e a ponta da tecla preta é quase reta', () => {
  assert.match(css, /\.hook-keys-lite \.performance-keyboard__key\.is-pressed \{\s*box-shadow: inset 0 0 0 2px rgba\(225, 255, 234, \.78\) !important;/);
  assert.match(css, /\.performance-keyboard__key--black \{[^}]*border-radius: 0 0 2px 2px;/);
});

test('celular: Glide com knob no padrão da tela e Volume sem ON cortado', () => {
  assert.match(css, /\.player-modal--module-synth \.module-glide-card \.module-envelope-knob \{\s*width: var\(--synth-knob-size\);/);
  assert.match(css, /\.output-fader-rail \{\s*min-height: 120px;/);
  assert.match(css, /\.player-modal--module-synth \.synth-editor__identity \{\s*display: none;/);
  assert.match(css, /\.synth-card--target > span \{ transform: translateY\(-12px\); \}/,
    'o título LFO destino sobe sem deslocar os botões');
});

test('presets usam cores claras variadas, texto preto e paleta salva no modal', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /DEFAULT_PRESET_COLOR_ORDER\s*=\s*\[2, 7, 4, 12/);
  assert.match(player, /data-preset-color-index="\$\{colorIndex\}"/);
  assert.match(player, /preset\.colorIndex = presetColorIndex\(colorButton\?\.dataset\.presetColorIndex, presetNumber\)/);
  assert.match(player, /colorIndex: presetColorIndex\(sourcePreset\.colorIndex, presetIndex \+ 1\)/);
  assert.match(css, /\.player-preset-button\s*\{[^}]*color:\s*#090909;[^}]*background:\s*linear-gradient\(145deg, var\(--preset-accent\), var\(--preset-dark\)\);/s);
  assert.doesNotMatch(css, /\.player-preset-button\s*\{[^}]*#ff365e[^}]*#ca4cff/s,
    'o contorno RGB antigo saiu dos presets');
  assert.match(css, /\.preset-color-palette\s*\{/);
  assert.match(css, /\.preset-color-option\.is-selected\s*\{[^}]*border-color:\s*#fff;/s);
});

test('trocar OCT do módulo libera a nota ativa antes de aplicar a nova oitava', () => {
  const engine = readFileSync(new URL('../native-engine/src/HookKeysEngine.cpp', import.meta.url), 'utf8');
  assert.match(engine, /const auto octaveChanged = configs_\[index\]\.octaveShift != command\.moduleConfig\.octaveShift;/);
  assert.match(engine, /\(inputRouteChanged \|\| octaveChanged\)[\s\S]*?modules_\[index\]->allNotesOff\(\);[\s\S]*?clearActiveNoteState\(index\);/);
});

test('módulos nascem com Reverb Room, exceto o Bronze B3, que nasce com Rotary', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const effects = readFileSync(new URL('../src/features/player/ModuleEffectsView.ts', import.meta.url), 'utf8');
  assert.match(effects, /FACTORY_MODULE_REVERB: ModuleReverbSettings = \{\s*enabled: true,\s*decay: 1\.2,\s*dampen: 62,\s*mod: 0,\s*size: 18,\s*mix: 50,/);
  assert.match(player, /modulationMode: moduleIndex === 6 \? 'rotary' : 'user',/);
  assert.match(player, /reverb: \{ \.\.\.FACTORY_MODULE_REVERB, enabled: moduleIndex !== 6 \},/);
  assert.match(player, /enabled: moduleIndex === 6,\s*modulationEnabled: moduleIndex === 6,/);
});

test('Config do Bronze B3 remove controles sem função e mantém Envelope, Mod e Pulse reais', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/features/player/ModuleSettingsView.ts', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../native-engine/src/NativeEngineRuntime.cpp', import.meta.url), 'utf8');
  const organ = readFileSync(new URL('../native-engine/src/OrganModule.cpp', import.meta.url), 'utf8');
  assert.match(settings, /const organ = processorReplacement === 'organ';/);
  assert.match(settings, /organ \? createModuleModulationCardMarkup\(settings, 'organ'\) : createCutoffControl/);
  assert.match(settings, /module-mod-card--organ/);
  assert.doesNotMatch(settings, /organ \? '<article class="module-envelope-control module-envelope-placeholder/,
    'o Mod do Organ deve ocupar o antigo espaço vazio');
  assert.match(css, /\.module-envelope-grid > \.module-mod-card--organ \{\s*grid-column: span 2;/,
    'o card Mod do Organ ocupa duas colunas');
  assert.match(settings, /\? 'Wheel Rotary' : labels\[value\]/);
  assert.match(settings, />Toggle Rotary<\/button>/);
  assert.match(css, /\.module-envelope-grid > \.module-mod-card--organ > div\[data-module-modulation-modes="4"\] \{[^}]*grid-template-columns: repeat\(2,/s,
    'os quatro botões do Mod ficam em duas colunas largas');
  assert.match(css, /\.module-envelope-grid > \.module-mod-card--organ > div\[data-module-modulation-modes="4"\] button \{\s*min-height: 30px;/,
    'os quatro botões do Mod do Organ usam a altura maior');
  assert.match(css, /\.module-envelope-grid > \.module-mod-card--organ > div\[data-module-modulation-modes="4"\] button \{[^}]*font-size: clamp\(9px, \.95vw, 12px\);/s,
    'os nomes dos quatro modos do Organ usam fonte maior');
  assert.match(settings, /processorReplacement === 'organ' \? '' : `<div class="module-settings-bottom-row">/,
    'o Organ não deve renderizar os cards inferiores de Velocity e Glide');
  assert.match(settings, /processorReplacement === 'organ'\s*\? \['envelope', 'eq', 'chorus', 'reverb', 'delay'\]/,
    'o Bronze B3 não mostra a aba Compressor');
  assert.match(settings, /if \(processorReplacement !== 'organ'\) pages\.push\('arpeggiator'\);/,
    'o Bronze B3 não mostra a aba Arpeggiator');
  assert.match(player, /const noSens = moduleIndex === 6 \? true/);
  assert.match(player, /moduleEnabled: moduleNumber !== 7 && arpeggiator\?\.enabled === true/,
    'o Arpeggiator fica bloqueado no Bronze B3 inclusive para estados antigos');
  assert.match(player, /compressorMix: moduleIndex !== 6 && compressor\.enabled \? compressor\.mix \/ 100 : 0/,
    'o Compressor fica bloqueado no DSP do Bronze B3');
  assert.match(runtime, /if \(moduleIndex == 6\) \{[\s\S]{0,240}organModule_->setVolumeEnvelope/,
    'Envelope do Organ precisa alcançar as nove drawbars');
  assert.match(organ, /void OrganModule::setNoVelocitySensitivity\(bool\)[\s\S]*?setNoVelocitySensitivity\(true\)/,
    'No Sens do Organ permanece ligado internamente');
});

test('Config dos módulos 1 a 6 mostra Empty quando nenhum timbre está selecionado', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /if \(kind === 'module-settings'\)[\s\S]*?: 'Empty';/);
});

test('arrasto das cinco bandas do EQ continua registrado e sincroniza o áudio ao vivo', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /if \(\(kind === 'module-settings' \|\| pageKind\(\) === 'module-eq'\) && moduleNumber !== null\) \{\s*modal\.addEventListener\('pointerdown', \(event\) => this\.startEqBandDrag/);
  assert.match(player, /private updateEqBandFromPointer[\s\S]*?moduleState\.settings\.eqBands = bands;[\s\S]*?this\.scheduleNativeEngineSync\(\);\s*\n  \}/,
    'cada movimento da banda deve chegar ao motor antes de soltar o ponteiro');
});

test('module fader field and library controls use the requested compact corner radii', () => {
  assert.match(css, /\.player-screen \.player-module__fader-rail\s*\{\s*border-radius:\s*2px;/);
  assert.match(css, /\.player-screen :is\(\.player-module__settings-button, \.player-module__sound-button\)\s*\{\s*border-radius:\s*4px;/);
});

test('all module parameter cards use four-pixel corners and two-pixel spacing', () => {
  assert.match(css, /:is\(\s*\.synth-card,[\s\S]*?\.arpeggiator-auto-fader\s*\)\s*\{\s*border-radius:\s*4px;/);
  assert.match(css, /:is\(\s*\.synth-editor__grid,[\s\S]*?\.module-eq-editor__readouts\s*\)\s*\{\s*gap:\s*2px;/);
});

test('título Gain usa a mesma tipografia dos títulos do Envelope', () => {
  assert.match(css, /\.module-envelope-control h3 \{[^}]*color: #ffc15f;[^}]*font-size: clamp\(11px, 1\.3vw, 16px\);[^}]*font-weight: 900;/s);
  assert.match(css, /\.module-gain-card > strong \{[^}]*color: #ffc15f;[^}]*font-size: clamp\(11px, 1\.3vw, 16px\);[^}]*font-weight: 900;/s);
});

test('botão Envelope do Cutoff usa fonte maior sem mudar o tamanho do card', () => {
  assert.match(css, /\.module-cutoff-control > button \{[^}]*min-height: 24px;[^}]*font-size: clamp\(9px, \.95vw, 12px\);/s);
});

test('the interface base uses the loading-panel dark gray instead of pure black', () => {
  assert.match(css, /--interface-background:\s*#131315;/);
  assert.match(css, /\.player-screen\s*\{[^}]*background:\s*var\(--interface-background\);/s);
  assert.match(css, /\.player-screen--tablet\.is-tracks-split > \.player-primary > \.player-top-transport\s*\{[^}]*background:\s*var\(--interface-background\);/s);
});

test('the enlarged knob uses the same custom vertical fader on desktop and app', () => {
  assert.match(css, /\.knob-focus__fader\s*\{[^}]*position:\s*relative;[^}]*width:\s*34px;[^}]*height:\s*118px;/s);
  assert.match(css, /\.knob-focus__fader::before\s*\{[^}]*width:\s*8px;[^}]*height:\s*100%;/s);
  assert.match(css, /\.knob-focus__fader::after\s*\{[^}]*top:\s*calc\(\(1 - var\(--focus-fader-progress\)\) \* \(100% - 20px\)\);/s);
  assert.doesNotMatch(css, /:root:not\(\[data-runtime="desktop"\]\) \.knob-focus__fader/,
    'the app must not have a different fader implementation');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /setProperty\('--focus-fader-progress', String\(progress\)\)/);
});

test('knob abre o visor; só o fader vertical muda o valor sem saltar no primeiro toque', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const knobHandlers = player.slice(player.indexOf('private startKnobDrag('), player.indexOf('private ccLearnTargetForOutputKnob('));
  assert.match(knobHandlers, /this\.showKnobFocus\(input\)/);
  assert.doesNotMatch(knobHandlers, /input\.value\s*=/);
  assert.match(player, /pointerStartValue = Number\(fader\.value\)/);
  assert.match(player, /const rawValue = pointerStartValue \+\s*\(pointerStartY - event\.clientY\)/);
  assert.doesNotMatch(player.slice(player.indexOf('faderTrack.onpointerdown ='), player.indexOf('faderTrack.onpointermove =')), /updateFromPointer\(event\)/);
  for (const knob of ['player-output-knob', 'module-envelope-knob', 'module-effect-knob']) {
    const block = css.match(new RegExp(`\n\.${knob} input \{[^}]*\}`))[0];
    assert.match(block, /pointer-events: none;/, `${knob}: o toque vai para o knob, não para o range`);
  }
});

test('teto de velocity: variável numérica (a alça desce) e escondido em Fixed', () => {
  const view = readFileSync(new URL('../src/features/player/VelocityCurveView.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /--velocity-ceiling:\$\{\(ceiling \/ 127\) \* 100\}%/);
  assert.match(view, /setProperty\('--velocity-ceiling', String\(\(value \/ 127\) \* 100\)\)/);
  assert.match(css, /\.velocity-curve-editor\[data-velocity-mode="fixed"\] :is\(\.velocity-ceiling, \.velocity-ceiling-zone, \.velocity-ceiling-line\) \{\s*display: none;/);
});

test('área do teclado/módulos sem :has() (Safari 16 recalculava tudo a cada tecla acesa)', () => {
  assert.doesNotMatch(css, /player-bank-view:has\(/);
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /class="player-bank-view player-bank-view--combined\$\{this\.cellularLayout \? ' player-bank-view--cellular' : ''\}"/);
});

test('Hook Keys: long press só abre os 30%; com eles abertos, um toque fecha', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /if \(this\.splitTracksController\) \{\s*this\.closeTracksSplitView\(\);\s*return;\s*\}\s*this\.openModal\('about'/);
  assert.match(player, /if \(!this\.splitTracksController\) this\.startTracksHoldGesture\(brandButton, event\);/);
  assert.doesNotMatch(player, /toggleTracksSplitView/);
});

test('paisagem dos dois lados no iOS e no Android', () => {
  const runtime = readFileSync(new URL('../src/platform/runtime.ts', import.meta.url), 'utf8');
  const iosController = readFileSync(new URL('../ios/App/App/BronzeNativeHostingController.swift', import.meta.url), 'utf8');
  const orientationTransition = readFileSync(new URL('../src/platform/orientationTransition.ts', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  assert.match(runtime, /if \(await hookKeysNative\.lockOrientation\(mode\)\) return;/);
  assert.match(runtime, /window\.addEventListener\('resize', refreshNotchSideAfterOrientationChange\)/);
  assert.match(iosController, /supportedInterfaceOrientations: UIInterfaceOrientationMask \{ \.landscape \}/);
  assert.match(iosController, /override var shouldAutorotate: Bool \{ true \}/);
  assert.match(orientationTransition, /await refreshNativeNotchSide\(\);/);
  assert.match(android, /SCREEN_ORIENTATION_SENSOR_LANDSCAPE/);
});

test('Copy/Paste: vermelho parado, amarelo piscando copiado e mais rápido no Paste', () => {
  assert.match(css, /\.player-preset-copy-button:is\(\[data-copy-state="copied"\], \[data-copy-state="paste"\]\) \{[^}]*animation: tracks-loop-blink 1\.1s ease-in-out infinite;/);
  assert.match(css, /\.player-preset-copy-button\[data-copy-state="paste"\] \{\s*animation-duration: \.45s;/);
  assert.match(css, /\.player-presets \.player-preset-copy-button \{\s*--button-color-a: #f05a4f !important;/);
});

test('compressor de fábrica e o Reset que só mexe nos parâmetros', () => {
  const effects = readFileSync(new URL('../src/features/player/ModuleEffectsView.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../native-engine/include/hook_keys/DspTypes.hpp', import.meta.url), 'utf8');
  assert.match(effects, /const DEFAULT_COMPRESSOR: ModuleCompressorSettings = \{\s*enabled: false,\s*thresholdDb: -30,\s*ratio: 4,\s*gainDb: 6,\s*attackMs: MIN_COMPRESSOR_ATTACK_MS,\s*releaseMs: 10,\s*mix: 100,/);
  // Attack abaixo de 1 ms sujava o som: 1 ms vira o mínimo no knob, na leitura
  // de um preset salvo e no motor.
  assert.match(effects, /const MIN_COMPRESSOR_ATTACK_MS = 1;/);
  assert.match(effects, /control\('attackMs', 'Attack', MIN_COMPRESSOR_ATTACK_MS, 100/);
  assert.match(effects, /attackMs: numberInRange\(source\.attackMs, MIN_COMPRESSOR_ATTACK_MS, 100/);
  assert.match(engine, /attackMs = std::clamp\(attackMs, 1\.0f, 250\.0f\);/);
  // Reset de processador nunca liga nem desliga o efeito.
  // O Reset de cada página volta ao Default daquele timbre, sem ligar nem
  // desligar o processador.
  assert.match(player, /const reference = this\.defaultSettingsForModule\(moduleNumber, moduleState\);/);
  assert.match(player, /restore\('compressor', readModuleCompressorSettings,\s*readModuleCompressorSettings\(moduleState\.settings\.compressor\)\.enabled\);/);
  assert.match(player, /restore\('reverb', readModuleReverbSettings,\s*readModuleReverbSettings\(moduleState\.settings\.reverb\)\.enabled\);/);
  assert.match(player, /restore\('rotary', readModuleRotarySettings,\s*readModuleRotarySettings\(moduleState\.settings\.rotary\)\.enabled\);/);
  assert.match(player, /restore\('delay', readModuleDelaySettings,\s*readModuleDelaySettings\(moduleState\.settings\.delay\)\.enabled\);/);
});

test('Velocity do filtro: coluna com Cutoff e ON/OFF à direita da curva, também em Fixed', () => {
  assert.match(css, /\.velocity-curve-editor--filter \.velocity-curve-plot-row \{\s*grid-template-columns: minmax\(0, 1fr\) clamp\(96px, 11vw, 136px\);/);
  assert.match(css, /\.velocity-curve-editor\[data-velocity-mode="fixed"\]:not\(\.velocity-curve-editor--filter\) \.velocity-curve-plot-row/);
  assert.match(css, /\.filter-velocity-cutoff > \.filter-velocity-power \{\s*grid-row: 5;/);
});

test('Config em páginas: Reset acompanha a aba e ON/OFF permanece no centro do rodapé', () => {
  // iPhone SE deitado: Polifonia e Modo na mesma linha dos seletores (sem quebrar em duas).
  assert.match(css, /@media \(orientation: landscape\) \{\s*\.module-settings-panel--voice-switch \.module-settings-io-row \{\s*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(0, 1fr\) minmax\(64px, \.34fr\) minmax\(64px, \.34fr\);/);
  // Os botões de página têm altura fixa: a página aberta não muda o tamanho deles.
  assert.match(css, /\.module-settings-pages button \{[^}]*height: clamp\(28px, 4\.2vh, 38px\);/);
  assert.match(css, /\.module-settings-pages \[role="tablist"\] button\.is-selected \{[^}]*border-color: #fff;/);
  const view = readFileSync(new URL('../src/features/player/ModuleSettingsView.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  // O Reset do módulo saiu de cima do Modo; cada página tem o seu.
  assert.doesNotMatch(view, /data-module-setting-action="reset-module"/);
  assert.doesNotMatch(view, /data-modal-action="reset-processor"/, 'o Reset saiu da fileira de abas');
  assert.match(player, /data-reset-processor="\$\{this\.moduleConfigPage\}"\$\{[\s\S]*?settingsMode === 'default' \? ' hidden' : ''\}/,
    'o Reset da página fica no rodapé e só em User');
  assert.doesNotMatch(view, /data-module-effect-power="\$\{page === 'eq'/,
    'o ON/OFF não fica mais junto das abas');
  assert.match(player, /kind === 'module-settings'[\s\S]*?player-modal__back-button[\s\S]*?data-module-effect-power="\$\{this\.moduleConfigPage\}"[\s\S]*?player-modal__reset-button/,
    'o ON/OFF fica entre Voltar e Reset');
  assert.match(player, /\.player-modal__actions \[data-module-effect-power\]/,
    'a troca de página atualiza o ON/OFF do rodapé');
  assert.match(css, /\.player-modal--module-settings \.player-modal__actions[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
    'o rodapé do Config mantém três colunas');
  assert.match(player, /const defaults = createDefaultModuleSettings\(moduleNumber - 1\);[\s\S]*?synthPresets: moduleState\.settings\.synthPresets \?\? defaults\.synthPresets,/);
});

test('Default bloqueia parâmetros, orienta mudar para User e o timbre só fecha depois de carregar', () => {
  const view = readFileSync(new URL('../src/features/player/ModuleSettingsView.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(view, /data-module-settings-mode="default"/);
  assert.match(view, /data-module-settings-mode="user"/);
  assert.match(player, /settingsMode: moduleIndex < 6 \? 'default' : 'user'/,
    'os módulos 1–6 nascem em Default; Organ e Synth não expõem User');
  assert.match(player, /moduleIndex < 6 && source\.settingsMode !== 'user' \? 'default' : 'user'/,
    'um estado sem escolha explícita também restaura em Default');
  const modeSelection = /private setModuleSettingsMode[\s\S]*?private defaultSettingsForModule/.exec(player)?.[0] ?? '';
  assert.match(modeSelection, /mode === 'default'[\s\S]*?moduleState\.userSettings = cloneSettings\(moduleState\.settings\)/,
    'ao voltar para Default, o User atual fica guardado');
  assert.match(modeSelection, /cloneSettings\(moduleState\.userSettings \?\? moduleState\.settings\)/,
    'User parte do Default apenas na primeira vez e depois recupera sua memória');
  assert.match(player, /Mude para User para configurar\./);
  assert.match(player, /private async selectFixedSound[\s\S]*?await this\.syncNativeEngine\(\);[\s\S]*?nativeLoadedTimbres[\s\S]*?this\.closeModal\(\);/);
  assert.match(player, /Carregando timbre…/);
  assert.match(player, /data-sound-loading-progress/);
  const userSelection = /private async selectUserSoundfont[\s\S]*?private async loadCompatibilityVideoUrl/.exec(player)?.[0] ?? '';
  const fixedSelection = /private async selectFixedSound[\s\S]*?private showSoundLoadingOverlay/.exec(player)?.[0] ?? '';
  for (const selection of [userSelection, fixedSelection]) {
    assert.match(selection, /if \(moduleState\.settingsMode === 'user'\)[\s\S]*?moduleState\.userSettings = cloneSettings\(moduleState\.settings\)/,
      'a troca de timbre mantém a memória User do módulo');
    assert.doesNotMatch(selection, /moduleState\.settingsMode = 'default'/,
      'a troca de timbre não pode forçar Default');
  }
});

test('Reverb seleciona os quatro IRs reais e expõe apenas o Mix', () => {
  const knob = transpile('../src/features/player/ParameterKnobView.ts');
  const effects = transpile('../src/features/player/ModuleEffectsView.ts', { './ParameterKnobView': knob });
  const markup = effects.createModuleReverbMarkup({
    reverbSpace: 'hall1',
    reverb: { enabled: true, decay: 7.3, dampen: 41, mod: 17, size: 84, mix: 39 },
  });
  assert.match(markup, /data-module-reverb-space="hall1"\s+class="is-selected"\s+aria-pressed="true"/);
  assert.match(markup, /Convolution/);
  assert.match(markup, /data-module-effect-control="mix"/);
  assert.doesNotMatch(markup, /data-module-effect-control="(?:decay|dampen|mod|size)"/);
  const presetMixes = {
    reverbSpace: 'hall1', reverb: { enabled: true, mix: 39 },
    reverbSpaces: { room1: { mix: 11 }, room2: { mix: 22 }, hall1: { mix: 33 }, hall2: { mix: 44 } },
  };
  for (const [space, expected] of [['room1', 11], ['room2', 22], ['hall1', 33], ['hall2', 44]]) {
    assert.equal(effects.readReverbSpaceMix(presetMixes, space), expected);
  }
  assert.equal(effects.readReverbSpaceMix(presetMixes), 33);
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /reverbImpulse: REVERB_SPACES\[readReverbSpace\(moduleState\.settings\.reverbSpace\)\]\.impulse/);
  assert.match(player, /moduleState\.settings\.reverbSpace = name/);
  assert.match(player, /reverbMix: reverb\.enabled \? readReverbSpaceMix\(moduleState\.settings\) \/ 100 : 0/);
});

test('cinco volumes mostram medidores e Módulos reúne timbres de qualquer saída', () => {
  const output = readFileSync(new URL('../src/features/player/OutputControls.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../native-engine/src/NativeEngineRuntime.cpp', import.meta.url), 'utf8');
  assert.match(output, /data-output-meter="\$\{id\}"/);
  assert.match(output, /id === 'master' \? 'modules' : id/);
  assert.match(output, /createOutputMiniMeter\('click', 'Click'\)/);
  assert.match(player, /createOutputKnobMarkup\('master', 'Módulos'/);
  assert.match(player, /renderOutputMeter\('modules', peaks\.slice\(16, 18\)\)/);
  assert.match(player, /hookKeysNative\.tracksAvailable\(\)[\s\S]*?peaks\.slice\(18, 20\) : this\.trackTransport\?\.getOutputPeaks\(\)/);
  assert.match(player, /renderOutputMeter\('click', peaks\.slice\(20, 22\)\)/);
  assert.match(runtime, /for \(std::size_t channel = 0; channel < channels; \+\+channel\) \{\s*output\[frame \* channels \+ channel\] \*= gain;/);
});

test('Baixar tudo acrescenta os restantes à fila e item aguardando não reabre o modal', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /const notQueued = sounds\.filter\(\(sound\) => !this\.activeSoundDownloads\.has\(sound\.id\)\)/);
  assert.match(player, /this\.soundDownloadBatchIds = new Set\(sounds\.map\(\(sound\) => sound\.id\)\)/);
  assert.match(player, /button\.textContent = `Baixado \$\{completed\}\/\$\{batch\.size\}`/);
  assert.match(player, /status\.textContent = downloading \? 'Baixando' : 'Aguardando'/);
  assert.match(player, /if \(this\.activeSoundDownloads\.has\(soundId\)\) return;/);
  assert.doesNotMatch(player, /Aguarde a fila atual terminar antes de usar Baixar tudo/);
});

test('download manual concluído pulsa só até o usuário tocar em outro timbre', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /source:\s*'manual'/);
  assert.match(player, /source:\s*'batch'/);
  assert.match(player, /entry\.source === 'manual'\) this\.recentManualDownloadSoundId = soundId/);
  assert.match(player, /this\.recentManualDownloadSoundId !== soundId/);
  assert.match(css, /\.fixed-sound-grid button\.is-manual-download-complete\s*\{[^}]*animation:\s*fixed-sound-download-complete/s);
});

test('Gain do módulo alcança -36 dB na interface e no motor', () => {
  const settings = readFileSync(new URL('../src/features/player/ModuleSettingsView.ts', import.meta.url), 'utf8');
  const dspTypes = readFileSync(new URL('../native-engine/include/hook_keys/DspTypes.hpp', import.meta.url), 'utf8');
  assert.match(settings, /MODULE_GAIN_MIN_DB\s*=\s*-36/);
  assert.match(dspTypes, /inputGainDb\s*=\s*std::clamp\(inputGainDb,\s*-36\.0f,\s*12\.0f\)/);
});

test('desktop não bloqueia Baixar tudo pela cota estimada da WebView', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /async function hasStorageFor\(byteSize: number \| undefined\): Promise<boolean> \{[\s\S]*?if \(isDesktopRuntime\(\)\) return true;[\s\S]*?navigator\.storage\.estimate\(\)/);
  assert.match(player, /private async prepareBackupDownloadCapacity\([\s\S]*?if \(this\.desktopRuntime\) return;[\s\S]*?navigator\.storage\?\.estimate/);
  assert.match(player, /QuotaExceededError'[\s\S]*?isDesktopRuntime\(\)[\s\S]*?biblioteca local do desktop/);
});

test('Organ envia Rotary, Tremolo e Pan às nove vozes em vez de ficar no LFO', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../native-engine/src/NativeEngineRuntime.cpp', import.meta.url), 'utf8');
  const organ = readFileSync(new URL('../native-engine/src/OrganModule.cpp', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('../src/platform/native/HookKeysNative.ts', import.meta.url), 'utf8');
  assert.match(player, /moduleIndex === 6 && modulationMode === 'rotary'\s*\? 4/);
  assert.match(runtime, /if \(moduleIndex == 6\) \{\s*organModule_->setModulationMode\(mode, rateHz, intensity\);/);
  assert.match(organ, /for \(auto& voice : voices_\) voice->setModulationMode\(mode, rateHz, intensity\);/);
  assert.match(bridge, /Math\.min\(4, Math\.max\(0, config\.mode\)\)/);
});

test('toque longo em Pan e Tremolo abre intensidade independente em porcentagem', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/features/player/ModuleSettingsView.ts', import.meta.url), 'utf8');
  const sf2 = readFileSync(new URL('../native-engine/src/TinySoundFontModule.cpp', import.meta.url), 'utf8');
  assert.match(player, /moduleModulationIntensityHoldGesture\.start\(event,/);
  assert.match(player, /data-module-modulation-intensity="\$\{mode\}"/);
  assert.match(settings, /mode === 'pan' \? 'panIntensity' : 'tremoloIntensity'/);
  assert.match(settings, /aria-valuetext="\$\{Math\.round\(value\)\}%"/);
  assert.match(css, /\.module-mod-card__intensity-control,\s*\.module-mod-card__intensity-control\[hidden\] \{\s*display: none !important;/);
  assert.match(sf2, /modulationIntensity_\.load\(std::memory_order_relaxed\)/);
});

test('margem externa da tela e de todos os modais é 1 px', () => {
  assert.match(css, /\.player-screen \{\s*gap: 2px;\s*padding:\s*max\(1px, env\(safe-area-inset-top\)\)/);
  assert.match(css, /\.player-modal \{\s*padding:\s*max\(1px, env\(safe-area-inset-top\)\)/);
});

test('knobs dos cinco volumes ficam circulares e separados do meter no desktop', () => {
  assert.match(css, /html\[data-runtime="desktop"\] \.player-output-knob__control \{[^}]*align-items: center;[^}]*gap: clamp\(6px, \.55vw, 9px\);/s);
  assert.match(css, /html\[data-runtime="desktop"\] \.player-output-knob__face \{[^}]*width: clamp\(32px, 3\.2vw, 42px\);[^}]*height: clamp\(32px, 3\.2vw, 42px\);[^}]*border-radius: 50%;/s);
});

test('celular usa a mesma margem segura no notch e na porta e mantém os cinco knobs circulares', () => {
  const runtime = readFileSync(new URL('../src/platform/runtime.ts', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  assert.match(runtime, /const nativeSide = await hookKeysNative\.displayCutoutSide\(\);/,
    'o layout consulta o lado físico informado pelo app nativo');
  assert.match(runtime, /if \(!isNative\) \{[^}]*await updateNativeNotchSide\(\);[^}]*addEventListener\('resize'/s,
    'a prévia no navegador móvel também acompanha o lado do notch');
  assert.match(runtime, /document\.documentElement\.dataset\.notchSide = side;/);
  assert.match(runtime, /angle === 90 \|\| orientation\?\.type === 'landscape-primary'\s*\? 'left'/s,
    'em 90 graus o notch fica à esquerda e o lado da porta permanece livre');
  assert.match(runtime, /angle === 270 \|\| orientation\?\.type === 'landscape-secondary'\s*\? 'right'/s,
    'em 270 graus o notch fica à direita e o lado da porta permanece livre');
  assert.match(css, /:root:not\(\[data-runtime="desktop"\]\) \.player-screen--cellular \{\s*padding: 1px max\(1px, calc\(env\(safe-area-inset-left\) - 8px\), calc\(env\(safe-area-inset-right\) - 8px\)\) !important;/);
  assert.match(css, /:root:not\(\[data-runtime="desktop"\]\) \.player-modal \{\s*padding-left: max\(1px, calc\(env\(safe-area-inset-left\) - 8px\), calc\(env\(safe-area-inset-right\) - 8px\)\) !important;\s*padding-right: max\(1px, calc\(env\(safe-area-inset-left\) - 8px\), calc\(env\(safe-area-inset-right\) - 8px\)\) !important;/);
  assert.doesNotMatch(css, /:root\[data-notch-side="(?:left|right)"\] \.player-screen--cellular/,
    'nenhum lado lateral pode ficar com margem menor que o outro');
  assert.match(android, /getDisplayCutout\(\)/);
  assert.match(android, /cutout\.getBoundingRects\(\)/);
  assert.match(css, /:root:not\(\[data-runtime="desktop"\]\) \.player-screen--cellular \.player-output-knob__face \{[^}]*flex: 0 0 clamp\(20px,[^}]*width: clamp\(20px,[^}]*height: clamp\(20px,[^}]*border-radius: 50%;/s);
  assert.match(css, /:root:not\(\[data-runtime="desktop"\]\) \.player-screen--cellular \.player-output-mini-meter \{[^}]*height: clamp\(20px,/s);
});

test('Mod do Organ reserva a coluna do Rate sem sobrepor os botões 2x2', () => {
  assert.match(css, /\.module-envelope-grid > \.module-mod-card--organ \{[^}]*grid-template-columns: minmax\(0, 1fr\) max-content;[^}]*grid-template-rows: auto minmax\(0, 1fr\);/s);
  assert.match(css, /\.module-envelope-grid > \.module-mod-card--organ > div\[data-module-modulation-modes="4"\] \{[^}]*grid-template-columns: repeat\(2,[^}]*grid-template-rows: repeat\(2,/s);
  assert.match(css, /\.module-envelope-grid > \.module-mod-card--organ > \.module-mod-card__rate \{[^}]*grid-column: 2;[^}]*grid-row: 2;/s);
  assert.match(css, /:root:not\(\[data-runtime="desktop"\]\) \.module-envelope-grid > \.module-mod-card--organ \{[^}]*grid-template-columns: minmax\(0, 1fr\) 50px;/s);
  assert.match(css, /:root:not\(\[data-runtime="desktop"\]\) \.module-envelope-grid > \.module-mod-card--organ \.module-envelope-knob \{\s*width: clamp\(32px, 9\.5vh, 38px\);/);
});

test('Playlist 30% no app mantém os cinco knobs e meters com altura igual à largura', () => {
  assert.match(css, /:root:not\(\[data-runtime="desktop"\]\) \.player-screen--tablet:not\(\.player-screen--cellular\)\.is-tracks-split \.player-output-knob__face \{[^}]*flex: 0 0 clamp\(17px,[^}]*height: clamp\(17px,[^}]*border-radius: 50%;/s);
  assert.match(css, /:root:not\(\[data-runtime="desktop"\]\) \.player-screen--tablet:not\(\.player-screen--cellular\)\.is-tracks-split \.player-output-mini-meter \{[^}]*height: clamp\(17px,/s);
});

test('efeitos removem descontinuidade ao alterar Reverb, Compressor e outros parâmetros', () => {
  const effects = readFileSync(new URL('../native-engine/src/ModuleEffects.cpp', import.meta.url), 'utf8');
  assert.match(effects, /soundChanged = config_\.inputGainDb[^;]*!sameCompressor[^;]*reverbTopologyChanged/s);
  assert.match(effects, /if \(soundChanged && hasProcessedOutput_\) effectTransitionPending_ = true;/);
  assert.match(effects, /currentInputGain_ \+= \(targetGain - currentInputGain_\) \* smoothing;/);
  assert.match(effects, /transitionOffsetLeft_ = lastOutputLeft_ - left\[frame\];/);
});

test('card do Glide: botões compactos no Synth e título acompanha Glide ou Portamento', () => {
  const glide = readFileSync(new URL('../src/features/player/GlideView.ts', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/features/player/ModuleSettingsView.ts', import.meta.url), 'utf8');
  assert.match(glide, /<div class="module-glide-card__buttons"[\s\S]*?No Sens<\/button>\s*<\/div>\s*\$\{glideDialMarkup\(settings, bpm, ownerAttribute, mode === 'portamento' \? 'Portamento' : 'Glide'\)\}/);
  assert.match(glide, /mode === 'portamento' \? 'Portamento' : 'Auto'/);
  assert.match(glide, /function glideDialMarkup[\s\S]*?<div class="module-glide-card__dial">\s*<strong>\$\{label\}<\/strong>/);
  assert.match(css, /\.module-glide-card__buttons \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.module-glide-card__buttons > button \{\s*width: 100%;\s*max-width: 100%;[\s\S]*?overflow: hidden;/,
    'cada botão mantém a dimensão da célula mesmo quando o texto muda');
  assert.match(css, /\.module-glide-card__dial \{[^}]*width: 12ch;[^}]*min-width: 12ch;/s,
    'o dial reserva sempre a largura do título Portamento');
  assert.match(css, /\.module-glide-card__dial > strong \{[^}]*transform: translateY\(-3px\);/s,
    'o título Glide ou Portamento fica um pouco acima do knob');
  assert.match(css, /\.synth-editor__grid > \.module-glide-card \{[^}]*grid-template-columns: minmax\(210px, 90%\) max-content;[^}]*justify-content: start;/s);
  assert.match(settings, /aria-label="Envelope do Cutoff[^>]*>Envelope<\/button>/);
  assert.doesNotMatch(css, /module-glide-card > header/);
  // Ligar o Sync troca "0 ms" por "120 BPM": o valor tem largura fixa e o knob não anda.
  assert.match(css, /\.module-glide-card output \{[^}]*width: 7\.5ch;[^}]*text-align: center;/);
});


test('seletor próprio: tocar no rótulo (ou nos próprios botões dentro dele) não abre o select nativo do sistema', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  // O contêiner visual não pode continuar sendo um <label>: no WKWebView a
  // ativação nativa pode começar antes de qualquer preventDefault. O enhancer
  // preserva os filhos/atributos, mas troca o label por uma div neutra.
  assert.match(player, /const container = document\.createElement\('div'\);[\s\S]*while \(label\.firstChild\) container\.append\(label\.firstChild\);\s*label\.replaceWith\(container\);/);
  const native = css.match(/\n\.app-select__native \{[^}]*\}/)[0];
  assert.match(native, /min-height: 0 !important;/);
  assert.match(native, /pointer-events: none !important;/);
});

test('curva de velocity: os 5 pontos se movem, inclusive o primeiro e o último', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /const pointIndex = handle\s*\? Number\(handle\.dataset\.velocityPoint\)\s*: Math\.round\(Math\.min\(1, Math\.max\(0, \(event\.clientX - bounds\.left\) \/ Math\.max\(1, bounds\.width\)\)\) \* 4\);/);
});

test('Drum envia Release 0 por tecla e os três chimbais mantêm choke depois do Note Off', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  const catalog = readFileSync(new URL('../src/features/sound-library/SoundCatalog.ts', import.meta.url), 'utf8');
  const engineTypes = readFileSync(new URL('../native-engine/include/hook_keys/EngineTypes.hpp', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../native-engine/src/HookKeysEngine.cpp', import.meta.url), 'utf8');
  const desktop = readFileSync(new URL('../src-tauri/src/native_engine_bridge.cpp', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../android/app/src/main/cpp/HookKeysNativeBridge.cpp', import.meta.url), 'utf8');
  const ios = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.mm', import.meta.url), 'utf8');
  assert.match(player, /encodeDrumZeroReleaseNotes\(moduleState\?\.settings\.drumZeroReleaseNotes\)/);
  assert.match(player, /drumZeroReleaseMask0: drumZeroReleaseMasks\[0\]/);
  assert.match(player, /const soundSettings = sound\?\.moduleSettings\?\.\[scope\] \?\? \{\};[\s\S]*?soundSettings/,
    'a configuração individual recebida do backend deve ser combinada ao timbre');
  assert.match(catalog, /modules1To6: safeSettingsObject\(source\.modules1To6\)/,
    'o catálogo não pode descartar drumZeroReleaseNotes dentro das configurações do timbre');
  assert.match(engineTypes, /std::array<std::uint32_t, 4> drumZeroReleaseNoteMasks/);
  assert.match(engine, /hiHatTailNotes_\[index\]\[note\]/);
  assert.match(engine, /drumNoteUsesZeroRelease\(sourceNote\)[\s\S]*?stealNote/);
  for (const bridge of [desktop, android, ios]) {
    assert.match(bridge, /drumZeroReleaseNoteMasks/);
  }
});
