#pragma once

#include "hook_keys/DspTypes.hpp"
#include "../../third_party/FFTConvolver/TwoStageFFTConvolver.h"

#include <array>
#include <cstddef>
#include <memory>
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
  void prepare(double sampleRate, bool organModule = false);
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
    float targetB0 = 1.0f;
    float targetB1 = 0.0f;
    float targetB2 = 0.0f;
    float targetA1 = 0.0f;
    float targetA2 = 0.0f;
    float stepB0 = 0.0f;
    float stepB1 = 0.0f;
    float stepB2 = 0.0f;
    float stepA1 = 0.0f;
    float stepA2 = 0.0f;
    float z1Left = 0.0f;
    float z2Left = 0.0f;
    float z1Right = 0.0f;
    float z2Right = 0.0f;
    bool enabled = false;
    bool targetEnabled = false;
    bool coefficientsInitialized = false;
    std::uint32_t smoothingSamplesRemaining = 0;

    void configure(const EqBandConfig& config, double sampleRate) noexcept;
    void reset() noexcept;
    void process(float& left, float& right) noexcept;
    void advanceCoefficients() noexcept;
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

  struct Reverb final {
    struct ConvolutionPair final {
      fftconvolver::TwoStageFFTConvolver left;
      fftconvolver::TwoStageFFTConvolver right;
      bool ready = false;
    };

    ReverbConfig config{};
    double sampleRate = 48000.0;
    // O Mix é automatizado enquanto o áudio toca. O valor corrente segue o
    // alvo por uma rampa curta para não criar degraus/estalos no dry/wet.
    float currentMix = config.mix;
    // Todos os perfis são preparados antes da thread de áudio: alternar IR
    // durante uma apresentação não faz alocação nem processamento pesado.
    std::array<std::unique_ptr<ConvolutionPair>, 4> convolvers{};
    std::array<float, 256> wetLeft{};
    std::array<float, 256> wetRight{};

    void prepare(double nextSampleRate);
    void configure(ReverbConfig next) noexcept;
    void reset() noexcept;
    void process(float* left, float* right, std::size_t frames) noexcept;
  };

  struct Cabinet final {
    struct ConvolutionPair final {
      fftconvolver::TwoStageFFTConvolver left;
      fftconvolver::TwoStageFFTConvolver right;
      bool ready = false;
    };

    double sampleRate = 48000.0;
    std::array<ConvolutionPair, 2> convolvers{}; // Rotary Off, Rotary On
    std::array<std::array<float, 256>, 2> wetLeft{};
    std::array<std::array<float, 256>, 2> wetRight{};
    // Os IRs têm forte atenuação média depois da normalização que protege as
    // ressonâncias. Cada resposta mantém um ganho de loudness próprio.
    std::array<float, 2> loudnessGain{{4.0f, 4.0f}};
    std::size_t activeImpulse = 0;
    bool wasEnabled = false;

    void prepare(double nextSampleRate);
    void reset() noexcept;
    void process(float* left, float* right, std::size_t frames, bool enabled, bool rotaryOn) noexcept;
  };

  // Caixa Leslie de dois rotores (corneta e tambor), captada por dois microfones.
  // A geometria segue o OpenB3 (que incorpora o b_whirl do setBfree): o atraso de cada rotor é a distância
  // real até o microfone, sqrt((d - r·cos v)² + (r·sin v)²), o que dá ao Doppler
  // a curva torta de verdade (a chegada é mais rápida que a saída). Em cima
  // disso vêm a modulação de volume e de brilho pela direção, a reflexão do
  // gabinete, um vazamento seco, inércias diferentes e um drive leve.
  struct RotarySpeaker final {
    // Distâncias usadas no OpenB3/Beatrix (b_whirl): microfone a 42 cm,
    // corneta de raio 19,2 cm e tambor de 22 cm, ar a 340 m/s.
    static constexpr float kMicDistanceCm = 42.0f;
    static constexpr float kHornRadiusCm = 19.2f;
    static constexpr float kDrumRadiusCm = 22.0f;
    static constexpr float kAirSpeedMetersPerSecond = 340.0f;
    // Primeira reflexão no gabinete: 81,5 cm na corneta e 121,5 cm no tambor.
    static constexpr float kHornReflectionCm = 81.5f;
    static constexpr float kDrumReflectionCm = 121.5f;
    static constexpr std::size_t kDisplacementSize = 1024;

    RotaryConfig config{};
    std::uint8_t effectiveSpeed = 1;
    double sampleRate = 48000.0;
    std::array<std::vector<float>, 2> hornBuffers;
    std::array<std::vector<float>, 2> drumBuffers;
    // Distância corneta→microfone e tambor→microfone, em samples, por ângulo.
    std::array<float, kDisplacementSize> hornDisplacement{};
    std::array<float, kDisplacementSize> drumDisplacement{};
    float micDistanceSamples = 0.0f;
    float hornReflectionSamples = 0.0f;
    float drumReflectionSamples = 0.0f;
    std::size_t writeIndex = 0;
    double hornPhase = 0.0;
    double drumPhase = 0.25;
    float hornHz = 0.0f;
    float drumHz = 0.0f;
    // A corneta é leve e acelera rápido, mas leva o dobro para parar; o tambor
    // é pesado e faz o contrário (setBfree: 0,161/0,321 s e 4,127/1,371 s).
    float hornAccSmoothing = 0.0f;
    float hornDecSmoothing = 0.0f;
    float drumAccSmoothing = 0.0f;
    float drumDecSmoothing = 0.0f;
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
    // Atraso em samples de um rotor visto em `turns` voltas (0..1), já com o
    // Depth encolhendo o raio em volta da distância do microfone.
    [[nodiscard]] float displacementAt(
        const std::array<float, kDisplacementSize>& table, float turns, float depth) const noexcept;
  };

  // Chorus: uma linha de atraso por lado, com os dois LFOs em quadratura para
  // o som abrir no estéreo.
  struct Chorus final {
    double sampleRate = 48000.0;
    std::array<std::vector<float>, 2> buffers;
    std::size_t writeIndex = 0;
    double phase = 0.0;

    void prepare(double nextSampleRate);
    void reset() noexcept;
    void process(const ChorusConfig& config, float* left, float* right, std::size_t frames) noexcept;
  };

  struct LoFi final {
    double sampleRate = 48000.0;
    std::array<std::vector<float>, 2> buffers;
    std::size_t writeIndex = 0;
    double phase = 0.0;
    float currentRateHz = 1.0f;
    float currentAmountSemitones = 0.0f;

    void prepare(double nextSampleRate);
    void reset() noexcept;
    void process(const LoFiConfig& config, float* left, float* right, std::size_t frames) noexcept;
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
  Cabinet cabinet_{};
  RotarySpeaker rotary_{};
  Chorus chorus_{};
  LoFi loFi_{};
  // Auto Fader: fase da onda que abaixa e devolve o volume no tempo do BPM.
  double autoFaderPhase_ = 0.0;
  double gatePhaseSamples_ = 0.0;
  double gateMeasurePhaseSamples_ = 0.0;
  std::uint8_t gateStep_ = 0;
  float gateGain_ = 1.0f;
  float gateAttackCoefficient_ = 0.01f;
  float gateReleaseCoefficient_ = 0.01f;
  float currentInputGain_ = 1.0f;
  float lastOutputLeft_ = 0.0f;
  float lastOutputRight_ = 0.0f;
  float transitionOffsetLeft_ = 0.0f;
  float transitionOffsetRight_ = 0.0f;
  bool hasProcessedOutput_ = false;
  bool effectTransitionPending_ = false;
  void processTranceGate(float* left, float* right, std::size_t frames) noexcept;
  void processAutoFader(float* left, float* right, std::size_t frames) noexcept;
  void configureCutoff() noexcept;
};

} // namespace hook_keys
