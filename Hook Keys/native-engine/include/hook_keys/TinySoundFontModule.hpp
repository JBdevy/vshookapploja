#pragma once

#include "hook_keys/ModuleSynth.hpp"
#include "hook_keys/RealtimeCommandQueue.hpp"

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

struct tsf;

namespace hook_keys {

// One independently playable Hook Keys module backed by TinySoundFont.
// SoundFont parsing happens on a control/loader thread. The prepared synth is
// activated by beginBlock() without allocation, locks, or file access.
class TinySoundFontModule final : public ModuleSynth {
public:
  TinySoundFontModule(double sampleRate, std::size_t maximumBlockFrames, std::size_t maximumVoices = 64);
  ~TinySoundFontModule() override;

  TinySoundFontModule(const TinySoundFontModule&) = delete;
  TinySoundFontModule& operator=(const TinySoundFontModule&) = delete;

  // Control/loader thread only. A successful load becomes active on the next
  // audio block. Calling this never blocks the audio callback.
  [[nodiscard]] bool loadFromFile(const char* utf8Path) noexcept;
  [[nodiscard]] bool loadFromMemory(const void* data, std::size_t size) noexcept;
  void unload() noexcept;
  void collectRetiredSoundFonts() noexcept;
  void setVolumeEnvelope(float attackMs, float holdMs, float decayMs, float releaseMs) noexcept;

  [[nodiscard]] bool hasPendingSoundFont() const noexcept;

  // Audio thread only.
  void beginBlock() noexcept override;
  void noteOn(std::uint8_t note, std::uint8_t velocity) noexcept override;
  void noteOff(std::uint8_t note) noexcept override;
  void controlChange(std::uint8_t controller, std::uint8_t value) noexcept override;
  void pitchBend(std::uint16_t value) noexcept override;
  void allNotesOff() noexcept override;
  void renderAdd(float* left, float* right, std::size_t frames, float gainLinear) noexcept override;

private:
  void stage(tsf* prepared) noexcept;
  [[nodiscard]] bool configure(tsf* synth) const noexcept;
  [[nodiscard]] static tsf* unloadMarker() noexcept;

  double sampleRate_ = 48000.0;
  std::size_t maximumBlockFrames_ = 0;
  int maximumVoices_ = 64;
  std::vector<float> scratchInterleaved_;

  tsf* active_ = nullptr;
  tsf* deferredRetired_ = nullptr;
  std::atomic<tsf*> pending_{nullptr};
  std::atomic<float> attackMs_{-1.0f};
  std::atomic<float> holdMs_{-1.0f};
  std::atomic<float> decayMs_{-1.0f};
  std::atomic<float> releaseMs_{-1.0f};
  std::atomic<std::uint32_t> envelopeGeneration_{0};
  std::uint32_t appliedEnvelopeGeneration_ = 0;
  RealtimeCommandQueue<tsf*, 64> retired_{};
};

} // namespace hook_keys
