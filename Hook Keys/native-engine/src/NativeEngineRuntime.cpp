#include "hook_keys/NativeEngineRuntime.hpp"

#include <algorithm>
#include <cmath>

namespace hook_keys {

NativeEngineRuntime::NativeEngineRuntime(double sampleRate, std::size_t maximumBlockFrames)
    : sampleRate_(std::clamp(sampleRate, 8000.0, 384000.0)),
      maximumBlockFrames_(std::clamp<std::size_t>(maximumBlockFrames, 16, 8192)) {
  for (auto& module : modules_) {
    module = std::make_unique<TinySoundFontModule>(sampleRate_, maximumBlockFrames_);
  }
  synth_ = std::make_unique<AnalogSynthModule>(sampleRate_);
  EngineSettings settings;
  settings.sampleRate = sampleRate_;
  settings.maximumBlockFrames = maximumBlockFrames_;
  engine_ = std::make_unique<HookKeysEngine>(modulePointers(modules_, synth_.get()), settings);
  // O Synth não depende de SF2 e portanto já consegue produzir áudio assim
  // que o runtime nasce. Mantenha-o mudo até a interface enviar o estado do
  // módulo 8, como já acontece naturalmente com os módulos sem timbre.
  configs_[kModuleCount - 1].enabled = false;
  (void)engine_->setModuleConfig(kModuleCount - 1, configs_[kModuleCount - 1]);
}

NativeEngineRuntime::~NativeEngineRuntime() {
  stopAllNotes();
  engine_.reset();
  collectRetiredSoundFonts();
}

bool NativeEngineRuntime::loadSoundFont(std::size_t moduleIndex, const char* utf8Path) noexcept {
  return moduleIndex < modules_.size() && modules_[moduleIndex] != nullptr &&
         modules_[moduleIndex]->loadFromFile(utf8Path);
}

void NativeEngineRuntime::unloadSoundFont(std::size_t moduleIndex) noexcept {
  if (moduleIndex < modules_.size() && modules_[moduleIndex] != nullptr) modules_[moduleIndex]->unload();
}

void NativeEngineRuntime::collectRetiredSoundFonts() noexcept {
  for (auto& module : modules_) {
    if (module != nullptr) module->collectRetiredSoundFonts();
  }
}

bool NativeEngineRuntime::sendMidi(
    std::uint8_t inputSlot,
    std::uint8_t status,
    std::uint8_t data1,
    std::uint8_t data2,
    std::uint64_t timestampNanoseconds) noexcept {
  return engine_ != nullptr && engine_->enqueueMidi({status, data1, data2, inputSlot, timestampNanoseconds});
}

bool NativeEngineRuntime::setModuleConfig(std::size_t moduleIndex, ModuleConfig config) noexcept {
  if (engine_ == nullptr || moduleIndex >= configs_.size()) return false;
  std::scoped_lock lock(configMutex_);
  config.effects = configs_[moduleIndex].effects;
  config.normalize();
  configs_[moduleIndex] = config;
  return engine_->setModuleConfig(moduleIndex, config);
}

bool NativeEngineRuntime::setModuleEffects(
    std::size_t moduleIndex, ModuleEffectsConfig effects) noexcept {
  if (engine_ == nullptr || moduleIndex >= configs_.size()) return false;
  std::scoped_lock lock(configMutex_);
  effects.normalize();
  configs_[moduleIndex].effects = effects;
  return engine_->setModuleConfig(moduleIndex, configs_[moduleIndex]);
}

bool NativeEngineRuntime::setModuleEnvelope(
    std::size_t moduleIndex, float attackMs, float holdMs,
    float decayMs, float releaseMs) noexcept {
  if (moduleIndex >= modules_.size() || modules_[moduleIndex] == nullptr) return false;
  modules_[moduleIndex]->setVolumeEnvelope(attackMs, holdMs, decayMs, releaseMs);
  return true;
}

bool NativeEngineRuntime::setSynthConfig(AnalogSynthConfig config) noexcept {
  return synth_ != nullptr && synth_->setConfig(config);
}

bool NativeEngineRuntime::setTempo(float bpm) noexcept {
  return engine_ != nullptr && engine_->setTempoBpm(bpm);
}

void NativeEngineRuntime::setMetronome(
    bool enabled, float bpm, float volume, std::uint8_t clickSound,
    bool accentEnabled, bool doubleTimeEnabled,
    std::uint8_t timeSignatureNumerator) noexcept {
  metronomeBpm_.store(std::clamp(bpm, 60.0f, 600.0f), std::memory_order_release);
  metronomeVolume_.store(std::clamp(volume, 0.0f, 1.0f), std::memory_order_release);
  metronomeClickSound_.store(
      static_cast<std::uint8_t>(std::clamp<int>(clickSound, 1, 3)),
      std::memory_order_release);
  metronomeAccentEnabled_.store(accentEnabled, std::memory_order_release);
  metronomeDoubleTimeEnabled_.store(doubleTimeEnabled, std::memory_order_release);
  metronomeNumerator_.store(
      static_cast<std::uint8_t>(std::clamp<int>(timeSignatureNumerator, 1, 16)),
      std::memory_order_release);
  metronomeEnabled_.store(enabled, std::memory_order_release);
}

void NativeEngineRuntime::setOutputGainDb(float db, bool enabled) noexcept {
  outputGainLinear_.store(
      enabled && db > -60.0f ? std::pow(10.0f, std::clamp(db, -60.0f, 6.0f) / 20.0f) : 0.0f,
      std::memory_order_release);
}

void NativeEngineRuntime::stopAllNotes() noexcept {
  if (engine_ != nullptr) static_cast<void>(engine_->stopAllNotes());
}

void NativeEngineRuntime::render(float* left, float* right, std::size_t frames) noexcept {
  if (engine_ == nullptr) return;
  engine_->render(left, right, frames);
  addMetronome(left, right, frames);
  const auto gain = outputGainLinear_.load(std::memory_order_acquire);
  if (gain == 1.0f) return;
  for (std::size_t index = 0; index < frames; ++index) {
    left[index] *= gain;
    right[index] *= gain;
  }
}

void NativeEngineRuntime::renderInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept {
  if (engine_ == nullptr || output == nullptr) return;
  engine_->renderInterleaved(output, frames, channels);
  addMetronomeInterleaved(output, frames, channels);
  const auto gain = outputGainLinear_.load(std::memory_order_acquire);
  if (gain == 1.0f) return;
  for (std::size_t index = 0; index < frames * channels; ++index) output[index] *= gain;
}

// Reads the control-thread state once per block: the click keeps its own frame
// clock, so its timing never depends on how often the interface calls back.
bool NativeEngineRuntime::beginMetronomeBlock() noexcept {
  if (!metronomeEnabled_.load(std::memory_order_acquire)) {
    metronomeWasEnabled_ = false;
    metronomeClickFrame_ = 0;
    metronomeClickLength_ = 0;
    return false;
  }
  if (!metronomeWasEnabled_) {
    metronomeWasEnabled_ = true;
    metronomeFramesUntilBeat_ = 0.0;
    metronomeBeatIndex_ = 0;
  }
  return true;
}

void NativeEngineRuntime::addMetronome(
    float* left, float* right, std::size_t frames) noexcept {
  if (left == nullptr || right == nullptr || frames == 0) return;
  if (!beginMetronomeBlock()) return;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto sample = renderMetronomeSample();
    left[frame] += sample;
    right[frame] += sample;
  }
}

void NativeEngineRuntime::addMetronomeInterleaved(
    float* output, std::size_t frames, std::size_t channels) noexcept {
  if (output == nullptr || frames == 0 || channels == 0) return;
  if (!beginMetronomeBlock()) return;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto sample = renderMetronomeSample();
    auto* destination = output + frame * channels;
    destination[0] += sample;
    if (channels > 1) destination[1] += sample;
  }
}

float NativeEngineRuntime::renderMetronomeSample() noexcept {
  constexpr double kPi = 3.14159265358979323846;
  if (metronomeFramesUntilBeat_ <= 0.0) {
    const auto sound = metronomeClickSound_.load(std::memory_order_acquire);
    const auto accented = metronomeAccentEnabled_.load(std::memory_order_acquire) &&
                          metronomeBeatIndex_ == 0;
    const float baseFrequency = sound == 2 ? 1900.0f : sound == 3 ? 760.0f : 1350.0f;
    const float duration = sound == 2 ? 0.032f : sound == 3 ? 0.072f : 0.045f;
    metronomeClickFrequency_ = baseFrequency * (accented ? 1.28f : 1.0f);
    metronomeClickAmplitude_ = (accented ? 0.56f : 0.42f) *
        metronomeVolume_.load(std::memory_order_acquire);
    metronomeClickWaveform_ = sound;
    metronomeClickFrame_ = 0;
    metronomeClickLength_ = std::max<std::size_t>(
        1, static_cast<std::size_t>(sampleRate_ * duration));

    const auto bpm = static_cast<double>(
        metronomeBpm_.load(std::memory_order_acquire));
    const auto speed = metronomeDoubleTimeEnabled_.load(std::memory_order_acquire) ? 2.0 : 1.0;
    metronomeFramesUntilBeat_ += sampleRate_ * 60.0 / bpm / speed;
    const auto beatsPerMeasure = static_cast<std::size_t>(
        metronomeNumerator_.load(std::memory_order_acquire)) *
        (speed > 1.0 ? 2u : 1u);
    metronomeBeatIndex_ = (metronomeBeatIndex_ + 1) %
        std::max<std::size_t>(1, beatsPerMeasure);
  }
  metronomeFramesUntilBeat_ -= 1.0;

  if (metronomeClickFrame_ >= metronomeClickLength_) return 0.0f;
  const auto frame = static_cast<double>(metronomeClickFrame_++);
  const auto length = static_cast<double>(metronomeClickLength_);
  const auto time = frame / sampleRate_;
  const auto phase = 2.0 * kPi * static_cast<double>(metronomeClickFrequency_) * time;
  const auto attackFrames = std::max(1.0, sampleRate_ * 0.0015);
  const auto attack = std::min(1.0, frame / attackFrames);
  const auto decay = std::exp(-7.0 * frame / length);
  const auto oscillator = metronomeClickWaveform_ == 2
      ? (std::sin(phase) >= 0.0 ? 1.0 : -1.0)
      : metronomeClickWaveform_ == 3
          ? (2.0 / kPi) * std::asin(std::sin(phase))
          : std::sin(phase);
  return static_cast<float>(oscillator * attack * decay) * metronomeClickAmplitude_;
}

HookKeysEngine::SynthModules NativeEngineRuntime::modulePointers(
    const std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount - 1>& modules,
    AnalogSynthModule* synth) noexcept {
  HookKeysEngine::SynthModules pointers{};
  for (std::size_t index = 0; index < modules.size(); ++index) pointers[index] = modules[index].get();
  pointers[kModuleCount - 1] = synth;
  return pointers;
}

} // namespace hook_keys
