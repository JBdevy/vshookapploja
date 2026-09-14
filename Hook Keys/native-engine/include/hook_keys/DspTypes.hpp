#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <cmath>

namespace hook_keys {

// How a module's Glide starts each note. Auto: every note rises from one whole
// tone below itself. Portamento: every note slides from the previous note.
// The velocity gate turns Glide off by raw key velocity: from the threshold up,
// or (inverted) below the threshold.
struct GlideBehavior final {
  bool portamento = false;
  bool velocityGateEnabled = false;
  bool velocityGateInverted = false;
  std::uint8_t velocityThreshold = 64;

  [[nodiscard]] bool glidesAt(std::uint8_t velocity) const noexcept {
    if (!velocityGateEnabled) return true;
    return velocityGateInverted ? velocity >= velocityThreshold : velocity < velocityThreshold;
  }

  // Packed so the audio thread reads the whole behavior in one atomic load.
  [[nodiscard]] std::uint16_t pack() const noexcept {
    return static_cast<std::uint16_t>((portamento ? 1 : 0) | (velocityGateEnabled ? 2 : 0) |
        (velocityGateInverted ? 4 : 0) | (std::min<int>(velocityThreshold, 127) << 3));
  }
  [[nodiscard]] static GlideBehavior unpack(std::uint16_t bits) noexcept {
    GlideBehavior behavior;
    behavior.portamento = (bits & 1) != 0;
    behavior.velocityGateEnabled = (bits & 2) != 0;
    behavior.velocityGateInverted = (bits & 4) != 0;
    behavior.velocityThreshold = static_cast<std::uint8_t>((bits >> 3) & 127);
    return behavior;
  }
};

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
      {true, EqBandType::lowShelf, 80.0f, 0.0f, 0.7071f, 1},
      {true, EqBandType::bell, 250.0f, 0.0f, 0.7071f, 1},
      {true, EqBandType::bell, 1000.0f, 0.0f, 0.7071f, 1},
      {true, EqBandType::bell, 4000.0f, 0.0f, 0.7071f, 1},
      {true, EqBandType::highShelf, 12000.0f, 0.0f, 0.7071f, 1},
  }};

  void normalize() noexcept {
    for (auto& band : bands) band.normalize();
  }
};

struct CutoffConfig final {
  bool enabled = true;
  float frequencyHz = 20000.0f;
  std::array<std::uint8_t, 5> velocityCurve{{127, 127, 127, 127, 127}};

  void normalize() noexcept {
    frequencyHz = std::clamp(frequencyHz, 10.0f, 20000.0f);
  }

  float frequencyForVelocity(std::uint8_t velocity) const noexcept {
    if (!enabled) return 20000.0f;
    const float position = std::min<int>(velocity, 127) * 4.0f / 127.0f;
    const auto lower = static_cast<std::size_t>(std::min(3.0f, std::floor(position)));
    const float mapped = velocityCurve[lower] +
        (static_cast<float>(velocityCurve[lower + 1]) - velocityCurve[lower]) * (position - static_cast<float>(lower));
    return 20.0f * std::pow(std::clamp(frequencyHz, 20.0f, 20000.0f) / 20.0f, mapped / 127.0f);
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
  float beatMultiplier = 1.0f; // 1/4: the delay time itself
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

struct RotaryConfig final {
  bool enabled = false;
  std::uint8_t speed = 1; // brake, slow, fast
  float slowHz = 0.8f;
  float fastHz = 6.4f;
  float rampSeconds = 1.2f;
  float depth = 0.7f;
  float mix = 1.0f;
  bool modulationEnabled = false;

  void normalize() noexcept {
    speed = std::min<std::uint8_t>(speed, 2);
    slowHz = std::clamp(slowHz, 0.2f, 2.0f);
    fastHz = std::clamp(fastHz, 2.0f, 10.0f);
    rampSeconds = std::clamp(rampSeconds, 0.1f, 10.0f);
    depth = std::clamp(depth, 0.0f, 1.0f);
    mix = std::clamp(mix, 0.0f, 1.0f);
  }
};

struct ModuleEffectsConfig final {
  struct TranceGateConfig final {
    bool enabled = false;
    std::uint16_t steps = 0xffff;
    std::uint8_t length = 16;
    float beatMultiplier = 0.25f;
    float gate = 0.5f;
    float depth = 1.0f;
    float attackMs = 3.0f;
    float releaseMs = 3.0f;
    float swing = 0.0f;
    void normalize() noexcept {
      length = std::clamp<std::uint8_t>(length, 1, 16);
      beatMultiplier = std::clamp(beatMultiplier, 0.0625f, 4.0f);
      gate = std::clamp(gate, 0.05f, 1.0f);
      depth = std::clamp(depth, 0.0f, 1.0f);
      attackMs = std::clamp(attackMs, 0.1f, 100.0f);
      releaseMs = std::clamp(releaseMs, 0.1f, 100.0f);
      swing = std::clamp(swing, 0.0f, 0.75f);
    }
  } tranceGate{};
  CutoffConfig cutoff{};
  EqConfig equalizer{};
  CompressorConfig compressor{};
  DelayConfig delay{};
  ReverbConfig reverb{};
  RotaryConfig rotary{};

  void normalize() noexcept {
    cutoff.normalize();
    equalizer.normalize();
    compressor.normalize();
    delay.normalize();
    reverb.normalize();
    rotary.normalize();
    tranceGate.normalize();
  }
};

} // namespace hook_keys
