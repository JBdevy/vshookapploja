#include "hook_keys/HookKeysEngine.hpp"
#include "hook_keys/AnalogSynthModule.hpp"
#include "hook_keys/ModuleEffects.hpp"
#include "hook_keys/NativeEngineRuntime.hpp"
#include "hook_keys/OrganModule.hpp"
#include "hook_keys/RealtimeCommandQueue.hpp"
#include "hook_keys/TinySoundFontModule.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cmath>
#include <filesystem>
#include <iostream>
#include <memory>
#include <numeric>
#include <thread>
#include <vector>

namespace {

struct Event final {
  enum class Type { noteOn, noteOff, controlChange, pitchBend, allNotesOff } type;
  int data1 = 0;
  int data2 = 0;
};

class RecordingSynth final : public hook_keys::ModuleSynth {
public:
  void noteOn(std::uint8_t note, std::uint8_t velocity) noexcept override {
    events.push_back({Event::Type::noteOn, note, velocity});
  }
  void noteOff(std::uint8_t note) noexcept override {
    events.push_back({Event::Type::noteOff, note, 0});
  }
  void stealNote(std::uint8_t note) noexcept override {
    ++stealCount;
    noteOff(note);
  }
  void controlChange(std::uint8_t controller, std::uint8_t value) noexcept override {
    events.push_back({Event::Type::controlChange, controller, value});
  }
  void pitchBend(std::uint16_t value) noexcept override {
    events.push_back({Event::Type::pitchBend, value, 0});
  }
  void allNotesOff() noexcept override {
    events.push_back({Event::Type::allNotesOff, 0, 0});
  }
  void renderAdd(float*, float*, std::size_t, float) noexcept override {}
  bool isVoicePoolNearlyFull() const noexcept override { return voicePoolNearlyFull; }

  std::vector<Event> events;
  bool voicePoolNearlyFull = false;
  int stealCount = 0;
};

class StereoSignalSynth final : public hook_keys::ModuleSynth {
public:
  void noteOn(std::uint8_t, std::uint8_t) noexcept override {}
  void noteOff(std::uint8_t) noexcept override {}
  void controlChange(std::uint8_t, std::uint8_t) noexcept override {}
  void pitchBend(std::uint16_t) noexcept override {}
  void allNotesOff() noexcept override {}
  void renderAdd(float* left, float* right, std::size_t frames, float gain) noexcept override {
    for (std::size_t frame = 0; frame < frames; ++frame) {
      left[frame] += 0.25f * gain;
      right[frame] += 0.75f * gain;
    }
  }
};

[[noreturn]] void fail(const char* message) {
  std::cerr << "FAILED: " << message << '\n';
  std::exit(EXIT_FAILURE);
}

void expect(bool condition, const char* message) {
  if (!condition) fail(message);
}

void process(hook_keys::HookKeysEngine& engine) {
  std::array<float, 32> left{};
  std::array<float, 32> right{};
  engine.render(left.data(), right.data(), left.size());
}

hook_keys::MidiMessage midi(
    std::uint8_t status, std::uint8_t data1, std::uint8_t data2, std::uint8_t inputSlot = 0) {
  return {status, data1, data2, inputSlot, 0};
}

void testGlobalTranspose() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);

  hook_keys::ModuleConfig config;
  expect(engine.setModuleConfig(0, config), "configure module for global transpose test");

  expect(engine.enqueueMidi(midi(0x90, 60, 100)), "queue note on, no transpose yet");
  process(engine);
  expect(synth.events.back().data1 == 60, "no transpose leaves the note as played");

  expect(engine.setGlobalTranspose(5), "raise the global transpose by 5 semitones");
  expect(engine.enqueueMidi(midi(0x90, 60, 100)), "queue note on with +5 transpose");
  process(engine);
  expect(synth.events.back().data1 == 65, "global transpose shifts every module up by the same amount");

  expect(engine.setGlobalTranspose(-3), "lower the global transpose to -3 semitones");
  expect(engine.enqueueMidi(midi(0x90, 60, 100)), "queue note on with -3 transpose");
  process(engine);
  expect(synth.events.back().data1 == 57, "a negative global transpose shifts down");

  // Soma com o Oct do próprio módulo: uma oitava acima (+12) e mais 2 semitons
  // do transpose geral.
  config.octaveShift = 1;
  expect(engine.setModuleConfig(0, config), "raise the module's own octave too");
  expect(engine.setGlobalTranspose(2), "set the global transpose to +2 semitones");
  expect(engine.enqueueMidi(midi(0x90, 60, 100)), "queue note on with octave and transpose combined");
  process(engine);
  expect(synth.events.back().data1 == 74, "global transpose stacks with the module's own octave shift");
}

void testModuleDualMonoOutputRouting() {
  StereoSignalSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig config;
  config.outputChannelStart = 2;
  config.outputChannelCount = 2;
  expect(engine.setModuleConfig(0, config), "configure stereo module route on outputs 3+4");

  std::array<float, 8> output{};
  engine.renderInterleaved(output.data(), 2, 4);
  expect(std::abs(output[2] - 0.25f) < 0.0001f && std::abs(output[3] - 0.75f) < 0.0001f,
      "stereo keeps L on output 3 and R on output 4");

  config.outputDualMono = true;
  expect(engine.setModuleConfig(0, config), "enable dual mono for the same module route");
  engine.renderInterleaved(output.data(), 2, 4);
  expect(std::abs(output[2] - 1.0f) < 0.0001f && std::abs(output[3] - 1.0f) < 0.0001f,
      "dual mono sends the uncompensated L+R sum to both outputs 3 and 4");

  config.outputDualMono = false;
  config.outputChannelStart = 3;
  config.outputChannelCount = 1;
  expect(engine.setModuleConfig(0, config), "configure an individual output 4 route");
  engine.renderInterleaved(output.data(), 2, 4);
  expect(std::abs(output[3] - 0.5f) < 0.0001f,
      "an individual output always receives the L+R mono mix");
}

void testPerModuleOutputLimiter() {
  StereoSignalSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig config;
  config.gainLinear = 2.0f;
  expect(engine.setModuleConfig(0, config), "configure a hot module for limiter test");

  constexpr float ceiling = 0.97723722096f; // -0.2 dBFS
  std::array<float, 1024> output{};
  engine.renderInterleaved(output.data(), output.size() / 2, 2);
  const auto peak = *std::max_element(output.begin(), output.end());
  expect(peak <= ceiling + 0.000001f,
      "each module is limited internally to -0.2 dBFS after its fader");
  expect(output[output.size() - 1] > ceiling - 0.0001f,
      "the module limiter reaches the configured ceiling instead of clipping lower");
  expect(std::abs(output[output.size() - 2] * 3.0f - output[output.size() - 1]) < 0.0001f,
      "the linked stereo limiter preserves the module's L/R image");

  std::array<float, 256> left{}, right{};
  engine.render(left.data(), right.data(), left.size());
  expect(*std::max_element(right.begin(), right.end()) <= ceiling + 0.000001f,
      "the planar render path uses the same per-module -0.2 dBFS limiter");
}

void testRangeAndOctaveRouting() {
  RecordingSynth first;
  RecordingSynth second;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &first;
  modules[1] = &second;
  hook_keys::HookKeysEngine engine(modules);

  hook_keys::ModuleConfig firstConfig;
  firstConfig.lowNote = 48;
  firstConfig.highNote = 72;
  firstConfig.octaveShift = 1;
  hook_keys::ModuleConfig secondConfig;
  secondConfig.lowNote = 73;
  secondConfig.highNote = 96;
  expect(engine.setModuleConfig(0, firstConfig), "configure module 1");
  expect(engine.setModuleConfig(1, secondConfig), "configure module 2");
  expect(engine.enqueueMidi(midi(0x90, 60, 100)), "queue note on");
  process(engine);

  expect(first.events.size() == 1, "module 1 receives in-range note");
  expect(first.events[0].type == Event::Type::noteOn && first.events[0].data1 == 72, "module 1 transposes one octave");
  expect(second.events.empty(), "module 2 rejects out-of-range note");

  // Changing the range after note-on must not lose the matching note-off.
  firstConfig.lowNote = 80;
  expect(engine.setModuleConfig(0, firstConfig), "queue range change");
  expect(engine.enqueueMidi(midi(0x80, 60, 0)), "queue note off");
  process(engine);
  expect(first.events.back().type == Event::Type::noteOff && first.events.back().data1 == 72, "note-off uses original routed note");

  // OCT -/+ durante uma nota pressionada encerra a voz antiga no próprio
  // módulo. Caso contrário o Note Off posterior podia não alcançar a nota.
  firstConfig.lowNote = 48;
  firstConfig.octaveShift = 0;
  expect(engine.setModuleConfig(0, firstConfig), "restore range and octave");
  expect(engine.enqueueMidi(midi(0x90, 61, 100)), "hold note before octave change");
  process(engine);
  firstConfig.octaveShift = 1;
  expect(engine.setModuleConfig(0, firstConfig), "change octave while note is held");
  process(engine);
  expect(first.events.back().type == Event::Type::allNotesOff,
      "changing module octave releases held notes instead of leaving a stuck voice");
}

void testKeyboardBroadcastRouting() {
  std::array<RecordingSynth, 4> synths;
  hook_keys::HookKeysEngine::SynthModules modules{};
  for (std::size_t index = 0; index < synths.size(); ++index) modules[index] = &synths[index];
  hook_keys::HookKeysEngine engine(modules);
  for (std::size_t index = 0; index < synths.size(); ++index) {
    hook_keys::ModuleConfig config;
    config.midiInputSlot = index == 3 ? hook_keys::kAllMidiInputs : static_cast<std::uint8_t>(index);
    expect(engine.setModuleConfig(index, config), "configure keyboard routing");
  }
  expect(engine.enqueueMidi(midi(0x90, 60, 110, 1)), "keyboard on MIDI 2");
  process(engine);
  expect(synths[0].events.empty() && synths[2].events.empty(), "MIDI 2 excludes MIDI 1 and 3 modules");
  expect(synths[1].events.size() == 1 && synths[3].events.size() == 1, "MIDI 2 includes matching and all-input modules once");
  expect(engine.enqueueMidi(midi(0x80, 60, 0, 1)), "release MIDI 2");
  process(engine);
  for (auto& synth : synths) synth.events.clear();
  expect(engine.enqueueMidi(midi(0x90, 64, 110, hook_keys::kKeyboardBroadcastInput)), "broadcast keyboard without hardware");
  process(engine);
  for (auto& synth : synths) expect(synth.events.size() == 1, "broadcast plays each module exactly once");
  expect(engine.enqueueMidi(midi(0x80, 64, 0, hook_keys::kKeyboardBroadcastInput)), "release broadcast keyboard");
  process(engine);
  for (auto& synth : synths) expect(synth.events.size() == 2 && synth.events.back().type == Event::Type::noteOff, "broadcast releases each note");
  // Desde que cada módulo ganhou seu próprio slot gerado (base 4 + índice do
  // módulo), o slot 6 passou a ser válido (o do módulo 3) — o teste agora usa
  // um slot além do fim da faixa roteável para continuar inválido.
  expect(!engine.enqueueMidi(midi(0x90, 64, 110, static_cast<std::uint8_t>(hook_keys::kRoutableMidiInputCount))),
      "reject invalid virtual input");
}

void testPatternGeneratorRouting() {
  std::array<RecordingSynth, hook_keys::kModuleCount> synths;
  hook_keys::HookKeysEngine::SynthModules modules{};
  for (std::size_t index = 0; index < synths.size(); ++index) {
    modules[index] = &synths[index];
  }
  hook_keys::HookKeysEngine engine(modules);
  // Cada módulo tem seu próprio Arpeggiator: cada um escuta o seu próprio slot
  // gerado (base + índice do módulo) — ver arpeggiatorInputForModule em
  // EngineTypes.hpp. O módulo 5 (índice 4) usa o dele nesta primeira parte.
  for (std::size_t index = 0; index < synths.size(); ++index) {
    hook_keys::ModuleConfig config;
    config.midiInputSlot = index == 4
        ? hook_keys::arpeggiatorInputForModule(index) : hook_keys::kAllMidiInputs;
    expect(engine.setModuleConfig(index, config), "configure generated-note routing");
  }
  expect(engine.enqueueMidi(midi(0x90, 67, 108, hook_keys::arpeggiatorInputForModule(4))),
      "queue arpeggiator note for module 5's own generated slot");
  process(engine);
  for (std::size_t index = 0; index < synths.size(); ++index) {
    const auto expected = index == 4 ? 1U : 0U;
    expect(synths[index].events.size() == expected, "generated notes stay inside their module");
  }
  expect(synths[4].events[0].data1 == 67, "arpeggiator reaches module 5");
  for (auto& synth : synths) synth.events.clear();

  // O pedal físico segura o acorde-fonte no controlador do arpejador, mas não
  // pode chegar ao synth e prender todas as notas geradas em forma de acorde.
  expect(engine.enqueueMidi(midi(0xb0, 64, 127, 0)), "queue physical sustain for arpeggiator source");
  process(engine);
  expect(synths[4].events.empty(), "physical sustain does not latch generated arpeggiator voices");
  expect(engine.enqueueMidi(midi(0x90, 69, 100, hook_keys::arpeggiatorInputForModule(4))),
      "queue generated note while the physical pedal is down");
  expect(engine.enqueueMidi(midi(0x80, 69, 0, hook_keys::arpeggiatorInputForModule(4))),
      "release generated note while the physical pedal is down");
  process(engine);
  expect(synths[4].events.size() == 2 && synths[4].events[0].type == Event::Type::noteOn &&
         synths[4].events[1].type == Event::Type::noteOff,
      "generated notes still release under the physical sustain pedal");
  expect(synths[4].stealCount == 1,
      "arpeggiator Gate uses the short anti-click release instead of stacking envelope tails");
  for (auto& synth : synths) synth.events.clear();

  // Um segundo módulo com seu próprio Arpeggiator não ouve a frase do
  // primeiro: cada slot gerado pertence a um único módulo.
  hook_keys::ModuleConfig secondGenerator;
  secondGenerator.midiInputSlot = hook_keys::arpeggiatorInputForModule(1);
  expect(engine.setModuleConfig(1, secondGenerator), "give module 2 its own Arpeggiator slot");
  expect(engine.enqueueMidi(midi(0x90, 70, 100, hook_keys::arpeggiatorInputForModule(4))),
      "queue another note for module 5's generated slot");
  process(engine);
  const auto secondModuleReceivedNote = std::any_of(
      synths[1].events.begin(), synths[1].events.end(),
      [](const Event& event) { return event.type == Event::Type::noteOn; });
  // Trocar a rota do módulo 2 solta o CC64 que ainda estava abaixado, portanto
  // ele pode registrar esse CC de limpeza; o que nunca pode receber é a nota
  // gerada pelo Arpeggiator exclusivo do módulo 5.
  expect(synths[4].events.size() == 1 && !secondModuleReceivedNote,
      "each module's generated slot stays independent from the others");
  for (auto& synth : synths) synth.events.clear();

  expect(engine.enqueueMidi(midi(0x90, 60, 100, hook_keys::kKeyboardBroadcastInput)),
         "queue touch keyboard broadcast while the arpeggiator is active");
  process(engine);
  expect(synths[4].events.empty(),
         "touch keyboard roots do not bypass the arpeggiator");
  expect(synths[0].events.size() == 1 && synths[7].events.size() == 1,
         "touch keyboard still broadcasts to ordinary modules");
}

void testMonoVoiceSteal() {
  RecordingSynth mono;
  hook_keys::HookKeysEngine::SynthModules monoModules{};
  monoModules[0] = &mono;
  hook_keys::HookKeysEngine monoEngine(monoModules);
  hook_keys::ModuleConfig monoConfig;
  monoConfig.midiInputSlot = hook_keys::kAllMidiInputs;
  monoConfig.polyphony = 1;
  expect(monoEngine.setModuleConfig(0, monoConfig), "configure mono module");
  expect(monoEngine.enqueueMidi(midi(0x90, 60, 100)), "queue first mono note");
  expect(monoEngine.enqueueMidi(midi(0x90, 64, 100)), "queue replacing mono note");
  process(monoEngine);
  expect(mono.events.size() >= 3, "mono voice is replaced instead of rejecting the next note");
  expect(mono.events.back().type == Event::Type::noteOn && mono.events.back().data1 == 64,
         "latest mono note wins");
}

void testRepeatedNoteLayersUntilNoteOff() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig config;
  config.midiInputSlot = hook_keys::kAllMidiInputs;
  config.polyphony = 128;
  expect(engine.setModuleConfig(0, config), "configure repeated-note layering");
  expect(engine.enqueueMidi(midi(0x90, 60, 70)), "queue first instance of repeated note");
  expect(engine.enqueueMidi(midi(0x90, 60, 115)), "queue second instance of repeated note");
  process(engine);
  expect(synth.events.size() == 2 &&
         synth.events[0].type == Event::Type::noteOn &&
         synth.events[1].type == Event::Type::noteOn,
      "repeated Note On layers a new voice without cutting the previous one");
  expect(engine.enqueueMidi(midi(0x80, 60, 0)), "queue repeated-note release");
  process(engine);
  expect(synth.events.size() == 3 && synth.events.back().type == Event::Type::noteOff &&
         synth.events.back().data1 == 60,
      "one Note Off asks the synth to release the complete repeated-note group");
}

void testGmDrumHiHatChoke() {
  RecordingSynth drum;
  RecordingSynth piano;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &drum;
  modules[1] = &piano;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig drumConfig;
  drumConfig.midiInputSlot = hook_keys::kAllMidiInputs;
  drumConfig.gmDrumHiHatChoke = true;
  hook_keys::ModuleConfig pianoConfig;
  pianoConfig.midiInputSlot = hook_keys::kAllMidiInputs;
  expect(engine.setModuleConfig(0, drumConfig), "configure GM drum hi-hat choke");
  expect(engine.setModuleConfig(1, pianoConfig), "configure regular layered module");
  expect(engine.enqueueMidi(midi(0x90, 46, 100)), "play GM open hi-hat");
  expect(engine.enqueueMidi(midi(0x90, 42, 110)), "closed hi-hat chokes open hi-hat");
  expect(engine.enqueueMidi(midi(0x90, 44, 105)), "pedal hi-hat chokes closed hi-hat");
  process(engine);

  expect(drum.events.size() == 5, "each new GM hi-hat chokes the preceding drum voice");
  expect(drum.events[0].type == Event::Type::noteOn && drum.events[0].data1 == 46,
      "GM open hi-hat starts normally");
  expect(drum.events[1].type == Event::Type::noteOff && drum.events[1].data1 == 46 &&
         drum.events[2].type == Event::Type::noteOn && drum.events[2].data1 == 42,
      "GM closed hi-hat immediately cuts the open hi-hat");
  expect(drum.events[3].type == Event::Type::noteOff && drum.events[3].data1 == 42 &&
         drum.events[4].type == Event::Type::noteOn && drum.events[4].data1 == 44,
      "GM pedal hi-hat immediately cuts the closed hi-hat");
  expect(engine.enqueueMidi(midi(0x80, 44, 0)), "release GM pedal hi-hat before its tail ends");
  expect(engine.enqueueMidi(midi(0x90, 46, 100)), "open hi-hat also chokes a released pedal tail");
  process(engine);
  expect(drum.events.size() == 8 &&
         drum.events[5].type == Event::Type::noteOff && drum.events[5].data1 == 44 &&
         drum.events[6].type == Event::Type::noteOff && drum.events[6].data1 == 44 &&
         drum.events[7].type == Event::Type::noteOn && drum.events[7].data1 == 46,
      "a new GM hi-hat chokes the preceding sample even after its key was released");
  expect(piano.events.size() == 5 &&
         std::all_of(piano.events.begin(), piano.events.begin() + 3, [](const Event& event) {
           return event.type == Event::Type::noteOn;
         }) && piano.events[3].type == Event::Type::noteOff &&
         piano.events[4].type == Event::Type::noteOn,
      "the same GM notes keep normal key behavior outside the Drum category");
}

void testFifoPolyphonySteal() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig config;
  config.midiInputSlot = hook_keys::kAllMidiInputs;
  config.polyphony = 2;
  expect(engine.setModuleConfig(0, config), "configure two-voice FIFO polyphony");
  expect(engine.enqueueMidi(midi(0x90, 60, 100, 0)), "queue oldest poly note");
  expect(engine.enqueueMidi(midi(0x90, 64, 100, 1)), "queue second poly note");
  expect(engine.enqueueMidi(midi(0x90, 67, 100, 2)), "queue replacement poly note");
  process(engine);
  expect(synth.events.size() == 4, "full polyphony steals one voice and still accepts the new note");
  expect(synth.events[0].type == Event::Type::noteOn && synth.events[0].data1 == 60,
      "FIFO polyphony starts with the first note");
  expect(synth.events[2].type == Event::Type::noteOff && synth.events[2].data1 == 60,
      "FIFO polyphony steals the globally oldest note across MIDI inputs");
  expect(synth.events[3].type == Event::Type::noteOn && synth.events[3].data1 == 67,
      "FIFO polyphony starts the incoming note after stealing");

  expect(engine.enqueueMidi(midi(0x80, 60, 0, 0)), "late Note Off for stolen note is accepted");
  process(engine);
  expect(synth.events.size() == 4, "late Note Off cannot stop a different live voice");
}

void testArpeggiatorRouteClearsSustain() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  // Índice 4 = módulo 5, o Arpeggiator desde a renumeração.
  modules[4] = &synth;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig regular;
  regular.midiInputSlot = 0;
  expect(engine.setModuleConfig(4, regular), "configure physical arpeggiator input before enabling processor");
  expect(engine.enqueueMidi(midi(0xB0, 64, 127, 0)), "press sustain before enabling arpeggiator");
  process(engine);
  synth.events.clear();

  auto generated = regular;
  // Slot próprio do módulo 5 (índice 4): base + índice, não o slot cravado.
  generated.midiInputSlot = hook_keys::arpeggiatorInputForModule(4);
  generated.sustainInputEnabled = false;
  expect(engine.setModuleConfig(4, generated), "route arpeggiator to generated notes only");
  process(engine);
  expect(synth.events.size() == 1 && synth.events[0].type == Event::Type::controlChange &&
         synth.events[0].data1 == 64 && synth.events[0].data2 == 0,
      "enabling arpeggiator explicitly releases an earlier sustain pedal state");
  synth.events.clear();
  expect(engine.enqueueMidi(midi(0xB0, 64, 127, 0)), "physical sustain remains valid input data");
  expect(engine.enqueueMidi(midi(0x90, 67, 100, hook_keys::arpeggiatorInputForModule(4))), "generated arpeggio note starts");
  expect(engine.enqueueMidi(midi(0x80, 67, 0, hook_keys::arpeggiatorInputForModule(4))), "generated arpeggio note stops");
  process(engine);
  expect(synth.events.size() == 2 && synth.events[0].type == Event::Type::noteOn &&
         synth.events[1].type == Event::Type::noteOff,
      "with its Sustain switch off the arpeggiator follows only the generated key gate");

  // Com o botão Sustain do módulo ligado, o pedal físico é consumido pelo
  // controlador do Arpeggiator. Ele segura o acorde-fonte, mas não chega ao
  // synth para prender cada nota gerada e formar um acorde por baixo.
  auto pedal = generated;
  pedal.sustainInputEnabled = true;
  expect(engine.setModuleConfig(4, pedal), "turn the arpeggiator module Sustain switch back on");
  process(engine);
  synth.events.clear();
  expect(engine.enqueueMidi(midi(0xB0, 64, 127, 0)), "press the pedal on the physical keyboard");
  expect(engine.enqueueMidi(midi(0xE0, 0, 96, 0)), "bend the wheel on the physical keyboard");
  process(engine);
  expect(synth.events.size() == 1 && synth.events[0].type == Event::Type::pitchBend,
      "the arpeggiator consumes physical sustain without latching generated notes");
  synth.events.clear();
  expect(engine.enqueueMidi(midi(0xB0, 64, 0, 0)), "release the pedal");
  process(engine);
  expect(synth.events.empty(),
      "releasing physical sustain is also kept out of the generated-note synth");
}

void testPerModuleControllerFilters() {
  RecordingSynth first;
  RecordingSynth second;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &first;
  modules[1] = &second;
  hook_keys::HookKeysEngine engine(modules);

  hook_keys::ModuleConfig firstConfig;
  firstConfig.sustainInputEnabled = false;
  firstConfig.modulationInputEnabled = false;
  expect(engine.setModuleConfig(0, firstConfig), "configure controller filters");
  expect(engine.enqueueMidi(midi(0xB0, 64, 127)), "queue sustain");
  expect(engine.enqueueMidi(midi(0xB0, 1, 75)), "queue modulation");
  expect(engine.enqueueMidi(midi(0xB0, 74, 50)), "queue regular controller");
  process(engine);

  expect(first.events.size() == 2 && first.events[0].data1 == 1 && first.events[0].data2 == 0 &&
         first.events[1].data1 == 74,
      "disabling modulation neutralizes the wheel once, then filters sustain and modulation");
  expect(second.events.size() == 3, "unfiltered module receives all controllers");
}

void testDisableAndPanic() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);

  expect(engine.enqueueMidi(midi(0x90, 64, 110)), "queue note before disable");
  expect(engine.enqueueMidi(midi(0xB0, 64, 127)), "queue sustain down");
  process(engine);
  const auto beforeDisable = synth.events.size();
  hook_keys::ModuleConfig disabled;
  disabled.enabled = false;
  expect(engine.setModuleConfig(0, disabled), "disable module");
  process(engine);
  // Desligar o módulo é só fechar a porta do MIDI: o que estava soando segue.
  expect(synth.events.size() == beforeDisable, "disabling a module does not cut the sound");

  expect(engine.enqueueMidi(midi(0x90, 67, 110)), "queue note while disabled");
  expect(engine.enqueueMidi(midi(0xB0, 74, 50)), "queue controller while disabled");
  process(engine);
  expect(synth.events.size() == beforeDisable, "a disabled module takes no notes and no controllers");

  // O sustain continua inteiro: Solo/Off fecha notas novas, mas o pedal ainda
  // pode soltar e voltar a segurar as caudas que já pertencem ao módulo.
  expect(engine.enqueueMidi(midi(0xB0, 64, 0)), "queue pedal release while disabled");
  process(engine);
  expect(synth.events.size() == beforeDisable + 1 &&
         synth.events.back().data1 == 64 && synth.events.back().data2 == 0,
      "releasing the pedal still reaches a disabled module");
  expect(engine.enqueueMidi(midi(0xB0, 64, 127)), "queue pedal down while disabled");
  process(engine);
  expect(synth.events.size() == beforeDisable + 2 &&
         synth.events.back().data1 == 64 && synth.events.back().data2 == 127,
      "pressing the pedal still reaches a disabled module");

  // E a tecla solta depois de desligar ainda para a nota dela.
  expect(engine.enqueueMidi(midi(0x80, 64, 0)), "queue note off while disabled");
  process(engine);
  expect(synth.events.back().type == Event::Type::noteOff, "note off still reaches a disabled module");

  expect(engine.stopAllNotes(), "queue panic");
  process(engine);
  expect(synth.events.back().type == Event::Type::allNotesOff, "panic reaches every module");
}

void testModuleEnabledMaskPreservesTailsAndSustain() {
  std::array<RecordingSynth, hook_keys::kModuleCount> synths;
  hook_keys::HookKeysEngine::SynthModules modules{};
  for (std::size_t index = 0; index < synths.size(); ++index) modules[index] = &synths[index];
  auto engine = std::make_unique<hook_keys::HookKeysEngine>(modules);
  expect(engine->enqueueMidi(midi(0x90, 60, 100)), "start a note in every module");
  expect(engine->enqueueMidi(midi(0xB0, 64, 127)), "hold pedal before solo");
  process(*engine);
  for (auto& synth : synths) synth.events.clear();

  expect(engine->setModuleEnabledMask(1u << 6), "solo organ with one atomic command");
  process(*engine);
  for (const auto& synth : synths) {
    expect(synth.events.empty(), "solo must not cut, retrigger or reset existing voices");
  }
  expect(engine->enqueueMidi(midi(0x90, 64, 100)), "new note while organ is soloed");
  expect(engine->enqueueMidi(midi(0xB0, 1, 100)), "mod wheel while soloed");
  expect(engine->enqueueMidi(midi(0xE0, 0, 80)), "pitch wheel while soloed");
  process(*engine);
  for (std::size_t index = 0; index < synths.size(); ++index) {
    expect(synths[index].events.size() == (index == 6 ? 3u : 0u),
        "only solo module receives new notes, modulation and pitch");
    synths[index].events.clear();
  }
  expect(engine->enqueueMidi(midi(0x80, 60, 0)), "release original keys under solo");
  expect(engine->enqueueMidi(midi(0xB0, 64, 0)), "release pedal under solo");
  process(*engine);
  for (auto& synth : synths) {
    expect(synth.events.size() == 2 && synth.events[0].type == Event::Type::noteOff &&
        synth.events[1].type == Event::Type::controlChange && synth.events[1].data1 == 64,
        "note-off and sustain release still reach all original modules");
    synth.events.clear();
  }
  expect(engine->setModuleEnabledMask(0x81), "restore original on/off mask, modules 1 and 8");
  expect(engine->enqueueMidi(midi(0x90, 67, 100, hook_keys::kKeyboardBroadcastInput)),
      "screen keyboard follows restored power states");
  process(*engine);
  for (std::size_t index = 0; index < synths.size(); ++index) {
    expect(synths[index].events.size() == (index == 0 || index == 7 ? 1u : 0u),
        "restoring power states must not enable modules that were off before solo");
  }

  StereoSignalSynth tail;
  modules.fill(nullptr);
  modules[0] = &tail;
  auto tailEngine = std::make_unique<hook_keys::HookKeysEngine>(modules);
  expect(tailEngine->setModuleEnabledMask(0), "close all MIDI gates");
  std::array<float, 32> left{}, right{};
  tailEngine->render(left.data(), right.data(), left.size());
  expect(left.back() > 0 && right.back() > 0, "disabled modules continue rendering their tails");
}

void testMidiInputRouting() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);

  hook_keys::ModuleConfig config;
  config.midiInputSlot = 1;
  expect(engine.setModuleConfig(0, config), "select MIDI input 2");
  expect(engine.enqueueMidi(midi(0x90, 60, 100, 0)), "queue note from input 1");
  expect(engine.enqueueMidi(midi(0x90, 62, 100, 1)), "queue note from input 2");
  expect(engine.enqueueMidi(midi(0xE0, 0, 64, 0)), "queue pitch bend from input 1");
  expect(engine.enqueueMidi(midi(0xE0, 1, 64, 1)), "queue pitch bend from input 2");
  expect(engine.enqueueMidi(midi(0xB0, 1, 90, 0)), "queue modulation from input 1");
  expect(engine.enqueueMidi(midi(0xB0, 1, 91, 1)), "queue modulation from input 2");
  process(engine);

  expect(synth.events.size() == 3, "module receives notes, pitch and modulation only from selected input");
  expect(synth.events[0].type == Event::Type::noteOn && synth.events[0].data1 == 62,
         "selected MIDI input routes notes");
  expect(synth.events[1].type == Event::Type::pitchBend, "selected MIDI input routes pitch bend");
  expect(synth.events[2].type == Event::Type::controlChange && synth.events[2].data1 == 1,
         "selected MIDI input routes modulation");

  config.midiInputSlot = 2;
  expect(engine.setModuleConfig(0, config), "switch MIDI input");
  process(engine);
  expect(synth.events.back().type == Event::Type::allNotesOff, "switching MIDI input releases old voices");
  // Slot 6 hoje é válido (o gerado do módulo 3); use um além do fim da faixa.
  expect(!engine.enqueueMidi(midi(0x90, 64, 100, static_cast<std::uint8_t>(hook_keys::kRoutableMidiInputCount))),
      "reject invalid MIDI input slot");
}

void testAllMidiInputsRouting() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);

  hook_keys::ModuleConfig config;
  config.midiInputSlot = hook_keys::kAllMidiInputs;
  expect(engine.setModuleConfig(0, config), "select all MIDI inputs");
  expect(engine.enqueueMidi(midi(0x90, 60, 100, 0)), "queue note from all-input slot 1");
  expect(engine.enqueueMidi(midi(0x90, 62, 100, 2)), "queue note from all-input slot 3");
  expect(engine.enqueueMidi(midi(0xE0, 0, 64, 1)), "queue pitch from all-input slot 2");
  expect(engine.enqueueMidi(midi(0xB0, 1, 70, 2)), "queue modulation from all-input slot 3");
  process(engine);

  expect(synth.events.size() == 4, "all-input module receives notes and expressive MIDI from every slot");
  expect(synth.events[0].type == Event::Type::noteOn && synth.events[1].type == Event::Type::noteOn,
         "all-input module routes both notes");
  expect(synth.events[2].type == Event::Type::pitchBend, "all-input module routes pitch bend");
  expect(synth.events[3].type == Event::Type::controlChange, "all-input module routes modulation");
}

void testConcurrentProducers() {
  struct QueueValue final {
    std::uint16_t producer = 0;
    std::uint16_t sequence = 0;
  };

  constexpr std::size_t producerCount = 4;
  constexpr std::size_t valuesPerProducer = 200;
  hook_keys::RealtimeCommandQueue<QueueValue, 1024> queue;
  std::atomic<bool> start{false};
  std::array<std::thread, producerCount> producers;

  for (std::size_t producer = 0; producer < producerCount; ++producer) {
    producers[producer] = std::thread([producer, &queue, &start, valuesPerProducer] {
      while (!start.load(std::memory_order_acquire)) std::this_thread::yield();
      for (std::size_t sequence = 0; sequence < valuesPerProducer; ++sequence) {
        const QueueValue value{static_cast<std::uint16_t>(producer), static_cast<std::uint16_t>(sequence)};
        if (!queue.tryPush(value)) fail("MPSC queue unexpectedly full");
      }
    });
  }

  start.store(true, std::memory_order_release);
  for (auto& producer : producers) producer.join();

  std::array<std::array<bool, valuesPerProducer>, producerCount> received{};
  QueueValue value;
  std::size_t count = 0;
  while (queue.tryPop(value)) {
    expect(value.producer < producerCount && value.sequence < valuesPerProducer, "valid queued value");
    expect(!received[value.producer][value.sequence], "concurrent queue does not duplicate values");
    received[value.producer][value.sequence] = true;
    ++count;
  }
  expect(count == producerCount * valuesPerProducer, "concurrent queue preserves all values");
}

void testTinySoundFontRendering() {
  hook_keys::TinySoundFontModule synth(48000.0, 128);
  expect(synth.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"),
         "load TinySoundFont example SF2");
  expect(synth.hasPendingSoundFont(), "loaded SF2 waits for the audio block");

  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);
  expect(engine.enqueueMidi(midi(0x90, 60, 120)), "queue SF2 test note");

  std::array<float, 2048> left{};
  std::array<float, 2048> right{};
  engine.render(left.data(), right.data(), left.size());
  const auto energy = std::accumulate(left.begin(), left.end(), 0.0,
                                      [](double sum, float sample) { return sum + std::abs(sample); });
  expect(energy > 0.001, "TinySoundFont generates audible samples");
  expect(!synth.hasPendingSoundFont(), "audio block activates the loaded SF2");

  expect(engine.enqueueMidi(midi(0x80, 60, 0)), "queue SF2 note off");
  process(engine);
  synth.unload();
  process(engine);
  synth.collectRetiredSoundFonts();
}

void testSoundFontModWheelModes() {
  const auto render = [](bool lfo, float rateHz, std::uint8_t wheel) {
    hook_keys::TinySoundFontModule synth(48000.0, 128);
    expect(synth.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"),
           "load SF2 for Mod mode test");
    synth.setModulationMode(lfo ? 1 : 0, rateHz);
    synth.beginBlock();
    synth.controlChange(1, wheel);
    synth.noteOn(60, 120);
    std::vector<float> left(24000), right(24000);
    synth.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    return left;
  };
  const auto distance = [](const auto& first, const auto& second) {
    double result = 0;
    for (std::size_t index = 0; index < first.size(); ++index) {
      result += std::abs(first[index] - second[index]);
    }
    return result;
  };

  const auto userWithoutWheel = render(false, 7.55f, 0);
  const auto userWithWheel = render(false, 7.55f, 127);
  expect(userWithoutWheel == userWithWheel,
      "User Mod does not add Hook Keys pitch vibrato to the SF2");
  const auto defaultLfo = render(true, 7.55f, 127);
  expect(distance(defaultLfo, userWithoutWheel) > 1.0,
      "LFO Mod applies pitch vibrato when the wheel is raised");
  const auto slowerLfo = render(true, 2.0f, 127);
  expect(distance(defaultLfo, slowerLfo) > 1.0,
      "Mod Rate changes the pitch LFO frequency");
  expect(render(true, 7.55f, 0) == userWithoutWheel,
      "LFO mode stays neutral while the Mod wheel is at zero");
}

void testSameSoundFontRunsIndependentlyAcrossModules() {
  hook_keys::NativeEngineRuntime runtime(48000.0, 128);
  const char* path = "third_party/TinySoundFont/examples/florestan-subset.sf2";
  expect(runtime.loadSoundFont(0, path) && runtime.cloneSoundFont(0, 1),
      "same SF2 samples load once and clone into an independent module instance");
  hook_keys::ModuleConfig first;
  first.midiInputSlot = 0;
  first.outputChannelStart = 0;
  first.outputChannelCount = 2;
  hook_keys::ModuleConfig second = first;
  second.midiInputSlot = 1;
  second.outputChannelStart = 2;
  expect(runtime.setModuleConfig(0, first) && runtime.setModuleConfig(1, second),
      "same-SF2 modules retain independent routing and settings");
  expect(runtime.sendMidi(0, 0x90, 60, 110), "play only the first same-SF2 instance");
  std::vector<float> firstPass(4096 * 4);
  runtime.renderInterleaved(firstPass.data(), 4096, 4);
  double firstEnergy = 0.0;
  double secondEnergy = 0.0;
  for (std::size_t frame = 0; frame < 4096; ++frame) {
    firstEnergy += std::abs(firstPass[frame * 4]);
    secondEnergy += std::abs(firstPass[frame * 4 + 2]);
  }
  expect(firstEnergy > 0.01 && secondEnergy < 0.00001,
      "triggering one module does not trigger the other instance of the same SF2");

  expect(runtime.sendMidi(1, 0x90, 67, 110), "play the second same-SF2 instance independently");
  std::vector<float> secondPass(4096 * 4);
  runtime.renderInterleaved(secondPass.data(), 4096, 4);
  firstEnergy = 0.0;
  secondEnergy = 0.0;
  for (std::size_t frame = 0; frame < 4096; ++frame) {
    firstEnergy += std::abs(secondPass[frame * 4]);
    secondEnergy += std::abs(secondPass[frame * 4 + 2]);
  }
  expect(firstEnergy > 0.01 && secondEnergy > 0.01,
      "same SF2 voices continue with separate note, output and processor state");
}

void testDefaultVolumeEnvelopes() {
  hook_keys::AnalogSynthConfig defaults;
  expect(defaults.attackMs == 0.0f && defaults.releaseMs == 300.0f, "Synth defaults to zero Attack and 300 ms Release");
  expect(defaults.holdMs == 15000.0f && defaults.decayMs == 25000.0f && defaults.filterCutoffHz == 20000.0f,
      "Synth Hold, Decay and Cutoff default to maximum");
  defaults.sustain = 0.25f;
  defaults.normalize(48000.0);
  expect(defaults.sustain == 1.0f, "native Synth Sustain is always fixed to full gain");

  hook_keys::AnalogSynthModule synth(48000.0);
  synth.noteOn(60, 127);
  std::array<float, 256> left{};
  std::array<float, 256> right{};
  synth.renderAdd(left.data(), right.data(), left.size(), 1.0f);
  expect(std::any_of(left.begin(), left.end(), [](float value) { return value != 0.0f; }), "zero Attack sounds immediately");
  synth.noteOff(60);
  std::vector<float> tailLeft(16000, 0.0f);
  std::vector<float> tailRight(16000, 0.0f);
  synth.renderAdd(tailLeft.data(), tailRight.data(), tailLeft.size(), 1.0f);
  const auto tailEnd = std::find_if(tailLeft.rbegin(), tailLeft.rend(), [](float value) { return value != 0.0f; });
  const auto releaseFrames = static_cast<std::size_t>(std::distance(tailLeft.begin(), tailEnd.base()));
  expect(releaseFrames >= 14380 && releaseFrames <= 14420, "native Synth Release lasts 300 ms at 48 kHz");

  const auto renderSoundFont = [](bool explicitDefaults) {
    hook_keys::TinySoundFontModule sf2(48000.0, 128);
    if (explicitDefaults) sf2.setVolumeEnvelope(0.0f, 15000.0f, 25000.0f, 300.0f);
    expect(sf2.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"), "load SF2 for envelope default test");
    sf2.beginBlock();
    sf2.noteOn(60, 127);
    std::array<std::vector<float>, 2> audio{std::vector<float>(8192), std::vector<float>(8192)};
    sf2.renderAdd(audio[0].data(), audio[1].data(), 2048, 1.0f);
    sf2.noteOff(60);
    sf2.renderAdd(audio[0].data() + 2048, audio[1].data() + 2048, 6144, 1.0f);
    return audio;
  };
  expect(renderSoundFont(false) == renderSoundFont(true),
      "standalone SF2 modules keep their documented envelope defaults");
}

void testNativeRuntimeSignalPath() {
  hook_keys::NativeEngineRuntime runtime(48000.0, 128);
  expect(runtime.loadSoundFont(0, "third_party/TinySoundFont/examples/florestan-subset.sf2"),
         "native runtime loads a module SF2");
  hook_keys::ModuleConfig config;
  config.midiInputSlot = hook_keys::kAllMidiInputs;
  expect(runtime.setModuleConfig(0, config), "native runtime configures all MIDI inputs");
  expect(runtime.sendMidi(2, 0x90, 60, 120), "native runtime queues a MIDI note");

  std::array<float, 2048> left{};
  std::array<float, 2048> right{};
  runtime.render(left.data(), right.data(), left.size());
  const auto energy = std::accumulate(left.begin(), left.end(), 0.0,
                                      [](double sum, float sample) { return sum + std::abs(sample); });
  expect(energy > 0.001, "native runtime renders the complete MIDI-to-audio path");

  runtime.setOutputGainDb(-90.0f, true);
  runtime.render(left.data(), right.data(), left.size());
  runtime.render(left.data(), right.data(), left.size());
  const auto mutedEnergy = std::accumulate(left.begin(), left.end(), 0.0,
                                           [](double sum, float sample) { return sum + std::abs(sample); });
  expect(mutedEnergy == 0.0, "native runtime maps the minimum fader position to silence");
}

void testNativeRuntimeLiveEffectGain() {
  hook_keys::NativeEngineRuntime runtime(48000.0, 128);
  std::vector<float> sample(48000 * 2, 0.25f);
  expect(runtime.loadEffectSample(0, sample.data(), 48000, 48000.0), "load long FX");
  expect(runtime.triggerEffectSample(0, true), "start long FX");
  std::array<float, 256> output{};
  runtime.renderInterleaved(output.data(), 128, 2);
  expect(std::abs(output[0] - 0.25f) < 0.001f, "FX begins at unity");
  expect(runtime.setEffectSampleGain(1, -36.0f), "other FX gain accepted");
  runtime.renderInterleaved(output.data(), 128, 2);
  expect(std::abs(output[0] - 0.25f) < 0.001f, "other pad gain does not change playing FX");
  expect(runtime.setEffectSampleGain(0, -12.0f), "change playing FX gain");
  runtime.renderInterleaved(output.data(), 128, 2);
  expect(output[0] > 0.24f && output.back() < output[0], "gain starts a smooth ramp");
  for (int i = 0; i < 60; ++i) runtime.renderInterleaved(output.data(), 128, 2);
  expect(std::abs(output.back() - 0.25f * std::pow(10.0f, -12.0f / 20.0f)) < 0.001f,
      "playing FX reaches slider gain without restarting");
}

void testNativeRuntimeEffectPadsAndMidiChannel10() {
  hook_keys::NativeEngineRuntime runtime(48000.0, 128);
  std::array<float, 128 * 2> sample{};
  for (std::size_t frame = 0; frame < 128; ++frame) {
    sample[frame * 2] = 0.25f;
    sample[frame * 2 + 1] = -0.5f;
  }
  expect(runtime.loadEffectSample(0, sample.data(), 128, 48000.0),
      "native runtime decodes an FX pad into preallocated PCM");
  expect(runtime.triggerEffectSample(0, true), "UI can trigger a native FX pad");
  std::array<float, 128 * 2> output{};
  runtime.renderInterleaved(output.data(), 128, 2);
  expect(std::abs(output[0] - 0.25f) < 0.0001f && std::abs(output[1] + 0.5f) < 0.0001f,
      "native FX keeps stereo samples off the UI thread");
  const auto peaks = runtime.consumeEffectPeaks();
  expect(peaks[0] >= 0.25f && peaks[1] >= 0.5f,
      "FX meter measures the native post-gain output");

  runtime.setPerformanceMapping(48, 2, 0, 0, 0, -6.0f);
  output.fill(0.0f);
  expect(runtime.sendMidi(0, 0x99, 48, 127),
      "MIDI channel 10 reaches the native performance mapping");
  runtime.renderInterleaved(output.data(), 128, 2);
  expect(std::abs(output[0]) > 0.12f && std::abs(output[0]) < 0.13f,
      "channel 10 triggers the mapped FX with its saved gain");

  runtime.clearPerformanceMappings();
  output.fill(0.0f);
  expect(runtime.sendMidi(0, 0x99, 48, 127), "unmapped channel 10 note is consumed safely");
  runtime.renderInterleaved(output.data(), 128, 2);
  expect(std::all_of(output.begin(), output.end(), [](float value) { return value == 0.0f; }),
      "clearing the native mapping prevents a stale FX trigger");
}

void testNeutralRuntimeSoundFontPathPreservesEmbeddedEnvelope() {
  constexpr std::size_t frames = 4096;
  constexpr std::size_t block = 128;
  const char* path = "third_party/TinySoundFont/examples/florestan-subset.sf2";

  hook_keys::NativeEngineRuntime runtime(48000.0, block);
  expect(runtime.loadSoundFont(0, path), "neutral SF2 path loads the runtime timbre");
  hook_keys::ModuleConfig config;
  config.midiInputSlot = hook_keys::kAllMidiInputs;
  expect(runtime.setModuleConfig(0, config), "neutral SF2 path enables module 1");
  expect(runtime.setModuleEnvelope(0, 0.0f, 15000.0f, 25000.0f, 300.0f, 0.0f, 0.0f),
      "neutral SF2 path sends the UI factory envelope");
  expect(runtime.sendMidi(0, 0x90, 60, 127), "neutral SF2 path starts a note");
  std::array<std::vector<float>, 2> actual{
      std::vector<float>(frames), std::vector<float>(frames)};
  runtime.render(actual[0].data(), actual[1].data(), frames);

  hook_keys::TinySoundFontModule reference(48000.0, block);
  reference.useEmbeddedVolumeEnvelope();
  expect(reference.loadFromFile(path), "neutral SF2 path loads its embedded-envelope reference");
  reference.beginBlock();
  reference.noteOn(60, 127);
  std::array<std::vector<float>, 2> expected{
      std::vector<float>(frames), std::vector<float>(frames)};
  reference.renderAdd(expected[0].data(), expected[1].data(), frames, 1.0f);

  expect(actual == expected,
      "module 1 with every processor neutral reaches the output without hidden envelope or effects");
}

void testGmDrumPerNoteZeroRelease() {
  RecordingSynth drum;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &drum;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig config;
  config.midiInputSlot = hook_keys::kAllMidiInputs;
  config.gmDrumHiHatChoke = true;
  config.drumZeroReleaseNoteMasks[1] = std::uint32_t{1} << (38 - 32);
  expect(engine.setModuleConfig(0, config), "configure per-note Drum Release 0");
  expect(engine.enqueueMidi(midi(0x90, 38, 100)), "play zero-release snare note");
  expect(engine.enqueueMidi(midi(0x80, 38, 0)), "release zero-release snare note");
  process(engine);
  expect(drum.events.size() == 2 && drum.events[1].type == Event::Type::noteOff && drum.events[1].data1 == 38,
      "a Drum key marked Release 0 uses immediate voice stealing on Note Off");
}

void testModulesMeterUsesEveryOutput() {
  const char* soundFont = "third_party/TinySoundFont/examples/florestan-subset.sf2";
  hook_keys::NativeEngineRuntime defaultRoute(48000.0, 128);
  expect(defaultRoute.loadSoundFont(0, soundFont), "load SF2 for Modules meter test");
  hook_keys::ModuleConfig config;
  config.midiInputSlot = hook_keys::kAllMidiInputs;
  expect(defaultRoute.setModuleConfig(0, config), "route timbre to default stereo pair");
  expect(defaultRoute.sendMidi(0, 0x90, 60, 120), "start default-route timbre");
  std::array<float, 4096> left{}, right{};
  defaultRoute.render(left.data(), right.data(), left.size());
  const auto defaultPeaks = defaultRoute.consumeMasterPeaks();
  expect(defaultPeaks[0] > 0.0f && defaultPeaks[1] > 0.0f,
      "Modules meter reads both channels of the default timbre output");
  expect(defaultRoute.consumeMasterPeaks() == std::array<float, 2>{},
      "Modules meter peaks reset after the UI reads them");

  hook_keys::NativeEngineRuntime customRoute(48000.0, 128);
  expect(customRoute.loadSoundFont(0, soundFont), "load SF2 for custom route test");
  config.outputChannelStart = 2;
  expect(customRoute.setModuleConfig(0, config), "route timbre to outputs 3+4");
  expect(customRoute.sendMidi(0, 0x90, 60, 120), "start custom-route timbre");
  customRoute.setOutputGainDb(-90.0f, true);
  std::array<float, 4096 * 4> output{};
  customRoute.renderInterleaved(output.data(), 4096, 4);
  (void)customRoute.consumeMasterPeaks();
  customRoute.renderInterleaved(output.data(), 4096, 4);
  expect(customRoute.consumeMasterPeaks() == std::array<float, 2>{},
      "muted Modules bus reports silence on custom outputs too");
  expect(std::all_of(output.begin(), output.end(), [](float sample) { return sample == 0.0f; }),
      "Modules fader mutes timbres routed to outputs 3+4");

  customRoute.setOutputGainDb(0.0f, true, 2, 2);
  customRoute.renderInterleaved(output.data(), 4096, 4);
  const auto routedPeaks = customRoute.consumeMasterPeaks();
  expect(routedPeaks[0] > 0.0f && routedPeaks[1] > 0.0f,
      "Modules meter includes timbres routed to outputs 3+4");
  customRoute.setOutputGainDb(-90.0f, true, 2, 2);
  customRoute.renderInterleaved(output.data(), 4096, 4);
  customRoute.renderInterleaved(output.data(), 4096, 4);
  expect(std::all_of(output.begin(), output.end(), [](float sample) {
    return sample == 0.0f;
  }), "Modules fader keeps every timbre output muted");
}

void testNativeRuntimeOrganDrawbars() {
  hook_keys::NativeEngineRuntime runtime(48000.0, 128);
  for (std::size_t index = 0; index < 9; ++index) {
    const auto path = "assets/hook-b3/drawbar-" + std::to_string(index) + ".sf2";
    expect(runtime.loadOrganVoice(index, path.c_str()), "native runtime loads every Organ drawbar SF2");
    runtime.setOrganDrawbarPosition(index, index == 0 ? 8 : 0);
  }
  hook_keys::ModuleConfig config;
  config.midiInputSlot = hook_keys::kAllMidiInputs;
  expect(runtime.setModuleConfig(6, config), "native runtime enables the Organ module");
  expect(runtime.sendMidi(0, 0x90, 60, 127), "native runtime queues an Organ note");

  std::array<float, 4096> left{};
  std::array<float, 4096> right{};
  runtime.render(left.data(), right.data(), left.size());
  const auto energy = std::accumulate(left.begin(), left.end(), 0.0,
                                      [](double sum, float sample) { return sum + std::abs(sample); });
  expect(energy > 0.001, "a pulled Organ drawbar produces audio through module 7");

  hook_keys::ModuleEffectsConfig::TranceGateConfig pulse;
  pulse.enabled = true;
  pulse.steps = 0;
  pulse.length = 1;
  pulse.beatMultiplier = 0.0625f;
  pulse.depth = 1.0f;
  pulse.attackMs = 0.1f;
  pulse.releaseMs = 0.1f;
  expect(runtime.setTranceGate(6, pulse), "Pulse config reaches the Organ engine");
  expect(runtime.sendMidi(0, 0x90, 64, 127), "Organ Pulse receives a fresh note");
  std::array<float, 4096> gatedLeft{}, gatedRight{};
  runtime.render(gatedLeft.data(), gatedRight.data(), gatedLeft.size());
  const auto gatedTail = std::accumulate(gatedLeft.end() - 1024, gatedLeft.end(), 0.0,
      [](double sum, float sample) { return sum + std::abs(sample); });
  expect(gatedTail < energy * 0.001, "Pulse closes the audible Organ signal");
}

void testDryOrganPreservesItsSoundFontVoice() {
  constexpr std::size_t frames = 4096;
  constexpr std::size_t block = 256;
  const char* path = "assets/hook-b3/drawbar-0.sf2";

  hook_keys::OrganModule organ(48000.0, block);
  expect(organ.loadVoice(0, path), "dry Organ test loads its first drawbar");
  organ.setDrawbarPosition(0, 8);

  hook_keys::TinySoundFontModule reference(48000.0, block);
  expect(reference.loadFromFile(path), "dry Organ test loads the reference SF2 voice");
  reference.setNoVelocitySensitivity(true);
  reference.useEmbeddedVolumeEnvelope();

  organ.beginBlock();
  reference.beginBlock();
  organ.noteOn(60, 127);
  reference.noteOn(60, 127);
  std::array<std::vector<float>, 2> actual{
      std::vector<float>(frames), std::vector<float>(frames)};
  std::array<std::vector<float>, 2> expected{
      std::vector<float>(frames), std::vector<float>(frames)};
  for (std::size_t offset = 0; offset < frames; offset += block) {
    organ.beginBlock();
    reference.beginBlock();
    organ.renderAdd(actual[0].data() + offset, actual[1].data() + offset, block, 1.0f);
    reference.renderAdd(expected[0].data() + offset, expected[1].data() + offset, block, 1.0f);
  }
  expect(actual == expected,
      "dry Organ adds no hidden click, envelope or first-note drawbar fade to the SF2 voice");
}

void testOrganEnvelopeAndPermanentNoSens() {
  const auto render = [](float attackMs, std::uint8_t velocity) {
    hook_keys::OrganModule organ(48000.0, 256);
    expect(organ.loadVoice(0, "assets/hook-b3/drawbar-0.sf2"), "Organ envelope test loads a drawbar");
    organ.setDrawbarPosition(0, 8);
    organ.setNoVelocitySensitivity(false); // The Organ must ignore attempts to disable No Sens.
    organ.setVolumeEnvelope(attackMs, 15000.0f, 0.0f, 30.0f, 0.0f);
    organ.beginBlock();
    organ.noteOn(60, velocity);
    std::vector<float> left(4096), right(4096);
    for (std::size_t offset = 0; offset < left.size(); offset += 256) {
      organ.beginBlock();
      organ.renderAdd(left.data() + offset, right.data() + offset,
          std::min<std::size_t>(256, left.size() - offset), 1.0f);
    }
    return std::accumulate(left.begin(), left.end(), 0.0,
        [](double sum, float sample) { return sum + std::abs(sample); });
  };
  const auto immediateSoft = render(0.0f, 20);
  const auto immediateHard = render(0.0f, 127);
  const auto slowAttack = render(2000.0f, 127);
  expect(immediateSoft > immediateHard * 0.85 && immediateSoft < immediateHard * 1.15,
      "Organ keeps No Sens active internally at every key velocity");
  expect(slowAttack < immediateHard * 0.2,
      "Organ forwards its Attack envelope to every drawbar voice");
}

void testCompatibilityBlocksCc7() {
  hook_keys::NativeEngineRuntime actual(48000, 128), reference(48000, 128);
  hook_keys::ModuleConfig module;
  module.midiInputSlot = 0;
  for (auto* runtime : {&actual, &reference}) {
    expect(runtime->loadSoundFont(0, "third_party/TinySoundFont/examples/florestan-subset.sf2"), "CC7 test loads SF2");
    expect(runtime->setModuleConfig(0, module), "CC7 test configures SF2");
  }
  actual.setCompatibilityMode(true);
  expect(actual.sendMidi(0, 0xb0, 7, 0), "blocked CC7 is safely discarded");
  for (auto* runtime : {&actual, &reference}) expect(runtime->sendMidi(0, 0x90, 60, 127), "CC7 test note on");
  std::array<float, 512 * 2> audio{}, expected{};
  actual.renderInterleaved(audio.data(), 512, 2);
  reference.renderInterleaved(expected.data(), 512, 2);
  expect(audio == expected, "compatibility blocks CC7 before internal SF2 channel volume changes");
  expect(std::any_of(audio.begin(), audio.end(), [](float sample) { return std::abs(sample) > 0.00001f; }), "CC7 did not mute the SF2");
  actual.setCompatibilityMode(false);
  expect(actual.sendMidi(0, 0xb0, 7, 0), "CC7 is accepted when compatibility is off");
  for (int block = 0; block < 4; ++block) actual.renderInterleaved(audio.data(), 512, 2);
  expect(std::all_of(audio.begin(), audio.end(), [](float sample) { return std::abs(sample) < 0.00001f; }), "normal MIDI CC7 remains functional outside compatibility mode");
}

void testSharedSoundFontEnvelopeIsolation() {
  hook_keys::TinySoundFontModule slow(48000, 128), fast(48000, 128), reference(48000, 128);
  const char* path = "third_party/TinySoundFont/examples/florestan-subset.sf2";
  expect(slow.loadFromFile(path) && fast.copySoundFontFrom(slow) && reference.loadFromFile(path), "copy sample data across independent envelopes");
  slow.setVolumeEnvelope(500, 15000, 25000, 400);
  reference.setVolumeEnvelope(500, 15000, 25000, 400);
  fast.setVolumeEnvelope(0, 10, 10, 10);
  slow.beginBlock();
  reference.beginBlock();
  fast.beginBlock(); // must not change slow's parameters for FUTURE note-ons
  slow.noteOn(60, 127);
  reference.noteOn(60, 127);
  std::array<float, 1024> left{}, right{}, expectedLeft{}, expectedRight{};
  slow.renderAdd(left.data(), right.data(), left.size(), 1);
  reference.renderAdd(expectedLeft.data(), expectedRight.data(), left.size(), 1);
  expect(left == expectedLeft && right == expectedRight, "shared samples never share mutable Attack/Hold/Decay/Release parameters");
}

void testIndependentPresetTails() {
  hook_keys::NativeEngineRuntime actual(48000.0, 128);
  hook_keys::NativeEngineRuntime previous(48000.0, 128);
  hook_keys::NativeEngineRuntime current(48000.0, 128);
  hook_keys::ModuleConfig oldModule;
  oldModule.midiInputSlot = 0;
  oldModule.gainLinear = 0.5f;
  oldModule.outputChannelStart = 0;
  hook_keys::ModuleEffectsConfig oldEffects;
  oldEffects.delay.enabled = true;
  oldEffects.delay.mix = 0.25f;
  oldEffects.delay.delayMs = 45.0f;
  oldEffects.reverb.enabled = true;
  oldEffects.reverb.mix = 0.15f;
  hook_keys::AnalogSynthConfig oldSynth;
  oldSynth.voiceMode = 0;
  oldSynth.oscillator1 = 0;
  oldSynth.oscillator2Enabled = false;
  oldSynth.oscillator3Enabled = false;
  oldSynth.glideMs = 0;
  oldSynth.filterEnvelope = 0;
  oldSynth.releaseMs = 350;
  for (auto* runtime : {&actual, &previous}) {
    expect(runtime->loadSoundFont(0, "third_party/TinySoundFont/examples/florestan-subset.sf2"), "preset test loads shared SF2");
    expect(runtime->setModuleConfig(0, oldModule), "old SF2 config");
    expect(runtime->setModuleConfig(7, oldModule), "old synth config");
    expect(runtime->setModuleEffects(0, oldEffects), "old effects config");
    expect(runtime->setModuleEffects(7, oldEffects), "old synth effects config");
    expect(runtime->setSynthConfig(oldSynth), "old oscillator config");
    expect(runtime->setModuleEnvelope(0, 0, 15000, 25000, 350), "old envelope config");
    expect(runtime->sendMidi(0, 0xb0, 64, 127), "old pedal held");
    expect(runtime->sendMidi(0, 0x90, 60, 100), "old note on");
  }
  std::array<float, 128 * 4> actualAudio{}, previousAudio{}, currentAudio{};
  auto compare = [&](bool renderCurrent = true) {
    actual.renderInterleaved(actualAudio.data(), 128, 4);
    previous.renderInterleaved(previousAudio.data(), 128, 4);
    if (renderCurrent) current.renderInterleaved(currentAudio.data(), 128, 4);
    else currentAudio.fill(0.0f);
    for (std::size_t sample = 0; sample < actualAudio.size(); ++sample) {
      expect(std::abs(actualAudio[sample] - previousAudio[sample] - currentAudio[sample]) < 0.00001f,
          "preset transition preserves original SF2/synth voices, effects, gain and output route sample-for-sample");
    }
  };
  for (int block = 0; block < 16; ++block) compare();
  expect(actual.beginPresetTransition(), "prepare independent preset without panic/restart");
  hook_keys::ModuleConfig newModule;
  newModule.midiInputSlot = 1;
  newModule.outputChannelStart = 2;
  newModule.octaveShift = 1;
  newModule.sustainInputEnabled = false;
  newModule.gainLinear = 0.2f;
  hook_keys::AnalogSynthConfig newSynth = oldSynth;
  newSynth.oscillator1 = 2;
  newSynth.oscillator2Enabled = true;
  newSynth.oscillator2Volume = 0.3f;
  newSynth.attackMs = 15;
  newSynth.filterCutoffHz = 350;
  newSynth.releaseMs = 12;
  // Current reference starts with the same samples but entirely separate
  // voices. Actual transition cloned the bank without rereading the SF2.
  expect(current.loadSoundFont(0, "third_party/TinySoundFont/examples/florestan-subset.sf2"), "new reference loads same SF2");
  for (auto* runtime : {&actual, &current}) {
    expect(runtime->setModuleConfig(0, newModule), "new SF2 config");
    expect(runtime->setModuleConfig(7, newModule), "new synth config");
    expect(runtime->setSynthConfig(newSynth), "new oscillators do not mutate old voices");
    expect(runtime->setModuleEnvelope(0, 25, 100, 150, 12), "new envelopes do not mutate old voices");
  }
  compare(false); // both fresh layers stay unrendered until their settings are committed
  expect(actual.commitPresetTransition(), "atomically activate a fully configured preset");
  for (auto* runtime : {&actual, &current}) expect(runtime->sendMidi(1, 0x90, 67, 90), "new notes use new layer only");
  for (int block = 0; block < 16; ++block) compare();
  for (auto* runtime : {&actual, &previous}) expect(runtime->sendMidi(0, 0x80, 60, 0), "release old key by its original route");
  for (int block = 0; block < 16; ++block) compare();
  expect(std::any_of(previousAudio.begin(), previousAudio.end(), [](float sample) { return std::abs(sample) > 0.00001f; }),
      "old sustain remains held even when the new preset disables sustain");
  expect(actual.setModuleGainDb(0, -30), "mapped fader changes only new SF2 layer");
  expect(current.setModuleGainDb(0, -30), "new reference fader");
  for (int block = 0; block < 8; ++block) compare();
  for (auto* runtime : {&actual, &previous}) expect(runtime->sendMidi(0, 0xb0, 64, 0), "pedal up releases original preset");
  for (auto* runtime : {&actual, &current}) expect(runtime->sendMidi(1, 0x80, 67, 0), "new note releases independently");
  for (int block = 0; block < 1700; ++block) compare();
  actual.collectRetiredSoundFonts();

  // Repeated silent switches recycle layers rather than retaining every
  // preset forever or cutting held voices when the bounded capacity fills.
  hook_keys::NativeEngineRuntime idle(8000.0, 128);
  std::array<float, 128 * 2> silence{};
  for (int preset = 0; preset < 40; ++preset) {
    expect(idle.beginPresetTransition(), "silent layers are reclaimed for subsequent preset switches");
    expect(idle.commitPresetTransition(), "activate prepared idle layer");
    for (int block = 0; block < 128; ++block) idle.renderInterleaved(silence.data(), 128, 2);
    idle.collectRetiredSoundFonts();
  }
}

void testCancelledNativePresetLeavesCurrentAudioUntouched() {
  hook_keys::NativeEngineRuntime actual(48000, 128), reference(48000, 128);
  hook_keys::ModuleConfig config;
  config.gainLinear = 0.15f;
  hook_keys::AnalogSynthConfig synth;
  synth.oscillator1 = 0;
  synth.oscillator2Enabled = synth.oscillator3Enabled = false;
  synth.voiceMode = 0;
  for (auto* runtime : {&actual, &reference}) {
    expect(runtime->setModuleConfig(7, config), "enable test synth");
    expect(runtime->setSynthConfig(synth), "configure test synth");
    expect(runtime->sendMidi(0, 0xb0, 64, 127), "hold pedal before native preset");
    expect(runtime->sendMidi(0, 0x90, 60, 100), "hold note before native preset");
  }
  std::array<float, 256> a{}, b{};
  const auto compare = [&] {
    actual.renderInterleaved(a.data(), 128, 2);
    reference.renderInterleaved(b.data(), 128, 2);
    for (std::size_t i = 0; i < a.size(); ++i)
      expect(std::abs(a[i] - b[i]) < 0.000001f, "cancel leaves sounding voices and controls unchanged");
  };
  compare();
  for (int attempt = 0; attempt < 20; ++attempt) {
    expect(actual.beginPresetTransition(true, attempt % 2 == 0), "cancelled layers do not consume the preset limit, including deferred effects");
    expect(actual.setModuleEnabledMask(0), "stage disabled modules");
    expect(actual.setModuleEnvelope(7, 1000, 0, 1000, 1000), "stage native synth envelope");
    expect(!actual.loadSoundFont(0, "missing-native-preset.sf2"), "invalid SF2 rejects staged preset");
    compare();
    actual.cancelPresetTransition();
    compare();
  }
  for (auto* runtime : {&actual, &reference}) {
    expect(runtime->setModuleGainDb(7, -20), "controls return to the live layer after cancel");
    expect(runtime->sendMidi(0, 0x80, 60, 0), "release held key");
    expect(runtime->sendMidi(0, 0xb0, 64, 0), "release original sustain");
  }
  for (int i = 0; i < 20; ++i) compare();
  actual.cancelPresetTransition(); // no pending layer is a safe no-op
  compare();
}

void testPresetSoundFontWarmupIsBoundedAndReused() {
  namespace fs = std::filesystem;
  const auto root = fs::temp_directory_path() / ("bronze-warm-" +
      std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
  fs::create_directory(root);
  const auto a = root / "a.sf2", b = root / "b.sf2", c = root / "c.sf2";
  const auto fixture = fs::path("third_party/TinySoundFont/examples/florestan-subset.sf2");
  for (const auto& path : {a, b, c}) fs::copy_file(fixture, path);
  hook_keys::NativeEngineRuntime runtime(48000, 128);
  const auto budget = static_cast<std::size_t>(fs::file_size(fixture)) * 2;
  expect(!runtime.preloadSoundFont(a.string().c_str()), "warm-up requires seamless mode");
  runtime.setSeamlessPresetSwitching(true, budget);
  expect(runtime.preloadSoundFont(a.string().c_str()), "prepare first preset before touch");
  expect(runtime.preloadSoundFont(b.string().c_str()), "prepare second preset within the shared sample budget");
  expect(!runtime.preloadSoundFont(c.string().c_str()), "optional warm-up cannot evict ready presets to load a third bank");
  std::array<float, 256> silence{};
  runtime.renderInterleaved(silence.data(), 128, 2);
  expect(std::all_of(silence.begin(), silence.end(), [](float v) { return v == 0; }), "warm-up does not activate any module");
  fs::remove(a); fs::remove(b);
  for (int preset = 0; preset < 6; ++preset) {
    expect(runtime.beginPresetTransition(true, true), "stage warmed preset");
    const auto path = preset % 2 == 0 ? a : b;
    expect(runtime.loadSoundFont(0, path.string().c_str()), "repeated preset switches reuse samples without reopening deleted files");
    expect(runtime.commitPresetTransition(), "activate warmed preset");
    for (int block = 0; block < 128; ++block) runtime.renderInterleaved(silence.data(), 128, 2);
    runtime.collectRetiredSoundFonts();
  }
  runtime.setSeamlessPresetSwitching(false);
  expect(!runtime.loadSoundFont(0, a.string().c_str()), "disabling seamless releases retained cache");
  fs::remove_all(root);
}

void testDeferredNativePresetEffectsMatchPreparedTransition() {
  hook_keys::NativeEngineRuntime actual(48000, 128), reference(48000, 128);
  std::array<float, 256> a{}, b{};
  const auto compare = [&] {
    actual.renderInterleaved(a.data(), 128, 2);
    reference.renderInterleaved(b.data(), 128, 2);
    for (std::size_t i = 0; i < a.size(); ++i)
      expect(std::abs(a[i] - b[i]) < 0.000001f,
          "deferred preparation preserves old voices and new reverb/delay sample-for-sample");
  };
  for (int preset = 0; preset < 3; ++preset) {
    if (preset > 0) {
      expect(actual.beginPresetTransition(true, true), "defer outgoing preset effects");
      expect(reference.beginPresetTransition(true), "prepare outgoing preset effects as reference");
    }
    for (auto* runtime : {&actual, &reference}) {
      hook_keys::ModuleConfig module;
      module.gainLinear = 0.1f;
      expect(runtime->setModulePerformance(7, module), "configure target synth route");
      hook_keys::AnalogSynthConfig synth;
      synth.oscillator1 = 0;
      synth.oscillator2Enabled = synth.oscillator3Enabled = false;
      synth.releaseMs = 400;
      expect(runtime->setSynthConfig(synth), "configure target synth");
      expect(runtime->setModuleReverb(7, preset != 1, preset == 2 ? 3 : 2, 0.4f, preset == 2 ? 0.4f : 1.0f),
          "prepare only the target reverb, including bypass and a different tail");
      hook_keys::DelayConfig delay;
      delay.enabled = preset != 1;
      delay.sync = false;
      delay.delayMs = 20;
      delay.mix = 0.4f;
      expect(runtime->setModuleDelay(7, delay), "prepare target delay");
    }
    if (preset > 0) {
      compare(); // preparing the next layer must not alter the audible old one
      expect(actual.commitPresetTransition(), "commit deferred snapshot");
      expect(reference.commitPresetTransition(), "commit reference snapshot");
    }
    for (auto* runtime : {&actual, &reference})
      expect(runtime->sendMidi(0, 0x90, static_cast<std::uint8_t>(60 + preset), 100), "play target preset");
    for (int block = 0; block < 100; ++block) compare();
    for (auto* runtime : {&actual, &reference})
      expect(runtime->sendMidi(0, 0x80, static_cast<std::uint8_t>(60 + preset), 0), "release target preset");
  }
}

// Collects the frame index of every metronome attack, rendering the runtime in
// blocks of `blockFrames` so the caller can compare different callback sizes.
// A click is an oscillator, so its samples cross zero constantly: a new onset
// only counts after a silent gap longer than any of those crossings.
std::vector<std::size_t> metronomeOnsets(
    hook_keys::NativeEngineRuntime& runtime, std::size_t totalFrames, std::size_t blockFrames) {
  constexpr std::size_t silenceGapFrames = 480; // 10 ms at 48 kHz.
  std::vector<float> left(blockFrames, 0.0f);
  std::vector<float> right(blockFrames, 0.0f);
  std::vector<std::size_t> onsets;
  std::size_t silentFrames = silenceGapFrames;
  for (std::size_t offset = 0; offset < totalFrames; offset += blockFrames) {
    // The last block is clamped so every block size covers the same span.
    const auto rendered = std::min(blockFrames, totalFrames - offset);
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    runtime.render(left.data(), right.data(), rendered);
    for (std::size_t frame = 0; frame < rendered; ++frame) {
      if (std::abs(left[frame]) <= 0.0005f) {
        ++silentFrames;
        continue;
      }
      if (silentFrames >= silenceGapFrames) onsets.push_back(offset + frame);
      silentFrames = 0;
    }
  }
  return onsets;
}

void testMetronomeRunsOnTheAudioCallback() {
  constexpr double sampleRate = 48000.0;
  constexpr std::size_t totalFrames = 48000 * 2;

  hook_keys::NativeEngineRuntime idle(sampleRate, 512);
  expect(metronomeOnsets(idle, 4096, 512).empty(), "a disabled metronome stays silent");

  hook_keys::NativeEngineRuntime small(sampleRate, 512);
  hook_keys::NativeEngineRuntime large(sampleRate, 2048);
  small.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4, 4);
  large.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4, 4);

  const auto smallOnsets = metronomeOnsets(small, totalFrames, 64);
  const auto largeOnsets = metronomeOnsets(large, totalFrames, 2048);
  expect(smallOnsets.size() == 4, "120 BPM produces four clicks in two seconds");
  expect(smallOnsets == largeOnsets, "click timing ignores the render block size");
  for (std::size_t index = 1; index < smallOnsets.size(); ++index) {
    const auto interval = smallOnsets[index] - smallOnsets[index - 1];
    expect(interval == static_cast<std::size_t>(sampleRate * 0.5),
           "clicks keep an exact beat interval");
  }

  hook_keys::NativeEngineRuntime doubled(sampleRate, 512);
  doubled.setMetronome(true, 120.0f, 1.0f, 1, false, true, 4, 4);
  expect(metronomeOnsets(doubled, totalFrames, 256).size() == 8,
         "double time doubles the click rate");

  hook_keys::NativeEngineRuntime quiet(sampleRate, 512);
  quiet.setMetronome(true, 120.0f, 0.0f, 1, false, false, 4, 4);
  expect(metronomeOnsets(quiet, totalFrames, 256).empty(), "zero volume silences the click");

  hook_keys::NativeEngineRuntime sampled(sampleRate, 512);
  sampled.setMetronome(true, 120.0f, 1.0f, 4, false, false, 4, 4);
  expect(!metronomeOnsets(sampled, 16384, 256).empty(),
         "Click 4 plays the embedded WAV sample");

  hook_keys::NativeEngineRuntime sampledFive(sampleRate, 512);
  sampledFive.setMetronome(true, 120.0f, 1.0f, 5, false, false, 4, 4);
  expect(!metronomeOnsets(sampledFive, 16384, 256).empty(),
         "Click 5 plays the embedded MP3 converted to native PCM");

  hook_keys::NativeEngineRuntime restarted(sampleRate, 512);
  restarted.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4, 4);
  (void)metronomeOnsets(restarted, 12000, 256);
  restarted.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4, 4, true);
  const auto restartedOnsets = metronomeOnsets(restarted, 4096, 256);
  expect(restartedOnsets.size() == 1 && restartedOnsets.front() < 16,
         "an explicit metronome restart begins a new beat at the next audio block");
}

void testMetronomeOutputRoute() {
  static constexpr std::size_t channels = 4;
  static constexpr std::size_t frames = 4096;
  const auto energyPerChannel = [](hook_keys::NativeEngineRuntime& runtime) {
    std::vector<float> audio(frames * channels, 0.0f);
    runtime.renderInterleaved(audio.data(), frames, channels);
    std::array<double, channels> energy{};
    for (std::size_t frame = 0; frame < frames; ++frame) {
      for (std::size_t channel = 0; channel < channels; ++channel) {
        energy[channel] += std::abs(audio[frame * channels + channel]);
      }
    }
    return energy;
  };

  hook_keys::NativeEngineRuntime main(48000.0, 512);
  main.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4, 4);
  const auto mainEnergy = energyPerChannel(main);
  expect(mainEnergy[0] > 0.0 && mainEnergy[1] > 0.0, "the default metronome route plays on outputs 1+2");
  expect(mainEnergy[2] == 0.0 && mainEnergy[3] == 0.0, "the default metronome route leaves outputs 3+4 silent");
  const auto clickPeaks = main.consumeMetronomePeaks();
  expect(clickPeaks[0] > 0.0f && clickPeaks[1] > 0.0f,
      "Click meter reads both post-volume metronome channels");

  hook_keys::NativeEngineRuntime cue(48000.0, 512);
  cue.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4, 4);
  cue.setMetronomeOutput(2, 2);
  const auto cueEnergy = energyPerChannel(cue);
  expect(cueEnergy[0] == 0.0 && cueEnergy[1] == 0.0, "a 3+4 metronome route leaves outputs 1+2 silent");
  expect(cueEnergy[2] > 0.0 && cueEnergy[3] > 0.0, "a 3+4 metronome route plays on outputs 3+4");

  hook_keys::NativeEngineRuntime mono(48000.0, 512);
  mono.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4, 4);
  mono.setMetronomeOutput(3, 1);
  const auto monoEnergy = energyPerChannel(mono);
  expect(monoEnergy[3] > 0.0 && monoEnergy[0] == 0.0 && monoEnergy[1] == 0.0 && monoEnergy[2] == 0.0,
         "a mono metronome route plays only on its output");

  hook_keys::NativeEngineRuntime missing(48000.0, 512);
  missing.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4, 4);
  missing.setMetronomeOutput(8, 2);
  const auto missingEnergy = energyPerChannel(missing);
  expect(missingEnergy[0] > 0.0 && missingEnergy[1] > 0.0,
         "a route beyond the interface falls back to outputs 1+2");
}

class ConstantTrackDecoder final : public hook_keys::TrackDecoder {
public:
  ConstantTrackDecoder(std::uint64_t frames, float left, float right) noexcept
      : frames_(frames), left_(left), right_(right) {}
  [[nodiscard]] std::uint64_t frameCount() const noexcept override { return frames_; }
  [[nodiscard]] bool seek(std::uint64_t frame) noexcept override {
    position_ = std::min(frame, frames_);
    return true;
  }
  [[nodiscard]] std::size_t read(float* stereo, std::size_t frames) noexcept override {
    const auto count = static_cast<std::size_t>(std::min<std::uint64_t>(frames, frames_ - position_));
    for (std::size_t frame = 0; frame < count; ++frame) {
      stereo[frame * 2] = left_;
      stereo[frame * 2 + 1] = right_;
    }
    position_ += count;
    return count;
  }

private:
  std::uint64_t frames_;
  std::uint64_t position_ = 0;
  float left_;
  float right_;
};

// Renderiza até a condição valer: a thread de leitura enche a fila por conta própria.
template <typename Condition>
bool renderTracksUntil(hook_keys::TrackPlayer& player, std::vector<float>& audio, std::size_t channels,
                       Condition condition, int maximumBlocks = 400) {
  static constexpr std::size_t frames = 256;
  for (int block = 0; block < maximumBlocks; ++block) {
    audio.assign(frames * channels, 0.0f);
    player.render(audio.data(), frames, channels);
    if (condition()) return true;
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  return false;
}

void testTrackPlayerPlaysRoutesLoopsAndEnds() {
  static constexpr std::size_t channels = 4;
  std::vector<float> audio;
  const auto channelEnergy = [&](std::size_t channel) {
    double energy = 0.0;
    for (std::size_t frame = 0; frame < audio.size() / channels; ++frame) energy += std::abs(audio[frame * channels + channel]);
    return energy;
  };

  auto player = std::make_unique<hook_keys::TrackPlayer>(48000.0);
  expect(player->load(7, std::make_unique<ConstantTrackDecoder>(48000, 0.5f, -0.25f)), "load a track");
  expect(player->frameCount(7) == 48000, "the track reports its length");
  expect(player->status().activeId == 0, "loading does not start playback");
  expect(player->play(7), "play the loaded track");
  expect(renderTracksUntil(*player, audio, channels, [&] { return channelEnergy(0) > 0.0; }),
         "the track reaches the default output 1+2");
  expect(channelEnergy(1) > 0.0 && channelEnergy(2) == 0.0 && channelEnergy(3) == 0.0,
         "the default track route stays on outputs 1+2");
  expect(renderTracksUntil(*player, audio, channels, [&] { return audio[0] > 0.49f; }),
         "the start fade reaches full level");
  expect(std::abs(audio[1] + 0.25f) < 0.01f, "the right channel keeps its own samples");
  expect(player->status().playing && player->status().positionFrames > 0, "playback advances the position");

  player->setRightChannelOnly(true);
  expect(renderTracksUntil(*player, audio, channels, [&] { return audio[0] < -0.24f; }),
         "click off replaces left with right without stopping playback");
  expect(std::abs(audio[0] - audio[1]) < 0.0001f && player->status().playing,
         "click off sends R to both sides, without summing L or doubling volume");
  player->setRightChannelOnly(false);
  expect(renderTracksUntil(*player, audio, channels, [&] { return audio[0] > 0.49f; }),
         "click on restores the original stereo signal live");
  expect(std::abs(audio[1] + 0.25f) < 0.01f, "right remains untouched after routing changes");

  player->setOutput(2, 2);
  renderTracksUntil(*player, audio, channels, [] { return true; });
  expect(channelEnergy(0) == 0.0 && channelEnergy(1) == 0.0 && channelEnergy(2) > 0.0 && channelEnergy(3) > 0.0,
         "a 3+4 track route moves the music to outputs 3+4");
  player->setOutput(3, 1);
  renderTracksUntil(*player, audio, channels, [] { return true; });
  expect(std::abs(audio[3] - 0.125f) < 0.01f && channelEnergy(2) == 0.0,
         "a mono track route mixes both channels into its output");
  player->setOutput(0, 2);

  player->setGainDb(0.0f, false);
  expect(renderTracksUntil(*player, audio, channels, [&] { return channelEnergy(0) == 0.0; }),
         "the Music power button silences the track");
  player->setGainDb(-6.0f, true);
  expect(renderTracksUntil(*player, audio, channels, [&] { return std::abs(audio[0] - 0.25f) < 0.01f; }),
         "the Music fader scales the track");
  player->setGainDb(0.0f, true);

  expect(renderTracksUntil(*player, audio, channels, [&] { return player->status().ended; }),
         "a track without loop ends");
  expect(!player->status().playing && player->status().positionFrames == 48000, "an ended track sits at its end");

  player->setLoop(7, true);
  expect(player->play(7), "play again after the end");
  expect(player->status().positionFrames == 0, "playing after the end restarts from the beginning");
  bool wrapped = false;
  std::uint64_t previous = 0;
  renderTracksUntil(*player, audio, channels, [&] {
    const auto position = player->status().positionFrames;
    if (position < previous) wrapped = true;
    previous = position;
    return wrapped;
  }, 1200);
  expect(wrapped && !player->status().ended, "a looping track wraps without ending");

  player->pause(7);
  expect(renderTracksUntil(*player, audio, channels, [&] { return channelEnergy(0) == 0.0; }),
         "pause fades the track out");
  const auto paused = player->status().positionFrames;
  renderTracksUntil(*player, audio, channels, [] { return false; }, 20);
  expect(player->status().positionFrames == paused, "a paused track keeps its position");

  expect(player->seek(7, 24000), "move the needle while paused");
  renderTracksUntil(*player, audio, channels, [] { return true; });
  expect(player->status().positionFrames == 24000, "the needle position is reported before playing");
  player->setLoop(7, false);
  expect(player->play(7), "play from the needle");
  expect(renderTracksUntil(*player, audio, channels, [&] { return player->status().positionFrames > 24000; }),
         "playback continues from the needle");
  expect(player->status().positionFrames < 36000, "playback did not restart from the beginning");

  player->pause(7);
  expect(player->seek(7, 24000), "seek before playback-rate test");
  player->setPlaybackRate(7, 2.0f);
  expect(player->play(7), "play a tempo-synced loop at double rate");
  std::this_thread::sleep_for(std::chrono::milliseconds(20));
  audio.assign(256 * channels, 0.0f);
  player->render(audio.data(), 256, channels);
  expect(player->status().positionFrames >= 24500,
         "double playback rate advances about two source frames per output frame");
  player->setPlaybackRate(7, 1.0f);

  expect(player->load(8, std::make_unique<ConstantTrackDecoder>(4800, 0.1f, 0.1f)), "queue a second track");
  expect(player->play(8) && player->status().activeId == 8, "the queued track becomes the active one");
  expect(renderTracksUntil(*player, audio, channels, [&] { return std::abs(audio[0] - 0.1f) < 0.01f; }),
         "the second track replaces the first");
  player->unload(8);
  expect(player->status().activeId == 0, "unloading the active track stops playback");

  expect(player->load(9, std::make_unique<ConstantTrackDecoder>(4800, 0.4f, 0.4f)) && player->play(9),
         "play a short track to its end");
  expect(renderTracksUntil(*player, audio, channels, [&] { return player->status().ended; }),
         "the short track ends");
  expect(player->seek(9, 2400), "move the needle after the end");
  bool heardWhileSeeking = false;
  renderTracksUntil(*player, audio, channels, [&] {
    if (channelEnergy(0) > 0.0) heardWhileSeeking = true;
    return false;
  }, 40);
  expect(!heardWhileSeeking && !player->status().playing,
         "moving the needle after the end stays silent and stopped");
  expect(player->status().positionFrames == 2400, "the needle still reports the new position");
  expect(player->play(9), "play from the needle after the end");
  expect(renderTracksUntil(*player, audio, channels, [&] { return channelEnergy(0) > 0.0; }),
         "play after moving the needle is audible");
  expect(player->status().positionFrames >= 2400, "and starts from the needle, not the beginning");
  expect(!player->hasSource(8) && player->hasSource(7), "unload releases only its own track");

  hook_keys::NativeEngineRuntime runtime(48000.0, 512);
  expect(runtime.tracks().load(1, std::make_unique<ConstantTrackDecoder>(96000, 0.3f, 0.3f)) && runtime.tracks().play(1),
         "the runtime plays music through its own callback");
  std::vector<float> engineAudio(512 * 2, 0.0f);
  bool heard = false;
  for (int block = 0; block < 400 && !heard; ++block) {
    runtime.renderInterleaved(engineAudio.data(), 512, 2);
    heard = std::abs(engineAudio[1022] - 0.3f) < 0.01f;
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }

  constexpr double sampleRate = 48000.0;
  constexpr std::size_t totalFrames = static_cast<std::size_t>(sampleRate * 2.0);
  hook_keys::NativeEngineRuntime sixEight(sampleRate, 512);
  sixEight.setMetronome(true, 120.0f, 1.0f, 1, false, false, 6, 8);
  const auto sixEightOnsets = metronomeOnsets(sixEight, totalFrames, 256);
  expect(sixEightOnsets.size() == 8,
         "6/8 uses eighth-note pulses instead of treating the measure as six quarter notes");
  for (std::size_t index = 1; index < sixEightOnsets.size(); ++index) {
    expect(sixEightOnsets[index] - sixEightOnsets[index - 1] ==
               static_cast<std::size_t>(sampleRate * 0.25),
           "the metronome denominator controls the pulse duration");
  }
  expect(heard, "music is mixed into the engine output");
  const auto trackPeaks = runtime.consumeTrackPeaks();
  expect(trackPeaks[0] > 0.0f && trackPeaks[1] > 0.0f,
      "Playlist meter reads the post-volume stereo track signal");
  expect(runtime.consumeTrackPeaks() == std::array<float, 2>{},
      "Playlist meter peaks reset after the UI reads them");
}

void testMutedMetronomeKeepsPhaseWhenUnmuted() {
  for (int sound = 1; sound <= 5; ++sound) {
    for (const int denominator : {4, 8}) {
      hook_keys::NativeEngineRuntime reference(48000.0, 512);
      hook_keys::NativeEngineRuntime muted(48000.0, 512);
      const int numerator = denominator == 8 ? 6 : 4;
      reference.setMetronome(true, 132.5f, 1, sound, false, false, numerator, denominator);
      muted.setMetronome(true, 132.5f, 0, sound, false, false, numerator, denominator);
      (void)metronomeOnsets(reference, 7000, 256);
      expect(metronomeOnsets(muted, 7000, 256).empty(), "loop clock stays silent while click is off");
      muted.setMetronome(true, 132.5f, 1, sound, false, false, numerator, denominator, false);
      const auto expected = metronomeOnsets(reference, 48000, 256);
      const auto actual = metronomeOnsets(muted, 48000, 256);
      if (actual != expected) {
        std::cerr << "click=" << sound << " denominator=" << denominator << " expected:";
        for (auto onset : expected) std::cerr << ' ' << onset;
        std::cerr << " actual:";
        for (auto onset : actual) std::cerr << ' ' << onset;
        std::cerr << '\n';
      }
      expect(!actual.empty() && actual == expected,
          "unmuting any click at fractional BPM preserves the running 4/4 or 6/8 phase");
      // A sampled click can still be sounding between beats. OFF must gate
      // that existing tail too, without resetting the clock.
      muted.setMetronome(true, 132.5f, 0, sound, false, false, numerator, denominator, false);
      expect(metronomeOnsets(muted, 1024, 256).empty(), "mute also gates an already running click");
    }
  }
}

void testVelocityCurveMapping() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);

  hook_keys::ModuleConfig config;
  config.velocityCurve = {0, 8, 32, 72, 127};
  expect(engine.setModuleConfig(0, config), "configure the user velocity curve");
  // Velocity 0 is a note-off in MIDI, so 1 is the softest touch the curve sees.
  expect(engine.enqueueMidi(midi(0x90, 60, 1)), "queue the softest note");
  expect(engine.enqueueMidi(midi(0x90, 62, 64)), "queue a mid note");
  expect(engine.enqueueMidi(midi(0x90, 64, 127)), "queue the hardest note");
  process(engine);

  expect(synth.events.size() == 3, "every note reaches the module");
  expect(synth.events[0].data2 == 1, "the curve never mutes a note");
  expect(synth.events[1].data2 == 33, "the curve bends the middle of the range");
  expect(synth.events[2].data2 == 127, "the curve keeps full velocity at the top");

  config.velocityCurve = {100, 100, 100, 100, 100};
  expect(engine.setModuleConfig(0, config), "configure a fixed velocity curve");
  synth.events.clear();
  expect(engine.enqueueMidi(midi(0x90, 65, 10)), "queue a soft note");
  expect(engine.enqueueMidi(midi(0x90, 67, 120)), "queue a hard note");
  process(engine);
  expect(synth.events.size() == 2 && synth.events[0].data2 == 100 && synth.events[1].data2 == 100,
         "a flat curve maps every touch to the same velocity");
}

// Limite Velocity ignora a nota acima do limite; o limitador do Velocity a
// converte para o proprio limite.
void testVelocityLimits() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig config;
  config.velocityCurve = {0, 32, 64, 96, 127};
  expect(hook_keys::ModuleConfig{}.velocityIgnoreAbove == 127 && hook_keys::ModuleConfig{}.velocityCeiling == 127,
      "both velocity limits default to 127");

  config.velocityIgnoreAbove = 100;
  expect(engine.setModuleConfig(0, config), "configure Limite Velocity");
  expect(engine.enqueueMidi(midi(0x90, 60, 100)), "queue a note at the limit");
  expect(engine.enqueueMidi(midi(0x90, 62, 101)), "queue a note above the limit");
  expect(engine.enqueueMidi(midi(0x80, 62, 0)), "release the ignored note");
  expect(engine.enqueueMidi(midi(0x90, 64, 127)), "queue the hardest note");
  process(engine);
  expect(synth.events.size() == 1 && synth.events[0].data1 == 60,
      "Limite Velocity plays the limit itself and ignores every harder key, including its release");

  synth.events.clear();
  config.velocityIgnoreAbove = 127;
  config.velocityCeiling = 100;
  expect(engine.setModuleConfig(0, config), "configure the velocity limiter");
  expect(engine.enqueueMidi(midi(0x90, 65, 60)), "queue a soft note under the limiter");
  expect(engine.enqueueMidi(midi(0x90, 67, 127)), "queue a note above the limiter");
  process(engine);
  expect(synth.events.size() == 2 && synth.events[0].data2 < 100 && synth.events[1].data2 == 100,
      "the limiter keeps softer notes and converts harder ones to the limit");

  // Synth: each oscillator has its own limit on the raw key velocity.
  const auto renderSynth = [](std::uint8_t limit1, std::uint8_t limit2,
                              std::uint8_t limit3, std::uint8_t velocity) {
    hook_keys::AnalogSynthModule analog(48000);
    hook_keys::AnalogSynthConfig synthConfig;
    synthConfig.voiceMode = 0;
    synthConfig.oscillator1 = 0;
    synthConfig.oscillator2 = 2;
    synthConfig.oscillator3 = 3;
    synthConfig.oscillator3Octave = 1;
    synthConfig.oscillator1DetuneCents = synthConfig.oscillator2DetuneCents = synthConfig.oscillator3DetuneCents = 0.0f;
    synthConfig.glideMs = synthConfig.lfoDepth = synthConfig.filterEnvelope = 0.0f;
    expect(analog.setConfig(synthConfig), "configure oscillator velocity limits");
    analog.setOscillatorVelocityLimits(limit1, limit2, limit3);
    analog.beginBlock();
    analog.noteOnWithFilterVelocity(60, 100, velocity);
    std::vector<float> left(4800), right(4800);
    analog.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    return left;
  };
  const auto energy = [](const std::vector<float>& samples) {
    double total = 0.0;
    for (const auto sample : samples) total += std::abs(sample);
    return total;
  };
  const auto all = renderSynth(127, 127, 127, 110);
  const auto onlyFirst = renderSynth(127, 100, 100, 110);
  const auto onlySecond = renderSynth(100, 127, 100, 110);
  const auto onlyThird = renderSynth(100, 100, 127, 110);
  expect(all != onlyFirst && all != onlySecond && all != onlyThird &&
         onlyFirst != onlySecond && onlyFirst != onlyThird && onlySecond != onlyThird,
      "each of the three Synth oscillators obeys its own velocity limit");
  expect(renderSynth(100, 100, 100, 90) == all,
      "below all three limits the Synth plays every oscillator");
  expect(energy(renderSynth(100, 100, 100, 110)) == 0.0,
      "above all three limits the Synth plays nothing");

  // The runtime keeps the limits when the module itself is reconfigured.
  hook_keys::NativeEngineRuntime runtime(48000, 128);
  expect(runtime.setVelocityLimits(0, 90, 80), "runtime sets the velocity limits");
  expect(runtime.setModuleConfig(0, hook_keys::ModuleConfig{}), "runtime reconfigures the module");
  expect(!runtime.setVelocityLimits(8, 90, 80), "runtime rejects an unknown module");
}

void testEqualizerProcessing() {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0);
  hook_keys::ModuleEffectsConfig config;
  config.equalizer.enabled = true;
  for (auto& band : config.equalizer.bands) band.enabled = false;
  config.equalizer.bands[0] = {true, hook_keys::EqBandType::highCut, 500.0f, 0.0f, 0.7071f, 1};
  effects.setConfig(config, 120.0f);

  std::array<float, 4096> left{};
  std::array<float, 4096> right{};
  for (std::size_t index = 0; index < left.size(); ++index) {
    left[index] = right[index] = (index & 1U) == 0 ? 1.0f : -1.0f;
  }
  effects.process(left.data(), right.data(), left.size());
  double tailEnergy = 0.0;
  for (std::size_t index = left.size() / 2; index < left.size(); ++index) tailEnergy += std::abs(left[index]);
  expect(tailEnergy < 20.0, "high-cut EQ attenuates high-frequency content");
}

double highCutToneEnergy(std::uint8_t cutStages) {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0);
  hook_keys::ModuleEffectsConfig config;
  config.equalizer.enabled = true;
  for (auto& band : config.equalizer.bands) band.enabled = false;
  config.equalizer.bands[0] = {true, hook_keys::EqBandType::highCut, 1000.0f, 0.0f, 0.7071f, cutStages};
  effects.setConfig(config, 120.0f);

  std::array<float, 8192> left{};
  std::array<float, 8192> right{};
  for (std::size_t index = 0; index < left.size(); ++index) {
    const auto sample = static_cast<float>(std::sin(2.0 * 3.14159265358979323846 * 6000.0 *
                                                     static_cast<double>(index) / 48000.0));
    left[index] = right[index] = sample;
  }
  effects.process(left.data(), right.data(), left.size());
  double energy = 0.0;
  for (std::size_t index = left.size() / 2; index < left.size(); ++index) {
    energy += static_cast<double>(left[index]) * left[index];
  }
  return energy;
}

void testNativeEqualizerEditsPreserveOtherEffects() {
  for (const std::size_t moduleIndex : {0u, 6u, 7u}) {
  hook_keys::NativeEngineRuntime actual(48000, 128), reference(48000, 128);
  hook_keys::ModuleConfig module;
  module.gainLinear = 0.12f;
  module.effects.rotary.enabled = true;
  module.effects.rotary.speed = 2;
  module.effects.rotary.cabinetEnabled = false;
  module.effects.delay.enabled = true;
  module.effects.delay.mix = 0.1f;
  module.effects.delay.delayMs = 80;
  module.effects.chorus.enabled = true;
  module.effects.chorus.mix = 0.1f;
  hook_keys::AnalogSynthConfig synth;
  synth.voiceMode = 0;
  synth.oscillator1 = 0;
  synth.oscillator2Enabled = synth.oscillator3Enabled = false;
  for (auto* runtime : {&actual, &reference}) {
    const auto* sf2 = "third_party/TinySoundFont/examples/florestan-subset.sf2";
    if (moduleIndex == 0) expect(runtime->loadSoundFont(0, sf2), "load SF2 for dedicated EQ test");
    if (moduleIndex == 6) {
      expect(runtime->loadOrganVoice(0, sf2), "load B3 voice for dedicated EQ test");
      runtime->setOrganDrawbarPosition(0, 8);
    }
    expect(runtime->setModuleConfig(moduleIndex, module), "configure native EQ test routing and gain");
    expect(runtime->setModuleEffects(moduleIndex, module.effects), "configure existing Rotary, Delay and Chorus");
    expect(runtime->setSynthConfig(synth), "configure EQ test oscillator");
    expect(runtime->sendMidi(0, 0x90, 64, 80), "hold tone during continuous band edits");
  }
  std::array<float, 256> a{}, b{};
  double energy = 0;
  const auto compare = [&] {
    actual.renderInterleaved(a.data(), 128, 2);
    reference.renderInterleaved(b.data(), 128, 2);
    for (std::size_t i = 0; i < a.size(); ++i) {
      expect(std::isfinite(a[i]) && std::abs(a[i] - b[i]) < 0.000001f,
          "dedicated EQ edit preserves Rotary, Delay, Chorus, gain and active voices sample-for-sample");
      energy += std::abs(a[i]);
    }
  };
  for (int block = 0; block < 60; ++block) compare();
  for (int step = 0; step < 120; ++step) {
    auto& eq = module.effects.equalizer;
    eq.enabled = step % 30 != 0;
    eq.bands[2].frequencyHz = 300.0f + step * 20.0f;
    eq.bands[2].gainDb = std::sin(step * 0.1f) * 8.0f;
    eq.bands[2].quality = 0.5f + (step % 10) * 0.1f;
    expect(actual.setModuleEqualizer(moduleIndex, eq), "drag sends native EQ settings on every step");
    expect(reference.setModuleEffects(moduleIndex, module.effects), "full reference retains identical effects");
    compare();
  }
  auto invalid = module.effects.equalizer;
  invalid.bands[0].frequencyHz = std::numeric_limits<float>::quiet_NaN();
  expect(!actual.setModuleEqualizer(moduleIndex, invalid), "reject non-finite native EQ without changing state");
  invalid = module.effects.equalizer;
  invalid.bands[0].type = static_cast<hook_keys::EqBandType>(99);
  expect(!actual.setModuleEqualizer(moduleIndex, invalid), "reject unknown filter type");
  expect(!actual.setModuleEqualizer(8, {}), "reject invalid module");
  for (int block = 0; block < 20; ++block) compare();
  expect(energy > 1.0, "native EQ comparison must contain sounding audio");
  }
}

void testNativeSoundEffectsEditsPreserveOtherEffects() {
  hook_keys::ModuleEffectsConfig::TranceGateConfig pulse;
  pulse.beatMultiplier = 0.02f;
  pulse.normalize();
  expect(pulse.beatMultiplier == 0.02f, "free Pulse supports 20 ms at 60 BPM without clamp");
  pulse.beatMultiplier = 10.0f;
  pulse.normalize();
  expect(pulse.beatMultiplier == 10.0f, "free Pulse supports 2000 ms at 300 BPM without clamp");
  for (const std::size_t moduleIndex : {0u, 6u, 7u}) {
    hook_keys::NativeEngineRuntime actual(48000, 128), reference(48000, 128);
    hook_keys::ModuleConfig module;
    module.gainLinear = 0.12f;
    module.effects.equalizer.enabled = true;
    module.effects.equalizer.bands[2].gainDb = -4;
    module.effects.rotary.enabled = true;
    module.effects.rotary.speed = 2;
    module.effects.delay.enabled = true;
    module.effects.delay.mix = 0.1f;
    module.effects.delay.delayMs = 80;
    module.effects.tranceGate.enabled = true;
    module.effects.tranceGate.steps = 0xaaaa;
    module.effects.tranceGate.depth = 0.7f;
    for (auto* runtime : {&actual, &reference}) {
      const auto* sf2 = "third_party/TinySoundFont/examples/florestan-subset.sf2";
      if (moduleIndex == 0) expect(runtime->loadSoundFont(0, sf2), "load SF2 for processor edit test");
      if (moduleIndex == 6) {
        expect(runtime->loadOrganVoice(0, sf2), "load B3 for processor edit test");
        runtime->setOrganDrawbarPosition(0, 8);
      }
      expect(runtime->setModuleConfig(moduleIndex, module), "configure processor test routing");
      expect(runtime->setModuleEffects(moduleIndex, module.effects), "configure other effects before editing");
      expect(runtime->setTranceGate(moduleIndex, module.effects.tranceGate), "configure Pulse before processor edits");
      expect(runtime->sendMidi(0, 0x90, 64, 80), "hold note during processor edits");
    }
    std::array<float, 256> a{}, b{};
    double energy = 0;
    const auto compare = [&] {
      actual.renderInterleaved(a.data(), 128, 2);
      reference.renderInterleaved(b.data(), 128, 2);
      for (std::size_t i = 0; i < a.size(); ++i) {
        expect(std::isfinite(a[i]) && std::abs(a[i] - b[i]) < 0.000001f,
            "processor editor preserves EQ, Rotary, Delay and held voices sample-for-sample");
        energy += std::abs(a[i]);
      }
    };
    for (int block = 0; block < 60; ++block) compare();
    for (int step = 0; step < 80; ++step) {
      auto& e = module.effects;
      e.compressor.enabled = moduleIndex != 6 && step % 20 != 0;
      e.compressor.thresholdDb = -40 + step * 0.2f;
      e.chorus.enabled = step % 15 != 0;
      e.chorus.depth = step / 80.0f;
      e.loFi.enabled = moduleIndex != 6 && step % 20 != 0;
      e.loFi.vinylEnabled = step % 3 == 0;
      e.loFi.noiseGainDb = -36 + step * 0.4f;
      e.loFi.amountSemitones = step / 80.0f;
      expect(actual.setModuleSoundEffects(moduleIndex, e.compressor, e.chorus, e.loFi), "apply native processor edits");
      expect(reference.setModuleEffects(moduleIndex, e), "apply matching reference processor edits");
      compare();
    }
    auto bad = module.effects.loFi;
    bad.rateHz = std::numeric_limits<float>::quiet_NaN();
    expect(!actual.setModuleSoundEffects(moduleIndex, {}, {}, bad), "reject non-finite processor without mutation");
    expect(!actual.setModuleSoundEffects(8, {}, {}, {}), "reject invalid processor module");
    auto invalidPulse = pulse;
    invalidPulse.beatMultiplier = std::numeric_limits<float>::quiet_NaN();
    expect(!actual.setTranceGate(moduleIndex, invalidPulse), "reject non-finite Pulse without state mutation");
    auto blockedVibes = hook_keys::LoFiConfig{};
    blockedVibes.enabled = true;
    expect(!actual.setModuleSoundEffects(6, {}, {}, blockedVibes), "B3 cannot enable Vibes");
    auto blockedCompressor = hook_keys::CompressorConfig{};
    blockedCompressor.enabled = true;
    expect(!actual.setModuleSoundEffects(6, blockedCompressor, {}, {}), "B3 cannot enable compressor");
    compare();
    expect(energy > 1.0, "processor comparison must render actual audio");
  }
}

void testNativeReverbEditsPreserveOtherEffects() {
  for (const std::size_t moduleIndex : {0u, 6u, 7u}) {
    hook_keys::NativeEngineRuntime actual(48000, 128), reference(48000, 128);
    hook_keys::ModuleConfig module;
    module.gainLinear = 0.12f;
    module.effects.equalizer.enabled = true;
    module.effects.equalizer.bands[2].gainDb = -6;
    module.effects.rotary.enabled = true;
    module.effects.rotary.speed = 2;
    module.effects.rotary.cabinetEnabled = false;
    module.effects.delay.enabled = true;
    module.effects.delay.mix = 0.1f;
    module.effects.delay.delayMs = 80;
    hook_keys::AnalogSynthConfig synth;
    synth.voiceMode = 0;
    synth.oscillator2Enabled = synth.oscillator3Enabled = false;
    for (auto* runtime : {&actual, &reference}) {
      const auto* sf2 = "third_party/TinySoundFont/examples/florestan-subset.sf2";
      if (moduleIndex == 0) expect(runtime->loadSoundFont(0, sf2), "load SF2 for native reverb test");
      if (moduleIndex == 6) {
        expect(runtime->loadOrganVoice(0, sf2), "load B3 for native reverb test");
        runtime->setOrganDrawbarPosition(0, 8);
      }
      expect(runtime->setModuleConfig(moduleIndex, module), "configure native reverb test routing");
      expect(runtime->setModuleEffects(moduleIndex, module.effects), "configure existing EQ, Rotary and Delay");
      expect(runtime->setSynthConfig(synth), "configure reverb test oscillator");
      expect(runtime->sendMidi(0, 0x90, 64, 80), "hold tone while reverb changes");
    }
    std::array<float, 256> a{}, b{};
    double energy = 0;
    const auto compare = [&] {
      actual.renderInterleaved(a.data(), 128, 2);
      reference.renderInterleaved(b.data(), 128, 2);
      for (std::size_t i = 0; i < a.size(); ++i) {
        expect(std::isfinite(a[i]) && std::abs(a[i] - b[i]) < 0.000001f,
            "dedicated reverb preserves EQ, Rotary, Delay, gain and held voices sample-for-sample");
        energy += std::abs(a[i]);
      }
    };
    for (int block = 0; block < 60; ++block) compare();
    for (int step = 0; step < 80; ++step) {
      auto& reverb = module.effects.reverb;
      reverb.enabled = step % 20 != 0;
      reverb.impulse = static_cast<std::uint8_t>(step / 20);
      reverb.mix = (step % 20) * 0.04f;
      reverb.tail = step % 20 < 10 ? 1.0f : 0.25f;
      expect(actual.setModuleReverb(moduleIndex, reverb.enabled, reverb.impulse, reverb.mix, reverb.tail),
          "prepare all four IRs and update native mix continuously");
      expect(reference.setModuleEffects(moduleIndex, module.effects), "apply matching reference reverb");
      for (int block = 0; block < 4; ++block) compare();
    }
    expect(!actual.setModuleReverb(8, true, 0, 0.2f), "reject invalid reverb module");
    expect(!actual.setModuleReverb(moduleIndex, true, 4, 0.2f), "reject invalid IR");
    expect(!actual.setModuleReverb(moduleIndex, true, 0, std::numeric_limits<float>::quiet_NaN()),
        "reject non-finite mix without mutating state");
    expect(!actual.setModuleReverb(moduleIndex, true, 0, 0.2f, std::numeric_limits<float>::infinity()),
        "reject non-finite Decay without mutating state");
    for (int block = 0; block < 20; ++block) compare();
    for (const float mix : {-1.0f, 2.0f}) {
      module.effects.reverb.mix = std::clamp(mix, 0.0f, 1.0f);
      expect(actual.setModuleReverb(moduleIndex, true, 3, mix, module.effects.reverb.tail), "clamp finite out-of-range mix");
      expect(reference.setModuleEffects(moduleIndex, module.effects), "reference uses clamped mix");
      compare();
    }
    for (int step = 0; step < 60; ++step) {
      auto& delay = module.effects.delay;
      delay.enabled = step % 20 != 0;
      delay.sync = step >= 30;
      delay.delayMs = 50.0f + step * 10;
      delay.beatMultiplier = step % 2 == 0 ? 0.75f : 1.0f / 3;
      delay.feedback = (step % 10) * 0.08f;
      delay.mix = (step % 10) * 0.1f;
      expect(actual.setModuleDelay(moduleIndex, delay), "dedicated Delay edits preserve Reverb, EQ and Rotary");
      expect(reference.setModuleEffects(moduleIndex, module.effects), "reference Delay configuration");
      expect(actual.setTempo(132.5f) && reference.setTempo(132.5f), "Delay Sync accepts fractional BPM");
      for (int block = 0; block < 4; ++block) compare();
    }
    for (int field = 0; field < 4; ++field) {
      auto invalid = module.effects.delay;
      auto* value = field == 0 ? &invalid.delayMs : field == 1 ? &invalid.beatMultiplier :
          field == 2 ? &invalid.feedback : &invalid.mix;
      *value = std::numeric_limits<float>::quiet_NaN();
      expect(!actual.setModuleDelay(moduleIndex, invalid), "reject each non-finite Delay parameter");
    }
    expect(!actual.setModuleDelay(8, {}), "reject invalid Delay module");
    for (int block = 0; block < 20; ++block) compare();
    expect(energy > 1.0, "reverb comparison contains sounding audio");
  }
}

void testEqualizerCutSlope() {
  const auto subtleEnergy = highCutToneEnergy(1);
  const auto brickwallEnergy = highCutToneEnergy(8);
  expect(brickwallEnergy < subtleEnergy * 0.01, "EQ cut curve progresses from subtle to brickwall");
}

void testCutoffProcessing() {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0);
  hook_keys::ModuleEffectsConfig config;
  config.cutoff.frequencyHz = 500.0f;
  effects.setConfig(config, 120.0f);

  std::array<float, 4096> left{};
  std::array<float, 4096> right{};
  for (std::size_t index = 0; index < left.size(); ++index) {
    left[index] = right[index] = (index & 1U) == 0 ? 1.0f : -1.0f;
  }
  effects.process(left.data(), right.data(), left.size());
  double tailEnergy = 0.0;
  for (std::size_t index = left.size() / 2; index < left.size(); ++index) tailEnergy += std::abs(left[index]);
  expect(tailEnergy < 20.0, "module cutoff attenuates frequencies above its limit");
}

void testCutoffVelocityCurve() {
  hook_keys::VoiceCutoff processor;
  hook_keys::ModuleEffectsConfig config;
  config.cutoff.frequencyHz = 20000;
  config.cutoff.velocityCurve = {0, 32, 64, 96, 127};
  const auto render = [&](std::uint8_t velocity) {
    processor.reset();
    processor.configure(config.cutoff.frequencyForVelocity(velocity), 48000);
    std::vector<float> left(4096), right(4096);
    for (std::size_t index = 0; index < left.size(); ++index) {
      left[index] = right[index] = static_cast<float>(std::sin(
          6.283185307179586 * 4000.0 * static_cast<double>(index) / 48000.0));
    }
    for (auto& sample : left) sample = processor.process(sample);
    return std::accumulate(left.begin() + 1024, left.end(), 0.0,
        [](double sum, float sample) { return sum + std::abs(sample); });
  };
  const auto soft = render(1);
  const auto hard = render(127);
  expect(hard > soft * 20.0, "filter Velocity curve opens Cutoff according to played velocity");

  config.cutoff.velocityCurve = {127, 127, 127, 127, 127};
  const auto fixedSoft = render(1);
  const auto fixedHard = render(127);
  expect(std::abs(fixedSoft - fixedHard) < fixedHard * 0.0001,
      "default Fixed 127 filter Velocity preserves the original Cutoff at every touch strength");
}

void testCutoffFilterTypesAndEnvelope() {
  const char* path = "third_party/TinySoundFont/examples/florestan-subset.sf2";
  const auto energyOf = [&](hook_keys::CutoffConfig cutoff, std::size_t skipFrames) {
    hook_keys::TinySoundFontModule sf2(48000.0, 128);
    expect(sf2.loadFromFile(path), "load SF2 for cutoff filter type/envelope test");
    sf2.beginBlock();
    sf2.setCutoffConfig(cutoff);
    sf2.noteOn(60, 127);
    if (skipFrames > 0) {
      std::vector<float> discardLeft(skipFrames, 0.0f), discardRight(skipFrames, 0.0f);
      sf2.renderAdd(discardLeft.data(), discardRight.data(), skipFrames, 1.0f);
    }
    std::vector<float> left(512, 0.0f), right(512, 0.0f);
    sf2.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    double energy = 0.0;
    for (auto sample : left) energy += std::abs(sample);
    return energy;
  };

  hook_keys::CutoffConfig base;
  base.velocityCurve = {127, 127, 127, 127, 127};

  auto lowLowpass = base;
  lowLowpass.frequencyHz = 100.0f;
  lowLowpass.type = hook_keys::FilterKind::lowpass2;
  const auto lowLowpassEnergy = energyOf(lowLowpass, 0);

  auto lowHighpass = lowLowpass;
  lowHighpass.type = hook_keys::FilterKind::highpass2;
  const auto lowHighpassEnergy = energyOf(lowHighpass, 0);
  expect(lowHighpassEnergy > lowLowpassEnergy * 4.0,
      "Highpass at a low frequency lets far more energy through than Lowpass at the same frequency");

  auto midLowpass2 = base;
  midLowpass2.frequencyHz = 900.0f;
  midLowpass2.type = hook_keys::FilterKind::lowpass2;
  const auto lp2Energy = energyOf(midLowpass2, 0);

  auto midLowpass4 = midLowpass2;
  midLowpass4.type = hook_keys::FilterKind::lowpass4;
  const auto lp4Energy = energyOf(midLowpass4, 0);
  expect(lp4Energy < lp2Energy * 0.95,
      "Lowpass 4 (24 dB/octave) cuts more than Lowpass 2 at the same Cutoff");

  auto envelopeConfig = midLowpass2;
  envelopeConfig.envelope = {true, 5.0f, 5.0f, 1.0f, 5.0f, 4.0f};
  const auto earlyEnergy = energyOf(envelopeConfig, 0);
  const auto lateEnergy = energyOf(envelopeConfig, 24000);
  expect(earlyEnergy < lateEnergy * 0.5,
      "the filter envelope starts closed at Note On and opens once Attack/Decay finish");
}

void testNoVelocitySensitivity() {
  const char* path = "third_party/TinySoundFont/examples/florestan-subset.sf2";
  const auto blockEnergy = [](hook_keys::TinySoundFontModule& sf2) {
    std::vector<float> left(512, 0.0f), right(512, 0.0f);
    sf2.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    double energy = 0.0;
    for (auto sample : left) energy += std::abs(sample);
    return energy;
  };

  hook_keys::TinySoundFontModule soft(48000.0, 128);
  expect(soft.loadFromFile(path), "load SF2 for No Sens test (soft)");
  soft.beginBlock();
  soft.noteOn(60, 20);
  const auto softEnergyBefore = blockEnergy(soft);

  hook_keys::TinySoundFontModule loud(48000.0, 128);
  expect(loud.loadFromFile(path), "load SF2 for No Sens test (loud)");
  loud.beginBlock();
  loud.noteOn(60, 127);
  const auto loudEnergyFirstBlock = blockEnergy(loud);
  expect(softEnergyBefore < loudEnergyFirstBlock * 0.5,
      "a soft key press is quieter than a hard one with No Sens off");

  // A nota já está soando (sem novo Note On): ligar o No Sens agora precisa
  // valer na hora, subindo pro ganho pleno sem esperar a próxima tecla.
  soft.setNoVelocitySensitivity(true);
  const auto softEnergyAfter = blockEnergy(soft);
  const auto loudEnergySecondBlock = blockEnergy(loud);
  expect(softEnergyAfter > softEnergyBefore * 1.8,
      "turning No Sens on immediately raises the gain of an already-sounding note");
  expect(std::abs(softEnergyAfter - loudEnergySecondBlock) < loudEnergySecondBlock * 0.15,
      "with No Sens on, a soft press sounds as loud as a hard press");
}

void testMonoNoteReturnsToStillHeldKey() {
  const char* path = "third_party/TinySoundFont/examples/florestan-subset.sf2";
  const auto energyAfterRelease = [&](bool keepFirstNoteHeld) {
    hook_keys::TinySoundFontModule sf2(48000.0, 128);
    expect(sf2.loadFromFile(path), "load SF2 for mono note-return test");
    // Release curto: sem isso o release padrão (300 ms) mantém as duas
    // variantes praticamente no mesmo volume dentro da janela testada.
    sf2.setVolumeEnvelope(0.0f, 0.0f, 0.0f, 15.0f, 0.0f);
    sf2.beginBlock();
    sf2.setVoiceMode(true, false);
    sf2.noteOn(60, 100);
    std::vector<float> left(2048, 0.0f), right(2048, 0.0f);
    sf2.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    sf2.noteOn(64, 100); // a segunda tecla toma a voz da primeira (mono)
    sf2.renderAdd(left.data(), right.data(), left.size(), 1.0f); // a voz roubada morre rápido (10 ms)
    if (!keepFirstNoteHeld) sf2.noteOff(60);
    sf2.noteOff(64); // solta a tecla que estava soando
    std::vector<float> after(2048, 0.0f), afterRight(2048, 0.0f);
    sf2.renderAdd(after.data(), afterRight.data(), after.size(), 1.0f);
    double energy = 0.0;
    for (auto sample : after) energy += std::abs(sample);
    return energy;
  };
  const auto withPreviousKeyStillHeld = energyAfterRelease(true);
  const auto withNothingElseHeld = energyAfterRelease(false);
  expect(withPreviousKeyStillHeld > withNothingElseHeld * 3.0,
      "releasing the sounding mono note returns to the previous still-held key instead of going silent");
}

void testMonoLegatoRetunePreservesEnvelope() {
  const char* path = "third_party/TinySoundFont/examples/florestan-subset.sf2";
  // Attack de 2 s: o ganho do envelope domina o resultado, então o teste não
  // depende do conteúdo acústico específico do SF2 (picos/vales naturais da
  // amostra), só de o envelope reiniciar (retrigger) ou continuar (legato).
  const auto peakRightAfterSecondNote = [&](bool legato) {
    hook_keys::TinySoundFontModule sf2(48000.0, 128);
    expect(sf2.loadFromFile(path), "load SF2 for mono legato test");
    sf2.setVolumeEnvelope(2000.0f, 0.0f, 0.0f, 300.0f, 0.0f);
    sf2.beginBlock();
    sf2.setVoiceMode(true, legato);
    sf2.noteOn(60, 100);
    std::vector<float> left(1024, 0.0f), right(1024, 0.0f);
    sf2.renderAdd(left.data(), right.data(), left.size(), 1.0f); // envelope ainda bem no começo do attack
    sf2.noteOn(64, 100); // legato: continua o mesmo attack; sem legato: reinicia do zero
    std::vector<float> after(256, 0.0f), afterRight(256, 0.0f);
    sf2.renderAdd(after.data(), afterRight.data(), after.size(), 1.0f);
    float peak = 0.0f;
    for (auto sample : after) peak = std::max(peak, std::abs(sample));
    return peak;
  };
  const auto legatoPeak = peakRightAfterSecondNote(true);
  const auto retriggerPeak = peakRightAfterSecondNote(false);
  expect(legatoPeak > retriggerPeak * 1.3f,
      "Legato keeps the attack envelope already in progress; Legato off restarts it from zero");
}

void testCompressorProcessing() {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0);
  hook_keys::ModuleEffectsConfig config;
  config.compressor.enabled = true;
  config.compressor.thresholdDb = -20.0f;
  config.compressor.ratio = 10.0f;
  config.compressor.attackMs = 0.1f;
  config.compressor.releaseMs = 100.0f;
  effects.setConfig(config, 120.0f);

  std::array<float, 4096> left{};
  std::array<float, 4096> right{};
  left.fill(0.8f);
  right.fill(0.8f);
  effects.process(left.data(), right.data(), left.size());
  expect(std::abs(left.back()) < 0.20f, "compressor reduces signal above threshold");
}

void testDelayProcessing() {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0);
  hook_keys::ModuleEffectsConfig config;
  config.delay.enabled = true;
  config.delay.delayMs = 1.0f;
  config.delay.feedback = 0.0f;
  config.delay.mix = 1.0f;
  effects.prepareFor(config);
  effects.setConfig(config, 120.0f);

  std::array<float, 128> left{};
  std::array<float, 128> right{};
  left[0] = right[0] = 1.0f;
  effects.process(left.data(), right.data(), left.size());
  expect(std::abs(left[0]) < 0.001f, "fully wet delay removes the dry impulse");
  expect(std::abs(left[48] - 1.0f) < 0.01f, "delay emits the impulse at the selected time");
}

void testReverbProcessing() {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0);
  hook_keys::ModuleEffectsConfig config;
  config.reverb.enabled = true;
  config.reverb.decay = 0.7f;
  config.reverb.dampen = 0.4f;
  config.reverb.size = 0.5f;
  config.reverb.mix = 1.0f;
  effects.prepareFor(config);
  effects.setConfig(config, 120.0f);

  std::array<float, 8192> left{};
  std::array<float, 8192> right{};
  left[0] = right[0] = 1.0f;
  effects.process(left.data(), right.data(), left.size());
  double tailEnergy = 0.0;
  for (std::size_t index = 128; index < left.size(); ++index) tailEnergy += std::abs(left[index]);
  expect(tailEnergy > 0.01, "reverb creates an audible tail");
}

void testReverbMixMovesWithoutBoundaryJump() {
  hook_keys::ModuleEffects effects;
  hook_keys::ModuleEffectsConfig config;
  config.reverb.enabled = true;
  config.reverb.mix = 0.0f;
  effects.setConfig(config, 120.0f);
  effects.prepare(48000.0);

  std::array<float, 256> left{};
  std::array<float, 256> right{};
  left.fill(1.0f);
  right.fill(1.0f);
  effects.process(left.data(), right.data(), left.size());
  const auto before = left.back();

  config.reverb.mix = 1.0f;
  effects.setConfig(config, 120.0f);
  left.fill(1.0f);
  right.fill(1.0f);
  effects.process(left.data(), right.data(), left.size());

  expect(std::abs(left.front() - before) < 0.02f,
         "moving reverb mix starts with a smoothed dry/wet transition");
}

void testReverbDecayShapesTheRealImpulse() {
  for (std::uint8_t impulse = 0; impulse < 4; ++impulse) {
    const auto render = [impulse](float tail) {
      hook_keys::ModuleEffects effects;
      effects.prepare(48000);
      hook_keys::ModuleEffectsConfig config;
      config.reverb.enabled = true;
      config.reverb.mix = 1;
      config.reverb.impulse = impulse;
      config.reverb.tail = tail;
      effects.prepareFor(config);
      effects.setConfig(config, 120);
      effects.reset();
      std::vector<float> left(48000 * 8), right(left.size());
      left[0] = right[0] = 1;
      effects.process(left.data(), right.data(), left.size());
      return left;
    };
    const auto full = render(1), shortTail = render(0.1f);
    std::size_t fullEnd = 0, shortEnd = 0;
    for (std::size_t i = 0; i < full.size(); ++i) {
      expect(std::isfinite(full[i]) && std::isfinite(shortTail[i]), "Decay impulse output remains finite");
      if (std::abs(full[i]) > 1e-7f) fullEnd = i;
      if (std::abs(shortTail[i]) > 1e-7f) shortEnd = i;
      if (i < 128) expect(std::abs(full[i] - shortTail[i]) < 1e-6f, "Decay preserves the IR attack");
    }
    expect(fullEnd > 4096 && shortEnd < fullEnd * 0.3 + 2048, "Decay shortens every IR, not only its wet volume");
    expect(full == render(1), "100 percent Decay returns the unchanged original response");
  }
}

void testReverbDecayPublicationDuringAudio() {
  hook_keys::NativeEngineRuntime runtime(48000, 128);
  hook_keys::ModuleConfig module;
  module.enabled = true;
  module.gainLinear = 0.12f;
  expect(runtime.setModuleConfig(7, module), "enable synth for concurrent Decay test");
  expect(runtime.setModuleReverb(7, true, 2, 0.4f), "prepare initial concurrent reverb");
  expect(runtime.sendMidi(0, 0x90, 64, 80), "hold synth while preparing new decay versions");
  std::atomic<bool> done{false};
  std::atomic<unsigned> blocks{0};
  std::atomic<bool> sounded{false};
  std::thread audio([&] {
    std::array<float, 256> output{};
    while (!done.load()) {
      runtime.renderInterleaved(output.data(), 128, 2);
      for (const auto sample : output) {
        expect(std::isfinite(sample), "concurrent Decay never produces invalid samples");
        if (std::abs(sample) > 0.0001f) sounded.store(true);
      }
      blocks.fetch_add(1);
      std::this_thread::yield();
    }
  });
  for (int step = 0; step < 32; ++step) {
    expect(runtime.setModuleReverb(7, true, step % 4, 0.4f, 0.1f + (step % 7) * 0.15f),
        "publish a new IR while the old one is rendering");
    expect(runtime.setModuleGainDb(7, -12), "gain does not re-prepare a retired IR");
    if (step % 4 == 0) expect(runtime.setModuleReverb(7, false, step % 4, 0.4f), "bypass releases the pinned IR safely");
  }
  done.store(true);
  audio.join();
  expect(blocks.load() > 0, "concurrent rendering actually ran during preparation");
  expect(sounded.load(), "concurrent test must exercise a sounding convolver, not disabled modules");
}

void testRejectedReverbDecayRestoresCache() {
  hook_keys::NativeEngineRuntime actual(48000, 128), reference(48000, 128);
  hook_keys::ModuleConfig module;
  module.enabled = true;
  module.gainLinear = 0.12f;
  for (auto* runtime : {&actual, &reference}) {
    expect(runtime->setModuleConfig(7, module), "enable synth for rejected Decay test");
    expect(runtime->setModuleReverb(7, true, 2, 1, 1), "prepare original Hall for rejected Decay test");
  }
  bool full = false;
  for (int i = 0; i < 100000; ++i) {
    const bool accepted = actual.setTempo(120);
    expect(accepted == reference.setTempo(120), "fill matching command queues");
    if (!accepted) { full = true; break; }
  }
  expect(full, "test reaches a full command queue");
  expect(!actual.setModuleReverb(7, true, 2, 1, 0.1f), "full queue rejects Decay after preparation");
  std::array<float, 256> a{}, b{};
  actual.renderInterleaved(a.data(), 128, 2);
  reference.renderInterleaved(b.data(), 128, 2);
  expect(actual.sendMidi(0, 0x90, 64, 80) && reference.sendMidi(0, 0x90, 64, 80), "play after rejected Decay");
  double energy = 0;
  for (int block = 0; block < 200; ++block) {
    actual.renderInterleaved(a.data(), 128, 2);
    reference.renderInterleaved(b.data(), 128, 2);
    for (std::size_t i = 0; i < a.size(); ++i) {
      expect(std::abs(a[i] - b[i]) < 1e-6f, "rejected Decay restores the cached original IR even before first audio");
      energy += std::abs(a[i]);
    }
  }
  expect(energy > 0.1, "rejected Decay comparison contains audible wet output");
}

void testReverbImpulseSelection() {
  const auto renderTail = [](std::uint8_t impulse) {
    hook_keys::ModuleEffects effects;
    effects.prepare(48000.0);
    hook_keys::ModuleEffectsConfig config;
    config.reverb.enabled = true;
    config.reverb.mix = 1.0f;
    config.reverb.impulse = impulse;
    effects.prepareFor(config);
    effects.setConfig(config, 120.0f);
    std::vector<float> left(8192, 0.0f), right(8192, 0.0f);
    left[0] = right[0] = 1.0f;
    effects.process(left.data(), right.data(), left.size());
    return left;
  };
  const auto room1 = renderTail(0);
  const auto hall1 = renderTail(2);
  bool differs = false;
  for (std::size_t index = 0; index < room1.size(); ++index) {
    if (std::abs(room1[index] - hall1[index]) > 1e-6f) { differs = true; break; }
  }
  expect(differs, "Room 1 and Hall 1 use different convolution impulses");
  expect(room1 == renderTail(0), "the same IR produces a deterministic convolution tail");
}

// A cauda longa do convolvedor é calculada aos poucos ao longo do período
// seguinte; o resultado precisa continuar sendo exatamente a convolução, com
// qualquer tamanho de bloco e também depois de clearHistory().
void testTwoStageConvolverMatchesDirectConvolution() {
  std::uint32_t seed = 0x1234567u;
  const auto random = [&seed] {
    seed = seed * 1664525u + 1013904223u;
    return static_cast<float>(seed >> 8) / 8388608.0f - 1.0f;
  };
  std::vector<float> impulse(700);
  for (auto& sample : impulse) sample = random() * 0.1f;
  fftconvolver::TwoStageFFTConvolver convolver;
  expect(convolver.init(8, 32, impulse.data(), impulse.size()), "two-stage convolver accepts the test IR");

  std::vector<float> input(3000);
  for (auto& sample : input) sample = random();
  const std::size_t clearAt = 1700;
  std::vector<float> output(input.size(), 0.0f);
  std::size_t position = 0;
  std::size_t chunkSeed = 7;
  while (position < input.size()) {
    if (position == clearAt) convolver.clearHistory();
    chunkSeed = (chunkSeed * 31 + 11) % 97;
    auto chunk = std::min<std::size_t>(1 + chunkSeed, input.size() - position);
    if (position < clearAt) chunk = std::min(chunk, clearAt - position);
    convolver.process(input.data() + position, output.data() + position, chunk);
    position += chunk;
  }

  double worst = 0.0;
  for (std::size_t frame = 0; frame < input.size(); ++frame) {
    // Depois do clearHistory() o que veio antes vale silêncio.
    const std::size_t start = frame >= clearAt ? clearAt : 0;
    double expected = 0.0;
    for (std::size_t tap = 0; tap < impulse.size() && tap + start <= frame; ++tap) {
      expected += static_cast<double>(impulse[tap]) * input[frame - tap];
    }
    worst = std::max(worst, std::abs(expected - output[frame]));
  }
  expect(worst < 1e-3, "sliced two-stage convolution equals the direct convolution");
}

// Delay e Reverb desligados guardavam o som antigo e o tocavam de novo ao
// serem religados; o panic tampouco pode deixar eco voltar.
void testReenabledEffectsDoNotReplayOldAudio() {
  const auto ghostPeak = [](auto enable, bool panicInstead) {
    hook_keys::ModuleEffects effects;
    effects.prepare(48000.0);
    hook_keys::ModuleEffectsConfig config;
    enable(config, true);
    effects.prepareFor(config);
    effects.setConfig(config, 120.0f);
    std::vector<float> left(256), right(256);
    const auto run = [&](int blocks, bool impulse) {
      float peak = 0.0f;
      for (int block = 0; block < blocks; ++block) {
        std::fill(left.begin(), left.end(), 0.0f);
        std::fill(right.begin(), right.end(), 0.0f);
        if (impulse && block == 0) {
          std::fill_n(left.begin(), 64, 0.8f);
          std::fill_n(right.begin(), 64, 0.8f);
        }
        effects.process(left.data(), right.data(), left.size());
        for (const auto sample : left) peak = std::max(peak, std::abs(sample));
      }
      return peak;
    };
    expect(run(20, true) > 0.01f, "the effect is audible before it is turned off");
    if (panicInstead) {
      effects.reset();
    } else {
      enable(config, false);
      effects.setConfig(config, 120.0f);
      run(400, false);
      enable(config, true);
      effects.prepareFor(config);
      effects.setConfig(config, 120.0f);
    }
    return run(200, false);
  };
  const auto delay = [](hook_keys::ModuleEffectsConfig& config, bool on) {
    config.delay.enabled = on;
    config.delay.mix = 0.5f;
    config.delay.feedback = 0.6f;
    config.delay.delayMs = 500.0f;
  };
  const auto reverb = [](hook_keys::ModuleEffectsConfig& config, bool on) {
    config.reverb.enabled = on;
    config.reverb.impulse = 2;
    config.reverb.mix = 0.5f;
  };
  expect(ghostPeak(delay, false) < 0.0001f, "Delay turned on again starts silent, without old echoes");
  expect(ghostPeak(reverb, false) < 0.0001f, "Reverb turned on again starts silent, without the old tail");
  expect(ghostPeak(delay, true) < 0.0001f, "panic silences the Delay without zeroing it in the callback");
  expect(ghostPeak(reverb, true) < 0.0001f, "panic silences the Reverb tail");
}

// A linha do Delay e o IR do Reverb nascem em setModuleConfig, na thread de
// controle: pelo motor, os dois continuam soando assim que ligados.
void testEngineReverbAndDelayThroughConfig() {
  class ImpulseSynth final : public hook_keys::ModuleSynth {
  public:
    void noteOn(std::uint8_t, std::uint8_t) noexcept override { pending_ = true; }
    void noteOff(std::uint8_t) noexcept override {}
    void controlChange(std::uint8_t, std::uint8_t) noexcept override {}
    void pitchBend(std::uint16_t) noexcept override {}
    void allNotesOff() noexcept override {}
    void renderAdd(float* left, float* right, std::size_t frames, float gain) noexcept override {
      if (!pending_ || frames == 0) return;
      left[0] += 0.5f * gain;
      right[0] += 0.5f * gain;
      pending_ = false;
    }
  private:
    bool pending_ = false;
  };
  const auto tailEnergy = [](auto enable) {
    ImpulseSynth synth;
    hook_keys::HookKeysEngine::SynthModules modules{};
    modules[0] = &synth;
    hook_keys::HookKeysEngine engine(modules);
    hook_keys::ModuleConfig config;
    config.midiInputSlot = hook_keys::kAllMidiInputs;
    enable(config.effects);
    expect(engine.setModuleConfig(0, config), "engine accepts the effect config");
    expect(engine.enqueueMidi({0x90, 60, 100, 0, 0}), "engine queues the note");
    std::vector<float> left(128), right(128);
    double energy = 0.0;
    for (int block = 0; block < 400; ++block) {
      engine.render(left.data(), right.data(), left.size());
      if (block == 0) continue;
      for (const auto sample : left) energy += std::abs(sample);
    }
    return energy;
  };
  expect(tailEnergy([](hook_keys::ModuleEffectsConfig& effects) {
    effects.reverb.enabled = true;
    effects.reverb.impulse = 3;
    effects.reverb.mix = 1.0f;
  }) > 0.01, "Reverb enabled through the engine renders its tail");
  expect(tailEnergy([](hook_keys::ModuleEffectsConfig& effects) {
    effects.delay.enabled = true;
    effects.delay.delayMs = 100.0f;
    effects.delay.feedback = 0.5f;
    effects.delay.mix = 0.5f;
  }) > 0.01, "Delay enabled through the engine renders its echoes");
}

// Drawbar fechado não é renderizado e suas vozes não andavam: a nota solta
// nunca terminava (o Organ nunca ficava ocioso) e voltava ao abrir o drawbar.
void testClosedOrganDrawbarDoesNotKeepReleasedVoices() {
  hook_keys::OrganModule organ(48000.0, 512);
  expect(organ.loadVoice(0, "assets/hook-b3/drawbar-0.sf2"), "Organ loads the 16' drawbar");
  expect(organ.loadVoice(2, "assets/hook-b3/drawbar-2.sf2"), "Organ loads the 8' drawbar");
  for (std::size_t index = 0; index < hook_keys::OrganModule::kDrawbarCount; ++index) {
    organ.setDrawbarPosition(index, index == 2 ? 8 : 0);
  }
  std::vector<float> left(512), right(512);
  const auto render = [&](double seconds) {
    float peak = 0.0f;
    for (int block = 0; block < static_cast<int>(48000.0 * seconds / 512.0); ++block) {
      organ.beginBlock();
      std::fill(left.begin(), left.end(), 0.0f);
      std::fill(right.begin(), right.end(), 0.0f);
      organ.renderAdd(left.data(), right.data(), left.size(), 1.0f);
      for (const auto sample : left) peak = std::max(peak, std::abs(sample));
    }
    return peak;
  };
  organ.beginBlock();
  organ.noteOn(60, 127);
  expect(render(0.5) > 0.001f, "the open 8' drawbar sounds");
  organ.noteOff(60);
  render(5.0);
  expect(!organ.hasActiveVoices(), "released notes of a closed drawbar do not stay alive");
  organ.setDrawbarPosition(0, 8);
  expect(render(1.0) < 0.0001f, "opening a drawbar later does not bring back an old note");
}

void testOrganCabinetImpulseSelection() {
  const auto render = [](bool rotaryOn) {
    hook_keys::ModuleEffects effects;
    effects.prepare(48000.0, true);
    hook_keys::ModuleEffectsConfig config;
    config.rotary.cabinetEnabled = true;
    config.rotary.enabled = rotaryOn;
    config.rotary.speed = 0;
    config.rotary.depth = 0.0f;
    effects.setConfig(config, 120.0f);
    std::vector<float> left(2048, 0.0f), right(2048, 0.0f);
    left[0] = right[0] = 1.0f;
    effects.process(left.data(), right.data(), left.size());
    return left;
  };
  const auto rotaryOff = render(false);
  const auto rotaryOn = render(true);
  expect(rotaryOff != rotaryOn, "Organ selects the Rotary Off and Rotary On cabinet IRs");
  expect(std::any_of(rotaryOff.begin(), rotaryOff.end(), [](float value) { return std::abs(value) > 0.0001f; }),
      "Rotary Off cabinet produces audio");
}

void testBypassedModuleEffectsAreBitTransparent() {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0, false);
  hook_keys::ModuleEffectsConfig config;
  config.cutoff.enabled = false;
  config.equalizer.enabled = false;
  config.compressor.enabled = false;
  config.delay.enabled = false;
  config.reverb.enabled = false;
  config.rotary.enabled = false;
  config.rotary.cabinetEnabled = false;
  config.chorus.enabled = false;
  config.autoFader.enabled = false;
  config.tranceGate.enabled = false;
  config.inputGainDb = 0.0f;
  effects.setConfig(config, 120.0f);

  std::vector<float> left(4096), right(4096);
  for (std::size_t index = 0; index < left.size(); ++index) {
    left[index] = 0.37f * std::sin(static_cast<float>(index) * 0.037f);
    right[index] = 0.29f * std::cos(static_cast<float>(index) * 0.053f);
  }
  const auto expectedLeft = left;
  const auto expectedRight = right;
  for (std::size_t offset = 0; offset < left.size(); offset += 256) {
    effects.process(left.data() + offset, right.data() + offset, 256);
  }
  expect(left == expectedLeft && right == expectedRight,
      "all module effects OFF and Gain at 0 dB preserve audio bit for bit");
}

void testOrganCabinetDoesNotBoostResonances() {
  for (const auto rotaryOn : {false, true}) {
    for (const auto frequency : {440.0, 925.0, 1000.0, 1255.0}) {
      hook_keys::ModuleEffects effects;
      effects.prepare(48000.0, true);
      hook_keys::ModuleEffectsConfig config;
      config.rotary.cabinetEnabled = true;
      config.rotary.enabled = rotaryOn;
      config.rotary.speed = 0;
      config.rotary.depth = 0.0f;
      config.rotary.mix = 0.0f;
      effects.setConfig(config, 120.0f);
      std::vector<float> left(48000), right(48000);
      for (std::size_t index = 0; index < left.size(); ++index) {
        left[index] = right[index] = 0.5f * std::sin(
            2.0 * 3.14159265358979323846 * frequency * static_cast<double>(index) / 48000.0);
      }
      for (std::size_t offset = 0; offset < left.size(); offset += 256) {
        effects.process(left.data() + offset, right.data() + offset,
            std::min<std::size_t>(256, left.size() - offset));
      }
      float peak = 0.0f;
      for (std::size_t index = 40000; index < left.size(); ++index) {
        peak = std::max(peak, std::max(std::abs(left[index]), std::abs(right[index])));
      }
      expect(peak < 0.51f, "Organ cabinet IR does not boost steady notes above the input level");
      expect(peak > 0.40f, "Organ cabinet compensates the IR attenuation without losing audible volume");
    }
  }
}

void testVibesPitchModulationAndZeroBypass() {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0, false);
  hook_keys::ModuleEffectsConfig config;
  config.cutoff.enabled = false;
  config.equalizer.enabled = false;
  config.loFi = {true, 2.0f, 0.0f, false, -24.0f};
  effects.setConfig(config, 120.0f);

  std::vector<float> left(512), right(512);
  for (std::size_t index = 0; index < left.size(); ++index) {
    left[index] = right[index] = 0.4f * std::sin(
        2.0 * 3.14159265358979323846 * 440.0 * static_cast<double>(index) / 48000.0);
  }
  const auto dry = left;
  effects.process(left.data(), right.data(), left.size());
  expect(left == dry && right == dry, "Vibes Amount zero is a bit-transparent bypass");

  config.loFi.amountSemitones = 1.0f;
  effects.setConfig(config, 120.0f);
  double difference = 0.0;
  std::size_t phaseFrame = left.size();
  for (int block = 0; block < 12; ++block) {
    for (std::size_t index = 0; index < left.size(); ++index, ++phaseFrame) {
      const auto sample = 0.4f * std::sin(
          2.0 * 3.14159265358979323846 * 440.0 * static_cast<double>(phaseFrame) / 48000.0);
      left[index] = right[index] = sample;
    }
    const auto input = left;
    effects.process(left.data(), right.data(), left.size());
    if (block >= 4) {
      for (std::size_t index = 0; index < left.size(); ++index) {
        difference += std::abs(static_cast<double>(left[index] - input[index]));
      }
    }
  }
  expect(difference > 1.0, "Vibes Amount modulates pitch instead of reducing bits");

  hook_keys::ModuleEffects masterBypass;
  masterBypass.prepare(48000.0, false);
  hook_keys::ModuleEffectsConfig bypassConfig;
  bypassConfig.cutoff.enabled = false;
  bypassConfig.equalizer.enabled = false;
  // Mesmo com Amount, vinil e ruído configurados, o OFF mestre do Vibes
  // precisa deixar o caminho completamente transparente.
  bypassConfig.loFi = {false, 2.0f, 1.0f, true, 0.0f};
  masterBypass.setConfig(bypassConfig, 120.0f);
  for (std::size_t index = 0; index < left.size(); ++index) {
    left[index] = right[index] = 0.4f * std::sin(
        2.0 * 3.14159265358979323846 * 440.0 * static_cast<double>(index) / 48000.0);
  }
  const auto masterDry = left;
  masterBypass.process(left.data(), right.data(), left.size());
  expect(left == masterDry && right == masterDry,
      "Vibes OFF disables pitch, vinyl coloration and NoiseRain together");
}

void testOrganFullRegistrationThroughCabinet() {
  hook_keys::OrganModule organ(48000.0, 256);
  for (std::size_t index = 0; index < hook_keys::OrganModule::kDrawbarCount; ++index) {
    expect(organ.loadVoice(index, ("assets/hook-b3/drawbar-" + std::to_string(index) + ".sf2").c_str()),
        "full-registration test loads each Organ drawbar");
    organ.setDrawbarPosition(index, 8);
  }
  organ.setNoVelocitySensitivity(true);
  for (const auto note : {48, 52, 55, 60, 64, 67}) organ.noteOn(note, 127);
  std::vector<float> rawLeft(48000), rawRight(48000);
  for (std::size_t offset = 0; offset < rawLeft.size(); offset += 256) {
    organ.beginBlock();
    organ.renderAdd(rawLeft.data() + offset, rawRight.data() + offset,
        std::min<std::size_t>(256, rawLeft.size() - offset), 1.0f);
  }
  expect(rawLeft == rawRight, "mono Organ drawbars stay identical before stereo effects");
  for (const auto rotaryOn : {false, true}) {
    hook_keys::ModuleEffects effects;
    effects.prepare(48000.0, true);
    hook_keys::ModuleEffectsConfig config;
    config.rotary.cabinetEnabled = true;
    config.rotary.enabled = rotaryOn;
    config.rotary.speed = 2;
    config.rotary.depth = 0.7f;
    config.rotary.mix = 1.0f;
    effects.setConfig(config, 120.0f);
    auto left = rawLeft;
    auto right = rawRight;
    for (std::size_t offset = 0; offset < left.size(); offset += 256) {
      effects.process(left.data() + offset, right.data() + offset,
          std::min<std::size_t>(256, left.size() - offset));
    }
    const auto peak = std::max(
        std::abs(*std::max_element(left.begin(), left.end(), [](float a, float b) { return std::abs(a) < std::abs(b); })),
        std::abs(*std::max_element(right.begin(), right.end(), [](float a, float b) { return std::abs(a) < std::abs(b); })));
    expect(peak < 0.90f, "all nine Organ drawbars and a six-note chord keep headroom through the cabinet");
  }
}

void testIndependentOscillatorVolumes() {
  const auto render = [](float volume1, float volume2, float volume3,
                         bool enabled1, bool enabled2, bool enabled3) {
    hook_keys::AnalogSynthModule synth(48000.0);
    hook_keys::AnalogSynthConfig config;
    config.oscillator1 = 0;
    config.oscillator2 = 3;
    config.oscillator3 = 1;
    config.oscillator1Volume = volume1;
    config.oscillator2Volume = volume2;
    config.oscillator3Volume = volume3;
    config.oscillator1Enabled = enabled1;
    config.oscillator2Enabled = enabled2;
    config.oscillator3Enabled = enabled3;
    config.filterEnvelope = 0.0f;
    config.filterResonance = 0.0f;
    config.lfoDepth = 0.0f;
    expect(synth.setConfig(config), "oscillator volumes enter the realtime config queue");
    synth.beginBlock();
    synth.noteOn(69, 127);
    std::array<float, 1024> left{};
    std::array<float, 1024> right{};
    synth.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    expect(left == right, "oscillator gain reaches both output channels");
    return left;
  };
  const auto energy = [](const auto& samples) {
    double sum = 0.0;
    for (const auto sample : samples) sum += std::abs(sample);
    return sum;
  };
  const auto firstOnly = render(1.0f, 0.8f, 0.7f, true, false, false);
  const auto secondOnly = render(0.8f, 1.0f, 0.7f, false, true, false);
  const auto thirdOnly = render(0.8f, 0.7f, 1.0f, false, false, true);
  expect(energy(firstOnly) > 1.0 && energy(secondOnly) > 1.0 && energy(thirdOnly) > 1.0,
      "each oscillator produces audio alone");
  expect(firstOnly == render(1.0f, 0.0f, 0.0f, true, true, true),
      "enabling a silent OSC 2 does not change OSC 1 gain");
  expect(secondOnly == render(0.0f, 1.0f, 0.0f, true, true, true),
      "enabling a silent OSC 1 does not change OSC 2 gain");
  expect(thirdOnly == render(0.0f, 0.0f, 1.0f, true, true, true),
      "silent OSC 1 and OSC 2 do not change OSC 3 gain");
  const auto firstHalf = energy(render(0.5f, 1.0f, 1.0f, true, false, false));
  const auto secondHalf = energy(render(1.0f, 0.5f, 1.0f, false, true, false));
  const auto thirdHalf = energy(render(1.0f, 1.0f, 0.5f, false, false, true));
  expect(firstHalf > energy(firstOnly) * 0.49 && firstHalf < energy(firstOnly) * 0.53,
      "OSC 1 volume works with the other oscillators switched off");
  expect(secondHalf > energy(secondOnly) * 0.49 && secondHalf < energy(secondOnly) * 0.53,
      "OSC 2 volume works with the other oscillators switched off");
  expect(thirdHalf > energy(thirdOnly) * 0.49 && thirdHalf < energy(thirdOnly) * 0.53,
      "OSC 3 volume works with the other oscillators switched off");
  expect(energy(render(0.0f, 0.0f, 0.0f, true, true, true)) == 0.0,
      "zero volume silences all oscillators");
  expect(energy(render(1.0f, 1.0f, 1.0f, false, false, false)) == 0.0,
      "ON/OFF silences independently of stored volume");
  expect(firstOnly == render(2.0f, -1.0f, -1.0f, true, true, true),
      "volume gains clamp to zero through unity");
}

void testEffectParametersDoNotClickOnChange() {
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0);
  hook_keys::ModuleEffectsConfig config;
  effects.setConfig(config, 120.0f);
  std::array<float, 2048> left{}, right{};
  const auto render = [&] {
    left.fill(0.4f);
    right.fill(0.4f);
    effects.process(left.data(), right.data(), left.size());
    return left.back();
  };
  auto previous = render();
  config.inputGainDb = -20.0f;
  effects.setConfig(config, 120.0f);
  render();
  expect(std::abs(left.front() - previous) < 0.0001f,
      "input gain change starts continuously, without a click");
  previous = left.back();
  config.compressor = {true, -30.0f, 8.0f, 3.0f, 60.0f, 0.0f, 1.0f};
  effects.setConfig(config, 120.0f);
  render();
  expect(std::abs(left.front() - previous) < 0.0001f,
      "compressor change starts continuously, without a click");
  previous = left.back();
  config.reverb = {true, 0, 0.8f, 0.5f, 0.9f, 0.8f, 0.2f};
  effects.prepareFor(config);
  effects.setConfig(config, 120.0f);
  render();
  expect(std::abs(left.front() - previous) < 0.0001f,
      "reverb mix and size change starts continuously, without a click");
  expect(std::all_of(left.begin(), left.end(), [](float value) { return std::isfinite(value); }),
      "effect parameter smoothing keeps finite samples");
}

void testSynthPreservesLinearVelocityAndGain() {
  const auto render = [](std::uint8_t velocity, float gain = 1.0f) {
    hook_keys::AnalogSynthModule synth(48000.0);
    hook_keys::AnalogSynthConfig config;
    config.oscillator1 = config.oscillator2 = 0;
    config.oscillator1DetuneCents = config.oscillator2DetuneCents = config.oscillator3DetuneCents = 0.0f;
    config.glideMs = config.lfoDepth = config.filterEnvelope = 0.0f;
    config.filterResonance = 0.0f;
    expect(synth.setConfig(config), "configure Synth linear-gain test");
    synth.beginBlock();
    synth.noteOn(69, velocity);
    std::array<float, 4096> left{};
    std::array<float, 4096> right{};
    synth.renderAdd(left.data(), right.data(), left.size(), gain);
    return left;
  };
  const auto soft = render(64);
  const auto hard = render(127);
  const auto halfGain = render(127, 0.5f);
  const auto peak = [](const auto& samples) {
    float result = 0.0f;
    for (const auto sample : samples) result = std::max(result, std::abs(sample));
    return result;
  };
  const auto softPeak = peak(soft);
  const auto hardPeak = peak(hard);
  expect(std::abs(hardPeak / softPeak - 127.0f / 64.0f) < 0.0001f,
      "Synth preserves velocity dynamics without automatic compression");
  expect(hardPeak > 1.5f, "two full-level oscillators are not secretly attenuated at unity gain");
  for (std::size_t frame = 0; frame < hard.size(); ++frame) {
    expect(std::abs(halfGain[frame] - hard[frame] * 0.5f) < 0.0001f,
        "the Synth fader applies exactly its requested linear gain");
  }
}

void testSynthNoVelocitySensitivity() {
  const auto peak = [](const auto& samples) {
    float result = 0.0f;
    for (const auto sample : samples) result = std::max(result, std::abs(sample));
    return result;
  };
  const auto renderBlock = [&](hook_keys::AnalogSynthModule& synth) {
    std::array<float, 4096> left{};
    std::array<float, 4096> right{};
    synth.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    return peak(left);
  };
  hook_keys::AnalogSynthConfig config;
  config.oscillator1 = config.oscillator2 = 0;
  config.oscillator1DetuneCents = config.oscillator2DetuneCents = config.oscillator3DetuneCents = 0.0f;
  config.glideMs = config.lfoDepth = config.filterEnvelope = 0.0f;
  config.filterResonance = 0.0f;

  hook_keys::AnalogSynthModule soft(48000.0);
  expect(soft.setConfig(config), "configure Synth for No Sens test (soft)");
  soft.beginBlock();
  soft.noteOn(69, 32);
  const auto softPeakBefore = renderBlock(soft);

  hook_keys::AnalogSynthModule hard(48000.0);
  expect(hard.setConfig(config), "configure Synth for No Sens test (hard)");
  hard.beginBlock();
  hard.noteOn(69, 127);
  const auto hardPeakFirstBlock = renderBlock(hard);
  expect(softPeakBefore < hardPeakFirstBlock * 0.5f,
      "a soft key press is quieter than a hard one on the Synth with No Sens off");

  // Nota já soando, sem novo Note On: ligar o No Sens tem que valer na hora.
  soft.setNoVelocitySensitivity(true);
  const auto softPeakAfter = renderBlock(soft);
  const auto hardPeakSecondBlock = renderBlock(hard);
  expect(softPeakAfter > softPeakBefore * 1.8f,
      "turning No Sens on immediately raises the gain of an already-sounding Synth note");
  expect(std::abs(softPeakAfter - hardPeakSecondBlock) < hardPeakSecondBlock * 0.05f,
      "with No Sens on, a soft Synth press sounds as loud as a hard press");
}

void testSynthPitchIsIndependentOfSampleRate() {
  const auto positiveCrossings = [](double sampleRate) {
    hook_keys::AnalogSynthModule synth(sampleRate);
    hook_keys::AnalogSynthConfig config;
    config.oscillator1 = 0;
    config.oscillator2Enabled = false;
    config.oscillator3Enabled = false;
    config.attackMs = config.glideMs = config.lfoDepth = config.filterEnvelope = 0.0f;
    config.filterResonance = 0.0f;
    expect(synth.setConfig(config), "configure Synth sample-rate test");
    synth.beginBlock();
    synth.noteOn(69, 127); // A4 = 440 Hz
    const auto frames = static_cast<std::size_t>(sampleRate);
    std::vector<float> left(frames), right(frames);
    synth.renderAdd(left.data(), right.data(), frames, 1.0f);
    std::size_t crossings = 0;
    for (std::size_t frame = 1; frame < frames; ++frame) {
      if (left[frame - 1] <= 0.0f && left[frame] > 0.0f) ++crossings;
    }
    return crossings;
  };
  const auto at44100 = positiveCrossings(44100.0);
  const auto at48000 = positiveCrossings(48000.0);
  expect(at44100 >= 439 && at44100 <= 441, "A4 stays at 440 Hz with a 44.1 kHz clock");
  expect(at48000 >= 439 && at48000 <= 441, "A4 stays at 440 Hz with a 48 kHz clock");
  expect(at44100 == at48000, "changing sample rate does not transpose the Synth");
}

void testRotarySpeakerProcessing() {
  constexpr std::size_t frames = 48000;
  const auto input = [frames]() {
    std::vector<float> samples(frames);
    for (std::size_t index = 0; index < frames; ++index) {
      const auto seconds = static_cast<double>(index) / 48000.0;
      samples[index] = static_cast<float>(0.15 * std::sin(6.283185307179586 * 220.0 * seconds)
          + 0.15 * std::sin(6.283185307179586 * 2500.0 * seconds));
    }
    return samples;
  }();
  const auto render = [&input](bool enabled, std::uint8_t speed, float depth, float mix, std::size_t blockSize,
                              bool modulationEnabled = false, int modulation = -1) {
    hook_keys::ModuleEffects effects;
    effects.prepare(48000.0);
    hook_keys::ModuleEffectsConfig config;
    config.rotary = {enabled, speed, 0.8f, 6.4f, 0.1f, depth, mix};
    config.rotary.modulationEnabled = modulationEnabled;
    effects.setConfig(config, 120.0f);
    if (modulation >= 0) effects.setModulation(static_cast<std::uint8_t>(modulation));
    auto left = input;
    auto right = input;
    for (std::size_t offset = 0; offset < input.size(); offset += blockSize) {
      effects.process(left.data() + offset, right.data() + offset, std::min(blockSize, input.size() - offset));
    }
    for (std::size_t index = 0; index < input.size(); ++index) {
      expect(std::isfinite(left[index]) && std::isfinite(right[index]), "rotary output stays finite");
      expect(std::abs(left[index]) < 1.0f && std::abs(right[index]) < 1.0f, "rotary has bounded output gain");
    }
    return std::array<std::vector<float>, 2>{left, right};
  };
  const auto bypass = render(false, 1, 0.7f, 1.0f, 128);
  expect(bypass[0] == input && bypass[1] == input, "rotary OFF preserves audio bit for bit");
  const auto dry = render(true, 1, 0.7f, 0.0f, 128);
  expect(dry[0] == input && dry[1] == input, "rotary zero Mix preserves dry audio");
  const auto slow = render(true, 1, 0.7f, 1.0f, 128);
  const auto fast = render(true, 2, 0.7f, 1.0f, 128);
  const auto brake = render(true, 0, 0.7f, 1.0f, 128);
  double stereoMotion = 0.0;
  double speedDifference = 0.0;
  double brakeDifference = 0.0;
  for (std::size_t index = 0; index < input.size(); ++index) {
    stereoMotion += std::abs(slow[0][index] - slow[1][index]);
    speedDifference += std::abs(slow[0][index] - fast[0][index]);
    brakeDifference += std::abs(slow[0][index] - brake[0][index]);
  }
  expect(stereoMotion > 1.0, "rotary creates stereo motion from a mono source");
  expect(speedDifference > 1.0 && brakeDifference > 1.0, "Slow, Fast and Brake have different rotation");
  expect(fast == render(true, 2, 0.7f, 1.0f, 127), "rotary phase and inertia stay coherent across block boundaries");
  expect(slow == render(true, 2, 0.7f, 1.0f, 128, true, 63), "Modulation ON: CC 1 below 64 selects Slow directly in DSP");
  expect(fast == render(true, 1, 0.7f, 1.0f, 128, true, 64), "Modulation ON: CC 1 from 64 selects Fast directly in DSP");
  expect(slow == render(true, 1, 0.7f, 1.0f, 128, false, 127), "Modulation OFF ignores CC 1 for rotary speed");
  expect(render(true, 1, 0.0f, 1.0f, 128) == render(true, 2, 0.0f, 1.0f, 128),
      "zero Depth removes rotation modulation independent of speed");

  const auto renderStereo = [](bool foldToMono) {
    hook_keys::ModuleEffects effects;
    effects.prepare(48000.0);
    hook_keys::ModuleEffectsConfig config;
    config.rotary = {true, 2, 0.8f, 6.4f, 0.1f, 0.85f, 1.0f};
    effects.setConfig(config, 120.0f);
    std::vector<float> left(48000), right(48000);
    for (std::size_t index = 0; index < left.size(); ++index) {
      const auto seconds = static_cast<double>(index) / 48000.0;
      left[index] = static_cast<float>(0.18 * std::sin(6.283185307179586 * 260.0 * seconds));
      right[index] = static_cast<float>(0.18 * std::sin(6.283185307179586 * 2100.0 * seconds));
      if (foldToMono) left[index] = right[index] = (left[index] + right[index]) * 0.5f;
    }
    effects.process(left.data(), right.data(), left.size());
    return std::array<std::vector<float>, 2>{std::move(left), std::move(right)};
  };
  const auto stereoSource = renderStereo(false);
  const auto foldedSource = renderStereo(true);
  double retainedStereoInformation = 0.0;
  double outputWidth = 0.0;
  for (std::size_t index = 0; index < stereoSource[0].size(); ++index) {
    retainedStereoInformation += std::abs(stereoSource[0][index] - foldedSource[0][index])
        + std::abs(stereoSource[1][index] - foldedSource[1][index]);
    outputWidth += std::abs(stereoSource[0][index] - stereoSource[1][index]);
  }
  expect(retainedStereoInformation > 100.0, "rotary does not fold an existing stereo source to mono");
  expect(outputWidth > 100.0, "rotary produces a clearly stereo horn/drum microphone image");
}

// Leslie: a corneta girando faz o volume dos agudos pulsar mesmo somando os
// dois microfones (mono), e Depth zero tira o tremolo. O timbre de Leslie em
// si (brilho direcional, reflexão, inércias) só se confirma ouvindo.
void testRotaryLeslieAmplitudeModulation() {
  const auto monoEnvelopeVariation = [](std::uint8_t speed, float depth) {
    hook_keys::ModuleEffects effects;
    effects.prepare(48000.0);
    hook_keys::ModuleEffectsConfig config;
    config.rotary = {true, speed, 0.8f, 6.4f, 0.1f, depth, 1.0f};
    effects.setConfig(config, 120.0f);
    std::vector<float> left(96000), right(96000);
    for (std::size_t index = 0; index < left.size(); ++index) {
      left[index] = right[index] = static_cast<float>(
          0.2 * std::sin(6.283185307179586 * 3000.0 * static_cast<double>(index) / 48000.0));
    }
    effects.process(left.data(), right.data(), left.size());
    // RMS em janelas de 10 ms no segundo final (rotação já estabilizada).
    std::vector<double> windows;
    for (std::size_t start = 48000; start + 480 <= left.size(); start += 480) {
      double energy = 0.0;
      for (std::size_t index = start; index < start + 480; ++index) {
        const double mono = 0.5 * (left[index] + right[index]);
        energy += mono * mono;
      }
      windows.push_back(std::sqrt(energy / 480.0));
    }
    const auto [low, high] = std::minmax_element(windows.begin(), windows.end());
    return *high > 0.0 ? (*high - *low) / *high : 0.0;
  };
  expect(monoEnvelopeVariation(2, 0.85f) > 0.25, "Leslie Fast: horn tremolo pulses the treble even in mono");
  expect(monoEnvelopeVariation(2, 0.0f) < 0.02, "Depth zero removes the Leslie tremolo");
}

// Ligar ou editar o EQ precisa preservar o estado do Rotary. Esta é a mesma
// sequência do desktop: o Organ já está tocando, o usuário liga o EQ e o
// próximo bloco continua passando pela Leslie.
void testRotarySurvivesEqualizerActivation() {
  constexpr std::size_t blockSize = 256;
  hook_keys::ModuleEffects effects;
  effects.prepare(48000.0, true);
  hook_keys::ModuleEffectsConfig config;
  config.rotary = {true, 2, 0.672f, 7.056f, 0.1f, 0.85f, 1.0f};
  config.rotary.cabinetEnabled = false;
  effects.setConfig(config, 120.0f);

  std::size_t sampleIndex = 0;
  const auto renderBlock = [&]() {
    std::array<float, 256> left{};
    std::array<float, 256> right{};
    for (std::size_t frame = 0; frame < left.size(); ++frame, ++sampleIndex) {
      const auto seconds = static_cast<double>(sampleIndex) / 48000.0;
      left[frame] = right[frame] = static_cast<float>(
          0.15 * std::sin(6.283185307179586 * 220.0 * seconds)
          + 0.15 * std::sin(6.283185307179586 * 2500.0 * seconds));
    }
    effects.process(left.data(), right.data(), blockSize);
    return std::array<std::array<float, 256>, 2>{left, right};
  };

  for (std::size_t block = 0; block < 190; ++block) renderBlock();
  config.equalizer.enabled = true;
  config.equalizer.bands[2].gainDb = 6.0f;
  effects.setConfig(config, 120.0f);

  double stereoMotion = 0.0;
  for (std::size_t block = 0; block < 190; ++block) {
    const auto output = renderBlock();
    for (std::size_t frame = 0; frame < blockSize; ++frame) {
      expect(std::isfinite(output[0][frame]) && std::isfinite(output[1][frame]),
          "EQ plus Rotary output stays finite");
      stereoMotion += std::abs(output[0][frame] - output[1][frame]);
    }
  }
  expect(stereoMotion > 1.0, "activating EQ does not stop the Rotary stereo motion");
}

// EQ nos agudos: a banda 4 (bell 4 kHz) e a banda 5 (high shelf 12 kHz) mudam
// de fato o nível das senoides agudas, para cima e para baixo.
// Leslie, não vibrato: a rotação deve soar como giro (volume, brilho e
// espaço), sem entortar a afinação. Mede o desvio de altura, em cents, de uma
// senoide grave (vai para o tambor) e de uma aguda (vai para a corneta).
double rotaryPeakPitchDeviationCents(double frequency, float depth, std::uint8_t speed, bool doppler = true) {
  constexpr double sampleRate = 48000.0;
  hook_keys::ModuleEffects effects;
  effects.prepare(sampleRate);
  hook_keys::ModuleEffectsConfig config;
  // Mede o comportamento com os valores de fábrica do OpenB3/Beatrix.
  config.rotary = {true, speed, 0.672f, 7.056f, 1.2f, depth, 1.0f};
  config.rotary.dopplerEnabled = doppler;
  effects.setConfig(config, 120.0f);
  std::vector<float> left(144000), right(144000);
  for (std::size_t index = 0; index < left.size(); ++index) {
    left[index] = right[index] = static_cast<float>(0.2 * std::sin(6.283185307179586 * frequency * static_cast<double>(index) / sampleRate));
  }
  effects.process(left.data(), right.data(), left.size());
  // Cruzamentos por zero subindo (interpolados) no último segundo.
  std::vector<double> crossings;
  for (std::size_t index = 96000; index + 1 < left.size(); ++index) {
    if (left[index] <= 0.0f && left[index + 1] > 0.0f) {
      const double fraction = left[index] / static_cast<double>(left[index] - left[index + 1]);
      crossings.push_back(static_cast<double>(index) + fraction);
    }
  }
  // Frequência média a cada ~5 ms, como o ouvido percebe a altura.
  const std::size_t cycles = std::max<std::size_t>(1, static_cast<std::size_t>(frequency * 0.005));
  double peak = 0.0;
  for (std::size_t index = cycles; index < crossings.size(); ++index) {
    const double measured = sampleRate * static_cast<double>(cycles) / (crossings[index] - crossings[index - cycles]);
    peak = std::max(peak, std::abs(1200.0 * std::log2(measured / frequency)));
  }
  return peak;
}

// Uma Leslie 122 de verdade balança a afinação: a corneta gira a 19,2 cm de
// raio, e no Fast (7 Hz) isso dá ~44 cents de pico. O teste guarda essa faixa
// física e, principalmente, guarda o cruzamento: com atrasos geométricos as
// duas metades chegavam a se cancelar e o medidor acusava 200 cents.
// Auto Fader: desce o volume até -depthDb e volta. A interface calcula os
// tempos a partir do compasso atual e entrega aqui a duração em beats.
void testAutoFaderRidesTheVolume() {
  const auto envelope = [](bool enabled, float beats, float depthDb) {
    constexpr double sampleRate = 48000.0;
    hook_keys::ModuleEffects effects;
    effects.prepare(sampleRate);
    hook_keys::ModuleEffectsConfig config;
    config.autoFader = {enabled, beats, depthDb};
    effects.setConfig(config, 120.0f);  // 120 BPM: um tempo dura meio segundo.
    std::vector<float> left(48000, 0.5f), right(48000, 0.5f);
    effects.process(left.data(), right.data(), left.size());
    std::vector<float> peaks;
    for (std::size_t start = 0; start + 480 <= left.size(); start += 480) {
      float peak = 0.0f;
      for (std::size_t index = start; index < start + 480; ++index) peak = std::max(peak, std::abs(left[index]));
      peaks.push_back(peak);
    }
    return peaks;
  };
  const auto lowest = [](const std::vector<float>& peaks) {
    return *std::min_element(peaks.begin(), peaks.end());
  };
  const auto highest = [](const std::vector<float>& peaks) {
    return *std::max_element(peaks.begin(), peaks.end());
  };
  // Conta os fundos da onda: um por ciclo, e todos caem no meio da medida.
  const auto cycles = [](const std::vector<float>& peaks) {
    std::size_t count = 0;
    for (std::size_t index = 1; index + 1 < peaks.size(); ++index) {
      if (peaks[index] < peaks[index - 1] && peaks[index] <= peaks[index + 1]) count += 1;
    }
    return count;
  };

  const auto off = envelope(false, 1.0f, 6.0f);
  expect(highest(off) - lowest(off) < 0.0001f, "with the Auto Fader off nothing moves");

  const auto quarter = envelope(true, 1.0f, 6.0f);
  expect(highest(quarter) > 0.49f, "the Auto Fader never goes above the current volume");
  // -6 dB é metade da amplitude.
  expect(std::abs(lowest(quarter) - 0.25f) < 0.02f, "at 6 dB the bottom of the wave is half the level");
  expect(cycles(quarter) == 2, "at 120 BPM a 1/4 cycle happens twice per second");

  const auto half = envelope(true, 2.0f, 6.0f);
  expect(cycles(half) == 1, "a 1/2 cycle takes twice as long");

  const auto deep = envelope(true, 1.0f, 20.0f);
  expect(lowest(deep) < lowest(quarter), "more dB digs the volume deeper");

  hook_keys::ModuleEffectsConfig config;
  config.autoFader = {true, 0.25f, 99.0f};
  config.normalize();
  expect(config.autoFader.beats == 0.25f && config.autoFader.depthDb == 40.0f,
      "the Auto Fader preserves valid beat durations and caps depth at 40 dB");
}

void testRotaryPitchStaysInTune() {
  for (auto frequency : {220.0, 800.0, 2500.0}) {
    for (std::uint8_t speed : {1, 2}) {
      std::cerr << "Organ pitch: " << frequency << " speed " << (int)speed << " cents " << rotaryPeakPitchDeviationCents(frequency, 1.0f, speed, false) << std::endl;
      expect(rotaryPeakPitchDeviationCents(frequency, 1.0f, speed, false) < 3.0,
          "Organ rotary keeps pitch stable at full depth in Slow and Fast");
    }
  }
  expect(rotaryPeakPitchDeviationCents(2500.0, 0.7f, 2) > 30.0, "Leslie Fast really swings the horn");
  expect(rotaryPeakPitchDeviationCents(2500.0, 0.7f, 2) < 60.0, "the horn swing stays a Leslie, not a siren");
  expect(rotaryPeakPitchDeviationCents(2500.0, 1.0f, 1) < 10.0, "Leslie Slow barely moves the pitch");
  expect(rotaryPeakPitchDeviationCents(220.0, 1.0f, 1) < 6.0, "Leslie Slow keeps low notes in tune");
  // Depth é o raio do rotor: 35% dá um giro discreto, 100% a caixa inteira.
  expect(rotaryPeakPitchDeviationCents(2500.0, 0.35f, 2) < 28.0, "a low Depth keeps the horn discreet");
  expect(rotaryPeakPitchDeviationCents(2500.0, 0.35f, 2)
         < rotaryPeakPitchDeviationCents(2500.0, 1.0f, 2), "Depth opens the swing");
  // Cruzamento: 812 Hz no tambor e 300 Hz na corneta, com cortes fundos.
  for (const double frequency : {700.0, 1000.0}) {
    expect(rotaryPeakPitchDeviationCents(frequency, 1.0f, 2) < 90.0,
        "Leslie drum and horn do not cancel at the crossover");
    expect(rotaryPeakPitchDeviationCents(frequency, 0.35f, 2) < 30.0,
        "at a low Depth the crossover region stays calm");
  }
}

// Ganho em dB que o EQ aplica numa senoide, com uma banda configurada à mão.
double equalizerGainDb(double sampleRate, hook_keys::EqBandConfig band, double frequency) {
  hook_keys::ModuleEffects effects;
  effects.prepare(sampleRate);
  hook_keys::ModuleEffectsConfig config;
  config.equalizer.enabled = true;
  config.equalizer.bands[4] = band;
  effects.setConfig(config, 120.0f);
  const auto frames = static_cast<std::size_t>(sampleRate);
  std::vector<float> left(frames), right(frames);
  for (std::size_t index = 0; index < frames; ++index) {
    left[index] = right[index] = static_cast<float>(0.1 * std::sin(6.283185307179586 * frequency * static_cast<double>(index) / sampleRate));
  }
  effects.process(left.data(), right.data(), frames);
  double energy = 0.0;
  for (std::size_t index = frames / 2; index < frames; ++index) energy += static_cast<double>(left[index]) * left[index];
  const double rms = std::sqrt(energy / static_cast<double>(frames - frames / 2));
  return 20.0 * std::log10(rms / (0.1 / std::sqrt(2.0)));
}

// O EQ age de verdade até 20 kHz, em 44,1 e 48 kHz: bell e shelf no topo da
// faixa sobem o que prometem, e o High Cut corta.
void testEqualizerControlsTreble() {
  using hook_keys::EqBandType;
  for (const double rate : {44100.0, 48000.0}) {
    expect(equalizerGainDb(rate, {true, EqBandType::bell, 16000.0f, 12.0f, 1.0f, 1}, 16000.0) > 11.5,
        "bell +12 dB at 16 kHz raises 16 kHz by 12 dB");
    expect(equalizerGainDb(rate, {true, EqBandType::bell, 20000.0f, 12.0f, 1.0f, 1}, 20000.0) > 11.5,
        "bell +12 dB at 20 kHz still raises 20 kHz by 12 dB");
    expect(equalizerGainDb(rate, {true, EqBandType::bell, 18000.0f, -12.0f, 1.0f, 1}, 18000.0) < -11.5,
        "bell -12 dB at 18 kHz lowers 18 kHz by 12 dB");
    expect(equalizerGainDb(rate, {true, EqBandType::highShelf, 12000.0f, 12.0f, 1.0f, 1}, 20000.0) > 11.0,
        "high shelf +12 dB at 12 kHz holds the full boost up to 20 kHz");
    expect(equalizerGainDb(rate, {true, EqBandType::highShelf, 12000.0f, -12.0f, 1.0f, 1}, 20000.0) < -11.0,
        "high shelf -12 dB at 12 kHz holds the full cut up to 20 kHz");
    expect(equalizerGainDb(rate, {true, EqBandType::highCut, 16000.0f, 0.0f, 0.7071f, 1}, 20000.0) < -6.0,
        "high cut at 16 kHz removes 20 kHz");
    expect(std::abs(equalizerGainDb(rate, {true, EqBandType::highShelf, 12000.0f, 12.0f, 1.0f, 1}, 1000.0)) < 0.2,
        "high shelf leaves 1 kHz untouched");
  }
}

void testIndependentOscillatorOctaves() {
  hook_keys::AnalogSynthConfig defaults;
  expect(defaults.oscillator1Octave == 0 && defaults.oscillator2Octave == 0 &&
         defaults.oscillator3Octave == 0, "all oscillators default to octave zero");
  defaults.oscillator1Octave = -10;
  defaults.oscillator2Octave = 10;
  defaults.oscillator3Octave = -10;
  defaults.normalize(48000.0);
  expect(defaults.oscillator1Octave == -3 && defaults.oscillator2Octave == 3 &&
         defaults.oscillator3Octave == -3, "oscillator octave bounds are -3 to +3");
  const auto render = [](int oscillator, int octave1, int octave2, int octave3, int note) {
    hook_keys::AnalogSynthModule synth(48000.0);
    hook_keys::AnalogSynthConfig config;
    config.oscillator1 = config.oscillator2 = config.oscillator3 = 0;
    config.oscillator1Enabled = oscillator == 1;
    config.oscillator2Enabled = oscillator == 2;
    config.oscillator3Enabled = oscillator == 3;
    config.oscillator1Octave = static_cast<std::int8_t>(octave1);
    config.oscillator2Octave = static_cast<std::int8_t>(octave2);
    config.oscillator3Octave = static_cast<std::int8_t>(octave3);
    config.oscillator1DetuneCents = config.oscillator2DetuneCents = config.oscillator3DetuneCents = 0.0f;
    config.glideMs = config.lfoDepth = config.filterEnvelope = 0.0f;
    expect(synth.setConfig(config), "queue independent oscillator octaves");
    synth.beginBlock();
    synth.noteOn(static_cast<std::uint8_t>(note), 100);
    std::vector<float> left(4800), right(4800);
    synth.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    return left;
  };
  for (int oscillator = 1; oscillator <= 3; ++oscillator) {
    const auto base = render(oscillator, 0, 0, 0, 60);
    expect(base == render(oscillator, oscillator == 1 ? 0 : 3,
        oscillator == 2 ? 0 : -3, oscillator == 3 ? 0 : 2, 60),
        "octave of muted oscillator does not change the audible oscillator");
    for (int octave = -3; octave <= 3; ++octave) {
      const auto shifted = render(oscillator, oscillator == 1 ? octave : 0,
          oscillator == 2 ? octave : 0, oscillator == 3 ? octave : 0, 60);
      const auto reference = render(oscillator, 0, 0, 0, 60 + octave * 12);
      for (std::size_t i = 0; i < shifted.size(); ++i) {
        expect(std::isfinite(shifted[i]), "octave transposition keeps audio finite");
        expect(std::abs(shifted[i] - reference[i]) < 0.0001f, "octave transposition matches the equivalent MIDI note");
      }
    }
  }
}

void testRotaryMidiEngineRouting() {
  class Tone final : public hook_keys::ModuleSynth {
  public:
    void noteOn(std::uint8_t, std::uint8_t) noexcept override {}
    void noteOff(std::uint8_t) noexcept override {}
    void controlChange(std::uint8_t, std::uint8_t) noexcept override {}
    void pitchBend(std::uint16_t) noexcept override {}
    void allNotesOff() noexcept override {}
    void renderAdd(float* left, float* right, std::size_t frames, float gain) noexcept override {
      for (std::size_t i = 0; i < frames; ++i, ++sample) {
        const auto value = static_cast<float>(0.2 * std::sin(6.283185307179586 * 1700.0 * sample / 48000.0)) * gain;
        left[i] += value;
        right[i] += value;
      }
    }
    std::size_t sample = 0;
  };
  const auto render = [](std::uint8_t speed, bool modulationEnabled, int controllerValue,
                         std::uint8_t inputSlot, bool moduleModulation = true, int manualSpeed = -1) {
    Tone tone;
    hook_keys::HookKeysEngine::SynthModules modules{};
    modules[4] = &tone;
    hook_keys::HookKeysEngine engine(modules);
    hook_keys::ModuleConfig config;
    config.midiInputSlot = 1;
    config.modulationInputEnabled = moduleModulation;
    config.effects.rotary = {true, speed, 0.8f, 6.4f, 0.1f, 0.7f, 1.0f, modulationEnabled};
    expect(engine.setModuleConfig(4, config), "configure module 5 rotary for MIDI test");
    if (controllerValue >= 0) {
      expect(engine.enqueueMidi(midi(0xB0, 1, static_cast<std::uint8_t>(controllerValue), inputSlot)),
          "native engine accepts physical and virtual Mod CC 1");
    }
    if (manualSpeed >= 0) {
      config.effects.rotary.speed = static_cast<std::uint8_t>(manualSpeed);
      expect(engine.setModuleConfig(4, config), "manual rotary speed remains available with Modulation ON");
    }
    std::array<std::vector<float>, 2> audio{std::vector<float>(48000), std::vector<float>(48000)};
    engine.render(audio[0].data(), audio[1].data(), audio[0].size());
    return audio;
  };
  const auto slow = render(1, false, -1, 1);
  const auto fast = render(2, false, -1, 1);
  expect(fast == render(1, true, 127, 1), "physical CC 1 changes Rotary without frontend updates");
  expect(fast == render(1, true, 64, hook_keys::kKeyboardBroadcastInput), "virtual Mod wheel reaches assigned Rotary when no MIDI is connected");
  expect(slow == render(1, true, 127, 0), "Rotary rejects CC 1 from a different assigned MIDI input");
  expect(slow == render(1, true, 127, 1, false), "module MOD OFF prevents Rotary modulation");
  expect(fast == render(2, false, 0, 1), "Rotary Modulation OFF leaves manual Fast untouched");
  expect(render(0, false, -1, 1) == render(1, true, 127, 1, true, 0), "manual Brake takes over after a Modulation message");
}

// Mono (polifonia 1): a nota tocada ligada tira a anterior, mas o Trance Gate
// segue o padrão. Só uma nota depois de silêncio recomeça do primeiro passo.
void testMonoLegatoKeepsTranceGatePattern() {
  class Constant final : public hook_keys::ModuleSynth {
  public:
    void noteOn(std::uint8_t, std::uint8_t) noexcept override {}
    void noteOff(std::uint8_t) noexcept override {}
    void controlChange(std::uint8_t, std::uint8_t) noexcept override {}
    void pitchBend(std::uint16_t) noexcept override {}
    void allNotesOff() noexcept override {}
    void renderAdd(float* left, float* right, std::size_t frames, float gain) noexcept override {
      for (std::size_t i = 0; i < frames; ++i) {
        left[i] += 0.5f * gain;
        right[i] += 0.5f * gain;
      }
    }
  };
  const auto levelAfterSecondNote = [](bool releaseFirst) {
    Constant constant;
    hook_keys::HookKeysEngine::SynthModules modules{};
    modules[6] = &constant;
    hook_keys::HookKeysEngine engine(modules);
    hook_keys::ModuleConfig config;
    config.polyphony = 1;
    // 120 BPM em semicolcheias: o passo 1 abre por 3000 amostras e o passo 2 é pausa.
    config.effects.tranceGate.enabled = true;
    config.effects.tranceGate.length = 2;
    config.effects.tranceGate.steps = 1;
    config.effects.tranceGate.gate = 0.5f;
    expect(engine.setModuleConfig(6, config), "configure mono Trance Gate module");
    std::vector<float> left(4000), right(4000);
    expect(engine.enqueueMidi(midi(0x90, 60, 100)), "first gated note");
    engine.render(left.data(), right.data(), left.size());
    if (releaseFirst) expect(engine.enqueueMidi(midi(0x80, 60, 0)), "release before the next note");
    expect(engine.enqueueMidi(midi(0x90, 62, 100)), "second note");
    engine.render(left.data(), right.data(), 1000);
    return *std::max_element(left.begin() + 500, left.begin() + 1000);
  };
  expect(levelAfterSecondNote(false) < 0.01f, "Mono legato note does not restart the Trance Gate pattern");
  expect(levelAfterSecondNote(true) > 0.2f, "a note after silence restarts the Trance Gate from the first step");
}

} // namespace

void testMetersAndNoteRelease() {
  for (const bool interleaved : {false, true}) {
    hook_keys::NativeEngineRuntime runtime(48000.0, 128);
    expect(runtime.loadSoundFont(0, "third_party/TinySoundFont/examples/florestan-subset.sf2"), "meter test loads SF2");
    hook_keys::ModuleConfig config;
    config.midiInputSlot = hook_keys::kAllMidiInputs;
    expect(runtime.setModuleConfig(0, config), "configure SF2 meter");
    expect(runtime.setModuleConfig(7, config), "configure Synth meter");
    const auto empty = runtime.consumeModulePeaks();
    expect(std::all_of(empty.begin(), empty.end(), [](float v) { return v == 0; }), "meters start silent");
    expect(runtime.sendMidi(3, 0x90, 60, 110), "virtual keyboard note on");
    std::array<float, 1024> left{}, right{};
    const auto render = [&] {
      if (interleaved) runtime.renderInterleaved(left.data(), 512, 2);
      else runtime.render(left.data(), right.data(), 512);
    };
    render();
    auto peaks = runtime.consumeModulePeaks();
    expect(peaks[0] > 0 && peaks[1] > 0 && peaks[14] > 0 && peaks[15] > 0,
        "real stereo audio reaches both SF2 and Synth meter channels");
    for (std::size_t module = 1; module < 7; ++module) {
      expect(peaks[module * 2] == 0 && peaks[module * 2 + 1] == 0,
          "unloaded stereo modules stay silent");
    }
    peaks = runtime.consumeModulePeaks();
    expect(peaks[0] == 0 && peaks[1] == 0 && peaks[14] == 0 && peaks[15] == 0,
        "stereo meter read consumes both channels");
    expect(runtime.setModuleGainDb(0, -90), "mute SF2 fader live");
    render();
    static_cast<void>(runtime.consumeModulePeaks()); // rampa anti-click de 30 ms
    render();
    static_cast<void>(runtime.consumeModulePeaks());
    render();
    static_cast<void>(runtime.consumeModulePeaks());
    render();
    expect(runtime.consumeModulePeaks()[0] == 0, "meter reacts to a live fader move while the note is held");
    expect(runtime.setModuleGainDb(0, 0), "unmute SF2 fader live");
    render();
    expect(runtime.consumeModulePeaks()[0] > 0, "held SF2 note returns to the meter without a new Note On");
    expect(runtime.sendMidi(3, 0x80, 60, 0), "virtual keyboard note off");
    for (int block = 0; block < 100; ++block) render();
    static_cast<void>(runtime.consumeModulePeaks());
    render();
    {
      const auto synthPeaks = runtime.consumeModulePeaks();
      expect(synthPeaks[14] < 0.00001f && synthPeaks[15] < 0.00001f,
          "Synth stops after release, no stuck loop");
    }
    render();
    expect(runtime.consumeModulePeaks()[0] < 0.00001f, "SF2 stops after release, no stuck loop");
  }
}

// Card Mod no SF2: o terceiro modo e o Tremolo, a roda abre o quanto o volume
// balanca no mesmo Rate do LFO de pitch.
void testSoundFontTremolo() {
  const auto render = [](std::uint8_t mode, int wheel, float intensity = 1.0f) {
    hook_keys::TinySoundFontModule sf2(48000.0, 128);
    // Mantem a nota sustentada para medir apenas o LFO, sem que o envelope
    // embutido no SF2 seja confundido com tremolo.
    sf2.setVolumeEnvelope(0.0f, 15000.0f, 25000.0f, 300.0f);
    expect(sf2.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"), "load SF2 for Tremolo test");
    sf2.setModulationMode(mode, 6.0f, intensity);
    sf2.beginBlock();
    sf2.controlChange(1, static_cast<std::uint8_t>(wheel));
    sf2.noteOn(60, 127);
    std::vector<float> left(24000), right(24000);
    sf2.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    return left;
  };
  // Envelope da metade final, onde o SF2 ja esta sustentado: o tremolo tem de
  // deixar o volume visivelmente mais fundo em algum ponto do ciclo.
  const auto envelopeRange = [](const std::vector<float>& samples) {
    double lowest = 1.0, highest = 0.0;
    for (std::size_t start = samples.size() / 2; start + 800 <= samples.size(); start += 800) {
      double peak = 0.0;
      for (std::size_t index = start; index < start + 800; ++index) {
        peak = std::max(peak, static_cast<double>(std::abs(samples[index])));
      }
      lowest = std::min(lowest, peak);
      highest = std::max(highest, peak);
    }
    return highest > 0.0 ? lowest / highest : 1.0;
  };
  expect(render(2, 0) == render(0, 0), "without the wheel the Tremolo sounds like User");
  expect(render(2, 127) != render(2, 0), "the wheel opens the Tremolo");
  expect(envelopeRange(render(2, 127)) < 0.45, "at full wheel the Tremolo swings the volume");
  expect(envelopeRange(render(2, 127, 0.0f)) > 0.8,
      "Tremolo intensity zero removes the audible movement");
  expect(envelopeRange(render(2, 127, 0.25f)) > envelopeRange(render(2, 127)),
      "lower Tremolo intensity makes the movement shallower");
  expect(envelopeRange(render(0, 127)) > 0.8, "in User the wheel does not swing the volume");
  // Tremolo nao pode virar vibrato: a roda fora do modo LFO nao mexe no pitch.
  expect(render(1, 127) != render(2, 127), "Tremolo and pitch LFO are different modes");

  hook_keys::NativeEngineRuntime runtime(48000, 128);
  expect(runtime.setModuleModulationMode(0, 2, 6.0f), "runtime routes the Tremolo to an SF2 module");
  expect(runtime.setModuleModulationMode(7, 2, 6.0f), "runtime accepts the Mod card mode on the Synth");
}

void testModWheelWithZeroDepth() {
  const auto render = [](int target, int wheel) {
    hook_keys::AnalogSynthModule synth(48000);
    hook_keys::AnalogSynthConfig config;
    config.lfoDepth = 0;
    config.lfoTarget = static_cast<std::uint8_t>(target);
    config.filterCutoffHz = 1500;
    config.filterEnvelope = 0;
    expect(synth.setConfig(config), "configure Mod test Synth");
    synth.setModulationMode(1, 6.85f);
    synth.beginBlock();
    synth.controlChange(1, static_cast<std::uint8_t>(wheel));
    synth.noteOn(60, 110);
    std::vector<float> left(24000), right(24000);
    synth.renderAdd(left.data(), right.data(), left.size(), 1);
    return left;
  };
  for (int target = 0; target < 3; ++target) {
    expect(render(target, 0) != render(target, 127), "Mod wheel works for every LFO destination with Depth zero");
  }
}

// Tocar a mesma nota de novo enquanto o release ainda soa era um tick: a fase
// do oscilador voltava a zero e o envelope saltava para o maximo.
void testSynthRetriggerHasNoClick() {
  const auto largestStep = [](const std::vector<float>& samples, std::size_t from, std::size_t to) {
    double largest = 0.0;
    for (std::size_t index = std::max<std::size_t>(from, 2); index < to; ++index) {
      largest = std::max(largest, static_cast<double>(
          std::abs(samples[index] - 2.0f * samples[index - 1] + samples[index - 2])));
    }
    return largest;
  };
  for (std::uint8_t voiceMode = 0; voiceMode < 3; ++voiceMode) {
    hook_keys::AnalogSynthModule synth(48000.0);
    hook_keys::AnalogSynthConfig config;
    config.voiceMode = voiceMode;
    config.oscillator1 = 0;
    config.oscillator2Enabled = false;
    config.oscillator3Enabled = false;
    config.oscillator1DetuneCents = config.oscillator2DetuneCents = config.oscillator3DetuneCents = 0.0f;
    config.glideMs = config.lfoDepth = 0.0f;
    expect(synth.setConfig(config), "configure retrigger click test");
    synth.beginBlock();
    std::vector<float> left(19200, 0.0f), right(19200, 0.0f);
    synth.noteOn(60, 100);
    synth.renderAdd(left.data(), right.data(), 9600, 1.0f);
    synth.noteOff(60);
    synth.renderAdd(left.data() + 9600, right.data() + 9600, 2400, 1.0f);
    synth.noteOn(60, 100);
    synth.renderAdd(left.data() + 12000, right.data() + 12000, 7200, 1.0f);
    const auto steady = largestStep(left, 4800, 9600);
    expect(largestStep(left, 0, 480) < steady * 8.0, "Attack 0 ramps in without a click");
    // Poly soma uma segunda voz real, portanto a curvatura pode passar de 2x
    // sem ser descontinuidade. Mono continua reutilizando uma única voz.
    const auto retriggerLimit = voiceMode == 0 ? 6.0 : 3.0;
    expect(largestStep(left, 11900, 12480) < steady * retriggerLimit,
        "re-pressing a releasing note layers without an impulse click");
    double lateEnergy = 0.0;
    for (std::size_t index = 16800; index < left.size(); ++index) lateEnergy += std::abs(left[index]);
    expect(lateEnergy > 1000.0,
        "a note re-pressed during its release keeps sounding in every voice mode");
  }
}

void testPolyAutoGlide() {
  const auto render = [](float glideMs, std::initializer_list<int> notes, std::uint8_t voiceMode = 0) {
    hook_keys::AnalogSynthModule synth(48000);
    hook_keys::AnalogSynthConfig config;
    config.voiceMode = voiceMode;
    config.oscillator1 = 0;
    config.oscillator2 = 0;
    config.oscillator1Enabled = true;
    config.oscillator2Enabled = false;
    config.oscillator3Enabled = false;
    config.oscillator1Volume = 1;
    config.oscillator1DetuneCents = config.oscillator2DetuneCents = config.oscillator3DetuneCents = 0;
    config.filterCutoffHz = 20000;
    config.filterResonance = 0;
    config.filterEnvelope = 0;
    config.lfoDepth = 0;
    config.glideMs = glideMs;
    expect(synth.setConfig(config), "configure Poly Auto Glide");
    synth.beginBlock();
    for (const auto note : notes) synth.noteOn(static_cast<std::uint8_t>(note), 100);
    std::vector<float> left(512), right(512);
    synth.renderAdd(left.data(), right.data(), left.size(), 1);
    return left;
  };
  const auto distance = [](const auto& left, const auto& right) {
    double total = 0;
    for (std::size_t index = 0; index < left.size(); ++index) total += std::abs(left[index] - right[index]);
    return total;
  };

  const auto targetNote = render(0, {60});
  const auto lowerNote = render(0, {58});
  const auto glidingNote = render(500, {60});
  expect(glidingNote != targetNote, "Poly Glide also affects the first note");
  expect(distance(glidingNote, lowerNote) < distance(glidingNote, targetNote),
      "Poly Auto Glide starts one whole tone below the played note");

  const auto targetChord = render(0, {60, 64, 67});
  const auto lowerChord = render(0, {58, 62, 65});
  const auto glidingChord = render(500, {60, 64, 67});
  expect(glidingChord != targetChord, "Poly Auto Glide affects simultaneous chord voices");
  expect(distance(glidingChord, lowerChord) < distance(glidingChord, targetChord),
      "every Poly chord voice starts one whole tone below its destination");

  for (const auto voiceMode : {std::uint8_t{1}, std::uint8_t{2}}) {
    const auto monoGlide = render(500, {60}, voiceMode);
    expect(monoGlide != targetNote && distance(monoGlide, lowerNote) < distance(monoGlide, targetNote),
        "Mono and Legato Glide also start the first note one whole tone below");
  }
}

// Portamento desliza da nota anterior; o limite de velocity desliga o Glide.
void testGlidePortamentoAndVelocityGate() {
  static constexpr std::size_t window = 4800; // 100 ms
  // With a 5 s Glide the pitch barely moves inside the window, so the zero
  // crossings measure where the note started.
  const auto crossings = [](const std::vector<float>& samples, std::size_t from) {
    int count = 0;
    for (std::size_t index = from + 1; index < from + window; ++index) {
      if (samples[index - 1] < 0.0f && samples[index] >= 0.0f) ++count;
    }
    return count;
  };
  struct Step { int note; std::uint8_t velocity; bool release; };
  const auto play = [&](std::uint8_t voiceMode, hook_keys::GlideBehavior behavior,
                        std::initializer_list<Step> steps) {
    hook_keys::AnalogSynthModule synth(48000);
    hook_keys::AnalogSynthConfig config;
    config.voiceMode = voiceMode;
    config.oscillator1 = 0;
    config.oscillator2Enabled = false;
    config.oscillator3Enabled = false;
    config.oscillator1DetuneCents = config.oscillator2DetuneCents = config.oscillator3DetuneCents = 0.0f;
    config.lfoDepth = config.filterEnvelope = config.filterResonance = 0.0f;
    config.releaseMs = 5.0f;
    config.glideMs = 5000.0f;
    expect(synth.setConfig(config), "configure Portamento synth");
    synth.setGlideBehavior(behavior);
    synth.beginBlock();
    std::vector<float> left, right;
    for (const auto& step : steps) {
      if (step.release) {
        synth.noteOff(static_cast<std::uint8_t>(step.note));
        std::vector<float> tail(4800), tailRight(4800);
        synth.renderAdd(tail.data(), tailRight.data(), tail.size(), 1.0f);
        continue;
      }
      synth.noteOnWithFilterVelocity(static_cast<std::uint8_t>(step.note), 100, step.velocity);
      left.assign(window + 1, 0.0f);
      right.assign(window + 1, 0.0f);
      synth.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    }
    return crossings(left, 0);
  };
  // C4 = 26 crossings in 100 ms, A#3 = 23, C3 = 13 (a continuing phase can shift one).
  const auto target = [](int count) { return count >= 25 && count <= 27; };
  const auto toneBelow = [](int count) { return count >= 22 && count <= 24; };
  hook_keys::GlideBehavior portamento;
  portamento.portamento = true;
  expect(toneBelow(play(0, {}, {{60, 100, false}})), "Auto starts one whole tone below");
  expect(target(play(0, portamento, {{60, 100, false}})), "Portamento's first note has no previous note to slide from");
  // Mono and Legato hold the previous key (one voice); Poly releases it first so
  // only the new note is measured.
  for (const auto voiceMode : {std::uint8_t{1}, std::uint8_t{2}}) {
    expect(play(voiceMode, portamento, {{48, 100, false}, {60, 100, false}}) <= 14,
        "Mono and Legato Portamento slide from the previous note");
    expect(toneBelow(play(voiceMode, {}, {{48, 100, false}, {60, 100, false}})),
        "Mono and Legato Auto ignore the previous note");
  }
  expect(play(0, portamento, {{48, 100, false}, {48, 0, true}, {60, 100, false}}) <= 14,
      "Poly Portamento slides from the previous note");
  expect(toneBelow(play(0, {}, {{48, 100, false}, {48, 0, true}, {60, 100, false}})),
      "Poly Auto ignores the previous note");

  hook_keys::GlideBehavior gate;
  gate.velocityGateEnabled = true;
  gate.velocityThreshold = 70;
  expect(target(play(0, gate, {{60, 70, false}})), "velocity at the threshold plays without Glide");
  expect(target(play(0, gate, {{60, 110, false}})), "velocity above the threshold plays without Glide");
  expect(toneBelow(play(0, gate, {{60, 69, false}})), "velocity below the threshold keeps Glide");
  gate.velocityGateInverted = true;
  expect(target(play(0, gate, {{60, 69, false}})), "inverted: velocity below the threshold plays without Glide");
  expect(toneBelow(play(0, gate, {{60, 70, false}})), "inverted: velocity from the threshold keeps Glide");

  hook_keys::GlideBehavior packed;
  packed.portamento = packed.velocityGateInverted = true;
  packed.velocityThreshold = 127;
  const auto unpacked = hook_keys::GlideBehavior::unpack(packed.pack());
  expect(unpacked.portamento && !unpacked.velocityGateEnabled && unpacked.velocityGateInverted &&
      unpacked.velocityThreshold == 127, "Glide behavior survives the atomic packing");

  // The runtime routes module 8 to the Synth and 1-7 to the SF2 modules.
  hook_keys::NativeEngineRuntime runtime(48000, 128);
  expect(runtime.setGlideBehavior(7, portamento), "runtime configures Synth Glide");
  expect(runtime.setGlideBehavior(0, gate), "runtime configures SF2 module Glide");
  expect(!runtime.setGlideBehavior(8, gate), "runtime rejects an unknown module");

  // SF2: a velocity gate that closes Glide renders exactly like Glide off.
  const auto renderSf2 = [](float glideMs, hook_keys::GlideBehavior behavior, std::uint8_t velocity) {
    hook_keys::TinySoundFontModule sf2(48000.0, 128);
    expect(sf2.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"), "load SF2 for Glide gate test");
    sf2.setGlide(glideMs);
    sf2.setGlideBehavior(behavior);
    sf2.beginBlock();
    sf2.noteOnWithFilterVelocity(60, 100, velocity);
    std::vector<float> left(4096), right(4096);
    sf2.renderAdd(left.data(), right.data(), 4096, 1.0f);
    return left;
  };
  hook_keys::GlideBehavior sf2Gate;
  sf2Gate.velocityGateEnabled = true;
  sf2Gate.velocityThreshold = 70;
  const auto dry = renderSf2(0.0f, {}, 100);
  expect(renderSf2(500.0f, {}, 100) != dry, "SF2 Auto Glide bends the note");
  expect(renderSf2(500.0f, sf2Gate, 100) == dry, "SF2 velocity gate turns Glide off from the threshold");
  expect(renderSf2(500.0f, sf2Gate, 50) != dry, "SF2 velocity gate keeps Glide below the threshold");
  expect(renderSf2(500.0f, portamento, 100) == dry, "SF2 Portamento's first note plays without Glide");
}

// A divisao do Delay vale sobre uma batida: o BPM com Sync, ou os ms sem ele.
void testDelayDivisionsFollowTempo() {
  const auto echoAt = [](bool sync, float beatMultiplier, float bpm) {
    hook_keys::ModuleEffects effects;
    effects.prepare(48000.0);
    hook_keys::ModuleEffectsConfig config;
    config.delay.enabled = true;
    config.delay.sync = sync;
    config.delay.delayMs = 250.0f;
    config.delay.beatMultiplier = beatMultiplier;
    config.delay.feedback = 0.0f;
    config.delay.mix = 1.0f;
    effects.prepareFor(config);
    effects.setConfig(config, bpm);
    std::vector<float> left(4 * 48000 + 4800, 0.0f), right(left.size(), 0.0f);
    left[0] = right[0] = 1.0f;
    for (std::size_t offset = 0; offset < left.size(); offset += 256) {
      effects.process(left.data() + offset, right.data() + offset, std::min<std::size_t>(256, left.size() - offset));
    }
    return static_cast<std::size_t>(std::distance(left.begin() + 1,
        std::max_element(left.begin() + 1, left.end(), [](float a, float b) { return std::abs(a) < std::abs(b); }))) + 1;
  };
  const auto near = [](std::size_t actual, std::size_t expected) {
    return actual + 48 >= expected && actual <= expected + 48;
  };
  // 120 BPM: a beat is 24000 samples at 48 kHz.
  expect(near(echoAt(true, 4.0f, 120.0f), 96000), "Delay 1/1 synced lasts four beats");
  expect(near(echoAt(true, 2.0f, 120.0f), 48000), "Delay 1/2 synced lasts two beats");
  expect(near(echoAt(true, 1.0f, 120.0f), 24000), "Delay 1/4 synced lasts one beat");
  expect(near(echoAt(true, 0.5f, 120.0f), 12000), "Delay 1/8 synced lasts half a beat");
  expect(near(echoAt(true, 1.0f, 90.0f), 32000), "Delay synced follows the BPM");
  // Without Sync the knob (250 ms = 12000 samples) is the beat the division applies to.
  expect(near(echoAt(false, 1.0f, 120.0f), 12000), "without Sync 1/4 is the knob milliseconds");
  expect(near(echoAt(false, 2.0f, 120.0f), 24000), "without Sync 1/2 doubles the knob milliseconds");
  expect(near(echoAt(false, 0.25f, 120.0f), 3000), "without Sync 1/16 is a quarter of the knob milliseconds");
  expect(near(echoAt(false, 2.0f, 60.0f), 24000), "without Sync the BPM does not change the Delay");
}

// Card Mod no Synth: LFO faz a roda acionar o LFO do editor do Synth; User deixa
// a roda sem efeito no Synth.
void testSynthModCard() {
  const auto render = [](bool lfoCard, int wheel, std::uint8_t synthLfoTarget) {
    hook_keys::AnalogSynthModule synth(48000);
    hook_keys::AnalogSynthConfig config;
    config.oscillator1 = 0;
    config.oscillator2Enabled = false;
    config.oscillator3Enabled = false;
    config.oscillator1DetuneCents = config.oscillator2DetuneCents = config.oscillator3DetuneCents = 0.0f;
    config.glideMs = config.lfoDepth = config.filterEnvelope = 0.0f;
    config.filterResonance = 0.0f;
    config.lfoTarget = synthLfoTarget;
    expect(synth.setConfig(config), "configure Synth Mod card test");
    synth.setModulationMode(lfoCard ? 1 : 0, 7.55f);
    synth.beginBlock();
    synth.controlChange(1, static_cast<std::uint8_t>(wheel));
    synth.noteOn(60, 110);
    std::vector<float> left(24000), right(24000);
    synth.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    return left;
  };
  expect(render(true, 0, 2) == render(false, 0, 2), "without the wheel both Mod modes sound the same");
  expect(render(true, 127, 2) != render(true, 0, 2), "Mod LFO: the wheel drives the Synth LFO");
  expect(render(true, 127, 1) != render(true, 127, 2), "Mod LFO: the Synth LFO destination follows the editor");
  expect(render(false, 127, 2) == render(false, 0, 2), "Mod User: the wheel does nothing in the Synth");
  expect(render(false, 127, 0) == render(false, 0, 0), "Mod User: not even on the pitch destination");

  hook_keys::NativeEngineRuntime runtime(48000, 128);
  expect(runtime.setModuleModulationMode(7, 1, 6.0f), "runtime routes the Mod card to the Synth");
}

void testOutputBoost() {
  const auto render = [](float master, float click) {
    hook_keys::NativeEngineRuntime runtime(48000, 128);
    runtime.setOutputGainDb(master, true);
    runtime.setMetronome(true, 120, click, 1, false, false, 4, 4);
    std::array<float, 512> left{}, right{};
    runtime.render(left.data(), right.data(), left.size());
    left.fill(0);
    right.fill(0);
    runtime.render(left.data(), right.data(), left.size());
    return *std::max_element(left.begin(), left.end());
  };
  const auto unity = render(0, 0.1f);
  expect(std::abs(render(12, 0.1f) - unity) < 0.000001f,
      "legacy positive Master values clamp to 0dB");
  expect(std::abs(render(0, 4.0f) - render(0, 1.0f)) < 0.000001f,
      "legacy positive Click values clamp to 0dB");
  expect(render(12, 1) <= 0.977238f,
      "Master limiter holds the summed bus at -0.2dBFS");
}

void testUnityGainAnalysisAndSmoothing() {
  class AnalysisTone final : public hook_keys::ModuleSynth {
  public:
    void noteOn(std::uint8_t, std::uint8_t) noexcept override {}
    void noteOff(std::uint8_t) noexcept override {}
    void controlChange(std::uint8_t, std::uint8_t) noexcept override {}
    void pitchBend(std::uint16_t) noexcept override {}
    void allNotesOff() noexcept override {}
    void renderAdd(float* left, float* right, std::size_t frames, float gain) noexcept override {
      for (std::size_t frame = 0; frame < frames; ++frame, ++sample) {
        const auto value = static_cast<float>(0.25 * std::sin(
            6.283185307179586 * 1000.0 * static_cast<double>(sample) / 48000.0)) * gain;
        left[frame] += value;
        right[frame] += value * 0.4f;
      }
    }
    std::size_t sample = 0;
  } tone;

  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &tone;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig config;
  config.gainLinear = 1.0f;
  config.effects.compressor.enabled = true;
  config.effects.compressor.ratio = 1.0f;
  expect(engine.setModuleConfig(0, config), "configure unity-gain module");
  static_cast<void>(engine.consumeModuleAnalysis(0));
  std::array<float, 2048> left{}, right{};
  engine.render(left.data(), right.data(), left.size());
  expect(*std::max_element(left.begin(), left.end()) > 0.249f,
      "0 dB is unity and does not hide attenuation in the module mixer");
  const auto stereoMeter = engine.consumeModulePeaks();
  expect(stereoMeter[0] > 0.249f && stereoMeter[0] < 0.251f,
      "module meter reads the same post-fader signal sent to the output");
  expect(stereoMeter[1] > 0.099f && stereoMeter[1] < 0.101f,
      "module meter preserves an independent right-channel peak");
  const auto analysis = engine.consumeModuleAnalysis(0);
  expect(analysis[0] > 0.249f && analysis[1] > 0.249f,
      "compressor Input and Output meters receive real pre/post processor audio");

  // Include an unread peak: disabling must clear it, not merely stop future capture.
  engine.render(left.data(), right.data(), left.size());
  config.effects.compressor.enabled = false;
  expect(engine.setModuleConfig(0, config), "disable compressor meters");
  engine.render(left.data(), right.data(), left.size());
  const auto disabledAnalysis = engine.consumeModuleAnalysis(0);
  expect(disabledAnalysis[0] == 0 && disabledAnalysis[1] == 0, "disabled compressor clears stale input/output peaks");
  engine.render(left.data(), right.data(), left.size());
  const auto bypassAnalysis = engine.consumeModuleAnalysis(0);
  expect(bypassAnalysis[0] == 0 && bypassAnalysis[1] == 0, "disabled compressor does not capture new peaks");
  expect(engine.consumeModulePeaks()[0] > 0.249f, "module fader meter remains active with compressor off");

  config.gainLinear = 0.25f;
  expect(engine.setModuleConfig(0, config), "queue smoothed fader gain");
  left.fill(0);
  right.fill(0);
  engine.render(left.data(), right.data(), 512);
  float largestStep = 0.0f;
  for (std::size_t index = 1; index < 512; ++index) {
    largestStep = std::max(largestStep, std::abs(left[index] - left[index - 1]));
  }
  expect(largestStep < 0.04f, "mapped fader changes are ramped without zipper ticks");
}

void testSoundFontGlide() {
  const auto render = [](bool enabled, int note) {
    hook_keys::TinySoundFontModule synth(48000, 128);
    expect(synth.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"), "load SF2 for Glide");
    synth.setGlide(enabled ? 500 : 0);
    synth.beginBlock();
    synth.noteOn(static_cast<std::uint8_t>(note), 110);
    std::vector<float> left(19200), right(19200);
    synth.renderAdd(left.data(), right.data(), left.size(), 1);
    synth.noteOff(static_cast<std::uint8_t>(note));
    std::vector<float> tail(48000), tailRight(48000);
    synth.renderAdd(tail.data(), tailRight.data(), tail.size(), 1);
    expect(std::all_of(tail.end() - 128, tail.end(), [](float v) { return std::abs(v) < 0.00001f; }), "Glide preserves note-off/release");
    return left;
  };
  const auto dry = render(false, 60);
  const auto wet = render(true, 60);
  expect(dry != wet, "the first SF2 note already receives Auto Glide");
  expect(dry == render(false, 60), "Glide OFF restores normal SF2 pitch");
}

void testMidiDuringLoadingIsDiscarded() {
  hook_keys::NativeEngineRuntime runtime(48000, 128);
  hook_keys::ModuleConfig config;
  config.enabled = true;
  expect(runtime.setModuleConfig(7, config), "prepare Synth before loading gate test");
  runtime.setMidiInputEnabled(false);
  for (int index = 0; index < 1000; ++index) {
    expect(runtime.sendMidi(0, 0x90, 60, 127), "blocked MIDI is discarded without filling queue");
  }
  runtime.setMidiInputEnabled(true);
  std::array<float, 512> left{}, right{};
  runtime.render(left.data(), right.data(), left.size());
  expect(std::all_of(left.begin(), left.end(), [](float sample) { return sample == 0; }),
      "opening MIDI after loading does not replay discarded notes");
  expect(runtime.sendMidi(0, 0x90, 64, 127), "new MIDI enters after loading");
  runtime.render(left.data(), right.data(), left.size());
  expect(std::any_of(left.begin(), left.end(), [](float sample) { return std::abs(sample) > 0.00001f; }),
      "new note sounds normally after loading");
}

void testTranceGateProcessing() {
  // Gate runs sample-by-sample, and does not send MIDI retriggers.
  {
    hook_keys::ModuleEffects processor;
    processor.prepare(48000);
    hook_keys::ModuleEffectsConfig config;
    config.tranceGate.enabled = true;
    config.tranceGate.length = 2;
    config.tranceGate.steps = 1;
    config.tranceGate.gate = 0.5f;
    processor.setConfig(config, 120);
    std::vector<float> left(24000, 1.0f), right(24000, 0.5f);
    processor.process(left.data(), right.data(), left.size());
    expect(left[1000] > 0.99f && left[5000] < 0.00001f, "Trance Gate opens/closes in audio callback at 120 BPM");
    expect(left[11000] < 0.00001f && left[13000] > 0.99f, "disabled gate step is a rest and pattern wraps");
    for (std::size_t index = 0; index < left.size(); ++index) {
      expect(std::abs(right[index] - left[index] * 0.5f) < 0.00001f, "gate preserves stereo balance");
      if (index) expect(std::abs(left[index] - left[index - 1]) < 0.01f, "gate transitions are smoothed, not clicks");
    }
    processor.reset();
    processor.setConfig(config, 240);
    std::fill(left.begin(), left.end(), 1.0f);
    std::fill(right.begin(), right.end(), 1.0f);
    processor.process(left.data(), right.data(), 6000);
    expect(left[1000] > 0.99f && left[2500] < 0.001f, "240 BPM doubles the pulse rate");
    config.tranceGate.steps = 0;
    config.tranceGate.depth = 0.5f;
    processor.setConfig(config, 120);
    std::fill(left.begin(), left.end(), 1.0f);
    processor.process(left.data(), right.data(), left.size());
    expect(std::abs(left.back() - 0.5f) < 0.00001f, "50 percent Depth retains half the volume when closed");
    config.tranceGate.enabled = false;
    processor.setConfig(config, 120);
    std::fill(left.begin(), left.end(), 1.0f);
    processor.process(left.data(), right.data(), left.size());
    expect(left.back() > 0.999f, "gate OFF restores unpulsed audio");

    RecordingSynth synth;
    hook_keys::HookKeysEngine::SynthModules modules{};
    modules[6] = &synth;
    hook_keys::HookKeysEngine engine(modules);
    hook_keys::ModuleConfig module;
    module.effects.tranceGate = config.tranceGate;
    module.effects.tranceGate.enabled = true;
    expect(engine.setModuleConfig(6, module), "configure native gate module");
    for (const auto note : {60, 64, 67}) expect(engine.enqueueMidi(midi(0x90, note, 100)), "gate chord input");
    for (int block = 0; block < 500; ++block) process(engine);
    expect(synth.events.size() == 3, "Trance Gate keeps the chord without generating NoteOn/Off");
    expect(synth.events[0].data1 == 60 && synth.events[1].data1 == 64 && synth.events[2].data1 == 67,
        "gate does not transpose the played chord");
    for (const auto note : {60, 64, 67}) expect(engine.enqueueMidi(midi(0x80, note, 0)), "release gate chord");
    process(engine);
    expect(synth.events.size() == 6, "gate releases only the actual played notes");
  }
}

// O banco de amostras vive em 16 bits e a escala virou ganho de voz. Um erro
// de fator 32767 para qualquer lado nao mudaria a forma de onda, so o nivel,
// entao o unico jeito de pegar isso e olhar a amplitude absoluta.
void testSoundFontSampleScale() {
  constexpr std::size_t blockFrames = 512;
  hook_keys::TinySoundFontModule soundFont(48000.0, blockFrames, 256);
  expect(soundFont.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"),
      "load SF2 for sample scale regression");
  soundFont.beginBlock();
  soundFont.noteOn(60, 127);
  std::array<float, blockFrames * 8> left{}, right{};
  for (std::size_t offset = 0; offset < left.size(); offset += blockFrames) {
    soundFont.renderAdd(left.data() + offset, right.data() + offset, blockFrames, 1.0f);
  }
  float peak = 0.0f;
  for (const auto sample : left) peak = std::max(peak, std::abs(sample));
  expect(peak > 0.01f, "a full velocity note is audible, not divided by the 16 bit range");
  expect(peak < 1.0f, "a full velocity note stays below clipping, not multiplied by it");
}

// O pedal de sustain nao pode encolher nem inflar a polifonia. Contar as notas
// presas por ele fazia o motor roubar notas que ainda deviam soar, e o timbre
// inteiro parecia comprimido; ignora-las por completo deixava o teto interno
// do TinySoundFont estourar, onde a nota nova nao saia. Quem devolve lugar e
// a folga real do banco de vozes, perguntada ao proprio modulo.
void testSustainPedalDoesNotConsumeThePolyphony() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);
  hook_keys::ModuleConfig config;
  config.polyphony = 2;
  expect(engine.setModuleConfig(0, config), "configure two-voice polyphony with sustain");
  expect(engine.enqueueMidi(midi(0xb0, 64, 127)), "press the sustain pedal");
  expect(engine.enqueueMidi(midi(0x90, 60, 100)), "first sustained note");
  expect(engine.enqueueMidi(midi(0x80, 60, 0)), "release the first key, the pedal holds the voice");
  expect(engine.enqueueMidi(midi(0x90, 64, 100)), "second sustained note");
  expect(engine.enqueueMidi(midi(0x80, 64, 0)), "release the second key");
  process(engine);
  synth.events.clear();
  expect(engine.enqueueMidi(midi(0x90, 67, 100)), "third note while both keys are pedalled");
  process(engine);
  expect(synth.events.size() == 1 && synth.events[0].type == Event::Type::noteOn,
      "a pedalled note does not spend the polyphony the musician chose");

  // Com o banco interno cheio a folga vira o criterio, e o sacrificio recai
  // sobre a nota mais antiga presa pelo pedal, nunca sobre a tecla em uso.
  synth.voicePoolNearlyFull = true;
  synth.events.clear();
  expect(engine.enqueueMidi(midi(0x90, 72, 100)), "note arriving with the voice pool nearly full");
  process(engine);
  expect(synth.events.size() == 2, "a full voice pool frees room before the new note");
  expect(synth.events[0].type == Event::Type::noteOff && synth.events[0].data1 == 60,
      "the oldest pedalled note is the one released");
  expect(synth.events[1].type == Event::Type::noteOn && synth.events[1].data1 == 72,
      "the new note still sounds");

  synth.voicePoolNearlyFull = false;
  expect(engine.enqueueMidi(midi(0x80, 67, 0)), "release the third key onto the pedal");
  expect(engine.enqueueMidi(midi(0x80, 72, 0)), "release the fourth key onto the pedal");
  process(engine);
  synth.events.clear();
  expect(engine.enqueueMidi(midi(0xb0, 64, 0)), "release the sustain pedal");
  expect(engine.enqueueMidi(midi(0x90, 76, 100)), "a note after the pedal finds free polyphony");
  expect(engine.enqueueMidi(midi(0x90, 77, 100)), "and a second one fills it again");
  process(engine);
  const auto steals = std::count_if(synth.events.begin(), synth.events.end(),
      [](const Event& event) { return event.type == Event::Type::noteOff; });
  expect(steals == 0, "lifting the pedal frees the held notes instead of stealing new ones");
}

void testSixNoteSoundFontChordKeepsEveryVoice() {
  constexpr std::array<std::uint8_t, 6> notes{48, 52, 55, 60, 64, 67};
  // static: o MSVC exige captura para uma constexpr local usada dentro da
  // lambda, e capturar tiraria o valor do contexto constante.
  static constexpr std::size_t frames = 512;
  const auto render = [](const auto& playedNotes) {
    hook_keys::TinySoundFontModule soundFont(48000.0, frames, 256);
    expect(soundFont.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"),
        "load SF2 for six-note chord regression");
    soundFont.beginBlock();
    for (const auto note : playedNotes) soundFont.noteOn(note, 100);
    std::array<float, frames> left{}, right{};
    soundFont.renderAdd(left.data(), right.data(), frames, 1.0f);
    return left;
  };

  const auto chord = render(notes);
  std::array<float, frames> separateSum{};
  for (const auto note : notes) {
    const std::array<std::uint8_t, 1> single{note};
    const auto voice = render(single);
    for (std::size_t frame = 0; frame < frames; ++frame) separateSum[frame] += voice[frame];
  }
  for (std::size_t frame = 0; frame < frames; ++frame) {
    expect(std::abs(chord[frame] - separateSum[frame]) < 0.0001f,
        "a six-note SF2 chord renders every requested note without internal voice loss");
  }
}

void testNewSoftNoteDoesNotFilterHeldChord() {
  for (const bool sf2 : {false, true}) {
    for (const bool interleaved : {false, true}) {
      for (const auto velocities : {std::array<std::uint8_t, 2>{127, 35}, std::array<std::uint8_t, 2>{35, 127}}) {
        for (const std::size_t frames : {64u, 256u, 512u}) {
          std::array<std::unique_ptr<hook_keys::ModuleSynth>, 3> synths;
          std::array<std::unique_ptr<hook_keys::HookKeysEngine>, 3> engines;
          for (std::size_t i = 0; i < synths.size(); ++i) {
            if (sf2) {
              auto synth = std::make_unique<hook_keys::TinySoundFontModule>(48000, 512);
              expect(synth->loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"), "load velocity isolation SF2");
              synths[i] = std::move(synth);
            } else {
              auto synth = std::make_unique<hook_keys::AnalogSynthModule>(48000);
              hook_keys::AnalogSynthConfig config;
              config.voiceMode = 0;
              config.glideMs = 0;
              config.filterEnvelope = 0;
              config.lfoDepth = 0;
              expect(synth->setConfig(config), "configure velocity isolation synth");
              synths[i] = std::move(synth);
            }
            hook_keys::HookKeysEngine::SynthModules modules{};
            modules[0] = synths[i].get();
            engines[i] = std::make_unique<hook_keys::HookKeysEngine>(modules);
            hook_keys::ModuleConfig config;
            // Este teste mede linearidade entre vozes, não o limiter final do
            // módulo. Mantenha a soma abaixo de -0,2 dBFS para isolar o DSP
            // de velocity/filtro que ele realmente verifica.
            config.gainLinear = 0.25f;
            config.effects.cutoff.velocityCurve = {0, 32, 64, 96, 127};
            // Fixed amplitude separates filter modulation from the deliberately
            // quieter amplitude of a soft note.
            config.velocityCurve = {100, 100, 100, 100, 100};
            expect(engines[i]->setModuleConfig(0, config), "configure per-note filter regression");
          }
          expect(engines[0]->enqueueMidi(midi(0x90, 72, velocities[0])), "combined held note");
          expect(engines[1]->enqueueMidi(midi(0x90, 72, velocities[0])), "isolated held note");
          std::array<std::array<float, 512>, 3> left{}, right{};
          std::array<std::array<float, 1024>, 3> stereo{};
          double error = 0, reference = 0;
          for (int block = 0; block < 60; ++block) {
            if (block == 20) {
              expect(engines[0]->enqueueMidi(midi(0x90, 48, velocities[1])), "new note after held note");
              expect(engines[2]->enqueueMidi(midi(0x90, 48, velocities[1])), "isolated new note");
            }
            for (std::size_t i = 0; i < engines.size(); ++i) {
              if (interleaved) {
                engines[i]->renderInterleaved(stereo[i].data(), frames, 2);
                for (std::size_t j = 0; j < frames; ++j) {
                  left[i][j] = stereo[i][j * 2];
                  right[i][j] = stereo[i][j * 2 + 1];
                }
              } else {
                engines[i]->render(left[i].data(), right[i].data(), frames);
              }
            }
            if (block < 20) continue;
            for (std::size_t j = 0; j < frames; ++j) {
              const double expectedLeft = left[1][j] + left[2][j];
              const double expectedRight = right[1][j] + right[2][j];
              error += std::abs(left[0][j] - expectedLeft) + std::abs(right[0][j] - expectedRight);
              reference += std::abs(expectedLeft) + std::abs(expectedRight);
            }
          }
          if (error > reference * 0.0001) {
            std::cerr << "Velocity isolation " << (sf2 ? "SF2" : "Synth")
                      << " buffer=" << frames << " interleaved=" << interleaved
                      << " newVelocity=" << static_cast<int>(velocities[1]) << " relative error=" << error / reference << '\n';
          }
          expect(reference > 0.01 && error < reference * 0.0001,
              "a soft or hard new note must not alter or compress a held note, in either output layout");
        }
      }
    }
  }
}

void testNativeArpeggiatorScheduler() {
  hook_keys::NativeArpeggiator arp;
  hook_keys::NativeArpeggiatorConfig config;
  config.enabled = true;
  config.gate = 0.5f;
  std::vector<std::array<int, 3>> events;
  int clock = 0;
  const auto emit = [&](auto note, auto velocity) { events.push_back({clock, note, velocity}); };
  const auto render = [&](int frames, float bpm = 120.0f) {
    const auto end = clock + frames;
    while (clock < end) {
      const auto block = arp.begin(config, 48000, bpm, std::min(512, end - clock), emit);
      arp.advance(block, 48000, bpm);
      clock += static_cast<int>(block);
    }
  };
  arp.note(0, 0, 60, 100); arp.note(0, 0, 64, 80); arp.note(0, 0, 67, 90);
  render(18001);
  expect(events.size() == 7, "native arp emits three gates and the next onset, no direct chord");
  expect(events[0] == std::array<int, 3>{0, 60, 100}, "first note starts at the first sample");
  expect(events[1] == std::array<int, 3>{3000, 60, 0}, "gate note off is sample accurate");
  expect(events[2] == std::array<int, 3>{6000, 64, 80}, "second step follows exact BPM");
  expect(events[4] == std::array<int, 3>{12000, 67, 90}, "third step keeps source velocity");
  arp.sustain(0, 0, true);
  for (auto note : {60, 64, 67}) arp.note(0, 0, note, 0);
  expect(arp.active(), "sustain keeps source keys in sequence");
  render(6000);
  const auto before = events.size();
  arp.sustain(0, 0, false);
  render(24000);
  expect(events.size() <= before + 1 && !arp.active(), "pedal release ends sequence without stuck notes");
  for (int mode = 0; mode < 4; ++mode) {
    arp.reset(emit); clock = 0; events.clear(); config.mode = mode;
    arp.note(0, 0, 67, 100); arp.note(0, 0, 60, 100); arp.note(0, 0, 64, 100);
    render(18001);
    const std::array<std::array<int, 4>, 4> expected{{{60, 64, 67, 60}, {67, 64, 60, 67}, {60, 64, 67, 64}, {67, 60, 64, 67}}};
    for (std::size_t n = 0; n < 4; ++n) expect(events[n * 2][1] == expected[mode][n], "native arp mode sequence");
  }
  arp.reset(emit); clock = 0; events.clear(); config.mode = 0;
  config.measureBeats = 3; config.octaves = 2; config.swing = 0.5f;
  arp.note(0, 0, 60, 100); arp.note(0, 0, 64, 100); arp.note(0, 0, 67, 100);
  render(72001);
  expect(events[2][0] == 9000 && events[4][0] == 12000, "swing alternates long and short while preserving pair length");
  expect(events[6][1] == 72, "octave expansion starts next octave");
  expect(events.back()[0] == 72000 && events.back()[1] == 60, "6/8 measure restarts on its exact downbeat");
  arp.reset(emit); clock = 0; events.clear(); config.swing = 0; config.octaves = 1; config.measureBeats = 0;
  arp.note(0, 0, 60, 100);
  render(480001, 132.5f);
  int onset = 0;
  for (const auto& event : events) if (event[2]) {
    const auto expected = onset++ * 48000.0 * 60.0 / 132.5 * 0.25;
    expect(std::abs(event[0] - expected) <= 1.001, "fractional BPM does not accumulate rounding drift");
  }
  arp.reset(emit);
  arp.note(0, 0, 60, 100); arp.note(1, 1, 60, 90);
  arp.sustain(0, 0, true); arp.note(0, 0, 60, 0); arp.sustain(0, 0, false);
  expect(arp.active(), "releasing one input does not release another keyboard");
  arp.note(1, 1, 60, 0); render(1);
  expect(!arp.active(), "last input releases the note");
}

void testNativeArpeggiatorEngineRouting() {
  RecordingSynth arpeggiated, normal;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &arpeggiated; modules[1] = &normal;
  auto engine = std::make_unique<hook_keys::HookKeysEngine>(modules);
  hook_keys::ModuleConfig config;
  config.nativeArpeggiator.enabled = true;
  expect(engine->setModuleConfig(0, config), "enable native arp");
  hook_keys::ModuleConfig normalConfig;
  expect(engine->setModuleConfig(1, normalConfig), "configure normal module on same input");
  for (auto note : {60, 64, 67}) expect(engine->enqueueMidi(midi(0x90, note, 100)), "queue chord");
  process(*engine);
  const auto noteCount = [](const RecordingSynth& synth) {
    return std::count_if(synth.events.begin(), synth.events.end(), [](auto event) { return event.type == Event::Type::noteOn; });
  };
  expect(noteCount(arpeggiated) == 1, "native arp never leaks the source chord");
  expect(noteCount(normal) == 3, "other modules remain polyphonic");
  expect(engine->enqueueMidi(midi(0xb0, 64, 127)), "sustain down");
  for (auto note : {60, 64, 67}) expect(engine->enqueueMidi(midi(0x80, note, 0)), "release chord");
  std::vector<float> audio(24000 * 2);
  engine->renderInterleaved(audio.data(), 24000, 2);
  expect(noteCount(arpeggiated) > 1, "arp continues under pedal");
  expect(std::none_of(arpeggiated.events.begin(), arpeggiated.events.end(), [](auto event) {
    return event.type == Event::Type::controlChange && event.data1 == 64 && event.data2 >= 64;
  }), "sustain never reaches generated voices");
  const auto count = noteCount(arpeggiated);
  expect(engine->enqueueMidi(midi(0xb0, 64, 0)), "sustain up");
  engine->renderInterleaved(audio.data(), 24000, 2);
  expect(noteCount(arpeggiated) == count, "pedal up stops arp");
  expect(engine->enqueueMidi(midi(0xb0, 64, 127)), "pedal before disabling");
  process(*engine);
  config.nativeArpeggiator.enabled = false;
  expect(engine->setModuleConfig(0, config), "disable arp"); process(*engine);
  config.nativeArpeggiator.enabled = true;
  expect(engine->setModuleConfig(0, config), "enable with pedal held"); process(*engine);
  expect(engine->enqueueMidi(midi(0x90, 62, 100)), "new chord with held pedal"); process(*engine);
  expect(engine->enqueueMidi(midi(0x80, 62, 0)), "release key with held pedal");
  const auto held = noteCount(arpeggiated);
  engine->renderInterleaved(audio.data(), 24000, 2);
  expect(noteCount(arpeggiated) > held, "enabling arp inherits pedal without repedaling");
  expect(engine->stopAllNotes(), "panic native arp"); process(*engine);
  const auto panicked = noteCount(arpeggiated);
  engine->renderInterleaved(audio.data(), 24000, 2);
  expect(noteCount(arpeggiated) == panicked, "panic clears held arp keys and clock");
  expect(!engine->setModuleConfig(6, config), "B3 rejects arp");
  config.nativeArpeggiator.gate = std::nanf("");
  expect(!engine->setModuleConfig(0, config), "nonfinite arp settings rejected");
}

void testNativePresetArpeggiatorPreservesSustainChannel() {
  auto actual = std::make_unique<hook_keys::NativeEngineRuntime>(48000, 128);
  auto reference = std::make_unique<hook_keys::NativeEngineRuntime>(48000, 128);
  hook_keys::ModuleConfig module;
  module.gainLinear = 0.15f;
  hook_keys::NativeArpeggiatorConfig arp;
  arp.enabled = true;
  for (auto* runtime : {actual.get(), reference.get()}) {
    expect(runtime->sendMidi(0, 0xb2, 64, 127), "pedal channel 3 before switching preset");
    expect(runtime->beginPresetTransition(), "prepare native arp preset");
    expect(runtime->setModuleConfig(7, module), "enable native synth in next preset");
    expect(runtime->setNativeArpeggiator(7, arp), "configure arp before commit");
    expect(runtime->commitPresetTransition(), "commit native arp preset");
  }
  // The reference explicitly repedals. Actual must inherit the same channel.
  expect(reference->sendMidi(0, 0xb2, 64, 127), "reference pedal channel 3");
  for (auto* runtime : {actual.get(), reference.get()}) {
    expect(runtime->sendMidi(0, 0xb0, 64, 0), "other channel pedal does not release channel 3");
    expect(runtime->sendMidi(0, 0x92, 60, 100), "play channel 3 after switch");
    expect(runtime->sendMidi(0, 0x82, 60, 0), "release key; arp must remain held by inherited pedal");
  }
  std::array<float, 256> a{}, b{};
  double energy = 0;
  for (int block = 0; block < 240; ++block) {
    actual->renderInterleaved(a.data(), 128, 2);
    reference->renderInterleaved(b.data(), 128, 2);
    for (std::size_t i = 0; i < a.size(); ++i) {
      expect(std::abs(a[i] - b[i]) < 0.000001f, "preset restores sustain on its original MIDI channel");
      energy += std::abs(a[i]);
    }
  }
  expect(energy > 1, "inherited pedal keeps arpeggiator sounding after key release");
}

void testNativePerformanceAndTonePreserveEffects() {
  auto actual = std::make_unique<hook_keys::NativeEngineRuntime>(48000, 128);
  auto reference = std::make_unique<hook_keys::NativeEngineRuntime>(48000, 128);
  hook_keys::ModuleConfig module;
  module.gainLinear = 0.12f;
  module.effects.equalizer.enabled = true;
  module.effects.equalizer.bands[2].gainDb = -5;
  module.effects.delay.enabled = true;
  module.effects.delay.mix = 0.2f;
  module.effects.delay.delayMs = 80;
  hook_keys::NativeArpeggiatorConfig arp;
  arp.enabled = true;
  arp.autoFaderEnabled = true;
  for (auto* runtime : {actual.get(), reference.get()}) {
    expect(runtime->setModuleConfig(7, module), "configure performance test synth");
    expect(runtime->setModuleEffects(7, module.effects), "set EQ and Delay before performance edits");
    expect(runtime->setNativeArpeggiator(7, arp), "enable arp before performance edits");
    expect(runtime->sendMidi(0, 0x90, 60, 100), "hold source during tone edits");
  }
  module.effects.autoFader = {true, arp.autoFaderBeats, arp.autoFaderDepthDb};
  std::array<float, 256> a{}, b{};
  double energy = 0;
  for (int block = 0; block < 200; ++block) {
    if (block % 10 == 0) {
      auto performance = module;
      performance.gainLinear = 0; performance.enabled = false; performance.effects = {};
      expect(actual->setModulePerformance(7, performance), "routing edit cannot change fader, ON/OFF, FX or arp");
      auto& cutoff = module.effects.cutoff;
      cutoff.enabled = true;
      cutoff.frequencyHz = 200 + block * 60.0f;
      module.effects.inputGainDb = -12 + block * 0.05f;
      expect(actual->setModuleTone(7, cutoff, module.effects.inputGainDb), "native tone edits");
      expect(reference->setModuleEffects(7, module.effects), "equivalent reference FX config");
    }
    actual->renderInterleaved(a.data(), 128, 2);
    reference->renderInterleaved(b.data(), 128, 2);
    for (std::size_t i = 0; i < a.size(); ++i) {
      expect(std::isfinite(a[i]) && std::abs(a[i] - b[i]) < 0.000001f, "performance and tone preserve held arp, EQ, Delay, fader and Auto Fader");
      energy += std::abs(a[i]);
    }
  }
  expect(energy > 1, "tone comparison renders sounding audio");
  expect(!actual->setModuleTone(6, module.effects.cutoff, 0), "B3 rejects generic cutoff");
  expect(!actual->setModuleTone(7, {}, std::nanf("")), "tone rejects nonfinite gain");
  expect(!actual->setModulePerformance(8, module), "performance rejects invalid module");
}

int main() {
  testNativePresetArpeggiatorPreservesSustainChannel();
  testNativePerformanceAndTonePreserveEffects();
  testNativeArpeggiatorScheduler();
  testNativeArpeggiatorEngineRouting();
  expect(hook_keys::ModuleConfig{}.polyphony == 128, "new modules default to 128-note polyphony");
  testVibesPitchModulationAndZeroBypass();
  testNewSoftNoteDoesNotFilterHeldChord();
  testSixNoteSoundFontChordKeepsEveryVoice();
  testSoundFontSampleScale();
  testSustainPedalDoesNotConsumeThePolyphony();
  testTranceGateProcessing();
  testEffectParametersDoNotClickOnChange();
  testMidiDuringLoadingIsDiscarded();
  testSoundFontGlide();
  testMetersAndNoteRelease();
  testModWheelWithZeroDepth();
  testSoundFontTremolo();
  testPolyAutoGlide();
  testSynthRetriggerHasNoClick();
  testGlidePortamentoAndVelocityGate();
  testSynthModCard();
  testDelayDivisionsFollowTempo();
  testVelocityLimits();
  testMetronomeOutputRoute();
  testTrackPlayerPlaysRoutesLoopsAndEnds();
  testOutputBoost();
  testUnityGainAnalysisAndSmoothing();
  testGlobalTranspose();
  testModuleDualMonoOutputRouting();
  testPerModuleOutputLimiter();
  testRangeAndOctaveRouting();
  testKeyboardBroadcastRouting();
  testPatternGeneratorRouting();
  testMonoVoiceSteal();
  testRepeatedNoteLayersUntilNoteOff();
  testGmDrumHiHatChoke();
  testGmDrumPerNoteZeroRelease();
  testFifoPolyphonySteal();
  testArpeggiatorRouteClearsSustain();
  testPerModuleControllerFilters();
  testDisableAndPanic();
  testModuleEnabledMaskPreservesTailsAndSustain();
  testMidiInputRouting();
  testAllMidiInputsRouting();
  testConcurrentProducers();
  testTinySoundFontRendering();
  testSoundFontModWheelModes();
  testSameSoundFontRunsIndependentlyAcrossModules();
  testDefaultVolumeEnvelopes();
  testNativeRuntimeSignalPath();
  testNativeRuntimeEffectPadsAndMidiChannel10();
  testNativeRuntimeLiveEffectGain();
  testNeutralRuntimeSoundFontPathPreservesEmbeddedEnvelope();
  testModulesMeterUsesEveryOutput();
  testNativeRuntimeOrganDrawbars();
  testDryOrganPreservesItsSoundFontVoice();
  testOrganEnvelopeAndPermanentNoSens();
  testIndependentPresetTails();
  testCancelledNativePresetLeavesCurrentAudioUntouched();
  testDeferredNativePresetEffectsMatchPreparedTransition();
  testPresetSoundFontWarmupIsBoundedAndReused();
  testCompatibilityBlocksCc7();
  testSharedSoundFontEnvelopeIsolation();
  testIndependentOscillatorVolumes();
  testSynthPreservesLinearVelocityAndGain();
  testSynthNoVelocitySensitivity();
  testSynthPitchIsIndependentOfSampleRate();
  testIndependentOscillatorOctaves();
  testMetronomeRunsOnTheAudioCallback();
  testMutedMetronomeKeepsPhaseWhenUnmuted();
  testVelocityCurveMapping();
  testCutoffProcessing();
  testCutoffVelocityCurve();
  testCutoffFilterTypesAndEnvelope();
  testNoVelocitySensitivity();
  testMonoNoteReturnsToStillHeldKey();
  testMonoLegatoRetunePreservesEnvelope();
  testEqualizerProcessing();
  testNativeEqualizerEditsPreserveOtherEffects();
  testNativeReverbEditsPreserveOtherEffects();
  testNativeSoundEffectsEditsPreserveOtherEffects();
  testEqualizerCutSlope();
  testCompressorProcessing();
  testDelayProcessing();
  testReverbProcessing();
  testReverbMixMovesWithoutBoundaryJump();
  testReverbImpulseSelection();
  testReverbDecayShapesTheRealImpulse();
  testReverbDecayPublicationDuringAudio();
  testRejectedReverbDecayRestoresCache();
  testTwoStageConvolverMatchesDirectConvolution();
  testReenabledEffectsDoNotReplayOldAudio();
  testEngineReverbAndDelayThroughConfig();
  testClosedOrganDrawbarDoesNotKeepReleasedVoices();
  testOrganCabinetImpulseSelection();
  testBypassedModuleEffectsAreBitTransparent();
  testOrganCabinetDoesNotBoostResonances();
  testOrganFullRegistrationThroughCabinet();
  testRotarySpeakerProcessing();
  testRotaryLeslieAmplitudeModulation();
  testRotarySurvivesEqualizerActivation();
  testEqualizerControlsTreble();
  testRotaryPitchStaysInTune();
  testAutoFaderRidesTheVolume();
  testRotaryMidiEngineRouting();
  testMonoLegatoKeepsTranceGatePattern();
  std::cout << "Hook Keys engine tests passed\n";
  return EXIT_SUCCESS;
}
