import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function transpile(path, require = () => ({}), globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const context = { exports: {}, require, ...globals };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

const views = transpile('../src/features/player/PatternModulesView.ts');
const knob = transpile('../src/features/player/ParameterKnobView.ts');
const tranceGate = transpile('../src/features/player/TranceGateView.ts', specifier =>
  specifier === './ParameterKnobView' ? knob : views);

test('Trance Gate defaults and normalized settings contain only volume steps, with BPM divisions', () => {
  const defaults = tranceGate.readTranceGateSettings(undefined);
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.gate, 50);
  assert.equal(defaults.depth, 100);
  assert.equal(defaults.steps.length, 16);
  const restored = tranceGate.readTranceGateSettings({ enabled: false, length: 8, steps: [false, true], depth: 55 });
  assert.equal(restored.enabled, false);
  assert.equal(restored.depth, 55);
  assert.equal(restored.steps[0], false);
  assert.equal(tranceGate.readTranceGateSettings({ gate: NaN }).gate, 50);
  const markup = tranceGate.createTranceGateMarkup(restored);
  assert.match(markup, /Pulse/);
  assert.doesNotMatch(markup, /Velocity|Semitone|data-pattern-parameter="semitone"/);
  assert.equal([...markup.matchAll(/data-trance-gate-step=/g)].length, 16);
  assert.equal(tranceGate.tranceGateBeatMultiplier('1/8 T'), 1 / 3);
  for (const path of ['../src-tauri/src/main.rs', '../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', '../ios/App/App/HookKeysNativeEngine.h']) {
    assert.match(readFileSync(new URL(path, import.meta.url), 'utf8'), /configure_trance_gate|configureTranceGate/);
  }
});

test('arpeggiator settings are normalized, and the old step sequencer is gone', () => {
  const arp = views.readArpeggiatorSettings({ enabled: true, mode: 'invalid', octaves: 99, gate: -4 });
  assert.equal(arp.enabled, true);
  assert.equal(arp.mode, 'up');
  assert.equal(arp.octaves, 4);
  assert.equal(arp.gate, 10);
  // O módulo 07 é só Trance Gate: não existe mais sequenciador de notas.
  assert.equal(views.readSequencerSettings, undefined);
  assert.equal(views.createSequencerMarkup, undefined);
});

test('Auto Fader uses 1/1 as the slower cycle and 1/2 as the faster cycle', () => {
  assert.equal(views.readArpeggiatorSettings(undefined).autoFaderDivision, '1/1');
  assert.equal(views.readArpeggiatorSettings({ autoFaderDivision: '1/2' }).autoFaderDivision, '1/2');
  assert.equal(views.autoFaderCycleBeats(4, 4, '1/1'), 4);
  assert.equal(views.autoFaderCycleBeats(4, 4, '1/2'), 2);
  assert.equal(views.autoFaderCycleBeats(6, 8, '1/1'), 3);
  assert.equal(views.autoFaderCycleBeats(6, 8, '1/2'), 1.5);
  assert.equal(views.patternStepsPerMeasure(4, 4, '1/16'), 16);
  assert.equal(views.patternStepsPerMeasure(6, 8, '1/16'), 12);
  const markup = views.createArpeggiatorMarkup({ autoFaderDivision: '1/1' });
  assert.match(markup, /data-arpeggiator-auto-fader="1\/1"[^>]*class="[^"]*auto-fader-choice--green[^"]*is-selected"/);
  assert.match(markup, /data-arpeggiator-auto-fader="1\/2"/);
  assert.match(markup, /auto-fader-choice--blue/);
  assert.doesNotMatch(markup, /data-arpeggiator-auto-fader="(?:4\/4|6\/8)"/);
  assert.doesNotMatch(markup, /data-arpeggiator-auto-fader="1\/4"/);

  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /autoFaderEnabled:\s*arpeggiatorSettings\.enabled\s*&&\s*autoFader\.enabled/,
    'Auto Fader só chega ligado ao DSP quando o Arpeggiator também está ligado');
  assert.match(player, /autoFaderBeats:\s*autoFaderCycleBeats\([\s\S]*getTimeSignatureNumerator\(\)[\s\S]*getTimeSignatureDenominator\(\)[\s\S]*autoFader\.division/);
  assert.match(player, /measureBeats:\s*gate\.sync[\s\S]*getTimeSignatureNumerator\(\)\s*\*\s*4\s*\/\s*this\.metronome\.getTimeSignatureDenominator\(\)/,
    'Pulse em Sync recebe o mesmo compasso global do metrônomo');
  const dspTypes = readFileSync(new URL('../native-engine/include/hook_keys/DspTypes.hpp', import.meta.url), 'utf8');
  assert.match(dspTypes, /beats = std::clamp\(beats, 0\.125f, 32\.0f\)/,
    'the native engine preserves 4, 3 and 1.5 beats and supports every native meter, including half of 1/16');
  const engine = readFileSync(new URL('../native-engine/src/ModuleEffects.cpp', import.meta.url), 'utf8');
  assert.match(engine, /cycleSeconds[^;]+fader\.beats/);
  assert.match(engine, /0\.5 - 0\.5 \* std::cos/,
    'the cosine crosses between its extremes in half of the complete cycle');
  assert.match(engine, /gateMeasurePhaseSamples_[\s\S]*gateStep_ = 0/,
    'Pulse reinicia o desenho ao completar o compasso selecionado');
});

test('division clock keeps swing pairs at the same total duration', () => {
  const straight = views.patternStepMilliseconds(120, '1/16', 0, 0);
  const long = views.patternStepMilliseconds(120, '1/16', 50, 0);
  const short = views.patternStepMilliseconds(120, '1/16', 50, 1);
  assert.equal(straight, 125);
  assert.equal(long + short, straight * 2);
  assert.equal(views.patternStepMilliseconds(120, '1/8 T', 0, 0), 500 / 3);
  assert.equal(views.patternStepMilliseconds(120, '1/16 T', 0, 0), 500 / 6);
});

test('arpeggiator offers triplets and 2x2 octave buttons while remaining permanently BPM-synced', () => {
  const markup = views.createArpeggiatorMarkup({ division: '1/8 T', octaves: 3 });
  assert.match(markup, /data-arpeggiator-division="1\/8 T"[^>]*aria-pressed="true"/);
  assert.equal((markup.match(/data-arpeggiator-octaves=/g) ?? []).length, 4);
  assert.doesNotMatch(markup, /data-pattern-parameter="octaves"/);
  assert.doesNotMatch(markup, /data-arpeggiator-sync|rateBpm/);
});

test('every module runs its own independent Arpeggiator, each on its own engine input', () => {
  let timerId = 0;
  const timers = new Map();
  const fakeWindow = {
    setTimeout(callback) {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const playback = transpile(
    '../src/features/player/PatternPlaybackController.ts',
    (specifier) => specifier === './PatternModulesView' ? views : {},
    { window: fakeWindow, Math },
  );
  const sent = [];
  const snapshot = {
    bpm: 120,
    arpeggiator: {
      moduleEnabled: true, hasSound: true, midiInputId: null, lowNote: 0, highNote: 127,
      sustainEnabled: true,
      settings: { enabled: true, mode: 'up', division: '1/16', octaves: 1, gate: 70, swing: 0 },
    },
  };
  const controller = new playback.PatternPlaybackController(
    () => snapshot,
    (moduleNumber, slot, status, note, velocity) => sent.push([moduleNumber, slot, status, note, velocity]),
  );
  controller.handleInput({ inputId: null, noteNumber: 60, pressed: true, velocity: 100 });
  // Cada um dos 8 módulos tem seu próprio Arpeggiator: a mesma nota física
  // gera uma frase independente para cada um, no seu próprio slot gerado.
  assert.equal(sent.length, 8, 'each of the 8 modules runs its own generator');
  for (const [moduleNumber, slot] of sent) {
    assert.equal(slot, playback.arpeggiatorInputSlotForModule(moduleNumber),
      'each module sends through its own base-plus-index engine input');
  }
  assert.equal(sent.find(([moduleNumber]) => moduleNumber === 1)?.[1], 4,
    'module 1 keeps using the base engine input');
  controller.handleInput({ inputId: null, noteNumber: 60, pressed: false, velocity: 0 });
  assert(sent.some(([, slot, status]) => slot === 4 && status === 0x80));
  controller.destroy();
});

test('arpeggiator receives the whole chord immediately and the pedal sustains its source notes', () => {
  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /sustainEnabled: arpeggiator\?\.sustainInputEnabled \?\? true/);
  assert.match(player, /input\.controller === 64[\s\S]+patternPlayback\.handleSustain/,
    'CC64 reaches the arpeggiator chord controller');
  assert.match(player, /inputSlot:\s*patternInputSlot \?\?/,
    'enabled arpeggiator must receive only its generated note stream');
  const android = readFileSync(new URL('../android/app/src/main/java/com/hookdeveloper/hookkeys/HookKeysNativePlugin.java', import.meta.url), 'utf8');
  assert.match(android, /ROUTABLE_MIDI_INPUT_COUNT = 4 \+ MODULE_COUNT/);
  assert.match(android, /Math\.min\(ROUTABLE_MIDI_INPUT_COUNT - 1, call\.getInt\("inputSlot"/);
  const ios = readFileSync(new URL('../ios/App/App/HookKeysNativeEngine.mm', import.meta.url), 'utf8');
  assert.match(ios, /kRoutableMidiInputCount - 1/,
    'mobile bridges preserve every independent arpeggiator slot instead of collapsing modules together');
  for (const path of ['../src-tauri/src/native_engine_bridge.cpp', '../android/app/src/main/cpp/HookKeysNativeBridge.cpp']) {
    assert.match(readFileSync(new URL(path, import.meta.url), 'utf8'), /kRoutableMidiInputCount/,
      `${path} must preserve every independent arpeggiator slot`);
  }

  let timerId = 0;
  const timers = new Map();
  const fakeWindow = {
    setTimeout(callback) {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const playback = transpile(
    '../src/features/player/PatternPlaybackController.ts',
    (specifier) => specifier === './PatternModulesView' ? views : {},
    { window: fakeWindow, Math },
  );
  const activeSnapshot = {
    bpm: 120,
    arpeggiator: {
      moduleEnabled: true, hasSound: true, midiInputId: 'keyboard', lowNote: 0, highNote: 127,
      sustainEnabled: true,
      settings: { enabled: true, mode: 'up', division: '1/16', octaves: 1, gate: 70, swing: 0 },
    },
  };
  const inactiveSnapshot = {
    ...activeSnapshot,
    arpeggiator: { ...activeSnapshot.arpeggiator, moduleEnabled: false },
  };
  const sent = [];
  const controller = new playback.PatternPlaybackController(
    (moduleNumber) => moduleNumber === 1 ? activeSnapshot : inactiveSnapshot,
    (moduleNumber, slot, status, note, velocity) => sent.push([moduleNumber, slot, status, note, velocity]),
  );
  const note = (noteNumber, pressed, velocity = 100) => controller.handleInput({
    channel: 1, inputId: 'keyboard', noteNumber, pressed, velocity,
  });

  note(60, true);
  note(64, true);
  note(67, true);
  const scheduledStep = controller.states[0].timer;
  assert.notEqual(scheduledStep, null);
  timers.get(scheduledStep)();
  const noteOns = sent.filter(([, , status]) => status === 0x90);
  assert.deepEqual(noteOns.map(([, , , midiNote]) => midiNote), [60, 64],
    'the second arpeggio step uses the second chord note instead of repeating the first');

  controller.handleSustain('keyboard', 1, true);
  note(60, false, 0);
  note(64, false, 0);
  note(67, false, 0);
  assert.equal(controller.states[0].held.length, 3,
    'released keys remain available while CC64 is down');
  assert.notEqual(controller.states[0].timer, null, 'the phrase keeps running under the pedal');
  controller.handleSustain('keyboard', 1, false);
  assert.equal(controller.states[0].held.length, 0);
  assert.equal(controller.states[0].timer, null, 'pedal-up stops after the last physical key was released');
  controller.destroy();
});

test('preset transition detaches Arpeggiator notes without cutting Organ or the other modules', () => {
  let timerId = 0;
  const timers = new Map();
  const fakeWindow = {
    setTimeout(callback) {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const playback = transpile(
    '../src/features/player/PatternPlaybackController.ts',
    (specifier) => specifier === './PatternModulesView' ? views : {},
    { window: fakeWindow, Math },
  );
  const sent = [];
  const snapshot = {
    bpm: 120,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
    arpeggiator: {
      moduleEnabled: true, hasSound: true, midiInputId: null, lowNote: 0, highNote: 127,
      sustainEnabled: true,
      settings: { enabled: true, mode: 'up', division: '1/16', octaves: 1, gate: 70, swing: 0 },
    },
  };
  const controller = new playback.PatternPlaybackController(
    () => snapshot,
    (moduleNumber, slot, status, note, velocity) => sent.push([moduleNumber, slot, status, note, velocity]),
  );
  controller.handleInput({ inputId: null, noteNumber: 60, pressed: true, velocity: 100 });
  const noteOffsBefore = sent.filter(([, , status]) => status === 0x80).length;
  const detached = controller.detachForPresetTransition();
  assert.equal(detached.length, 8, 'todos os módulos ativos entregam sua nota para a transição');
  assert(detached.some(({ moduleNumber, inputSlot }) => moduleNumber === 7 && inputSlot === 10),
    'o Organ participa da mesma transição sem corte');
  assert.equal(sent.filter(([, , status]) => status === 0x80).length, noteOffsBefore,
    'desanexar não envia Note Off antes do commit nativo');
  assert.equal(timers.size, 0, 'os próximos passos e gates antigos ficam suspensos');
  controller.reset();
  assert.equal(sent.filter(([, , status]) => status === 0x80).length, noteOffsBefore,
    'o restore do novo preset não corta as notas já entregues à camada antiga');

  const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
  assert.match(player, /await hookKeysNative\.commitPresetTransition\(\);\s*await this\.releasePatternNotesAfterPresetCommit\(\);/,
    'as notas do Arpeggiator só são soltas depois que Pulse e parâmetros antigos viram cauda');
});
