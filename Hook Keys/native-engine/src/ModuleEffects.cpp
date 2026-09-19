#include "hook_keys/ModuleEffects.hpp"

#include <algorithm>
#include <cmath>

namespace hook_keys {

namespace {
constexpr double kPi = 3.14159265358979323846;

float decibelsToLinear(float decibels) noexcept {
  return std::pow(10.0f, decibels / 20.0f);
}

bool sameBand(const EqBandConfig& left, const EqBandConfig& right) noexcept {
  return left.enabled == right.enabled && left.type == right.type && left.frequencyHz == right.frequencyHz &&
         left.gainDb == right.gainDb && left.quality == right.quality && left.cutStages == right.cutStages;
}

bool sameEq(const EqConfig& left, const EqConfig& right) noexcept {
  if (left.enabled != right.enabled) return false;
  for (std::size_t index = 0; index < left.bands.size(); ++index) {
    if (!sameBand(left.bands[index], right.bands[index])) return false;
  }
  return true;
}

bool sameCutoff(const CutoffConfig& left, const CutoffConfig& right) noexcept {
  return left == right;
}

bool sameCompressor(const CompressorConfig& left, const CompressorConfig& right) noexcept {
  return left.enabled == right.enabled && left.thresholdDb == right.thresholdDb && left.ratio == right.ratio &&
         left.attackMs == right.attackMs && left.releaseMs == right.releaseMs &&
         left.outputGainDb == right.outputGainDb && left.mix == right.mix;
}

bool sameDelay(const DelayConfig& left, const DelayConfig& right) noexcept {
  return left.enabled == right.enabled && left.sync == right.sync && left.delayMs == right.delayMs &&
         left.beatMultiplier == right.beatMultiplier && left.feedback == right.feedback && left.mix == right.mix;
}

bool sameReverb(const ReverbConfig& left, const ReverbConfig& right) noexcept {
  return left.enabled == right.enabled && left.decay == right.decay && left.dampen == right.dampen &&
         left.size == right.size && left.mix == right.mix && left.mod == right.mod;
}

bool sameRotary(const RotaryConfig& left, const RotaryConfig& right) noexcept {
  return left.enabled == right.enabled && left.speed == right.speed && left.slowHz == right.slowHz &&
         left.fastHz == right.fastHz && left.rampSeconds == right.rampSeconds &&
         left.depth == right.depth && left.mix == right.mix &&
         left.modulationEnabled == right.modulationEnabled;
}
} // namespace

void ModuleEffects::prepare(double sampleRate) {
  sampleRate_ = std::clamp(sampleRate, 8000.0, 384000.0);
  delay_.prepare(sampleRate_);
  reverb_.prepare(sampleRate_);
  rotary_.prepare(sampleRate_);
  chorus_.prepare(sampleRate_);
  configureCutoff();
  equalizer_.configure(config_.equalizer, sampleRate_);
  compressor_.configure(config_.compressor, sampleRate_);
  delay_.configure(config_.delay, tempoBpm_);
  reverb_.configure(config_.reverb);
  rotary_.configure(config_.rotary);
}

void ModuleEffects::reset() noexcept {
  cutoff_.reset();
  equalizer_.reset();
  compressor_.reset();
  delay_.reset();
  reverb_.reset();
  rotary_.reset();
  configureCutoff();
  gatePhaseSamples_ = 0.0;
  gateStep_ = 0;
  gateGain_ = 1.0f;
}

void ModuleEffects::setConfig(ModuleEffectsConfig config, float tempoBpm) noexcept {
  config.normalize();
  tempoBpm_ = std::clamp(tempoBpm, 60.0f, 600.0f);

  if (!sameCutoff(config_.cutoff, config.cutoff)) {
    config_.cutoff = config.cutoff;
    configureCutoff();
  }
  if (!sameEq(config_.equalizer, config.equalizer)) equalizer_.configure(config.equalizer, sampleRate_);
  if (!sameCompressor(config_.compressor, config.compressor)) {
    compressor_.configure(config.compressor, sampleRate_);
  }
  if (!sameDelay(config_.delay, config.delay)) delay_.configure(config.delay, tempoBpm_);
  if (!sameReverb(config_.reverb, config.reverb)) reverb_.configure(config.reverb);
  if (!sameRotary(config_.rotary, config.rotary)) rotary_.configure(config.rotary);
  if (!config_.tranceGate.enabled && config.tranceGate.enabled) triggerTranceGate();
  gateStep_ %= config.tranceGate.length;
  gateAttackCoefficient_ = static_cast<float>(1.0 - std::exp(-1.0 / (config.tranceGate.attackMs * 0.001 * sampleRate_)));
  gateReleaseCoefficient_ = static_cast<float>(1.0 - std::exp(-1.0 / (config.tranceGate.releaseMs * 0.001 * sampleRate_)));
  config_ = config;
}

void ModuleEffects::configureCutoff() noexcept {
  const auto& cutoff = config_.cutoff;
  const float frequency = std::clamp(cutoff.frequencyHz, 20.0f, 20000.0f);
  cutoff_.configure(
      {cutoff.enabled && frequency < 19999.0f, EqBandType::highCut,
       frequency, 0.0f, 0.7071f, 1}, sampleRate_);
}

void ModuleEffects::setTempo(float tempoBpm) noexcept {
  tempoBpm_ = std::clamp(tempoBpm, 60.0f, 600.0f);
  delay_.setTempo(tempoBpm_);
}

ModuleProcessorLevels ModuleEffects::process(
    float* left, float* right, std::size_t frames,
    bool captureCompressorLevels) noexcept {
  ModuleProcessorLevels levels{};
  if (left == nullptr || right == nullptr || frames == 0) return levels;
  captureCompressorLevels = captureCompressorLevels && config_.compressor.enabled;
  // Gain de entrada: entra antes de tudo, para o EQ e o compressor receberem
  // o sinal já empurrado.
  if (config_.inputGainDb != 0.0f) {
    const auto gain = std::pow(10.0f, config_.inputGainDb / 20.0f);
    for (std::size_t frame = 0; frame < frames; ++frame) {
      left[frame] *= gain;
      right[frame] *= gain;
    }
  }
  if (config_.cutoff.enabled && config_.cutoff.frequencyHz < 19999.0f) {
    for (std::size_t frame = 0; frame < frames; ++frame) cutoff_.process(left[frame], right[frame]);
  }
  if (config_.equalizer.enabled) equalizer_.process(left, right, frames);
  if (captureCompressorLevels) {
    for (std::size_t frame = 0; frame < frames; ++frame) {
      levels.compressorInput = std::max(
          levels.compressorInput, std::max(std::abs(left[frame]), std::abs(right[frame])));
    }
  }
  if (config_.compressor.enabled) compressor_.process(left, right, frames);
  if (captureCompressorLevels) {
    for (std::size_t frame = 0; frame < frames; ++frame) {
      levels.compressorOutput = std::max(
          levels.compressorOutput, std::max(std::abs(left[frame]), std::abs(right[frame])));
    }
  }
  if (config_.rotary.enabled) rotary_.process(left, right, frames);
  if (config_.chorus.enabled) chorus_.process(config_.chorus, left, right, frames);
  processTranceGate(left, right, frames);
  if (config_.delay.enabled) delay_.process(left, right, frames);
  if (config_.reverb.enabled) reverb_.process(left, right, frames);
  // O Auto Fader é volume: vem por último, depois de tudo que soa.
  if (config_.autoFader.enabled) processAutoFader(left, right, frames);
  else autoFaderPhase_ = 0.0;
  return levels;
}

// Auto Fader: o volume desce até -depthDb e volta, uma volta inteira por
// tempo (1/4) ou por colcheia (1/8). Só abaixa, nunca passa do volume atual.
void ModuleEffects::processAutoFader(float* left, float* right, std::size_t frames) noexcept {
  const auto& fader = config_.autoFader;
  if (!fader.enabled) {
    autoFaderPhase_ = 0.0;
    return;
  }
  const auto cycleSeconds = 60.0 / std::max(1.0f, tempoBpm_) * static_cast<double>(fader.beats);
  const auto step = 1.0 / (cycleSeconds * sampleRate_);
  const auto floorGain = std::pow(10.0f, -fader.depthDb / 20.0f);
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto shape = 0.5 - 0.5 * std::cos(2.0 * kPi * autoFaderPhase_);
    const auto gain = 1.0f + (floorGain - 1.0f) * static_cast<float>(shape);
    left[frame] *= gain;
    right[frame] *= gain;
    autoFaderPhase_ += step;
    if (autoFaderPhase_ >= 1.0) autoFaderPhase_ -= 1.0;
  }
}

void ModuleEffects::Chorus::prepare(double nextSampleRate) {
  sampleRate = nextSampleRate;
  // Base de 12 ms mais 8 ms de excursão: a faixa clássica de chorus.
  const auto capacity = static_cast<std::size_t>(std::ceil(sampleRate * 0.026)) + 4;
  for (auto& buffer : buffers) buffer.assign(capacity, 0.0f);
  reset();
}

void ModuleEffects::Chorus::reset() noexcept {
  for (auto& buffer : buffers) std::fill(buffer.begin(), buffer.end(), 0.0f);
  writeIndex = 0;
  phase = 0.0;
}

void ModuleEffects::Chorus::process(
    const ChorusConfig& config, float* left, float* right, std::size_t frames) noexcept {
  if (!config.enabled || buffers[0].empty()) return;
  const auto capacity = buffers[0].size();
  const auto baseSamples = static_cast<float>(sampleRate * 0.012);
  const auto sweepSamples = static_cast<float>(sampleRate * 0.008) * config.depth;
  const auto step = static_cast<double>(config.rateHz) / sampleRate;
  float* const channels[2] = {left, right};
  for (std::size_t frame = 0; frame < frames; ++frame) {
    buffers[0][writeIndex] = left[frame];
    buffers[1][writeIndex] = right[frame];
    for (std::size_t channel = 0; channel < 2; ++channel) {
      // Os dois lados andam em quadratura: um sobe enquanto o outro desce.
      const auto lfo = std::sin(2.0 * kPi * (phase + (channel == 0 ? 0.0 : 0.25)));
      const auto delaySamples = baseSamples + sweepSamples * static_cast<float>(0.5 + 0.5 * lfo);
      auto position = static_cast<float>(writeIndex) - delaySamples;
      if (position < 0.0f) position += static_cast<float>(capacity);
      const auto first = static_cast<std::size_t>(position) % capacity;
      const auto second = (first + 1) % capacity;
      const auto fraction = position - std::floor(position);
      const auto voice = buffers[channel][first]
          + (buffers[channel][second] - buffers[channel][first]) * fraction;
      channels[channel][frame] += (voice - channels[channel][frame]) * config.mix;
    }
    writeIndex = (writeIndex + 1) % capacity;
    phase += step;
    if (phase >= 1.0) phase -= 1.0;
  }
}

void ModuleEffects::triggerTranceGate() noexcept {
  gatePhaseSamples_ = 0.0;
  gateStep_ = 0;
}

void ModuleEffects::processTranceGate(float* left, float* right, std::size_t frames) noexcept {
  const auto& gate = config_.tranceGate;
  if (!gate.enabled && gateGain_ >= 0.99999f) { gateGain_ = 1.0f; return; }
  const double baseDuration = sampleRate_ * 60.0 / tempoBpm_ * gate.beatMultiplier;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    double duration = baseDuration * (gateStep_ % 2 == 0 ? 1.0 + gate.swing : 1.0 - gate.swing);
    while (gatePhaseSamples_ >= duration) {
      gatePhaseSamples_ -= duration;
      gateStep_ = (gateStep_ + 1) % gate.length;
      duration = baseDuration * (gateStep_ % 2 == 0 ? 1.0 + gate.swing : 1.0 - gate.swing);
    }
    const bool open = (gate.steps & (1u << gateStep_)) != 0 && gatePhaseSamples_ < duration * gate.gate;
    const float target = !gate.enabled || open ? 1.0f : 1.0f - gate.depth;
    gateGain_ += (target - gateGain_) * (target > gateGain_ ? gateAttackCoefficient_ : gateReleaseCoefficient_);
    left[frame] *= gateGain_;
    right[frame] *= gateGain_;
    gatePhaseSamples_ += 1.0;
  }
}

void ModuleEffects::RotarySpeaker::prepare(double nextSampleRate) {
  sampleRate = nextSampleRate;
  // Tabelas de distância: o mesmo cálculo do computeOffsets() do setBfree.
  const auto samplesPerCm = static_cast<float>(sampleRate) / (kAirSpeedMetersPerSecond * 100.0f);
  micDistanceSamples = kMicDistanceCm * samplesPerCm;
  hornReflectionSamples = kHornReflectionCm * samplesPerCm;
  drumReflectionSamples = kDrumReflectionCm * samplesPerCm;
  const auto hornRadius = kHornRadiusCm * samplesPerCm;
  const auto drumRadius = kDrumRadiusCm * samplesPerCm;
  for (std::size_t index = 0; index < kDisplacementSize; ++index) {
    const auto angle = 2.0 * kPi * static_cast<double>(index) / static_cast<double>(kDisplacementSize);
    const auto hornA = micDistanceSamples - hornRadius * static_cast<float>(std::cos(angle));
    const auto hornB = hornRadius * static_cast<float>(std::sin(angle));
    hornDisplacement[index] = std::sqrt(hornA * hornA + hornB * hornB);
    const auto drumA = micDistanceSamples - drumRadius * static_cast<float>(std::cos(angle));
    const auto drumB = drumRadius * static_cast<float>(std::sin(angle));
    drumDisplacement[index] = std::sqrt(drumA * drumA + drumB * drumB);
  }
  // Distância + reflexão do gabinete chegam a ~7 ms de atraso.
  const auto capacity = static_cast<std::size_t>(std::ceil(sampleRate * 0.012)) + 4;
  for (auto& buffer : hornBuffers) buffer.assign(capacity, 0.0f);
  for (auto& buffer : drumBuffers) buffer.assign(capacity, 0.0f);
  // Divisão de bandas da própria caixa, com os filtros do setBfree: o tambor
  // perde 39 dB acima de 812 Hz e a corneta perde 30 dB abaixo de 300 Hz, com
  // a boca dela fechando em 4,5 kHz. Cortes fundos assim evitam que as duas
  // metades, que agora têm atrasos bem diferentes, se cancelem no cruzamento.
  drumLowPass[0].configure({true, EqBandType::highShelf, 811.9695f, -38.9291f, 1.6016f, 1}, sampleRate);
  drumLowPass[1].configure({false, EqBandType::highShelf, 811.9695f, 0.0f, 0.7071f, 1}, sampleRate);
  hornHighPass[0].configure({true, EqBandType::lowShelf, 300.0f, -30.0f, 1.0f, 1}, sampleRate);
  hornHighPass[1].configure({true, EqBandType::highCut, 4500.0f, 0.0f, 1.2f, 1}, sampleRate);
  reset();
  configure(config);
}

void ModuleEffects::RotarySpeaker::configure(RotaryConfig next) noexcept {
  next.normalize();
  if (next.speed != config.speed || next.modulationEnabled != config.modulationEnabled)
    effectiveSpeed = next.speed;
  // Clear old delay samples on bypass transitions; retain inertia for speed changes.
  if (config.enabled != next.enabled) reset();
  config = next;
  // Ramp é o tempo da corneta subindo. As outras três constantes seguem as
  // proporções do setBfree: a corneta desce no dobro do tempo que sobe e o
  // tambor sobe em ~3,4x esse tempo, mas desce em ~1,1x.
  const auto constant = [this](float seconds) {
    return 1.0f - std::exp(-1.0f / (std::max(seconds, 0.001f) * static_cast<float>(sampleRate)));
  };
  hornAccSmoothing = constant(config.rampSeconds);
  hornDecSmoothing = constant(config.rampSeconds * 2.0f);
  drumAccSmoothing = constant(config.rampSeconds * 3.4f);
  drumDecSmoothing = constant(config.rampSeconds * 1.14f);
}

void ModuleEffects::setModulation(std::uint8_t value) noexcept {
  rotary_.setModulation(value);
}

void ModuleEffects::RotarySpeaker::setModulation(std::uint8_t value) noexcept {
  // Manual Brake/Slow/Fast remains available; a new CC 1 message takes over.
  if (config.modulationEnabled) effectiveSpeed = value >= 64 ? 2 : 1;
}

void ModuleEffects::RotarySpeaker::reset() noexcept {
  for (auto& buffer : hornBuffers) std::fill(buffer.begin(), buffer.end(), 0.0f);
  for (auto& buffer : drumBuffers) std::fill(buffer.begin(), buffer.end(), 0.0f);
  writeIndex = 0;
  hornPhase = 0.0;
  drumPhase = 0.25;
  hornHz = drumHz = 0.0f;
  for (auto& stage : drumLowPass) stage.reset();
  for (auto& stage : hornHighPass) stage.reset();
  hornTone.fill(0.0f);
}

float ModuleEffects::RotarySpeaker::displacementAt(
    const std::array<float, kDisplacementSize>& table, float turns, float depth) const noexcept {
  auto position = turns - std::floor(turns);
  const auto scaled = position * static_cast<float>(kDisplacementSize);
  const auto first = static_cast<std::size_t>(scaled) % kDisplacementSize;
  const auto second = (first + 1) % kDisplacementSize;
  const auto fraction = scaled - std::floor(scaled);
  const auto distance = table[first] + (table[second] - table[first]) * fraction;
  // Depth encolhe o raio do rotor sem mexer na distância do microfone.
  return micDistanceSamples + (distance - micDistanceSamples) * depth;
}

float ModuleEffects::RotarySpeaker::read(const std::vector<float>& buffer, float delaySamples) const noexcept {
  const auto capacity = buffer.size();
  auto position = static_cast<float>(writeIndex) - delaySamples;
  if (position < 0.0f) position += static_cast<float>(capacity);
  const auto first = static_cast<std::size_t>(position) % capacity;
  const auto second = (first + 1) % capacity;
  const auto fraction = position - std::floor(position);
  return buffer[first] + (buffer[second] - buffer[first]) * fraction;
}

void ModuleEffects::RotarySpeaker::process(float* left, float* right, std::size_t frames) noexcept {
  if (!config.enabled || hornBuffers[0].empty() || drumBuffers[0].empty()) return;
  const auto targetHz = effectiveSpeed == 0 ? 0.0f : effectiveSpeed == 2 ? config.fastHz : config.slowHz;
  // Tambor um pouco mais lento que a corneta (Leslie 122: chorale 0,83/0,67 Hz,
  // tremolo 6,7/5,7 Hz).
  const auto drumTargetHz = targetHz * (effectiveSpeed == 2 ? 0.844f : 0.893f);
  const auto depth = config.depth;
  const auto toneScale = static_cast<float>(2.0 * kPi / sampleRate);
  // Microfones a +/-72 graus (0,2 de volta): cada lado ouve a corneta chegar e
  // ir embora em momentos diferentes; o giro aparece no estéreo e ainda soa
  // em mono.
  constexpr std::array<float, 2> micOffsetTurns{-0.2f, 0.2f};
  constexpr float crossfeed = 0.12f;
  constexpr float hornReflection = 0.2f;
  constexpr float drumReflection = 0.2f;
  constexpr float drive = 1.3f;
  constexpr float hornTremolo = 0.7f;
  constexpr float drumTremolo = 0.45f;
  // Vazamento seco do setBfree (leakLevel 0,15): parte do som escapa da caixa
  // sem passar pelo rotor. É ele que segura a afinação com o Doppler real.
  constexpr float leak = 0.15f;
  const bool dryOnly = config.mix <= 0.0f;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    hornHz += (targetHz - hornHz) * (targetHz > hornHz ? hornAccSmoothing : hornDecSmoothing);
    drumHz += (drumTargetHz - drumHz) * (drumTargetHz > drumHz ? drumAccSmoothing : drumDecSmoothing);
    hornPhase += hornHz / sampleRate;
    // A corneta e o tambor de uma Leslie real giram em sentidos opostos.
    drumPhase -= drumHz / sampleRate;
    if (hornPhase >= 1.0) hornPhase -= 1.0;
    if (drumPhase < 0.0) drumPhase += 1.0;

    const std::array<float, 2> dry{left[frame], right[frame]};
    // Grave só no tambor e agudo só na corneta. Somadas, as duas bandas voltam
    // ao sinal original com a fase girada (passa-tudo).
    auto drumLeft = dry[0];
    auto drumRight = dry[1];
    for (auto& stage : drumLowPass) stage.process(drumLeft, drumRight);
    auto hornLeft = dry[0];
    auto hornRight = dry[1];
    for (auto& stage : hornHighPass) stage.process(hornLeft, hornRight);
    drumBuffers[0][writeIndex] = drumLeft;
    drumBuffers[1][writeIndex] = drumRight;
    hornBuffers[0][writeIndex] = hornLeft;
    hornBuffers[1][writeIndex] = hornRight;
    const std::array<float, 2> reference{drumLeft + hornLeft, drumRight + hornRight};

    std::array<float, 2> wet{};
    for (std::size_t channel = 0; channel < 2; ++channel) {
      const auto other = 1 - channel;
      const auto hornTurns = static_cast<float>(hornPhase) + micOffsetTurns[channel];
      const auto drumTurns = static_cast<float>(drumPhase) + micOffsetTurns[channel];
      // 1 = apontando para o microfone, -1 = de costas.
      const auto hornFacing = std::cos(static_cast<float>(2.0 * kPi) * hornTurns);
      const auto drumFacing = std::cos(static_cast<float>(2.0 * kPi) * drumTurns);

      // Doppler geométrico: o atraso é a distância real até o microfone.
      const auto hornDelay = displacementAt(hornDisplacement, hornTurns, depth);
      const auto drumDelay = displacementAt(drumDisplacement, drumTurns, depth);
      // Reflexão: o lobo de costas bate no gabinete e chega depois.
      const auto hornEchoDelay = displacementAt(hornDisplacement, hornTurns + 0.5f, depth) + hornReflectionSamples;
      const auto drumEchoDelay = displacementAt(drumDisplacement, drumTurns + 0.5f, depth) + drumReflectionSamples;

      const auto hornSource = read(hornBuffers[channel], hornDelay) + read(hornBuffers[other], hornDelay) * crossfeed;
      const auto hornEcho = read(hornBuffers[channel], hornEchoDelay) + read(hornBuffers[other], hornEchoDelay) * crossfeed;
      const auto drumSource = read(drumBuffers[channel], drumDelay) + read(drumBuffers[other], drumDelay) * crossfeed;
      const auto drumEcho = read(drumBuffers[channel], drumEchoDelay) + read(drumBuffers[other], drumEchoDelay) * crossfeed;

      // Volume pela direção: a corneta some bem mais de costas que o tambor.
      const auto hornGain = 1.0f - hornTremolo * depth * (0.5f - 0.5f * hornFacing);
      const auto hornEchoGain = hornReflection * (1.0f - hornTremolo * depth * (0.5f + 0.5f * hornFacing));
      const auto drumGain = 1.0f - drumTremolo * depth * (0.5f - 0.5f * drumFacing);
      const auto drumEchoGain = drumReflection * (1.0f - drumTremolo * depth * (0.5f + 0.5f * drumFacing));

      // Brilho pela direção: de frente passa até ~7,5 kHz, de costas fica abafada.
      const auto toneHz = 7500.0f - 5000.0f * depth * (0.5f - 0.5f * hornFacing);
      const auto omega = toneHz * toneScale;
      const auto toneCoefficient = omega / (1.0f + omega);
      const auto hornMixed = hornSource * hornGain + hornEcho * hornEchoGain;
      hornTone[channel] += toneCoefficient * (hornMixed - hornTone[channel]);

      const auto drumMixed = drumSource * drumGain + drumEcho * drumEchoGain;
      const auto combined = (hornTone[channel] / (1.0f + hornReflection)
          + drumMixed / (1.0f + drumReflection)) / (1.0f + crossfeed);
      // Drive leve de válvula, com ganho unitário em sinal baixo.
      const auto rotated = std::tanh(combined * drive) / drive;
      wet[channel] = rotated * (1.0f - leak) + reference[channel] * leak;
    }
    if (!dryOnly) {
      // O seco do Mix passa pelo mesmo crossover: Mix parcial não cancela
      // a região de 800 Hz.
      left[frame] = reference[0] + (wet[0] - reference[0]) * config.mix;
      right[frame] = reference[1] + (wet[1] - reference[1]) * config.mix;
    }
    writeIndex = (writeIndex + 1) % hornBuffers[0].size();
  }
}

void ModuleEffects::Biquad::configure(const EqBandConfig& config, double sampleRate) noexcept {
  enabled = config.enabled;
  if (!enabled) {
    b0 = 1.0f;
    b1 = b2 = a1 = a2 = 0.0f;
    return;
  }

  const auto frequency = std::clamp<double>(config.frequencyHz, 10.0, sampleRate * 0.45);
  const auto omega = 2.0 * kPi * frequency / sampleRate;
  const auto sine = std::sin(omega);
  const auto cosine = std::cos(omega);
  const auto quality = std::clamp<double>(config.quality, 0.1, 12.0);
  const auto alpha = sine / (2.0 * quality);
  const auto amplitude = std::pow(10.0, static_cast<double>(config.gainDb) / 40.0);

  double nextB0 = 1.0;
  double nextB1 = 0.0;
  double nextB2 = 0.0;
  double nextA0 = 1.0;
  double nextA1 = 0.0;
  double nextA2 = 0.0;

  switch (config.type) {
    case EqBandType::lowCut:
      nextB0 = (1.0 + cosine) * 0.5;
      nextB1 = -(1.0 + cosine);
      nextB2 = nextB0;
      nextA0 = 1.0 + alpha;
      nextA1 = -2.0 * cosine;
      nextA2 = 1.0 - alpha;
      break;
    case EqBandType::highCut:
      nextB0 = (1.0 - cosine) * 0.5;
      nextB1 = 1.0 - cosine;
      nextB2 = nextB0;
      nextA0 = 1.0 + alpha;
      nextA1 = -2.0 * cosine;
      nextA2 = 1.0 - alpha;
      break;
    case EqBandType::bell:
      nextB0 = 1.0 + alpha * amplitude;
      nextB1 = -2.0 * cosine;
      nextB2 = 1.0 - alpha * amplitude;
      nextA0 = 1.0 + alpha / amplitude;
      nextA1 = -2.0 * cosine;
      nextA2 = 1.0 - alpha / amplitude;
      break;
    case EqBandType::lowShelf: {
      const auto slope = std::clamp(quality, 0.1, 1.0);
      const auto shelfAlpha = sine * 0.5 *
                              std::sqrt((amplitude + 1.0 / amplitude) * (1.0 / slope - 1.0) + 2.0);
      const auto term = 2.0 * std::sqrt(amplitude) * shelfAlpha;
      nextB0 = amplitude * ((amplitude + 1.0) - (amplitude - 1.0) * cosine + term);
      nextB1 = 2.0 * amplitude * ((amplitude - 1.0) - (amplitude + 1.0) * cosine);
      nextB2 = amplitude * ((amplitude + 1.0) - (amplitude - 1.0) * cosine - term);
      nextA0 = (amplitude + 1.0) + (amplitude - 1.0) * cosine + term;
      nextA1 = -2.0 * ((amplitude - 1.0) + (amplitude + 1.0) * cosine);
      nextA2 = (amplitude + 1.0) + (amplitude - 1.0) * cosine - term;
      break;
    }
    case EqBandType::highShelf: {
      const auto slope = std::clamp(quality, 0.1, 1.0);
      const auto shelfAlpha = sine * 0.5 *
                              std::sqrt((amplitude + 1.0 / amplitude) * (1.0 / slope - 1.0) + 2.0);
      const auto term = 2.0 * std::sqrt(amplitude) * shelfAlpha;
      nextB0 = amplitude * ((amplitude + 1.0) + (amplitude - 1.0) * cosine + term);
      nextB1 = -2.0 * amplitude * ((amplitude - 1.0) + (amplitude + 1.0) * cosine);
      nextB2 = amplitude * ((amplitude + 1.0) + (amplitude - 1.0) * cosine - term);
      nextA0 = (amplitude + 1.0) - (amplitude - 1.0) * cosine + term;
      nextA1 = 2.0 * ((amplitude - 1.0) - (amplitude + 1.0) * cosine);
      nextA2 = (amplitude + 1.0) - (amplitude - 1.0) * cosine - term;
      break;
    }
  }

  b0 = static_cast<float>(nextB0 / nextA0);
  b1 = static_cast<float>(nextB1 / nextA0);
  b2 = static_cast<float>(nextB2 / nextA0);
  a1 = static_cast<float>(nextA1 / nextA0);
  a2 = static_cast<float>(nextA2 / nextA0);
}

void ModuleEffects::Biquad::reset() noexcept {
  z1Left = z2Left = z1Right = z2Right = 0.0f;
}

void ModuleEffects::Biquad::process(float& left, float& right) noexcept {
  if (!enabled) return;
  const auto outputLeft = b0 * left + z1Left;
  z1Left = b1 * left - a1 * outputLeft + z2Left;
  z2Left = b2 * left - a2 * outputLeft;
  left = outputLeft;

  const auto outputRight = b0 * right + z1Right;
  z1Right = b1 * right - a1 * outputRight + z2Right;
  z2Right = b2 * right - a2 * outputRight;
  right = outputRight;
}

void ModuleEffects::Equalizer::configure(const EqConfig& config, double sampleRate) noexcept {
  enabled = config.enabled;
  for (std::size_t bandIndex = 0; bandIndex < bands.size(); ++bandIndex) {
    const auto& bandConfig = config.bands[bandIndex];
    const auto cut = bandConfig.type == EqBandType::lowCut || bandConfig.type == EqBandType::highCut;
    const auto activeStages = cut
                                  ? std::clamp<std::size_t>(bandConfig.cutStages, 1, maximumCutStages)
                                  : std::size_t{1};
    const auto filterOrder = activeStages * 2;
    for (std::size_t stageIndex = 0; stageIndex < maximumCutStages; ++stageIndex) {
      auto stageConfig = bandConfig;
      stageConfig.enabled = bandConfig.enabled && stageIndex < activeStages;
      if (cut && stageConfig.enabled) {
        const auto poleAngle = kPi * static_cast<double>(2 * stageIndex + 1) /
                               static_cast<double>(filterOrder * 2);
        stageConfig.quality = static_cast<float>(1.0 / (2.0 * std::cos(poleAngle)));
      }
      bands[bandIndex][stageIndex].configure(stageConfig, sampleRate);
    }
  }
}

void ModuleEffects::Equalizer::reset() noexcept {
  for (auto& band : bands) {
    for (auto& stage : band) stage.reset();
  }
}

void ModuleEffects::Equalizer::process(float* left, float* right, std::size_t frames) noexcept {
  if (!enabled) return;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    for (auto& band : bands) {
      for (auto& stage : band) stage.process(left[frame], right[frame]);
    }
  }
}

void ModuleEffects::Compressor::configure(CompressorConfig next, double nextSampleRate) noexcept {
  next.normalize();
  config = next;
  sampleRate = nextSampleRate;
  attackCoefficient = std::exp(-1.0f / (0.001f * config.attackMs * static_cast<float>(sampleRate)));
  releaseCoefficient = std::exp(-1.0f / (0.001f * config.releaseMs * static_cast<float>(sampleRate)));
  outputGain = decibelsToLinear(config.outputGainDb);
}

void ModuleEffects::Compressor::reset() noexcept {
  envelope = 0.0f;
}

void ModuleEffects::Compressor::process(float* left, float* right, std::size_t frames) noexcept {
  if (!config.enabled) return;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto dryLeft = left[frame];
    const auto dryRight = right[frame];
    const auto detector = std::max(std::abs(dryLeft), std::abs(dryRight));
    const auto coefficient = detector > envelope ? attackCoefficient : releaseCoefficient;
    envelope = coefficient * envelope + (1.0f - coefficient) * detector;

    const auto levelDb = 20.0f * std::log10(std::max(envelope, 0.00000001f));
    const auto aboveThreshold = std::max(0.0f, levelDb - config.thresholdDb);
    const auto reductionDb = aboveThreshold * (1.0f / config.ratio - 1.0f);
    const auto compressedGain = decibelsToLinear(reductionDb) * outputGain;
    const auto wetLeft = dryLeft * compressedGain;
    const auto wetRight = dryRight * compressedGain;
    left[frame] = dryLeft + (wetLeft - dryLeft) * config.mix;
    right[frame] = dryRight + (wetRight - dryRight) * config.mix;
  }
}

void ModuleEffects::StereoDelay::prepare(double nextSampleRate) {
  sampleRate = nextSampleRate;
  const auto capacity = static_cast<std::size_t>(std::ceil(sampleRate * 4.0)) + 2;
  leftBuffer.assign(capacity, 0.0f);
  rightBuffer.assign(capacity, 0.0f);
  writeIndex = 0;
  currentDelaySamples = targetDelaySamples();
}

void ModuleEffects::StereoDelay::configure(DelayConfig next, float nextTempoBpm) noexcept {
  next.normalize();
  const auto wasEnabled = config.enabled;
  config = next;
  setTempo(nextTempoBpm);
  if (!wasEnabled && config.enabled) currentDelaySamples = targetDelaySamples();
}

void ModuleEffects::StereoDelay::setTempo(float nextTempoBpm) noexcept {
  tempoBpm = std::clamp(nextTempoBpm, 60.0f, 600.0f);
}

void ModuleEffects::StereoDelay::reset() noexcept {
  std::fill(leftBuffer.begin(), leftBuffer.end(), 0.0f);
  std::fill(rightBuffer.begin(), rightBuffer.end(), 0.0f);
  writeIndex = 0;
  currentDelaySamples = targetDelaySamples();
}

void ModuleEffects::StereoDelay::process(float* left, float* right, std::size_t frames) noexcept {
  if (!config.enabled || leftBuffer.empty()) return;
  const auto target = targetDelaySamples();
  const auto smoothing = 1.0f - std::exp(-1.0f / (0.020f * static_cast<float>(sampleRate)));
  const auto capacity = leftBuffer.size();

  for (std::size_t frame = 0; frame < frames; ++frame) {
    currentDelaySamples += (target - currentDelaySamples) * smoothing;
    auto readPosition = static_cast<float>(writeIndex) - currentDelaySamples;
    while (readPosition < 0.0f) readPosition += static_cast<float>(capacity);
    const auto first = static_cast<std::size_t>(readPosition) % capacity;
    const auto second = (first + 1) % capacity;
    const auto fraction = readPosition - std::floor(readPosition);
    const auto delayedLeft = leftBuffer[first] + (leftBuffer[second] - leftBuffer[first]) * fraction;
    const auto delayedRight = rightBuffer[first] + (rightBuffer[second] - rightBuffer[first]) * fraction;
    const auto dryLeft = left[frame];
    const auto dryRight = right[frame];

    leftBuffer[writeIndex] = dryLeft + delayedLeft * config.feedback;
    rightBuffer[writeIndex] = dryRight + delayedRight * config.feedback;
    left[frame] = dryLeft + (delayedLeft - dryLeft) * config.mix;
    right[frame] = dryRight + (delayedRight - dryRight) * config.mix;
    writeIndex = (writeIndex + 1) % capacity;
  }
}

float ModuleEffects::StereoDelay::targetDelaySamples() const noexcept {
  // The division always applies to one beat (1/4): the BPM beat with Sync, or
  // the knob milliseconds without it (500 ms at 1/8 = 250 ms).
  const auto beatMs = config.sync ? 60000.0f / tempoBpm : config.delayMs;
  const auto milliseconds = beatMs * config.beatMultiplier;
  const auto samples = milliseconds * 0.001f * static_cast<float>(sampleRate);
  const auto maximum = leftBuffer.size() > 2 ? static_cast<float>(leftBuffer.size() - 2) : 1.0f;
  return std::clamp(samples, 1.0f, maximum);
}

void ModuleEffects::ReverbDelayLine::prepare(std::size_t maximumLength) {
  buffer.assign(std::max<std::size_t>(maximumLength, 2), 0.0f);
  length = buffer.size();
  index = 0;
  filtered = 0.0f;
}

void ModuleEffects::ReverbDelayLine::setLength(std::size_t nextLength) noexcept {
  length = std::clamp<std::size_t>(nextLength, 1, buffer.size());
  if (index >= length) index = 0;
}

void ModuleEffects::ReverbDelayLine::reset() noexcept {
  std::fill(buffer.begin(), buffer.end(), 0.0f);
  index = 0;
  filtered = 0.0f;
}

float ModuleEffects::ReverbDelayLine::processComb(
    float input, float feedback, float dampen, float modOffset) noexcept {
  float output;
  if (modOffset == 0.0f) {
    output = buffer[index];
  } else {
    const auto size = static_cast<float>(length);
    auto readPosition = static_cast<float>(index) + modOffset;
    readPosition = std::fmod(readPosition, size);
    if (readPosition < 0.0f) readPosition += size;
    const auto baseIndex = static_cast<std::size_t>(readPosition);
    const auto fraction = readPosition - static_cast<float>(baseIndex);
    const auto nextIndex = baseIndex + 1 >= length ? 0 : baseIndex + 1;
    output = buffer[baseIndex] * (1.0f - fraction) + buffer[nextIndex] * fraction;
  }
  filtered = output * (1.0f - dampen) + filtered * dampen;
  buffer[index] = input + filtered * feedback;
  index = (index + 1) % length;
  return output;
}

float ModuleEffects::ReverbDelayLine::processAllPass(float input) noexcept {
  const auto delayed = buffer[index];
  const auto output = delayed - input;
  buffer[index] = input + delayed * 0.5f;
  index = (index + 1) % length;
  return output;
}

void ModuleEffects::Reverb::prepare(double nextSampleRate) {
  sampleRate = nextSampleRate;
  constexpr std::array<double, 4> combSeconds{{0.0297, 0.0371, 0.0411, 0.0437}};
  constexpr std::array<double, 2> allPassSeconds{{0.0050, 0.0017}};
  for (std::size_t index = 0; index < combLeft.size(); ++index) {
    combLeft[index].prepare(static_cast<std::size_t>(std::ceil(combSeconds[index] * 1.30 * sampleRate)) + 2);
    combRight[index].prepare(
        static_cast<std::size_t>(std::ceil((combSeconds[index] + 0.0007) * 1.30 * sampleRate)) + 2);
  }
  for (std::size_t index = 0; index < allPassLeft.size(); ++index) {
    allPassLeft[index].prepare(
        static_cast<std::size_t>(std::ceil(allPassSeconds[index] * 1.30 * sampleRate)) + 2);
    allPassRight[index].prepare(
        static_cast<std::size_t>(std::ceil((allPassSeconds[index] + 0.0003) * 1.30 * sampleRate)) + 2);
  }
  updateLengths();
}

void ModuleEffects::Reverb::configure(ReverbConfig next) noexcept {
  next.normalize();
  const auto sizeChanged = next.size != config.size;
  config = next;
  if (sizeChanged) updateLengths();
}

void ModuleEffects::Reverb::reset() noexcept {
  for (auto& line : combLeft) line.reset();
  for (auto& line : combRight) line.reset();
  for (auto& line : allPassLeft) line.reset();
  for (auto& line : allPassRight) line.reset();
  modPhase = 0.0;
}

void ModuleEffects::Reverb::process(float* left, float* right, std::size_t frames) noexcept {
  if (!config.enabled) return;
  const auto feedback = 0.65f + config.decay * 0.32f;
  // Mix como send: até 50% o som original fica inteiro e só entra reverb; de
  // 50% para cima o original é que vai embora, até sobrar só o processado.
  const auto dryGain = config.mix <= 0.5f ? 1.0f : 1.0f - (config.mix - 0.5f) * 2.0f;
  const auto wetGain = config.mix <= 0.5f ? config.mix * 2.0f : 1.0f;
  // Taxa fixa (baixa o bastante pra não virar vibrato) e uma fase por linha,
  // pra balançar sem ficar robótico. Até 1,8 amostra no fundo, suave.
  constexpr double kTwoPi = 6.28318530717958647692;
  constexpr double kModRateHz = 0.37;
  constexpr float kModMaxSamples = 1.8f;
  const auto modPhaseStep = kTwoPi * kModRateHz / sampleRate;
  const auto modDepth = config.mod * kModMaxSamples;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto dryLeft = left[frame];
    const auto dryRight = right[frame];
    const auto input = (dryLeft + dryRight) * 0.12f;
    float wetLeft = 0.0f;
    float wetRight = 0.0f;
    if (modDepth > 0.0f) {
      for (std::size_t index = 0; index < combLeft.size(); ++index) {
        const auto phase = modPhase + index * (kTwoPi / combLeft.size());
        wetLeft += combLeft[index].processComb(input, feedback, config.dampen,
            modDepth * static_cast<float>(std::sin(phase)));
        wetRight += combRight[index].processComb(input, feedback, config.dampen,
            modDepth * static_cast<float>(std::sin(phase + kTwoPi * 0.25)));
      }
    } else {
      for (auto& line : combLeft) wetLeft += line.processComb(input, feedback, config.dampen);
      for (auto& line : combRight) wetRight += line.processComb(input, feedback, config.dampen);
    }
    wetLeft *= 0.25f;
    wetRight *= 0.25f;
    for (auto& line : allPassLeft) wetLeft = line.processAllPass(wetLeft);
    for (auto& line : allPassRight) wetRight = line.processAllPass(wetRight);
    left[frame] = dryLeft * dryGain + wetLeft * wetGain;
    right[frame] = dryRight * dryGain + wetRight * wetGain;
    modPhase += modPhaseStep;
    if (modPhase >= kTwoPi) modPhase -= kTwoPi;
  }
}

void ModuleEffects::Reverb::updateLengths() noexcept {
  constexpr std::array<double, 4> combSeconds{{0.0297, 0.0371, 0.0411, 0.0437}};
  constexpr std::array<double, 2> allPassSeconds{{0.0050, 0.0017}};
  const auto scale = 0.75 + static_cast<double>(config.size) * 0.50;
  for (std::size_t index = 0; index < combLeft.size(); ++index) {
    combLeft[index].setLength(static_cast<std::size_t>(std::lround(combSeconds[index] * scale * sampleRate)));
    combRight[index].setLength(
        static_cast<std::size_t>(std::lround((combSeconds[index] + 0.0007) * scale * sampleRate)));
  }
  for (std::size_t index = 0; index < allPassLeft.size(); ++index) {
    allPassLeft[index].setLength(static_cast<std::size_t>(std::lround(allPassSeconds[index] * scale * sampleRate)));
    allPassRight[index].setLength(
        static_cast<std::size_t>(std::lround((allPassSeconds[index] + 0.0003) * scale * sampleRate)));
  }
}

} // namespace hook_keys
