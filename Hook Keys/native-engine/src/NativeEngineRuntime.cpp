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
  EngineSettings settings;
  settings.sampleRate = sampleRate_;
  settings.maximumBlockFrames = maximumBlockFrames_;
  engine_ = std::make_unique<HookKeysEngine>(modulePointers(modules_), settings);
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

bool NativeEngineRuntime::setTempo(float bpm) noexcept {
  return engine_ != nullptr && engine_->setTempoBpm(bpm);
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
  const auto gain = outputGainLinear_.load(std::memory_order_acquire);
  if (gain == 1.0f) return;
  for (std::size_t index = 0; index < frames; ++index) {
    left[index] *= gain;
    right[index] *= gain;
  }
}

HookKeysEngine::SynthModules NativeEngineRuntime::modulePointers(
    const std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount>& modules) noexcept {
  HookKeysEngine::SynthModules pointers{};
  for (std::size_t index = 0; index < modules.size(); ++index) pointers[index] = modules[index].get();
  return pointers;
}

} // namespace hook_keys
