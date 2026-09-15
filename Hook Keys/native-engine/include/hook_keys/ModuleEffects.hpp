#pragma once

#include "hook_keys/DspTypes.hpp"

#include <array>
#include <cstddef>
#include <vector>

namespace hook_keys {

struct ModuleProcessorLevels final {
  float compressorInput = 0.0f;
  float compressorOutput = 0.0f;
};

class ModuleEffects final {
public:
  ModuleEffects() = default;

  // Call before starting audio. All delay, reverb and rotary memory is allocated here.
  void prepare(double sampleRate);
  void reset() noexcept;

  // Audio thread only. These operations are bounded and never allocate.
  void setConfig(ModuleEffectsConfig config, float tempoBpm) noexcept;
  void setTempo(float tempoBpm) noexcept;
  void setModulation(std::uint8_t value) noexcept;
  void triggerTranceGate() noexcept;
  ModuleProcessorLevels process(
      float* left, float* right, std::size_t frames,
      bool captureCompressorLevels = false) noexcept;
  [[nodiscard]] bool requiresSilentProcessing() const noexcept {
    // Delay e Reverb precisam continuar depois do Note Off para renderizar a cauda.
    // Os demais processadores não produzem áudio a partir de silêncio.
    return config_.delay.enabled || config_.reverb.enabled;
  }

private:
  struct Biquad final {
    float b0 = 1.0f;
    float b1 = 0.0f;
    float b2 = 0.0f;
    float a1 = 0.0f;
    float a2 = 0.0f;
    float z1Left = 0.0f;
    float z2Left = 0.0f;
    float z1Right = 0.0f;
    float z2Right = 0.0f;
    bool enabled = false;

    void configure(const EqBandConfig& config, double sampleRate) noexcept;
    void reset() noexcept;
    void process(float& left, float& right) noexcept;
  };

  struct Equalizer final {
    static constexpr std::size_t maximumCutStages = 8;
    std::array<std::array<Biquad, maximumCutStages>, 5> bands{};
    bool enabled = false;

    void configure(const EqConfig& config, double sampleRate) noexcept;
    void reset() noexcept;
    void process(float* left, float* right, std::size_t frames) noexcept;
  };

  struct Compressor final {
    CompressorConfig config{};
    double sampleRate = 48000.0;
    float envelope = 0.0f;
    float attackCoefficient = 0.0f;
    float releaseCoefficient = 0.0f;
    float outputGain = 1.0f;

    void configure(CompressorConfig next, double nextSampleRate) noexcept;
    void reset() noexcept;
    void process(float* left, float* right, std::size_t frames) noexcept;
  };

  struct StereoDelay final {
    DelayConfig config{};
    double sampleRate = 48000.0;
    float tempoBpm = 120.0f;
    std::vector<float> leftBuffer;
    std::vector<float> rightBuffer;
    std::size_t writeIndex = 0;
    float currentDelaySamples = 1.0f;

    void prepare(double nextSampleRate);
    void configure(DelayConfig next, float nextTempoBpm) noexcept;
    void setTempo(float nextTempoBpm) noexcept;
    void reset() noexcept;
    void process(float* left, float* right, std::size_t frames) noexcept;
    [[nodiscard]] float targetDelaySamples() const noexcept;
  };

  struct ReverbDelayLine final {
    std::vector<float> buffer;
    std::size_t index = 0;
    std::size_t length = 1;
    float filtered = 0.0f;

    void prepare(std::size_t maximumLength);
    void setLength(std::size_t nextLength) noexcept;
    void reset() noexcept;
    float processComb(float input, float feedback, float dampen) noexcept;
    float processAllPass(float input) noexcept;
  };

  struct Reverb final {
    ReverbConfig config{};
    double sampleRate = 48000.0;
    std::array<ReverbDelayLine, 4> combLeft{};
    std::array<ReverbDelayLine, 4> combRight{};
    std::array<ReverbDelayLine, 2> allPassLeft{};
    std::array<ReverbDelayLine, 2> allPassRight{};

    void prepare(double nextSampleRate);
    void configure(ReverbConfig next) noexcept;
    void reset() noexcept;
    void process(float* left, float* right, std::size_t frames) noexcept;
    void updateLengths() noexcept;
  };

  // Caixa Leslie de dois rotores (corneta e tambor), captada por dois microfones:
  // Doppler, modulação de volume e de brilho pela direção da corneta, reflexão
  // do gabinete, inércias diferentes e um leve drive de válvula.
  struct RotarySpeaker final {
    RotaryConfig config{};
    std::uint8_t effectiveSpeed = 1;
    double sampleRate = 48000.0;
    std::array<std::vector<float>, 2> hornBuffers;
    std::array<std::vector<float>, 2> drumBuffers;
    std::size_t writeIndex = 0;
    double hornPhase = 0.0;
    double drumPhase = 0.25;
    float hornHz = 0.0f;
    float drumHz = 0.0f;
    float hornSmoothing = 0.0f;
    float drumSmoothing = 0.0f;
    // Crossover Linkwitz-Riley de 4ª ordem em 800 Hz (dois Butterworth em série).
    std::array<Biquad, 2> drumLowPass{};
    std::array<Biquad, 2> hornHighPass{};
    std::array<float, 2> hornTone{};

    void prepare(double nextSampleRate);
    void configure(RotaryConfig next) noexcept;
    void setModulation(std::uint8_t value) noexcept;
    void reset() noexcept;
    void process(float* left, float* right, std::size_t frames) noexcept;
    [[nodiscard]] float read(const std::vector<float>& buffer, float delaySamples) const noexcept;
  };

  double sampleRate_ = 48000.0;
  float tempoBpm_ = 120.0f;
  ModuleEffectsConfig config_{};
  Biquad cutoff_{};
  Equalizer equalizer_{};
  Compressor compressor_{};
  StereoDelay delay_{};
  Reverb reverb_{};
  RotarySpeaker rotary_{};
  double gatePhaseSamples_ = 0.0;
  std::uint8_t gateStep_ = 0;
  float gateGain_ = 1.0f;
  float gateAttackCoefficient_ = 0.01f;
  float gateReleaseCoefficient_ = 0.01f;
  void processTranceGate(float* left, float* right, std::size_t frames) noexcept;
  void configureCutoff() noexcept;
};

} // namespace hook_keys
