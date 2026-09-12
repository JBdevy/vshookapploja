#include "hook_keys/HookKeysEngine.hpp"
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
  testNativeRuntimeSignalPath();
  testMetronomeRunsOnTheAudioCallback();
  testVelocityCurveMapping();
  testCutoffProcessing();
  testEqualizerProcessing();
  testEqualizerCutSlope();
  testCompressorProcessing();
  testDelayProcessing();
  testReverbProcessing();
  std::cout << "Hook Keys engine tests passed\n";
  return EXIT_SUCCESS;
}
