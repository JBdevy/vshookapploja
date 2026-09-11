#pragma once

#include <algorithm>
#include <array>
#include <cstdint>

namespace hook_keys {

enum class EqBandType : std::uint8_t {
  lowCut,
  lowShelf,
  bell,
  highShelf,
  highCut,
};

struct EqBandConfig final {
  bool enabled = true;
  EqBandType type = EqBandType::bell;
  float frequencyHz = 1000.0f;
  float gainDb = 0.0f;
  float quality = 0.7071f;
  std::uint8_t cutStages = 1;

  void normalize() noexcept {
    frequencyHz = std::clamp(frequencyHz, 10.0f, 20000.0f);
    gainDb = std::clamp(gainDb, -24.0f, 24.0f);
    quality = std::clamp(quality, 0.1f, 12.0f);
    cutStages = std::clamp<std::uint8_t>(cutStages, 1, 8);
  }
};

struct EqConfig final {
  bool enabled = false;
  std::array<EqBandConfig, 5> bands{{
      {true, EqBandType::lowCut, 30.0f, 0.0f, 0.7071f, 1},
      {true, EqBandType::bell, 250.0f, 0.0f, 0.7071f, 1},
      {true, EqBandType::bell, 1000.0f, 0.0f, 0.7071f, 1},
      {true, EqBandType::bell, 4000.0f, 0.0f, 0.7071f, 1},
      {true, EqBandType::highCut, 18000.0f, 0.0f, 0.7071f, 1},
  }};

  void normalize() noexcept {
    for (auto& band : bands) band.normalize();
  }
};

struct CutoffConfig final {
  bool enabled = true;
  float frequencyHz = 20000.0f;

  void normalize() noexcept {
    frequencyHz = std::clamp(frequencyHz, 10.0f, 20000.0f);
  }
};

struct CompressorConfig final {
  bool enabled = false;
  float thresholdDb = -18.0f;
  float ratio = 4.0f;
  float attackMs = 10.0f;
  float releaseMs = 160.0f;
  float outputGainDb = 0.0f;
  float mix = 1.0f;

  void normalize() noexcept {
    thresholdDb = std::clamp(thresholdDb, -60.0f, 0.0f);
    ratio = std::clamp(ratio, 1.0f, 20.0f);
    attackMs = std::clamp(attackMs, 0.1f, 250.0f);
    releaseMs = std::clamp(releaseMs, 5.0f, 3000.0f);
    outputGainDb = std::clamp(outputGainDb, -24.0f, 24.0f);
    mix = std::clamp(mix, 0.0f, 1.0f);
  }
};

struct DelayConfig final {
  bool enabled = false;
  bool sync = false;
  float delayMs = 375.0f;
  float beatMultiplier = 0.75f;
  float feedback = 0.30f;
  float mix = 0.20f;

  void normalize() noexcept {
    delayMs = std::clamp(delayMs, 1.0f, 4000.0f);
    beatMultiplier = std::clamp(beatMultiplier, 0.0625f, 4.0f);
    feedback = std::clamp(feedback, 0.0f, 0.95f);
    mix = std::clamp(mix, 0.0f, 1.0f);
  }
};

struct ReverbConfig final {
  bool enabled = false;
  float decay = 0.50f;
  float dampen = 0.45f;
  float size = 0.50f;
  float mix = 0.20f;

  void normalize() noexcept {
    decay = std::clamp(decay, 0.0f, 1.0f);
    dampen = std::clamp(dampen, 0.0f, 1.0f);
    size = std::clamp(size, 0.0f, 1.0f);
    mix = std::clamp(mix, 0.0f, 1.0f);
  }
};

struct ModuleEffectsConfig final {
  CutoffConfig cutoff{};
  EqConfig equalizer{};
  CompressorConfig compressor{};
  DelayConfig delay{};
  ReverbConfig reverb{};

  void normalize() noexcept {
    cutoff.normalize();
    equalizer.normalize();
    compressor.normalize();
    delay.normalize();
    reverb.normalize();
  }
};

} // namespace hook_keys
