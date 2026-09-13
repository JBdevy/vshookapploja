#include "hook_keys/HookKeysEngine.hpp"
#include "hook_keys/AnalogSynthModule.hpp"
#include "hook_keys/ModuleEffects.hpp"
#include "hook_keys/NativeEngineRuntime.hpp"
#include "hook_keys/RealtimeCommandQueue.hpp"
#include "hook_keys/TinySoundFontModule.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <cmath>
#include <cstdlib>
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

  std::vector<Event> events;
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
  expect(!engine.enqueueMidi(midi(0x90, 64, 110, 6)), "reject invalid virtual input");
}

void testPatternGeneratorRouting() {
  std::array<RecordingSynth, hook_keys::kModuleCount> synths;
  hook_keys::HookKeysEngine::SynthModules modules{};
  for (std::size_t index = 0; index < synths.size(); ++index) {
    modules[index] = &synths[index];
  }
  hook_keys::HookKeysEngine engine(modules);
  for (std::size_t index = 0; index < synths.size(); ++index) {
    hook_keys::ModuleConfig config;
    config.midiInputSlot = index == 5 ? hook_keys::kArpeggiatorInput
        : index == 6 ? hook_keys::kSequencerInput : hook_keys::kAllMidiInputs;
    expect(engine.setModuleConfig(index, config), "configure generated-note routing");
  }
  expect(engine.enqueueMidi(midi(0x90, 67, 108, hook_keys::kArpeggiatorInput)), "queue arpeggiator note");
  expect(engine.enqueueMidi(midi(0x90, 72, 105, hook_keys::kSequencerInput)), "queue sequencer note");
  process(engine);
  for (std::size_t index = 0; index < synths.size(); ++index) {
    const auto expected = index == 5 || index == 6 ? 1U : 0U;
    expect(synths[index].events.size() == expected, "generated notes stay inside their module");
  }
  expect(synths[5].events[0].data1 == 67, "arpeggiator reaches module 6");
  expect(synths[6].events[0].data1 == 72, "sequencer reaches module 7");
  for (auto& synth : synths) synth.events.clear();
  expect(engine.enqueueMidi(midi(0x90, 60, 100, hook_keys::kKeyboardBroadcastInput)),
         "queue touch keyboard broadcast while patterns are active");
  process(engine);
  expect(synths[5].events.empty() && synths[6].events.empty(),
         "touch keyboard roots do not bypass enabled pattern processors");
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

  expect(first.events.size() == 1 && first.events[0].data1 == 74, "module filter blocks only sustain and modulation");
  expect(second.events.size() == 3, "unfiltered module receives all controllers");
}

void testDisableAndPanic() {
  RecordingSynth synth;
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = &synth;
  hook_keys::HookKeysEngine engine(modules);

  expect(engine.enqueueMidi(midi(0x90, 64, 110)), "queue note before disable");
  process(engine);
  hook_keys::ModuleConfig disabled;
  disabled.enabled = false;
  expect(engine.setModuleConfig(0, disabled), "disable module");
  process(engine);
  expect(synth.events.back().type == Event::Type::allNotesOff, "disabling a module releases its voices");

  expect(engine.stopAllNotes(), "queue panic");
  process(engine);
  expect(synth.events.back().type == Event::Type::allNotesOff, "panic reaches every module");
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
  expect(!engine.enqueueMidi(midi(0x90, 64, 100, 6)), "reject invalid MIDI input slot");
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

void testDefaultVolumeEnvelopes() {
  hook_keys::AnalogSynthConfig defaults;
  expect(defaults.attackMs == 0.0f && defaults.releaseMs == 90.0f, "Synth defaults to zero Attack and 90 ms Release");
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
  std::vector<float> tailLeft(4800, 0.0f);
  std::vector<float> tailRight(4800, 0.0f);
  synth.renderAdd(tailLeft.data(), tailRight.data(), tailLeft.size(), 1.0f);
  const auto tailEnd = std::find_if(tailLeft.rbegin(), tailLeft.rend(), [](float value) { return value != 0.0f; });
  const auto releaseFrames = static_cast<std::size_t>(std::distance(tailLeft.begin(), tailEnd.base()));
  expect(releaseFrames >= 4300 && releaseFrames <= 4330, "native Synth Release lasts 90 ms at 48 kHz");

  const auto renderSoundFont = [](bool explicitDefaults) {
    hook_keys::TinySoundFontModule sf2(48000.0, 128);
    if (explicitDefaults) sf2.setVolumeEnvelope(0.0f, 15000.0f, 25000.0f, 90.0f);
    expect(sf2.loadFromFile("third_party/TinySoundFont/examples/florestan-subset.sf2"), "load SF2 for envelope default test");
    sf2.beginBlock();
    sf2.noteOn(60, 127);
    std::array<std::vector<float>, 2> audio{std::vector<float>(8192), std::vector<float>(8192)};
    sf2.renderAdd(audio[0].data(), audio[1].data(), 2048, 1.0f);
    sf2.noteOff(60);
    sf2.renderAdd(audio[0].data() + 2048, audio[1].data() + 2048, 6144, 1.0f);
    return audio;
  };
  expect(renderSoundFont(false) == renderSoundFont(true), "SF2 receives the requested defaults on load even without a frontend configuration call");
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

  runtime.setOutputGainDb(-60.0f, true);
  runtime.render(left.data(), right.data(), left.size());
  const auto mutedEnergy = std::accumulate(left.begin(), left.end(), 0.0,
                                           [](double sum, float sample) { return sum + std::abs(sample); });
  expect(mutedEnergy == 0.0, "native runtime maps the minimum fader position to silence");
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
  small.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4);
  large.setMetronome(true, 120.0f, 1.0f, 1, false, false, 4);

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
  doubled.setMetronome(true, 120.0f, 1.0f, 1, false, true, 4);
  expect(metronomeOnsets(doubled, totalFrames, 256).size() == 8,
         "double time doubles the click rate");

  hook_keys::NativeEngineRuntime quiet(sampleRate, 512);
  quiet.setMetronome(true, 120.0f, 0.0f, 1, false, false, 4);
  expect(metronomeOnsets(quiet, totalFrames, 256).empty(), "zero volume silences the click");
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
  effects.setConfig(config, 120.0f);

  std::array<float, 8192> left{};
  std::array<float, 8192> right{};
  left[0] = right[0] = 1.0f;
  effects.process(left.data(), right.data(), left.size());
  double tailEnergy = 0.0;
  for (std::size_t index = 128; index < left.size(); ++index) tailEnergy += std::abs(left[index]);
  expect(tailEnergy > 0.01, "reverb creates an audible tail");
}

void testIndependentOscillatorVolumes() {
  const auto render = [](float volume1, float volume2, bool enabled1, bool enabled2) {
    hook_keys::AnalogSynthModule synth(48000.0);
    hook_keys::AnalogSynthConfig config;
    config.oscillator1 = 0;
    config.oscillator2 = 3;
    config.oscillator1Volume = volume1;
    config.oscillator2Volume = volume2;
    config.oscillator1Enabled = enabled1;
    config.oscillator2Enabled = enabled2;
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
  const auto firstOnly = render(1.0f, 0.8f, true, false);
  const auto secondOnly = render(0.8f, 1.0f, false, true);
  expect(energy(firstOnly) > 1.0 && energy(secondOnly) > 1.0, "each oscillator produces audio alone");
  expect(firstOnly == render(1.0f, 0.0f, true, true),
      "enabling a silent OSC 2 does not change OSC 1 gain");
  expect(secondOnly == render(0.0f, 1.0f, true, true),
      "enabling a silent OSC 1 does not change OSC 2 gain");
  const auto firstHalf = energy(render(0.5f, 1.0f, true, false));
  const auto secondHalf = energy(render(1.0f, 0.5f, false, true));
  expect(firstHalf > energy(firstOnly) * 0.49 && firstHalf < energy(firstOnly) * 0.53,
      "OSC 1 volume works even with OSC 2 switched off");
  expect(secondHalf > energy(secondOnly) * 0.49 && secondHalf < energy(secondOnly) * 0.53,
      "OSC 2 volume works even with OSC 1 switched off");
  expect(energy(render(0.0f, 0.0f, true, true)) == 0.0, "zero volume silences both oscillators");
  expect(energy(render(1.0f, 1.0f, false, false)) == 0.0, "ON/OFF silences independently of stored volume");
  expect(firstOnly == render(2.0f, -1.0f, true, true), "volume gains clamp to zero through unity");
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
}

void testIndependentOscillatorOctaves() {
  hook_keys::AnalogSynthConfig defaults;
  expect(defaults.oscillator1Octave == 0 && defaults.oscillator2Octave == 0, "both oscillators default to octave zero");
  defaults.oscillator1Octave = -10;
  defaults.oscillator2Octave = 10;
  defaults.normalize(48000.0);
  expect(defaults.oscillator1Octave == -3 && defaults.oscillator2Octave == 3, "oscillator octave bounds are -3 to +3");
  const auto render = [](int oscillator, int octave1, int octave2, int note) {
    hook_keys::AnalogSynthModule synth(48000.0);
    hook_keys::AnalogSynthConfig config;
    config.oscillator1 = config.oscillator2 = 0;
    config.oscillator1Enabled = oscillator == 1;
    config.oscillator2Enabled = oscillator == 2;
    config.oscillator1Octave = static_cast<std::int8_t>(octave1);
    config.oscillator2Octave = static_cast<std::int8_t>(octave2);
    config.detuneCents = config.glideMs = config.lfoDepth = config.filterEnvelope = 0.0f;
    expect(synth.setConfig(config), "queue independent oscillator octaves");
    synth.beginBlock();
    synth.noteOn(static_cast<std::uint8_t>(note), 100);
    std::vector<float> left(4800), right(4800);
    synth.renderAdd(left.data(), right.data(), left.size(), 1.0f);
    return left;
  };
  for (int oscillator = 1; oscillator <= 2; ++oscillator) {
    const auto base = render(oscillator, 0, 0, 60);
    expect(base == render(oscillator, oscillator == 1 ? 0 : 3, oscillator == 2 ? 0 : -3, 60),
        "octave of muted oscillator does not change the audible oscillator");
    for (int octave = -3; octave <= 3; ++octave) {
      const auto shifted = render(oscillator, oscillator == 1 ? octave : 0, oscillator == 2 ? octave : 0, 60);
      const auto reference = render(oscillator, 0, 0, 60 + octave * 12);
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

} // namespace

int main() {
  testRangeAndOctaveRouting();
  testKeyboardBroadcastRouting();
  testPatternGeneratorRouting();
  testMonoVoiceSteal();
  testPerModuleControllerFilters();
  testDisableAndPanic();
  testMidiInputRouting();
  testAllMidiInputsRouting();
  testConcurrentProducers();
  testTinySoundFontRendering();
  testDefaultVolumeEnvelopes();
  testNativeRuntimeSignalPath();
  testIndependentOscillatorVolumes();
  testIndependentOscillatorOctaves();
  testMetronomeRunsOnTheAudioCallback();
  testVelocityCurveMapping();
  testCutoffProcessing();
  testEqualizerProcessing();
  testEqualizerCutSlope();
  testCompressorProcessing();
  testDelayProcessing();
  testReverbProcessing();
  testRotarySpeakerProcessing();
  testRotaryMidiEngineRouting();
  std::cout << "Hook Keys engine tests passed\n";
  return EXIT_SUCCESS;
}
