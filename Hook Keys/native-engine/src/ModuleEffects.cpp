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
  return left.enabled == right.enabled && left.frequencyHz == right.frequencyHz;
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
         left.size == right.size && left.mix == right.mix;
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
  cutoff_.configure(
      {config_.cutoff.enabled && config_.cutoff.frequencyHz < 19999.0f,
       EqBandType::highCut,
       config_.cutoff.frequencyHz,
       0.0f,
       0.7071f,
       1},
      sampleRate_);
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
}

void ModuleEffects::setConfig(ModuleEffectsConfig config, float tempoBpm) noexcept {
  config.normalize();
  tempoBpm_ = std::clamp(tempoBpm, 60.0f, 600.0f);

  if (!sameCutoff(config_.cutoff, config.cutoff)) {
    cutoff_.configure(
        {config.cutoff.enabled && config.cutoff.frequencyHz < 19999.0f,
         EqBandType::highCut,
         config.cutoff.frequencyHz,
         0.0f,
         0.7071f},
        sampleRate_);
  }
  if (!sameEq(config_.equalizer, config.equalizer)) equalizer_.configure(config.equalizer, sampleRate_);
  if (!sameCompressor(config_.compressor, config.compressor)) {
    compressor_.configure(config.compressor, sampleRate_);
  }
  if (!sameDelay(config_.delay, config.delay)) delay_.configure(config.delay, tempoBpm_);
  if (!sameReverb(config_.reverb, config.reverb)) reverb_.configure(config.reverb);
  if (!sameRotary(config_.rotary, config.rotary)) rotary_.configure(config.rotary);
  config_ = config;
}

void ModuleEffects::setTempo(float tempoBpm) noexcept {
  tempoBpm_ = std::clamp(tempoBpm, 60.0f, 600.0f);
  delay_.setTempo(tempoBpm_);
}

void ModuleEffects::process(float* left, float* right, std::size_t frames) noexcept {
  if (left == nullptr || right == nullptr || frames == 0) return;
  for (std::size_t frame = 0; frame < frames; ++frame) cutoff_.process(left[frame], right[frame]);
  equalizer_.process(left, right, frames);
  compressor_.process(left, right, frames);
  rotary_.process(left, right, frames);
  delay_.process(left, right, frames);
  reverb_.process(left, right, frames);
}

void ModuleEffects::RotarySpeaker::prepare(double nextSampleRate) {
  sampleRate = nextSampleRate;
  const auto capacity = static_cast<std::size_t>(std::ceil(sampleRate * 0.004)) + 4;
  hornBuffer.assign(capacity, 0.0f);
  drumBuffer.assign(capacity, 0.0f);
  crossover = 1.0f - std::exp(static_cast<float>(-2.0 * kPi * 800.0 / sampleRate));
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
  hornSmoothing = 1.0f - std::exp(-1.0f / (config.rampSeconds * static_cast<float>(sampleRate)));
  drumSmoothing = 1.0f - std::exp(-1.0f / (config.rampSeconds * 1.7f * static_cast<float>(sampleRate)));
}

void ModuleEffects::setModulation(std::uint8_t value) noexcept {
  rotary_.setModulation(value);
}

void ModuleEffects::RotarySpeaker::setModulation(std::uint8_t value) noexcept {
  // Manual Brake/Slow/Fast remains available; a new CC 1 message takes over.
  if (config.modulationEnabled) effectiveSpeed = value >= 64 ? 2 : 1;
}

void ModuleEffects::RotarySpeaker::reset() noexcept {
  std::fill(hornBuffer.begin(), hornBuffer.end(), 0.0f);
  std::fill(drumBuffer.begin(), drumBuffer.end(), 0.0f);
  writeIndex = 0;
  hornPhase = 0.0;
  drumPhase = 0.25;
  hornHz = drumHz = lowPass = 0.0f;
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
  if (!config.enabled || hornBuffer.empty() || drumBuffer.empty()) return;
  const auto targetHz = effectiveSpeed == 0 ? 0.0f : effectiveSpeed == 2 ? config.fastHz : config.slowHz;
  const auto samplesPerMs = static_cast<float>(sampleRate * 0.001);
  for (std::size_t frame = 0; frame < frames; ++frame) {
    hornHz += (targetHz - hornHz) * hornSmoothing;
    drumHz += (targetHz * 0.76f - drumHz) * drumSmoothing;
    hornPhase += hornHz / sampleRate;
    drumPhase += drumHz / sampleRate;
    if (hornPhase >= 1.0) hornPhase -= 1.0;
    if (drumPhase >= 1.0) drumPhase -= 1.0;
    const auto hornMotion = static_cast<float>(std::sin(2.0 * kPi * hornPhase));
    const auto drumMotion = static_cast<float>(std::sin(2.0 * kPi * drumPhase));
    const auto hornDoppler = static_cast<float>(std::cos(2.0 * kPi * hornPhase)) * config.depth;
    const auto drumDoppler = static_cast<float>(std::cos(2.0 * kPi * drumPhase)) * config.depth;
    const auto dryLeft = left[frame];
    const auto dryRight = right[frame];
    const auto mono = (dryLeft + dryRight) * 0.5f;
    lowPass += crossover * (mono - lowPass);
    drumBuffer[writeIndex] = lowPass;
    hornBuffer[writeIndex] = mono - lowPass;
    const auto hornLeft = read(hornBuffer, (0.8f + 0.35f * hornDoppler) * samplesPerMs);
    const auto hornRight = read(hornBuffer, (0.8f - 0.35f * hornDoppler) * samplesPerMs);
    const auto drumLeft = read(drumBuffer, (0.8f + 0.18f * drumDoppler) * samplesPerMs);
    const auto drumRight = read(drumBuffer, (0.8f - 0.18f * drumDoppler) * samplesPerMs);
    const auto hornPan = hornMotion * config.depth * 0.6f;
    const auto drumPan = drumMotion * config.depth * 0.35f;
    const auto wetLeft = hornLeft * (1.0f - hornPan) + drumLeft * (1.0f - drumPan);
    const auto wetRight = hornRight * (1.0f + hornPan) + drumRight * (1.0f + drumPan);
    left[frame] = dryLeft + (wetLeft - dryLeft) * config.mix;
    right[frame] = dryRight + (wetRight - dryRight) * config.mix;
    writeIndex = (writeIndex + 1) % hornBuffer.size();
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
  const auto milliseconds = config.sync ? (60000.0f / tempoBpm) * config.beatMultiplier : config.delayMs;
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

float ModuleEffects::ReverbDelayLine::processComb(float input, float feedback, float dampen) noexcept {
  const auto output = buffer[index];
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
}

void ModuleEffects::Reverb::process(float* left, float* right, std::size_t frames) noexcept {
  if (!config.enabled) return;
  const auto feedback = 0.65f + config.decay * 0.32f;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto dryLeft = left[frame];
    const auto dryRight = right[frame];
    const auto input = (dryLeft + dryRight) * 0.12f;
    float wetLeft = 0.0f;
    float wetRight = 0.0f;
    for (auto& line : combLeft) wetLeft += line.processComb(input, feedback, config.dampen);
    for (auto& line : combRight) wetRight += line.processComb(input, feedback, config.dampen);
    wetLeft *= 0.25f;
    wetRight *= 0.25f;
    for (auto& line : allPassLeft) wetLeft = line.processAllPass(wetLeft);
    for (auto& line : allPassRight) wetRight = line.processAllPass(wetRight);
    left[frame] = dryLeft + (wetLeft - dryLeft) * config.mix;
    right[frame] = dryRight + (wetRight - dryRight) * config.mix;
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
