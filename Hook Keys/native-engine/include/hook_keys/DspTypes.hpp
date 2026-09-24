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

// LP2/HP2: um estágio de 2 polos (12 dB/oitava), o filtro de sempre. LP4/HP4:
// dois estágios em série (24 dB/oitava, curva mais íngreme). Lowpass corta os
// agudos: Highpass é o mesmo filtro ao contrário, cortando os graves.
enum class FilterKind : std::uint8_t { lowpass2, lowpass4, highpass2, highpass4 };

inline constexpr bool filterKindIsHighpass(FilterKind kind) noexcept {
  return kind == FilterKind::highpass2 || kind == FilterKind::highpass4;
}

inline constexpr bool filterKindIsFourPole(FilterKind kind) noexcept {
  return kind == FilterKind::lowpass4 || kind == FilterKind::highpass4;
}

// Envelope do filtro: Attack sobe o corte até o valor do Cutoff (acima), Decay
// desce até Sustain (fração do caminho já aberto pelo Attack) e Release volta
// a fechar depois do Note Off. Depth em oitavas: 0 desliga o envelope (o corte
// fica sempre no valor fixo de CutoffConfig, como antes desta função existir).
struct FilterEnvelopeConfig final {
  bool enabled = false;
  float attackMs = 5.0f;
  float decayMs = 200.0f;
  float sustain = 1.0f;
  float releaseMs = 200.0f;
  float depthOctaves = 4.0f;

  void normalize() noexcept {
    attackMs = std::clamp(attackMs, 0.0f, 15000.0f);
    decayMs = std::clamp(decayMs, 0.0f, 15000.0f);
    sustain = std::clamp(sustain, 0.0f, 1.0f);
    releaseMs = std::clamp(releaseMs, 0.0f, 15000.0f);
    depthOctaves = std::clamp(depthOctaves, 0.0f, 8.0f);
  }

  bool operator==(const FilterEnvelopeConfig& other) const noexcept {
    return enabled == other.enabled && attackMs == other.attackMs && decayMs == other.decayMs
        && sustain == other.sustain && releaseMs == other.releaseMs && depthOctaves == other.depthOctaves;
  }
};

struct CutoffConfig final {
  bool enabled = true;
  float frequencyHz = 20000.0f;
  std::array<std::uint8_t, 5> velocityCurve{{127, 127, 127, 127, 127}};
  FilterKind type = FilterKind::lowpass2;
  FilterEnvelopeConfig envelope{};

  void normalize() noexcept {
    frequencyHz = std::clamp(frequencyHz, 10.0f, 20000.0f);
    envelope.normalize();
  }

  float frequencyForVelocity(std::uint8_t velocity) const noexcept {
    if (!enabled) return 20000.0f;
    const float position = std::min<int>(velocity, 127) * 4.0f / 127.0f;
    const auto lower = static_cast<std::size_t>(std::min(3.0f, std::floor(position)));
    const float mapped = velocityCurve[lower] +
        (static_cast<float>(velocityCurve[lower + 1]) - velocityCurve[lower]) * (position - static_cast<float>(lower));
    return 20.0f * std::pow(std::clamp(frequencyHz, 20.0f, 20000.0f) / 20.0f, mapped / 127.0f);
  }

  bool operator==(const CutoffConfig& other) const noexcept {
    return enabled == other.enabled && frequencyHz == other.frequencyHz
        && velocityCurve == other.velocityCurve && type == other.type && envelope == other.envelope;
  }
  bool operator!=(const CutoffConfig& other) const noexcept { return !(*this == other); }
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
    // Abaixo de 1 ms o ganho reage dentro do ciclo da onda e suja o som.
    attackMs = std::clamp(attackMs, 1.0f, 250.0f);
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
  // 0 Room 1, 1 Room 2, 2 Hall 1, 3 Hall 2. Todos são IRs reais.
  std::uint8_t impulse = 0;
  // Campos legados continuam no formato dos presets antigos, mas o DSP de
  // convolução usa impulse, mix e tail. tail encurta a cauda do IR real.
  float decay = 0.50f;
  float dampen = 0.45f;
  float size = 0.50f;
  float mix = 0.20f;
  float mod = 0.0f;
  // Fraction of the original convolution IR retained. 1 keeps it unchanged.
  float tail = 1.0f;

  void normalize() noexcept {
    impulse = std::min<std::uint8_t>(impulse, 3);
    decay = std::clamp(decay, 0.0f, 1.0f);
    dampen = std::clamp(dampen, 0.0f, 1.0f);
    size = std::clamp(size, 0.0f, 1.0f);
    mix = std::clamp(mix, 0.0f, 1.0f);
    mod = std::clamp(mod, 0.0f, 1.0f);
    tail = std::clamp(tail, 0.1f, 1.0f);
  }
};

struct RotaryConfig final {
  bool enabled = false;
  std::uint8_t speed = 1; // brake, slow, fast
  float slowHz = 0.672f;
  float fastHz = 7.056f;
  float rampSeconds = 1.2f;
  float depth = 0.7f;
  float mix = 1.0f;
  bool modulationEnabled = false;
  // O módulo 7 (Organ) mantém a resposta real do gabinete mesmo com a
  // rotação desligada; o bridge nativo liga esta opção somente nele.
  bool cabinetEnabled = false;

  void normalize() noexcept {
    speed = std::min<std::uint8_t>(speed, 2);
    slowHz = std::clamp(slowHz, 0.2f, 2.0f);
    fastHz = std::clamp(fastHz, 2.0f, 10.0f);
    rampSeconds = std::clamp(rampSeconds, 0.1f, 10.0f);
    depth = std::clamp(depth, 0.0f, 1.0f);
    mix = std::clamp(mix, 0.0f, 1.0f);
  }
};

// Chorus: duas vozes atrasadas e moduladas, uma em cada lado, somadas ao som
// original. Rate em Hz, Depth e Mix em 0..1.
struct ChorusConfig final {
  bool enabled = false;
  float rateHz = 0.6f;
  float depth = 0.5f;
  float mix = 0.35f;

  void normalize() noexcept {
    rateHz = std::clamp(rateHz, 0.05f, 8.0f);
    depth = std::clamp(depth, 0.0f, 1.0f);
    mix = std::clamp(mix, 0.0f, 1.0f);
  }
};

// Vibes: oscilação contínua de afinação. O Amount vai de zero (bypass) até
// um semitom; o Rate controla a velocidade da ida e volta.
struct LoFiConfig final {
  bool enabled = false;
  float rateHz = 1.0f;
  float amountSemitones = 0.25f;
  bool vinylEnabled = true;
  float noiseGainDb = -24.0f;

  void normalize() noexcept {
    rateHz = std::clamp(rateHz, 0.05f, 8.0f);
    amountSemitones = std::clamp(amountSemitones, 0.0f, 1.0f);
    noiseGainDb = std::clamp(noiseGainDb, -36.0f, 0.0f);
  }
};

// Auto Fader: o volume desce e volta no tempo do BPM. depthDb é o quanto ele
// desce a partir do volume atual do módulo; beats é a duração do ciclo inteiro
// medida em semínimas (4/4: 4 ou 2; 6/8: 3 ou 1,5).
struct AutoFaderConfig final {
  bool enabled = false;
  float beats = 4.0f;
  float depthDb = 6.0f;

  void normalize() noexcept {
    beats = std::clamp(beats, 0.25f, 16.0f);
    depthDb = std::clamp(depthDb, 0.0f, 40.0f);
  }
};

struct ModuleEffectsConfig final {
  struct TranceGateConfig final {
    bool enabled = false;
    std::uint16_t steps = 0xffff;
    std::uint8_t length = 16;
    float beatMultiplier = 0.25f;
    // Duração do compasso em semínimas. Zero mantém o ciclo livre (Sync OFF).
    float measureBeats = 0.0f;
    float gate = 0.5f;
    float depth = 1.0f;
    float attackMs = 3.0f;
    float releaseMs = 3.0f;
    float swing = 0.0f;
    void normalize() noexcept {
      length = std::clamp<std::uint8_t>(length, 1, 16);
      // Free Pulse: 20 ms at 60 BPM through 2000 ms at 300 BPM.
      beatMultiplier = std::clamp(beatMultiplier, 0.02f, 10.0f);
      measureBeats = std::clamp(measureBeats, 0.0f, 16.0f);
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
  // Gain de entrada do módulo, em dB: empurra o sinal nos processadores sem
  // mexer no fader, que continua sendo o volume de saída.
  float inputGainDb = 0.0f;
  RotaryConfig rotary{};
  ChorusConfig chorus{};
  LoFiConfig loFi{};
  AutoFaderConfig autoFader{};

  void normalize() noexcept {
    cutoff.normalize();
    equalizer.normalize();
    compressor.normalize();
    delay.normalize();
    reverb.normalize();
    inputGainDb = std::clamp(inputGainDb, -36.0f, 12.0f);
    rotary.normalize();
    chorus.normalize();
    loFi.normalize();
    autoFader.normalize();
    tranceGate.normalize();
  }
};

} // namespace hook_keys
