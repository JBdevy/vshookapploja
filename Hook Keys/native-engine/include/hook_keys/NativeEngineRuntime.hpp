#pragma once

#include "hook_keys/HookKeysEngine.hpp"
#include "hook_keys/TinySoundFontModule.hpp"

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>

namespace hook_keys {

// Platform-neutral owner used by the Android and iOS audio callbacks.
// File loading stays on a control thread; render() is the only audio-thread API.
class NativeEngineRuntime final {
public:
  explicit NativeEngineRuntime(double sampleRate, std::size_t maximumBlockFrames = 512);
  ~NativeEngineRuntime();

  NativeEngineRuntime(const NativeEngineRuntime&) = delete;
  NativeEngineRuntime& operator=(const NativeEngineRuntime&) = delete;

  [[nodiscard]] bool loadSoundFont(std::size_t moduleIndex, const char* utf8Path) noexcept;
  void unloadSoundFont(std::size_t moduleIndex) noexcept;
  void collectRetiredSoundFonts() noexcept;

  [[nodiscard]] bool sendMidi(
      std::uint8_t inputSlot,
      std::uint8_t status,
      std::uint8_t data1,
      std::uint8_t data2,
      std::uint64_t timestampNanoseconds = 0) noexcept;
  [[nodiscard]] bool setModuleConfig(std::size_t moduleIndex, ModuleConfig config) noexcept;
  [[nodiscard]] bool setModuleEffects(std::size_t moduleIndex, ModuleEffectsConfig effects) noexcept;
  [[nodiscard]] bool setModuleEnvelope(
      std::size_t moduleIndex, float attackMs, float holdMs,
      float decayMs, float releaseMs) noexcept;
  [[nodiscard]] bool setTempo(float bpm) noexcept;
  void setOutputGainDb(float db, bool enabled) noexcept;
  void stopAllNotes() noexcept;
  void render(float* left, float* right, std::size_t frames) noexcept;

  [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }
  [[nodiscard]] std::size_t maximumBlockFrames() const noexcept { return maximumBlockFrames_; }

private:
  static HookKeysEngine::SynthModules modulePointers(
      const std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount>& modules) noexcept;

  double sampleRate_ = 48000.0;
  std::size_t maximumBlockFrames_ = 512;
  std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount> modules_{};
  std::unique_ptr<HookKeysEngine> engine_;
  std::array<ModuleConfig, kModuleCount> configs_{};
  std::mutex configMutex_;
  std::atomic<float> outputGainLinear_{1.0f};
};

} // namespace hook_keys
