#include "hook_keys/ModuleEffects.hpp"
#include "hook_keys/ConvolutionIrData.hpp"
#include "hook_keys/VinylNoiseData.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <cstdint>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <vector>

namespace hook_keys {

namespace {
constexpr double kPi = 3.14159265358979323846;

struct StereoImpulse final {
  std::vector<float> left;
  std::vector<float> right;
};

using ImpulseBank = std::array<StereoImpulse, 6>;

std::uint16_t readU16(const std::vector<std::uint8_t>& bytes, std::size_t offset) {
  return static_cast<std::uint16_t>(bytes[offset]) |
      (static_cast<std::uint16_t>(bytes[offset + 1]) << 8u);
}

std::uint32_t readU32(const std::vector<std::uint8_t>& bytes, std::size_t offset) {
  return static_cast<std::uint32_t>(bytes[offset]) |
      (static_cast<std::uint32_t>(bytes[offset + 1]) << 8u) |
      (static_cast<std::uint32_t>(bytes[offset + 2]) << 16u) |
      (static_cast<std::uint32_t>(bytes[offset + 3]) << 24u);
}

std::vector<std::uint8_t> decodeBase64(const char* encoded) {
  static constexpr char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::array<std::int16_t, 256> lookup{};
  lookup.fill(-1);
  for (std::int16_t index = 0; index < 64; ++index) {
    lookup[static_cast<std::uint8_t>(alphabet[index])] = index;
  }
  std::vector<std::uint8_t> result;
  std::uint32_t value = 0;
  int bits = -8;
  for (const auto* cursor = encoded; *cursor != '\0'; ++cursor) {
    const auto byte = static_cast<std::uint8_t>(*cursor);
    if (*cursor == '=') break;
    const auto decoded = lookup[byte];
    if (decoded < 0) continue;
    value = (value << 6u) | static_cast<std::uint32_t>(decoded);
    bits += 6;
    if (bits >= 0) {
      result.push_back(static_cast<std::uint8_t>((value >> bits) & 0xffu));
      bits -= 8;
    }
  }
  return result;
}

float pcmSample(const std::vector<std::uint8_t>& bytes, std::size_t offset, std::uint16_t bits) {
  if (bits == 16) {
    const auto raw = static_cast<std::int16_t>(readU16(bytes, offset));
    return static_cast<float>(raw) / 32768.0f;
  }
  if (bits == 24) {
    auto raw = static_cast<std::int32_t>(bytes[offset]) |
        (static_cast<std::int32_t>(bytes[offset + 1]) << 8) |
        (static_cast<std::int32_t>(bytes[offset + 2]) << 16);
    if ((raw & 0x00800000) != 0) raw |= static_cast<std::int32_t>(0xff000000);
    return static_cast<float>(raw) / 8388608.0f;
  }
  if (bits == 32) {
    return static_cast<float>(static_cast<std::int32_t>(readU32(bytes, offset))) / 2147483648.0f;
  }
  return 0.0f;
}

double peakFrequencyGain(const std::vector<float>& impulse) {
  if (impulse.empty()) return 0.0;
  // O pico de uma amostra do IR nao limita o ganho da convolucao: varias
  // amostras podem se somar na mesma frequencia. Medimos a resposta inteira
  // com resolucao dobrada para nao deixar uma ressonancia entre bins escapar.
  std::size_t size = 1;
  while (size < impulse.size() * 2) size <<= 1;
  std::vector<std::complex<double>> spectrum(size);
  for (std::size_t index = 0; index < impulse.size(); ++index) spectrum[index] = impulse[index];
  for (std::size_t index = 1, reversed = 0; index < size; ++index) {
    auto bit = size >> 1;
    while (reversed & bit) { reversed ^= bit; bit >>= 1; }
    reversed ^= bit;
    if (index < reversed) std::swap(spectrum[index], spectrum[reversed]);
  }
  for (std::size_t length = 2; length <= size; length <<= 1) {
    const auto angle = -2.0 * kPi / static_cast<double>(length);
    const std::complex<double> step(std::cos(angle), std::sin(angle));
    for (std::size_t base = 0; base < size; base += length) {
      std::complex<double> rotation(1.0, 0.0);
      for (std::size_t index = 0; index < length / 2; ++index) {
        const auto even = spectrum[base + index];
        const auto odd = spectrum[base + index + length / 2] * rotation;
        spectrum[base + index] = even + odd;
        spectrum[base + index + length / 2] = even - odd;
        rotation *= step;
      }
    }
  }
  double peak = 0.0;
  for (std::size_t index = 0; index <= size / 2; ++index) {
    peak = std::max(peak, std::abs(spectrum[index]));
  }
  return peak;
}

StereoImpulse decodeWav(const char* encoded, double targetSampleRate, bool reverb) {
  const auto bytes = decodeBase64(encoded);
  if (bytes.size() < 44 || readU32(bytes, 0) != 0x46464952u || readU32(bytes, 8) != 0x45564157u) return {};

  std::uint16_t format = 0;
  std::uint16_t channels = 0;
  std::uint16_t bits = 0;
  std::uint32_t sampleRate = 0;
  std::size_t dataOffset = 0;
  std::size_t dataSize = 0;
  for (std::size_t offset = 12; offset + 8 <= bytes.size();) {
    const auto id = readU32(bytes, offset);
    const auto size = static_cast<std::size_t>(readU32(bytes, offset + 4));
    const auto payload = offset + 8;
    if (payload + size > bytes.size()) break;
    if (id == 0x20746d66u && size >= 16) {
      format = readU16(bytes, payload);
      channels = readU16(bytes, payload + 2);
      sampleRate = readU32(bytes, payload + 4);
      bits = readU16(bytes, payload + 14);
    } else if (id == 0x61746164u) {
      dataOffset = payload;
      dataSize = size;
    }
    offset = payload + size + (size & 1u);
  }
  if (format != 1 || channels < 1 || channels > 2 || sampleRate == 0 ||
      (bits != 16 && bits != 24 && bits != 32) || dataSize == 0) return {};

  const auto bytesPerSample = static_cast<std::size_t>(bits / 8);
  const auto sourceFrames = dataSize / (bytesPerSample * channels);
  StereoImpulse source;
  source.left.resize(sourceFrames);
  source.right.resize(sourceFrames);
  for (std::size_t frame = 0; frame < sourceFrames; ++frame) {
    const auto offset = dataOffset + frame * bytesPerSample * channels;
    source.left[frame] = pcmSample(bytes, offset, bits);
    source.right[frame] = channels == 2 ? pcmSample(bytes, offset + bytesPerSample, bits) : source.left[frame];
  }

  StereoImpulse output;
  if (std::abs(targetSampleRate - static_cast<double>(sampleRate)) < 0.5) {
    output = std::move(source);
  } else {
    const auto outputFrames = static_cast<std::size_t>(std::ceil(
        static_cast<double>(sourceFrames) * targetSampleRate / static_cast<double>(sampleRate)));
    output.left.resize(outputFrames);
    output.right.resize(outputFrames);
    const auto step = static_cast<double>(sampleRate) / targetSampleRate;
    for (std::size_t frame = 0; frame < outputFrames; ++frame) {
      const auto position = std::min(static_cast<double>(sourceFrames - 1), frame * step);
      const auto first = static_cast<std::size_t>(position);
      const auto second = std::min(first + 1, sourceFrames - 1);
      const auto fraction = static_cast<float>(position - static_cast<double>(first));
      output.left[frame] = source.left[first] + (source.left[second] - source.left[first]) * fraction;
      output.right[frame] = source.right[first] + (source.right[second] - source.right[first]) * fraction;
    }
  }

  // Os IRs de fontes diferentes vieram com niveis muito distintos. No
  // gabinete, normalizar pelo pico da amostra causava ate +20 dB de ganho
  // numa faixa do Organ, antes do fader. O ganho maximo da resposta em
  // frequencia e o limite correto para a convolucao do Rotary.
  double leftEnergy = 0.0;
  double rightEnergy = 0.0;
  for (std::size_t frame = 0; frame < output.left.size(); ++frame) {
    leftEnergy += static_cast<double>(output.left[frame]) * output.left[frame];
    rightEnergy += static_cast<double>(output.right[frame]) * output.right[frame];
  }
  const auto denominator = reverb
      ? static_cast<float>(std::sqrt(std::max(leftEnergy, rightEnergy)))
      : static_cast<float>(std::max(peakFrequencyGain(output.left), peakFrequencyGain(output.right)));
  const auto target = reverb ? 0.70f : 0.85f;
  const auto gain = denominator > 0.000001f ? target / denominator : 1.0f;
  for (auto& sample : output.left) sample *= gain;
  for (auto& sample : output.right) sample *= gain;
  return output;
}

std::shared_ptr<const ImpulseBank> impulseBank(double sampleRate) {
  static std::mutex mutex;
  static std::unordered_map<int, std::shared_ptr<const ImpulseBank>> cache;
  const auto key = static_cast<int>(std::lround(sampleRate));
  std::lock_guard<std::mutex> lock(mutex);
  const auto existing = cache.find(key);
  if (existing != cache.end()) return existing->second;
  auto bank = std::make_shared<ImpulseBank>();
  for (std::size_t index = 0; index < bank->size(); ++index) {
    (*bank)[index] = decodeWav(embedded_ir::kImpulses[index].base64Wav, sampleRate, index < 4);
  }
  cache.emplace(key, bank);
  return bank;
}

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
  return left.enabled == right.enabled && left.impulse == right.impulse &&
         left.mix == right.mix;
}

bool sameRotary(const RotaryConfig& left, const RotaryConfig& right) noexcept {
  return left.enabled == right.enabled && left.speed == right.speed && left.slowHz == right.slowHz &&
         left.fastHz == right.fastHz && left.rampSeconds == right.rampSeconds &&
         left.depth == right.depth && left.mix == right.mix &&
         left.modulationEnabled == right.modulationEnabled && left.cabinetEnabled == right.cabinetEnabled;
}
} // namespace

void ModuleEffects::prepare(double sampleRate, bool organModule) {
  sampleRate_ = std::clamp(sampleRate, 8000.0, 384000.0);
  currentInputGain_ = decibelsToLinear(config_.inputGainDb);
  delay_.prepare(sampleRate_);
  reverb_.prepare(sampleRate_);
  if (organModule) cabinet_.prepare(sampleRate_);
  rotary_.prepare(sampleRate_);
  chorus_.prepare(sampleRate_);
  loFi_.prepare(sampleRate_);
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
  cabinet_.reset();
  rotary_.reset();
  loFi_.reset();
  configureCutoff();
  gatePhaseSamples_ = 0.0;
  gateMeasurePhaseSamples_ = 0.0;
  gateStep_ = 0;
  gateGain_ = 1.0f;
  currentInputGain_ = decibelsToLinear(config_.inputGainDb);
  lastOutputLeft_ = lastOutputRight_ = 0.0f;
  transitionOffsetLeft_ = transitionOffsetRight_ = 0.0f;
  hasProcessedOutput_ = false;
  effectTransitionPending_ = false;
}

void ModuleEffects::setConfig(ModuleEffectsConfig config, float tempoBpm) noexcept {
  config.normalize();
  tempoBpm_ = std::clamp(tempoBpm, 60.0f, 300.0f);

  const bool cutoffChanged = !sameCutoff(config_.cutoff, config.cutoff);
  const bool cutoffBypassChanged =
      (config_.cutoff.enabled && config_.cutoff.frequencyHz < 19999.0f) !=
      (config.cutoff.enabled && config.cutoff.frequencyHz < 19999.0f);
  const bool equalizerChanged = !sameEq(config_.equalizer, config.equalizer);
  const bool equalizerBypassChanged = config_.equalizer.enabled != config.equalizer.enabled;
  const bool reverbTopologyChanged = config_.reverb.enabled != config.reverb.enabled ||
      config_.reverb.impulse != config.reverb.impulse;
  // Qualquer troca de parâmetros pode criar uma descontinuidade na saída:
  // compressor, tamanho do reverb e estados ON/OFF inclusive. Cutoff e bandas
  // do EQ já interpolam seus próprios coeficientes amostra a amostra; aplicar
  // também este offset global em cada passo do arrasto produzia ruído.
  const bool soundChanged = config_.inputGainDb != config.inputGainDb ||
      cutoffBypassChanged || equalizerBypassChanged ||
      !sameCompressor(config_.compressor, config.compressor) ||
      !sameDelay(config_.delay, config.delay) || reverbTopologyChanged ||
      !sameRotary(config_.rotary, config.rotary) ||
      config_.chorus.enabled != config.chorus.enabled || config_.chorus.rateHz != config.chorus.rateHz ||
      config_.chorus.depth != config.chorus.depth || config_.chorus.mix != config.chorus.mix ||
      // Rate e Amount do Vibes têm suavização própria durante o arrasto.
      config_.loFi.enabled != config.loFi.enabled ||
      config_.loFi.vinylEnabled != config.loFi.vinylEnabled ||
      config_.autoFader.enabled != config.autoFader.enabled ||
      config_.autoFader.depthDb != config.autoFader.depthDb ||
      config_.autoFader.beats != config.autoFader.beats ||
      config_.tranceGate.enabled != config.tranceGate.enabled ||
      config_.tranceGate.steps != config.tranceGate.steps ||
      config_.tranceGate.length != config.tranceGate.length ||
      config_.tranceGate.beatMultiplier != config.tranceGate.beatMultiplier ||
      config_.tranceGate.measureBeats != config.tranceGate.measureBeats ||
      config_.tranceGate.gate != config.tranceGate.gate ||
      config_.tranceGate.depth != config.tranceGate.depth ||
      config_.tranceGate.attackMs != config.tranceGate.attackMs ||
      config_.tranceGate.releaseMs != config.tranceGate.releaseMs ||
      config_.tranceGate.swing != config.tranceGate.swing;
  if (soundChanged && hasProcessedOutput_) effectTransitionPending_ = true;

  if (cutoffChanged) {
    config_.cutoff = config.cutoff;
    configureCutoff();
  }
  if (equalizerChanged) equalizer_.configure(config.equalizer, sampleRate_);
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
  tempoBpm_ = std::clamp(tempoBpm, 60.0f, 300.0f);
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
  {
    const auto targetGain = decibelsToLinear(config_.inputGainDb);
    const auto smoothing = 1.0f - std::exp(-1.0f / (0.030f * static_cast<float>(sampleRate_)));
    for (std::size_t frame = 0; frame < frames; ++frame) {
      currentInputGain_ += (targetGain - currentInputGain_) * smoothing;
      left[frame] *= currentInputGain_;
      right[frame] *= currentInputGain_;
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
  // Em bypass esta chamada retorna antes da convolução. Com o Gabinet ligado,
  // somente o IR selecionado é processado; executar os dois IRs estéreo em
  // todo bloco roubava tempo do callback e podia interromper o Rotary.
  cabinet_.process(left, right, frames, config_.rotary.cabinetEnabled, config_.rotary.enabled);
  if (config_.rotary.enabled) rotary_.process(left, right, frames);
  if (config_.chorus.enabled) chorus_.process(config_.chorus, left, right, frames);
  // O Vibes mantém a linha de atraso alimentada mesmo em bypass. Assim ele
  // entra sem silêncio nem estouro ao ser ligado durante uma nota sustentada.
  loFi_.process(config_.loFi, left, right, frames);
  processTranceGate(left, right, frames);
  if (config_.delay.enabled) delay_.process(left, right, frames);
  if (config_.reverb.enabled) reverb_.process(left, right, frames);
  // O Auto Fader é volume: vem por último, depois de tudo que soa.
  if (config_.autoFader.enabled) processAutoFader(left, right, frames);
  else autoFaderPhase_ = 0.0;
  // De-click na saída de todos os processadores. Corrige apenas o salto na
  // fronteira da alteração, sem atrasar continuamente o áudio ou o controle.
  const auto release = std::exp(-1.0f / (0.015f * static_cast<float>(sampleRate_)));
  for (std::size_t frame = 0; frame < frames; ++frame) {
    if (effectTransitionPending_) {
      // Não amortece o ataque de uma nota nova depois de silêncio.
      if (std::max(std::abs(lastOutputLeft_), std::abs(lastOutputRight_)) > 0.0001f) {
        transitionOffsetLeft_ = lastOutputLeft_ - left[frame];
        transitionOffsetRight_ = lastOutputRight_ - right[frame];
      }
      effectTransitionPending_ = false;
    }
    left[frame] += transitionOffsetLeft_;
    right[frame] += transitionOffsetRight_;
    transitionOffsetLeft_ *= release;
    transitionOffsetRight_ *= release;
    lastOutputLeft_ = left[frame];
    lastOutputRight_ = right[frame];
  }
  hasProcessedOutput_ = true;
  return levels;
}

// Auto Fader: o volume desce até -depthDb e volta. `beats` representa a volta
// inteira; cada trajeto entre os extremos dura metade desse ciclo.
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

void ModuleEffects::LoFi::prepare(double nextSampleRate) {
  sampleRate = std::clamp(nextSampleRate, 8000.0, 384000.0);
  // Em 0,05 Hz e 1 semitom o raio do sweep chega a cerca de 190 ms, portanto
  // a excursão completa do atraso ocupa perto de 380 ms. A reserva de 500 ms
  // cobre toda a faixa sem alocar na thread de áudio.
  const auto capacity = static_cast<std::size_t>(std::ceil(sampleRate * 0.5)) + 8;
  for (auto& buffer : buffers) buffer.assign(capacity, 0.0f);
  reset();
}

void ModuleEffects::LoFi::reset() noexcept {
  for (auto& buffer : buffers) std::fill(buffer.begin(), buffer.end(), 0.0f);
  writeIndex = 0;
  phase = 0.0;
  currentRateHz = 1.0f;
  currentAmountSemitones = 0.0f;
  currentVinylGain = 0.0f;
  currentNoiseGain = 0.0f;
  noisePosition = 0.0;
  toneLowPass.fill(0.0f);
  toneHighPassInput.fill(0.0f);
  toneHighPassOutput.fill(0.0f);
}

float ModuleEffects::LoFi::read(
    const std::vector<float>& buffer, float delaySamples) const noexcept {
  if (buffer.empty()) return 0.0f;
  auto position = static_cast<float>(writeIndex) - delaySamples;
  const auto capacity = static_cast<float>(buffer.size());
  while (position < 0.0f) position += capacity;
  while (position >= capacity) position -= capacity;
  const auto first = static_cast<std::size_t>(position) % buffer.size();
  const auto second = (first + 1) % buffer.size();
  const auto fraction = position - std::floor(position);
  return buffer[first] + (buffer[second] - buffer[first]) * fraction;
}

float ModuleEffects::LoFi::readNoise(std::size_t channel) const noexcept {
  using namespace embedded_vinyl_noise;
  const auto first = static_cast<std::size_t>(noisePosition) % kFrames;
  const auto second = (first + 1) % kFrames;
  const auto fraction = static_cast<float>(noisePosition - std::floor(noisePosition));
  const auto a = static_cast<float>(kStereo[first * 2 + channel]) / 32768.0f;
  const auto b = static_cast<float>(kStereo[second * 2 + channel]) / 32768.0f;
  return a + (b - a) * fraction;
}

void ModuleEffects::LoFi::process(
    const LoFiConfig& config, float* left, float* right, std::size_t frames) noexcept {
  if (buffers[0].empty() || buffers[1].empty()) return;
  const auto targetAmount = config.enabled ? config.amountSemitones : 0.0f;
  const auto targetVinylGain = config.enabled && config.vinylEnabled ? 1.0f : 0.0f;
  const auto targetNoiseGain = targetVinylGain * std::pow(10.0f, config.noiseGainDb / 20.0f);
  const auto smoothing = 1.0f - std::exp(-1.0f / (0.030f * static_cast<float>(sampleRate)));
  const auto toneLowPassCoefficient = 1.0f - std::exp(
      -2.0f * static_cast<float>(kPi) * 6000.0f / static_cast<float>(sampleRate));
  const auto toneHighPassCoefficient = std::exp(
      -2.0f * static_cast<float>(kPi) * 100.0f / static_cast<float>(sampleRate));
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const std::array<float, 2> dry{{left[frame], right[frame]}};
    buffers[0][writeIndex] = dry[0];
    buffers[1][writeIndex] = dry[1];
    currentRateHz += (config.rateHz - currentRateHz) * smoothing;
    currentAmountSemitones += (targetAmount - currentAmountSemitones) * smoothing;
    currentVinylGain += (targetVinylGain - currentVinylGain) * smoothing;
    currentNoiseGain += (targetNoiseGain - currentNoiseGain) * smoothing;
    std::array<float, 2> vinyl = dry;
    if (currentAmountSemitones > 0.0001f) {
      // A derivada do atraso determina a variação de pitch. Esta amplitude
      // produz exatamente o desvio configurado no pico da senoide.
      const auto pitchRatio = std::pow(2.0f, currentAmountSemitones / 12.0f) - 1.0f;
      const auto sweepSamples = pitchRatio * static_cast<float>(sampleRate)
          / (2.0f * static_cast<float>(kPi) * currentRateHz);
      const auto delaySamples = 2.0f + sweepSamples
          * (1.0f + static_cast<float>(std::sin(2.0 * kPi * phase)));
      vinyl[0] = read(buffers[0], delaySamples);
      vinyl[1] = read(buffers[1], delaySamples);
      phase += currentRateHz / sampleRate;
      if (phase >= 1.0) phase -= 1.0;
    }

    for (std::size_t channel = 0; channel < 2; ++channel) {
      // Saturação suave e faixa física do disco: 100 Hz a 6 kHz.
      const auto saturated = std::tanh(vinyl[channel] * 1.25f) / 1.25f;
      toneLowPass[channel] += (saturated - toneLowPass[channel]) * toneLowPassCoefficient;
      const auto highPassed = toneHighPassCoefficient *
          (toneHighPassOutput[channel] + toneLowPass[channel] - toneHighPassInput[channel]);
      toneHighPassInput[channel] = toneLowPass[channel];
      toneHighPassOutput[channel] = highPassed;

      const auto colored = vinyl[channel] + (highPassed - vinyl[channel]) * currentVinylGain;
      const auto output = colored + readNoise(channel) * currentNoiseGain;
      if (channel == 0) left[frame] = output;
      else right[frame] = output;
    }
    if (currentNoiseGain > 0.000001f) {
      noisePosition += static_cast<double>(embedded_vinyl_noise::kSampleRate) / sampleRate;
      while (noisePosition >= embedded_vinyl_noise::kFrames) noisePosition -= embedded_vinyl_noise::kFrames;
    }
    writeIndex = (writeIndex + 1) % buffers[0].size();
  }
}

void ModuleEffects::triggerTranceGate() noexcept {
  gatePhaseSamples_ = 0.0;
  gateMeasurePhaseSamples_ = 0.0;
  gateStep_ = 0;
}

void ModuleEffects::processTranceGate(float* left, float* right, std::size_t frames) noexcept {
  const auto& gate = config_.tranceGate;
  if (!gate.enabled && gateGain_ >= 0.99999f) { gateGain_ = 1.0f; return; }
  const double baseDuration = sampleRate_ * 60.0 / tempoBpm_ * gate.beatMultiplier;
  const double measureDuration = gate.measureBeats > 0.0f
      ? sampleRate_ * 60.0 / tempoBpm_ * gate.measureBeats
      : 0.0;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    if (measureDuration > 0.0 && gateMeasurePhaseSamples_ >= measureDuration) {
      gateMeasurePhaseSamples_ = std::fmod(gateMeasurePhaseSamples_, measureDuration);
      gatePhaseSamples_ = 0.0;
      gateStep_ = 0;
    }
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
    if (measureDuration > 0.0) gateMeasurePhaseSamples_ += 1.0;
  }
}

void ModuleEffects::RotarySpeaker::prepare(double nextSampleRate) {
  sampleRate = nextSampleRate;
  // Tabelas de distância baseadas no computeOffsets() do OpenB3/Beatrix.
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
  // OpenB3/Beatrix b_whirl: quatro constantes de tempo independentes.
  // O controle Ramp escala todas sem destruir a diferença entre os rotores;
  // no valor padrão de 1,2 s usamos os tempos originais do OpenB3.
  const auto constant = [this](float seconds) {
    return 1.0f - std::exp(-1.0f / (std::max(seconds, 0.001f) * static_cast<float>(sampleRate)));
  };
  const auto rampScale = config.rampSeconds / 1.2f;
  hornAccSmoothing = constant(0.161f * rampScale);
  hornDecSmoothing = constant(0.321f * rampScale);
  drumAccSmoothing = constant(4.127f * rampScale);
  drumDecSmoothing = constant(1.371f * rampScale);
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
  // OpenB3/Beatrix b_whirl: 36/40,32 RPM no Slow e 357,3/423,36 no Fast.
  const auto drumTargetHz = targetHz * (effectiveSpeed == 2 ? (357.3f / 423.36f) : (36.0f / 40.32f));
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

  targetEnabled = config.enabled;
  targetB0 = targetEnabled ? static_cast<float>(nextB0 / nextA0) : 1.0f;
  targetB1 = targetEnabled ? static_cast<float>(nextB1 / nextA0) : 0.0f;
  targetB2 = targetEnabled ? static_cast<float>(nextB2 / nextA0) : 0.0f;
  targetA1 = targetEnabled ? static_cast<float>(nextA1 / nextA0) : 0.0f;
  targetA2 = targetEnabled ? static_cast<float>(nextA2 / nextA0) : 0.0f;

  if (!coefficientsInitialized) {
    b0 = targetB0;
    b1 = targetB1;
    b2 = targetB2;
    a1 = targetA1;
    a2 = targetA2;
    enabled = targetEnabled;
    coefficientsInitialized = true;
    smoothingSamplesRemaining = 0;
    return;
  }

  // Ao mover frequência, ganho ou Q, interpolar os coeficientes evita zipper
  // noise. Trinta milissegundos mantêm a resposta imediata, mas suavizam
  // também movimentos rápidos e sucessivos do ponto na tela.
  if (!enabled && targetEnabled) {
    enabled = true;
    b0 = 1.0f;
    b1 = b2 = a1 = a2 = 0.0f;
    reset();
  }
  if (!enabled && !targetEnabled) {
    b0 = targetB0;
    b1 = targetB1;
    b2 = targetB2;
    a1 = targetA1;
    a2 = targetA2;
    smoothingSamplesRemaining = 0;
    return;
  }
  smoothingSamplesRemaining = std::max<std::uint32_t>(
      1, static_cast<std::uint32_t>(sampleRate * 0.030));
  const auto divisor = static_cast<float>(smoothingSamplesRemaining);
  stepB0 = (targetB0 - b0) / divisor;
  stepB1 = (targetB1 - b1) / divisor;
  stepB2 = (targetB2 - b2) / divisor;
  stepA1 = (targetA1 - a1) / divisor;
  stepA2 = (targetA2 - a2) / divisor;
}

void ModuleEffects::Biquad::reset() noexcept {
  z1Left = z2Left = z1Right = z2Right = 0.0f;
}

void ModuleEffects::Biquad::process(float& left, float& right) noexcept {
  if (!enabled) return;
  advanceCoefficients();
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

void ModuleEffects::Biquad::advanceCoefficients() noexcept {
  if (smoothingSamplesRemaining == 0) return;
  b0 += stepB0;
  b1 += stepB1;
  b2 += stepB2;
  a1 += stepA1;
  a2 += stepA2;
  if (--smoothingSamplesRemaining > 0) return;
  b0 = targetB0;
  b1 = targetB1;
  b2 = targetB2;
  a1 = targetA1;
  a2 = targetA2;
  if (!targetEnabled) {
    enabled = false;
    reset();
  }
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
  tempoBpm = std::clamp(nextTempoBpm, 60.0f, 300.0f);
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

void ModuleEffects::Reverb::prepare(double nextSampleRate) {
  sampleRate = nextSampleRate;
  currentMix = config.mix;
  const auto bank = impulseBank(sampleRate);
  for (std::size_t impulse = 0; impulse < convolvers.size(); ++impulse) {
    const auto& source = (*bank)[impulse];
    if (source.left.empty() || source.right.empty()) return;
    auto pair = std::make_unique<ConvolutionPair>();
    constexpr std::size_t headBlockSize = 128;
    constexpr std::size_t tailBlockSize = 4096;
    const auto leftReady = pair->left.init(
        headBlockSize, tailBlockSize, source.left.data(), source.left.size());
    const auto rightReady = pair->right.init(
        headBlockSize, tailBlockSize, source.right.data(), source.right.size());
    pair->ready = leftReady && rightReady;
    convolvers[impulse] = std::move(pair);
  }
}

void ModuleEffects::Reverb::configure(ReverbConfig next) noexcept {
  next.normalize();
  config = next;
}

void ModuleEffects::Reverb::reset() noexcept {
  for (auto& pair : convolvers) {
    if (!pair || !pair->ready) continue;
    pair->left.clearHistory();
    pair->right.clearHistory();
  }
  currentMix = config.mix;
}

void ModuleEffects::Reverb::process(float* left, float* right, std::size_t frames) noexcept {
  if (!config.enabled) return;
  const auto impulse = std::min<std::uint8_t>(config.impulse, 3);
  auto* pair = convolvers[impulse].get();
  if (pair == nullptr || !pair->ready) return;
  // Mix como send: até 50% o som original fica inteiro e só entra reverb; de
  // 50% para cima o original é que vai embora, até sobrar só o processado.
  // A rampa é calculada por amostra: movimentos contínuos do knob não trocam
  // dry/wet em degraus no começo de cada callback.
  const auto mixSmoothing = 1.0f - std::exp(
      -1.0f / (0.030f * static_cast<float>(sampleRate)));
  for (std::size_t offset = 0; offset < frames;) {
    const auto count = std::min<std::size_t>(wetLeft.size(), frames - offset);
    pair->left.process(left + offset, wetLeft.data(), count);
    pair->right.process(right + offset, wetRight.data(), count);
    for (std::size_t frame = 0; frame < count; ++frame) {
      currentMix += (config.mix - currentMix) * mixSmoothing;
      const auto dryGain = currentMix <= 0.5f ? 1.0f : 1.0f - (currentMix - 0.5f) * 2.0f;
      const auto wetGain = currentMix <= 0.5f ? currentMix * 2.0f : 1.0f;
      left[offset + frame] = left[offset + frame] * dryGain + wetLeft[frame] * wetGain;
      right[offset + frame] = right[offset + frame] * dryGain + wetRight[frame] * wetGain;
    }
    offset += count;
  }
}

void ModuleEffects::Cabinet::prepare(double nextSampleRate) {
  sampleRate = nextSampleRate;
  const auto bank = impulseBank(sampleRate);
  for (std::size_t index = 0; index < convolvers.size(); ++index) {
    const auto& source = (*bank)[index + 4];
    if (source.left.empty() || source.right.empty()) continue;
    constexpr std::size_t headBlockSize = 64;
    constexpr std::size_t tailBlockSize = 2048;
    const auto leftReady = convolvers[index].left.init(
        headBlockSize, tailBlockSize, source.left.data(), source.left.size());
    const auto rightReady = convolvers[index].right.init(
        headBlockSize, tailBlockSize, source.right.data(), source.right.size());
    convolvers[index].ready = leftReady && rightReady;
  }
}

void ModuleEffects::Cabinet::reset() noexcept {
  for (auto& pair : convolvers) {
    if (!pair.ready) continue;
    pair.left.clearHistory();
    pair.right.clearHistory();
  }
  loudnessGain = {{4.0f, 4.0f}};
  activeImpulse = 0;
  wasEnabled = false;
}

void ModuleEffects::Cabinet::process(
    float* left, float* right, std::size_t frames, bool enabled, bool rotaryOn) noexcept {
  const auto selected = rotaryOn ? std::size_t{1} : std::size_t{0};
  if (!enabled) {
    wasEnabled = false;
    return;
  }
  if (!convolvers[selected].ready) return;
  if (!wasEnabled || selected != activeImpulse) {
    convolvers[selected].left.clearHistory();
    convolvers[selected].right.clearHistory();
    loudnessGain[selected] = 4.0f;
    activeImpulse = selected;
    wasEnabled = true;
  }
  for (std::size_t offset = 0; offset < frames;) {
    const auto count = std::min<std::size_t>(wetLeft[0].size(), frames - offset);
    double dryEnergy = 0.0;
    for (std::size_t frame = 0; frame < count; ++frame) {
      const auto dryLeft = left[offset + frame];
      const auto dryRight = right[offset + frame];
      dryEnergy += static_cast<double>(dryLeft) * dryLeft +
          static_cast<double>(dryRight) * dryRight;
    }
    convolvers[selected].left.process(left + offset, wetLeft[selected].data(), count);
    convolvers[selected].right.process(right + offset, wetRight[selected].data(), count);

    double wetEnergy = 0.0;
    float wetPeak = 0.0f;
    for (std::size_t frame = 0; frame < count; ++frame) {
      const auto wetL = wetLeft[selected][frame];
      const auto wetR = wetRight[selected][frame];
      wetEnergy += static_cast<double>(wetL) * wetL + static_cast<double>(wetR) * wetR;
      wetPeak = std::max(wetPeak, std::max(std::abs(wetL), std::abs(wetR)));
    }
    // Igualamos a energia do IR à entrada, mas o ganho nunca pode empurrar
    // um pico acima de -1,1 dBFS. Isso recupera o volume sem reintroduzir a
    // distorção que a antiga normalização por pico de amostra causava.
    auto target = loudnessGain[selected];
    if (dryEnergy > 1.0e-10 && wetEnergy > 1.0e-10) {
      target = static_cast<float>(std::sqrt(dryEnergy / wetEnergy));
    }
    constexpr float ceiling = 0.88f;
    const auto peakLimited = wetPeak > 1.0e-7f ? ceiling / wetPeak : 8.0f;
    target = std::clamp(std::min(target, peakLimited), 0.25f, 8.0f);
    const auto gainStart = std::min(loudnessGain[selected], peakLimited);
    const auto smoothing = 1.0f - std::exp(
        -static_cast<float>(count) / (0.080f * static_cast<float>(sampleRate)));
    loudnessGain[selected] = gainStart + (target - gainStart) * smoothing;
    const auto gainEnd = loudnessGain[selected];
    for (std::size_t frame = 0; frame < count; ++frame) {
      const auto progress = count > 1 ? static_cast<float>(frame) / static_cast<float>(count - 1) : 1.0f;
      const auto gain = gainStart + (gainEnd - gainStart) * progress;
      left[offset + frame] = wetLeft[selected][frame] * gain;
      right[offset + frame] = wetRight[selected][frame] * gain;
    }
    offset += count;
  }
}

} // namespace hook_keys
