// Standalone offline diagnostic. Supply one or more real SF2 filenames.
// Link against HookKeysEngine.cpp, ModuleEffects.cpp, TinySoundFontModule.cpp,
// and TinySoundFontImplementation.cpp. No audio device or app state is touched.
// A rendered chord is compared against the sum of its independently rendered
// notes, over a long hold, note releases, repeated chords and sustain pedal.
#include "hook_keys/HookKeysEngine.hpp"
#include "hook_keys/TinySoundFontModule.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <vector>

namespace {
constexpr std::array<unsigned char, 6> notes{48, 52, 55, 60, 64, 67};
constexpr double durationSeconds = 48.0;

struct Event { std::size_t frame; unsigned char status, note, value; int lane; };

std::vector<Event> score(double sampleRate) {
  std::vector<Event> result;
  const auto add = [&](double time, unsigned char status, unsigned char key,
                       unsigned char value, int lane = -1) {
    result.push_back({static_cast<std::size_t>(std::llround(time * sampleRate)), status, key, value, lane});
  };
  const auto chord = [&](double time, bool down) {
    for (int lane = 0; lane < static_cast<int>(notes.size()); ++lane)
      add(time, down ? 0x90 : 0x80, notes[lane], down ? 100 : 0, lane);
  };
  chord(0.0, true);
  chord(41.0, false); // crosses default hold and decay boundaries
  for (int repetition = 0; repetition < 12; ++repetition) {
    const double time = 42.0 + repetition * 0.25;
    chord(time, true);
    chord(time + 0.12, false);
  }
  add(45.1, 0xb0, 64, 127);
  chord(45.2, true);
  chord(45.3, false);
  add(46.0, 0xb0, 64, 0);
  // Repetition after pedal release isolates premature voice loss from the
  // engine's explicit same-key pedal-retrigger policy.
  chord(46.1, true);
  chord(46.3, false);
  std::stable_sort(result.begin(), result.end(), [](const Event& a, const Event& b) { return a.frame < b.frame; });
  return result;
}

class TrackedSynth final : public hook_keys::ModuleSynth {
public:
  explicit TrackedSynth(hook_keys::TinySoundFontModule& instance) : instance(instance) {}
  void beginBlock() noexcept override { instance.beginBlock(); }
  void noteOn(std::uint8_t key, std::uint8_t velocity) noexcept override { ++ons; instance.noteOn(key, velocity); }
  void noteOff(std::uint8_t key) noexcept override { ++offs; instance.noteOff(key); }
  void stealNote(std::uint8_t key) noexcept override { ++steals; instance.stealNote(key); }
  void controlChange(std::uint8_t cc, std::uint8_t value) noexcept override { instance.controlChange(cc, value); }
  void pitchBend(std::uint16_t value) noexcept override { instance.pitchBend(value); }
  void allNotesOff() noexcept override { ++panics; instance.allNotesOff(); }
  bool hasActiveVoices() const noexcept override { return instance.hasActiveVoices(); }
  bool isVoicePoolNearlyFull() const noexcept override { return instance.isVoicePoolNearlyFull(); }
  bool canSkipRenderingWhenIdle() const noexcept override { return true; }
  void renderAdd(float* left, float* right, std::size_t frames, float gain) noexcept override { instance.renderAdd(left, right, frames, gain); }
  hook_keys::TinySoundFontModule& instance;
  std::size_t ons = 0, offs = 0, steals = 0, panics = 0;
};

struct Result {
  std::vector<float> left, right;
  std::size_t ons = 0, offs = 0, steals = 0, panics = 0, dropped = 0;
};

Result render(const hook_keys::TinySoundFontModule& source, double rate,
              const std::vector<std::size_t>& pattern, bool separate) {
  const auto capacity = *std::max_element(pattern.begin(), pattern.end());
  std::vector<std::unique_ptr<hook_keys::TinySoundFontModule>> synths;
  for (std::size_t lane = 0; lane < (separate ? notes.size() : 1); ++lane) {
    auto synth = std::make_unique<hook_keys::TinySoundFontModule>(rate, capacity);
    if (!synth->copySoundFontFrom(source)) throw std::runtime_error("clone failed");
    synth->setVolumeEnvelope(0.0f, 15000.0f, 25000.0f, 300.0f);
    synth->beginBlock();
    synths.push_back(std::move(synth));
  }
  auto tracked = std::make_unique<TrackedSynth>(*synths[0]);
  hook_keys::HookKeysEngine::SynthModules modules{};
  modules[0] = tracked.get();
  auto engine = std::make_unique<hook_keys::HookKeysEngine>(modules, hook_keys::EngineSettings{rate, capacity, 120.0f});
  hook_keys::ModuleConfig config;
  config.effects.cutoff.enabled = false;
  config.velocityCurve.fill(100);
  if (!engine->setModuleConfig(0, config)) throw std::runtime_error("config rejected");

  Result result;
  const auto total = static_cast<std::size_t>(rate * durationSeconds);
  result.left.resize(total);
  result.right.resize(total);
  const auto events = score(rate);
  std::size_t cursor = 0, eventIndex = 0, patternIndex = 0;
  while (cursor < total) {
    while (eventIndex < events.size() && events[eventIndex].frame == cursor) {
      const auto& event = events[eventIndex++];
      if (!separate) {
        if (!engine->enqueueMidi({event.status, event.note, event.value, 0, 0})) ++result.dropped;
      } else {
        for (int lane = 0; lane < static_cast<int>(synths.size()); ++lane) {
          if (event.lane >= 0 && event.lane != lane) continue;
          if (event.status == 0x90) synths[lane]->noteOn(event.note, event.value);
          else if (event.status == 0x80) synths[lane]->noteOff(event.note);
          else synths[lane]->controlChange(event.note, event.value);
        }
      }
    }
    auto frames = std::min(pattern[patternIndex++ % pattern.size()], total - cursor);
    if (eventIndex < events.size()) frames = std::min(frames, events[eventIndex].frame - cursor);
    if (separate) {
      for (auto& synth : synths) {
        synth->beginBlock();
        synth->renderAdd(result.left.data() + cursor, result.right.data() + cursor, frames, 1.0f);
      }
    } else engine->render(result.left.data() + cursor, result.right.data() + cursor, frames);
    cursor += frames;
  }
  result.ons = tracked->ons;
  result.offs = tracked->offs;
  result.steals = tracked->steals;
  result.panics = tracked->panics;
  result.dropped += engine->droppedCommandCount();
  return result;
}

struct Difference { double max = 0, relativeRms = 0; std::size_t missingWindows = 0; };
Difference compare(const Result& actual, const Result& expected, double rate) {
  Difference result;
  double error = 0, energy = 0, actualWindow = 0, expectedWindow = 0;
  const auto window = static_cast<std::size_t>(rate / 100); // 10 ms holes
  for (std::size_t i = 0; i < actual.left.size(); ++i) {
    const double dl = actual.left[i] - expected.left[i], dr = actual.right[i] - expected.right[i];
    result.max = std::max({result.max, std::abs(dl), std::abs(dr)});
    error += dl * dl + dr * dr;
    const auto e = static_cast<double>(expected.left[i]) * expected.left[i] + static_cast<double>(expected.right[i]) * expected.right[i];
    energy += e;
    expectedWindow += e;
    actualWindow += static_cast<double>(actual.left[i]) * actual.left[i] + static_cast<double>(actual.right[i]) * actual.right[i];
    if ((i + 1) % window == 0) {
      if (expectedWindow > 1.0e-7 && actualWindow < expectedWindow * 0.25) ++result.missingWindows;
      actualWindow = expectedWindow = 0;
    }
  }
  result.relativeRms = std::sqrt(error / std::max(energy, 1.0e-30));
  return result;
}
}

int main(int argc, char** argv) {
  if (argc < 2) { std::cerr << "Usage: SoundFontContinuityDiagnostic file.sf2 [...]\n"; return 2; }
  bool failed = false;
  std::cout << std::setprecision(7) << std::unitbuf;
  for (int file = 1; file < argc; ++file) {
    hook_keys::TinySoundFontModule source(48000, 512);
    if (!source.loadFromFile(argv[file])) { std::cerr << "LOAD_FAILED " << argv[file] << '\n'; return 2; }
    std::cout << "FILE " << argv[file] << " shared_sample_bytes=" << source.sampleBytes() << '\n';
    for (const double rate : {44100.0, 48000.0, 96000.0}) {
      const auto baseline = render(source, rate, {64}, false);
      const std::vector<std::vector<std::size_t>> patterns{{64}, {128}, {256}, {512}, {93, 141, 287, 509}, {17, 631, 2, 1021}};
      for (const auto& pattern : patterns) {
        const auto actual = render(source, rate, pattern, false);
        const auto separate = render(source, rate, pattern, true);
        const auto sum = compare(actual, separate, rate);
        const auto block = compare(actual, baseline, rate);
        std::cout << "RATE " << rate << " BLOCKS";
        for (auto frames : pattern) std::cout << ':' << frames;
        std::cout << " noteOn=" << actual.ons << " noteOff=" << actual.offs
                  << " steals=" << actual.steals << " panics=" << actual.panics << " queueLost=" << actual.dropped
                  << " sum_max=" << sum.max << " sum_relative=" << sum.relativeRms << " sum_holes=" << sum.missingWindows
                  << " block_max=" << block.max << " block_relative=" << block.relativeRms << " block_holes=" << block.missingWindows << '\n';
        failed |= sum.relativeRms > 0.001 || sum.missingWindows > 0 || actual.steals > 0 || actual.dropped > 0 || block.missingWindows > 0;
      }
    }
  }
  std::cout << (failed ? "DIAGNOSTIC_REQUIRES_REVIEW\n" : "SF2_CONTINUITY_OK\n");
  return failed ? 1 : 0;
}
