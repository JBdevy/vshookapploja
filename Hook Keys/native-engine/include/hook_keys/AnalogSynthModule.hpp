#pragma once

#include "hook_keys/ModuleSynth.hpp"
#include "hook_keys/RealtimeCommandQueue.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace hook_keys {

struct AnalogSynthConfig final {
  std::uint8_t oscillator1 = 1; // sine, saw, square, triangle
  std::uint8_t oscillator2 = 2;
  std::uint8_t voiceMode = 1;   // poly, mono, legato
  std::uint8_t lfoTarget = 1;   // pitch, filter, volume
  float oscillatorMix = 0.35f;
  float detuneCents = 7.0f;
  float attackMs = 0.0f;
  float holdMs = 15000.0f;
  float decayMs = 25000.0f;
  float sustain = 1.0f;
  float releaseMs = 100.0f;
  float filterCutoffHz = 20000.0f;
  float filterResonance = 0.18f;
  float filterEnvelope = 0.24f;
  float lfoRateHz = 4.0f;
  float lfoDepth = 0.0f;
  float glideMs = 45.0f;

  void normalize(double sampleRate) noexcept {
    oscillator1 = std::min<std::uint8_t>(oscillator1, 3);
    oscillator2 = std::min<std::uint8_t>(oscillator2, 3);
    voiceMode = std::min<std::uint8_t>(voiceMode, 2);
    lfoTarget = std::min<std::uint8_t>(lfoTarget, 2);
    oscillatorMix = std::clamp(oscillatorMix, 0.0f, 1.0f);
    detuneCents = std::clamp(detuneCents, -100.0f, 100.0f);
    attackMs = std::clamp(attackMs, 0.0f, 15000.0f);
    holdMs = std::clamp(holdMs, 0.0f, 15000.0f);
    decayMs = std::clamp(decayMs, 0.0f, 25000.0f);
    sustain = std::clamp(sustain, 0.0f, 1.0f);
    releaseMs = std::clamp(releaseMs, 0.0f, 25000.0f);
    filterCutoffHz = std::clamp(filterCutoffHz, 20.0f,
        static_cast<float>(std::min(20000.0, sampleRate * 0.45)));
    filterResonance = std::clamp(filterResonance, 0.0f, 0.98f);
    filterEnvelope = std::clamp(filterEnvelope, -1.0f, 1.0f);
    lfoRateHz = std::clamp(lfoRateHz, 0.05f, 30.0f);
    lfoDepth = std::clamp(lfoDepth, 0.0f, 1.0f);
    glideMs = std::clamp(glideMs, 0.0f, 5000.0f);
  }
};

// Real-time-safe subtractive synthesizer used by the dedicated Synth module.
class AnalogSynthModule final : public ModuleSynth {
public:
  explicit AnalogSynthModule(double sampleRate) noexcept
      : sampleRate_(std::clamp(sampleRate, 8000.0, 384000.0)) {
    config_.normalize(sampleRate_);
  }

  [[nodiscard]] bool setConfig(AnalogSynthConfig config) noexcept {
    config.normalize(sampleRate_);
    return pendingConfigs_.tryPush(config);
  }

  void beginBlock() noexcept override {
    AnalogSynthConfig next;
    while (pendingConfigs_.tryPop(next)) {
      const auto previousMode = config_.voiceMode;
      config_ = next;
      if (previousMode != config_.voiceMode) allNotesOff();
    }
  }

  void noteOn(std::uint8_t note, std::uint8_t velocity) noexcept override {
    note = std::min<std::uint8_t>(note, 127);
    velocity = std::max<std::uint8_t>(velocity, 1);
    held_[note] = true;
    heldVelocity_[note] = velocity;
    heldOrder_[note] = ++noteOrder_;
    if (config_.voiceMode == 0) {
      startVoice(voiceForPolyNote(note), note, velocity, true);
      return;
    }
    auto& voice = voices_[0];
    const bool legato = config_.voiceMode == 2 && voice.active;
    startVoice(voice, note, velocity, !legato);
  }

  void noteOff(std::uint8_t note) noexcept override {
    note = std::min<std::uint8_t>(note, 127);
    held_[note] = false;
    if (sustainDown_) return;
    if (config_.voiceMode == 0) {
      for (auto& voice : voices_) if (voice.active && voice.note == note) releaseVoice(voice);
      return;
    }
    auto& voice = voices_[0];
    if (!voice.active || voice.note != note) return;
    const auto fallback = newestHeldNote();
    if (fallback >= 0) {
      startVoice(voice, static_cast<std::uint8_t>(fallback), heldVelocity_[fallback], false);
    } else {
      releaseVoice(voice);
    }
  }

  void controlChange(std::uint8_t controller, std::uint8_t value) noexcept override {
    if (controller == 1) modulation_ = static_cast<float>(value) / 127.0f;
    if (controller != 64) return;
    const bool next = value >= 64;
    if (sustainDown_ && !next) {
      for (auto& voice : voices_) {
        if (voice.active && !held_[voice.note]) releaseVoice(voice);
      }
    }
    sustainDown_ = next;
  }

  void pitchBend(std::uint16_t value) noexcept override {
    pitchBendSemitones_ = (static_cast<float>(std::min<std::uint16_t>(value, 16383)) - 8192.0f)
        / 8192.0f * 2.0f;
  }

  void allNotesOff() noexcept override {
    held_.fill(false);
    sustainDown_ = false;
    for (auto& voice : voices_) releaseVoice(voice);
  }

  void renderAdd(float* left, float* right, std::size_t frames, float gainLinear) noexcept override {
    if (left == nullptr || right == nullptr || frames == 0) return;
    constexpr double kTwoPi = 6.28318530717958647692;
    const auto lfoIncrement = static_cast<double>(config_.lfoRateHz) / sampleRate_;
    const auto glideCoefficient = config_.glideMs <= 0.01f ? 1.0
        : 1.0 - std::exp(-1.0 / (sampleRate_ * static_cast<double>(config_.glideMs) * 0.001));
    for (std::size_t frame = 0; frame < frames; ++frame) {
      const auto lfo = static_cast<float>(std::sin(kTwoPi * lfoPhase_));
      lfoPhase_ += lfoIncrement;
      if (lfoPhase_ >= 1.0) lfoPhase_ -= 1.0;
      float mixed = 0.0f;
      for (auto& voice : voices_) {
        if (!voice.active) continue;
        voice.currentFrequency += (voice.targetFrequency - voice.currentFrequency) * glideCoefficient;
        const auto lfoAmount = config_.lfoDepth * (0.35f + modulation_ * 0.65f);
        const auto pitchLfo = config_.lfoTarget == 0 ? lfo * lfoAmount * 2.0f : 0.0f;
        const auto bendRatio = std::pow(2.0, static_cast<double>(pitchBendSemitones_ + pitchLfo) / 12.0);
        const auto frequency1 = voice.currentFrequency * bendRatio;
        const auto frequency2 = frequency1 * std::pow(2.0, static_cast<double>(config_.detuneCents) / 1200.0);
        voice.phase1 = advancePhase(voice.phase1, frequency1);
        voice.phase2 = advancePhase(voice.phase2, frequency2);
        const auto osc1 = waveform(config_.oscillator1, voice.phase1);
        const auto osc2 = waveform(config_.oscillator2, voice.phase2);
        const auto envelope = advanceEnvelope(voice);
        if (!voice.active) continue;
        auto sample = (osc1 * (1.0f - config_.oscillatorMix) + osc2 * config_.oscillatorMix)
            * envelope * voice.velocity;
        const auto filterLfo = config_.lfoTarget == 1 ? lfo * lfoAmount * 4.0f : 0.0f;
        const auto envelopeOctaves = config_.filterEnvelope * envelope * 5.0f;
        const auto cutoff = config_.filterCutoffHz * std::pow(2.0f, envelopeOctaves + filterLfo);
        sample = processFilter(voice, sample, cutoff);
        if (config_.lfoTarget == 2) sample *= std::clamp(1.0f + lfo * lfoAmount, 0.0f, 1.5f);
        mixed += sample;
      }
      const auto output = std::tanh(mixed * 0.22f) * gainLinear;
      left[frame] += output;
      right[frame] += output;
    }
  }

private:
  enum class EnvelopeStage : std::uint8_t { idle, attack, hold, decay, sustain, release };
  struct Voice final {
    bool active = false;
    std::uint8_t note = 0;
    std::uint64_t age = 0;
    double phase1 = 0.0;
    double phase2 = 0.0;
    double currentFrequency = 440.0;
    double targetFrequency = 440.0;
    float velocity = 0.0f;
    float envelope = 0.0f;
    float releaseStep = 0.0f;
    std::size_t holdFrames = 0;
    EnvelopeStage stage = EnvelopeStage::idle;
    float filterIc1 = 0.0f;
    float filterIc2 = 0.0f;
  };

  [[nodiscard]] static double frequencyFor(std::uint8_t note) noexcept {
    return 440.0 * std::pow(2.0, (static_cast<double>(note) - 69.0) / 12.0);
  }

  [[nodiscard]] Voice& voiceForPolyNote(std::uint8_t note) noexcept {
    for (auto& voice : voices_) if (voice.active && voice.note == note) return voice;
    for (auto& voice : voices_) if (!voice.active) return voice;
    return *std::min_element(voices_.begin(), voices_.end(),
        [](const Voice& left, const Voice& right) { return left.age < right.age; });
  }

  void startVoice(Voice& voice, std::uint8_t note, std::uint8_t velocity, bool retrigger) noexcept {
    const auto nextFrequency = frequencyFor(note);
    if (!voice.active || config_.glideMs <= 0.01f) voice.currentFrequency = nextFrequency;
    voice.targetFrequency = nextFrequency;
    voice.note = note;
    voice.velocity = static_cast<float>(velocity) / 127.0f;
    voice.age = ++voiceAge_;
    voice.active = true;
    if (!retrigger) return;
    voice.phase1 = 0.0;
    voice.phase2 = 0.0;
    voice.envelope = config_.attackMs <= 0.01f ? 1.0f : 0.0f;
    voice.holdFrames = static_cast<std::size_t>(sampleRate_ * config_.holdMs * 0.001);
    voice.stage = config_.attackMs <= 0.01f
        ? (voice.holdFrames > 0 ? EnvelopeStage::hold : EnvelopeStage::decay)
        : EnvelopeStage::attack;
    voice.filterIc1 = 0.0f;
    voice.filterIc2 = 0.0f;
  }

  void releaseVoice(Voice& voice) noexcept {
    if (!voice.active || voice.stage == EnvelopeStage::release) return;
    if (config_.releaseMs <= 0.01f) {
      voice = Voice{};
      return;
    }
    const auto frames = std::max(1.0, sampleRate_ * config_.releaseMs * 0.001);
    voice.releaseStep = voice.envelope / static_cast<float>(frames);
    voice.stage = EnvelopeStage::release;
  }

  [[nodiscard]] float advanceEnvelope(Voice& voice) noexcept {
    switch (voice.stage) {
      case EnvelopeStage::attack: {
        const auto frames = std::max(1.0, sampleRate_ * config_.attackMs * 0.001);
        voice.envelope += static_cast<float>(1.0 / frames);
        if (voice.envelope >= 1.0f) {
          voice.envelope = 1.0f;
          voice.stage = voice.holdFrames > 0 ? EnvelopeStage::hold : EnvelopeStage::decay;
        }
        break;
      }
      case EnvelopeStage::hold:
        if (voice.holdFrames > 0) --voice.holdFrames;
        else voice.stage = EnvelopeStage::decay;
        break;
      case EnvelopeStage::decay: {
        const auto frames = std::max(1.0, sampleRate_ * config_.decayMs * 0.001);
        voice.envelope -= (1.0f - config_.sustain) / static_cast<float>(frames);
        if (voice.envelope <= config_.sustain) {
          voice.envelope = config_.sustain;
          voice.stage = EnvelopeStage::sustain;
        }
        break;
      }
      case EnvelopeStage::sustain:
        voice.envelope = config_.sustain;
        break;
      case EnvelopeStage::release:
        voice.envelope -= voice.releaseStep;
        if (voice.envelope <= 0.00001f) voice = Voice{};
        break;
      case EnvelopeStage::idle:
        voice.active = false;
        break;
    }
    return voice.envelope;
  }

  [[nodiscard]] double advancePhase(double phase, double frequency) const noexcept {
    phase += std::clamp(frequency, 1.0, sampleRate_ * 0.45) / sampleRate_;
    return phase - std::floor(phase);
  }

  [[nodiscard]] static float waveform(std::uint8_t shape, double phase) noexcept {
    constexpr double kTwoPi = 6.28318530717958647692;
    if (shape == 1) return static_cast<float>(phase * 2.0 - 1.0);
    if (shape == 2) return phase < 0.5 ? 1.0f : -1.0f;
    if (shape == 3) return static_cast<float>(1.0 - 4.0 * std::abs(phase - 0.5));
    return static_cast<float>(std::sin(kTwoPi * phase));
  }

  [[nodiscard]] float processFilter(Voice& voice, float input, float cutoffHz) const noexcept {
    constexpr float kPi = 3.14159265358979323846f;
    const auto cutoff = std::clamp(cutoffHz, 20.0f,
        static_cast<float>(std::min(20000.0, sampleRate_ * 0.45)));
    const auto g = std::tan(kPi * cutoff / static_cast<float>(sampleRate_));
    const auto k = 2.0f - config_.filterResonance * 1.92f;
    const auto a1 = 1.0f / (1.0f + g * (g + k));
    const auto a2 = g * a1;
    const auto a3 = g * a2;
    const auto v3 = input - voice.filterIc2;
    const auto v1 = a1 * voice.filterIc1 + a2 * v3;
    const auto v2 = voice.filterIc2 + a2 * voice.filterIc1 + a3 * v3;
    voice.filterIc1 = 2.0f * v1 - voice.filterIc1;
    voice.filterIc2 = 2.0f * v2 - voice.filterIc2;
    return v2;
  }

  [[nodiscard]] int newestHeldNote() const noexcept {
    int selected = -1;
    std::uint64_t newest = 0;
    for (std::size_t note = 0; note < held_.size(); ++note) {
      if (held_[note] && heldOrder_[note] >= newest) {
        selected = static_cast<int>(note);
        newest = heldOrder_[note];
      }
    }
    return selected;
  }

  double sampleRate_ = 48000.0;
  AnalogSynthConfig config_{};
  RealtimeCommandQueue<AnalogSynthConfig, 64> pendingConfigs_{};
  std::array<Voice, 128> voices_{};
  std::array<bool, 128> held_{};
  std::array<std::uint8_t, 128> heldVelocity_{};
  std::array<std::uint64_t, 128> heldOrder_{};
  std::uint64_t noteOrder_ = 0;
  std::uint64_t voiceAge_ = 0;
  bool sustainDown_ = false;
  float modulation_ = 0.0f;
  float pitchBendSemitones_ = 0.0f;
  double lfoPhase_ = 0.0;
};

} // namespace hook_keys
