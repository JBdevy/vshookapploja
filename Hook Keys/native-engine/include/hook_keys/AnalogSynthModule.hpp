#pragma once

#include "hook_keys/ModuleSynth.hpp"
#include "hook_keys/VoiceCutoff.hpp"
#include "hook_keys/RealtimeCommandQueue.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace hook_keys {

struct AnalogSynthConfig final {
  std::uint8_t oscillator1 = 1; // sine, saw, square, triangle
  std::uint8_t oscillator2 = 2;
  bool oscillator1Enabled = true;
  bool oscillator2Enabled = true;
  std::uint8_t voiceMode = 1;   // poly, mono, legato
  std::uint8_t lfoTarget = 1;   // pitch, filter, volume
  float oscillator1Volume = 1.0f;
  float oscillator2Volume = 1.0f;
  float detuneCents = 7.0f;
  float attackMs = 0.0f;
  float holdMs = 15000.0f;
  float decayMs = 25000.0f;
  float sustain = 1.0f;
  float releaseMs = 300.0f;
  float filterCutoffHz = 20000.0f;
  float filterResonance = 0.18f;
  float filterEnvelope = 0.24f;
  float lfoRateHz = 6.85f;
  float lfoDepth = 0.0f;
  float glideMs = 45.0f;
  std::int8_t oscillator1Octave = 0;
  std::int8_t oscillator2Octave = 0;

  void normalize(double sampleRate) noexcept {
    oscillator1 = std::min<std::uint8_t>(oscillator1, 3);
    oscillator2 = std::min<std::uint8_t>(oscillator2, 3);
    voiceMode = std::min<std::uint8_t>(voiceMode, 2);
    lfoTarget = std::min<std::uint8_t>(lfoTarget, 2);
    oscillator1Volume = std::clamp(oscillator1Volume, 0.0f, 1.0f);
    oscillator2Volume = std::clamp(oscillator2Volume, 0.0f, 1.0f);
    detuneCents = std::clamp(detuneCents, -100.0f, 100.0f);
    attackMs = std::clamp(attackMs, 0.0f, 15000.0f);
    holdMs = std::clamp(holdMs, 0.0f, 15000.0f);
    decayMs = std::clamp(decayMs, 0.0f, 25000.0f);
    sustain = 1.0f; // Fixed full envelope sustain; no user control.
    releaseMs = std::clamp(releaseMs, 0.0f, 25000.0f);
    filterCutoffHz = std::clamp(filterCutoffHz, 20.0f,
        static_cast<float>(std::min(20000.0, sampleRate * 0.45)));
    filterResonance = std::clamp(filterResonance, 0.0f, 0.98f);
    filterEnvelope = std::clamp(filterEnvelope, -1.0f, 1.0f);
    lfoRateHz = std::clamp(lfoRateHz, 0.05f, 30.0f);
    lfoDepth = std::clamp(lfoDepth, 0.0f, 1.0f);
    glideMs = std::clamp(glideMs, 0.0f, 5000.0f);
    oscillator1Octave = std::clamp<std::int8_t>(oscillator1Octave, -3, 3);
    oscillator2Octave = std::clamp<std::int8_t>(oscillator2Octave, -3, 3);
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
      for (std::size_t index = 0; index < activeVoiceLimit_; ++index) {
        voices_[index].filterUpdateCountdown = 0;
      }
    }
  }

  bool hasActiveVoices() const noexcept override {
    return std::any_of(voices_.begin(), voices_.begin() + activeVoiceLimit_,
        [](const auto& voice) { return voice.active; });
  }
  bool canSkipRenderingWhenIdle() const noexcept override { return true; }

  void noteOn(std::uint8_t note, std::uint8_t velocity) noexcept override {
    noteOnWithFilterVelocity(note, velocity, velocity);
  }

  // Mod card no Synth. LFO: a roda aciona o LFO configurado no editor do Synth
  // (rate e destino de lá). User: a roda não faz nada no Synth. O Synth não tem
  // vibrato próprio da roda, então o rate do card não se aplica aqui.
  // Só o modo LFO (1) muda algo aqui: o Synth não tem tremolo próprio da roda.
  void setModulationMode(std::uint8_t mode, float) noexcept {
    wheelDrivesLfo_.store(mode == 1, std::memory_order_relaxed);
  }

  // Velocity limit per oscillator: a key struck harder than an oscillator's
  // limit does not sound on that oscillator (raw key velocity, 127 = always).
  void setOscillatorVelocityLimits(std::uint8_t oscillator1, std::uint8_t oscillator2) noexcept {
    oscillatorVelocityLimits_.store(static_cast<std::uint16_t>(
        std::min<int>(oscillator1, 127) | (std::min<int>(oscillator2, 127) << 8)), std::memory_order_relaxed);
  }

  void setGlideBehavior(GlideBehavior behavior) noexcept override {
    glideBehavior_.store(behavior.pack(), std::memory_order_relaxed);
  }

  void setCutoffConfig(CutoffConfig config) noexcept override {
    if (cutoffConfig_.enabled == config.enabled && cutoffConfig_.frequencyHz == config.frequencyHz &&
        cutoffConfig_.velocityCurve == config.velocityCurve) return;
    cutoffConfig_ = config;
    for (auto& voice : voices_) if (voice.active)
      voice.moduleCutoff.configure(config.frequencyForVelocity(heldFilterVelocity_[voice.note]), sampleRate_);
  }

  void setNoVelocitySensitivity(bool enabled) noexcept override {
    noVelocitySensitivity_ = enabled;
  }

  void noteOnWithFilterVelocity(std::uint8_t note, std::uint8_t velocity,
      std::uint8_t filterVelocity) noexcept override {
    note = std::min<std::uint8_t>(note, 127);
    // A key above both sounding oscillators' limits plays nothing, so it must
    // not cut or retrigger the note already sounding.
    const auto limits = oscillatorVelocityLimits_.load(std::memory_order_relaxed);
    if (!(config_.oscillator1Enabled && filterVelocity <= (limits & 0xff)) &&
        !(config_.oscillator2Enabled && filterVelocity <= (limits >> 8))) return;
    heldFilterVelocity_[note] = filterVelocity;
    velocity = std::max<std::uint8_t>(velocity, 1);
    held_[note] = true;
    heldVelocity_[note] = velocity;
    heldOrder_[note] = ++noteOrder_;
    if (config_.voiceMode == 0) {
      auto& voice = voiceForPolyNote(note);
      const Voice* phaseReference = nullptr;
      for (std::size_t index = 0; index < activeVoiceLimit_; ++index) {
        const auto& candidate = voices_[index];
        if (candidate.active && candidate.note == note &&
            (!phaseReference || candidate.age > phaseReference->age)) phaseReference = &candidate;
      }
      const auto phase1 = phaseReference ? phaseReference->phase1 : 0.0;
      const auto phase2 = phaseReference ? phaseReference->phase2 : 0.0;
      startVoice(voice, note, velocity, true);
      // A camada nova ganha envelope próprio, mas começa na mesma fase da
      // camada anterior para não criar uma quina audível no retrigger.
      if (phaseReference && phaseReference != &voice) {
        voice.phase1 = phase1;
        voice.phase2 = phase2;
      }
      return;
    }
    auto& voice = voices_[0];
    // A voice fading out has no key left to tie to: Legato must re-attack it,
    // otherwise the new note keeps releasing while the key stays down.
    const bool legato = config_.voiceMode == 2 && voice.active && voice.stage != EnvelopeStage::release;
    startVoice(voice, note, velocity, !legato);
  }

  void noteOff(std::uint8_t note) noexcept override {
    note = std::min<std::uint8_t>(note, 127);
    held_[note] = false;
    if (sustainDown_) {
      for (std::size_t index = 0; index < activeVoiceLimit_; ++index) {
        auto& voice = voices_[index];
        if (voice.active && voice.note == note && voice.stage != EnvelopeStage::release) {
          voice.heldSustain = true;
        }
      }
      return;
    }
    if (config_.voiceMode == 0) {
      for (std::size_t index = 0; index < activeVoiceLimit_; ++index) {
        auto& voice = voices_[index];
        if (voice.active && voice.note == note) releaseVoice(voice);
      }
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

  void stealNote(std::uint8_t note) noexcept override {
    note = std::min<std::uint8_t>(note, 127);
    held_[note] = false;
    for (std::size_t index = 0; index < activeVoiceLimit_; ++index) {
      auto& voice = voices_[index];
      if (!voice.active || voice.note != note) continue;
      // A very short release avoids a discontinuity but actually frees the
      // oldest musical voice instead of respecting the normal release time.
      const auto frames = std::max(1.0, sampleRate_ * 0.005);
      voice.releaseStep = std::max(voice.envelope, 0.00001f) / static_cast<float>(frames);
      voice.stage = EnvelopeStage::release;
    }
  }

  void controlChange(std::uint8_t controller, std::uint8_t value) noexcept override {
    if (controller == 1) modulation_ = static_cast<float>(value) / 127.0f;
    if (controller != 64) return;
    const bool next = value >= 64;
    if (sustainDown_ && !next) {
      for (std::size_t index = 0; index < activeVoiceLimit_; ++index) {
        auto& voice = voices_[index];
        if (voice.active && voice.heldSustain) {
          voice.heldSustain = false;
          releaseVoice(voice);
        }
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
    for (std::size_t index = 0; index < activeVoiceLimit_; ++index) releaseVoice(voices_[index]);
  }

  void renderAdd(float* left, float* right, std::size_t frames, float gainLinear) noexcept override {
    if (left == nullptr || right == nullptr || frames == 0) return;
    constexpr double kTwoPi = 6.28318530717958647692;
    const auto lfoIncrement = static_cast<double>(config_.lfoRateHz) / sampleRate_;
    const auto detuneRatio = std::pow(2.0, static_cast<double>(config_.detuneCents) / 1200.0);
    const bool wheelDrivesLfo = wheelDrivesLfo_.load(std::memory_order_relaxed);
    const auto lfoAmount = config_.lfoDepth + (wheelDrivesLfo ? (1.0f - config_.lfoDepth) * modulation_ : 0.0f);
    for (std::size_t frame = 0; frame < frames; ++frame) {
      const auto lfo = static_cast<float>(std::sin(kTwoPi * lfoPhase_));
      lfoPhase_ += lfoIncrement;
      if (lfoPhase_ >= 1.0) lfoPhase_ -= 1.0;
      float mixed = 0.0f;
      const auto pitchLfo = config_.lfoTarget == 0 ? lfo * lfoAmount * 2.0f : 0.0f;
      const auto bendRatio = std::pow(2.0, static_cast<double>(pitchBendSemitones_ + pitchLfo) / 12.0);
      const auto filterLfo = config_.lfoTarget == 1 ? lfo * lfoAmount * 4.0f : 0.0f;
      for (std::size_t index = 0; index < activeVoiceLimit_; ++index) {
        auto& voice = voices_[index];
        if (!voice.active) continue;
        if (config_.glideMs <= 0.01f) {
          voice.currentFrequency = voice.targetFrequency;
          voice.glideFramesRemaining = 0;
        } else if (voice.glideFramesRemaining > 0) {
          voice.currentFrequency += voice.glideFrequencyStep;
          if (--voice.glideFramesRemaining == 0) voice.currentFrequency = voice.targetFrequency;
        }
        // Depth sets the base modulation; CC1 adds depth even when it is zero.
        const auto baseFrequency = voice.currentFrequency * bendRatio;
        const auto frequency1 = std::ldexp(baseFrequency, config_.oscillator1Octave);
        const auto frequency2 = std::ldexp(baseFrequency * detuneRatio, config_.oscillator2Octave);
        voice.phase1 = advancePhase(voice.phase1, frequency1);
        voice.phase2 = advancePhase(voice.phase2, frequency2);
        const auto osc1 = waveform(config_.oscillator1, voice.phase1);
        const auto osc2 = waveform(config_.oscillator2, voice.phase2);
        const auto envelope = advanceEnvelope(voice);
        if (!voice.active) continue;
        const auto oscillatorSignal = (config_.oscillator1Enabled && voice.oscillator1Gate ? osc1 * config_.oscillator1Volume : 0.0f)
            + (config_.oscillator2Enabled && voice.oscillator2Gate ? osc2 * config_.oscillator2Volume : 0.0f);
        // No Sens: lido a cada bloco, então ligar/desligar já vale pras vozes
        // que estão soando agora, sem esperar a próxima tecla.
        auto sample = oscillatorSignal * envelope * (noVelocitySensitivity_ ? 1.0f : voice.velocity);
        if (voice.filterUpdateCountdown == 0) {
          const auto envelopeOctaves = config_.filterEnvelope * envelope * 5.0f;
          const auto cutoff = config_.filterCutoffHz * std::pow(2.0f, envelopeOctaves + filterLfo);
          updateFilterCoefficients(voice, cutoff);
          voice.filterUpdateCountdown = kFilterControlBlock;
        }
        --voice.filterUpdateCountdown;
        sample = processFilter(voice, sample);
        sample = voice.moduleCutoff.process(sample);
        if (config_.lfoTarget == 2) sample *= std::clamp(1.0f + lfo * lfoAmount, 0.0f, 1.5f);
        mixed += sample;
      }
      // Do not hide headroom attenuation behind a control labelled 0 dB.
      // The module fader is the only post-synth gain: overload remains visible
      // on its meter (yellow/red) so the musician can lower it deliberately.
      const auto output = mixed * gainLinear;
      left[frame] += output;
      right[frame] += output;
      while (activeVoiceLimit_ > 0 && !voices_[activeVoiceLimit_ - 1].active) --activeVoiceLimit_;
    }
  }

private:
  enum class EnvelopeStage : std::uint8_t { idle, attack, hold, decay, sustain, release };
  struct Voice final {
    VoiceCutoff moduleCutoff{};
    bool active = false;
    std::uint8_t note = 0;
    std::uint64_t age = 0;
    double phase1 = 0.0;
    double phase2 = 0.0;
    double currentFrequency = 440.0;
    double targetFrequency = 440.0;
    double glideFrequencyStep = 0.0;
    std::size_t glideFramesRemaining = 0;
    float velocity = 0.0f;
    float envelope = 0.0f;
    bool oscillator1Gate = true;
    bool oscillator2Gate = true;
    bool heldSustain = false;
    float releaseStep = 0.0f;
    std::size_t holdFrames = 0;
    EnvelopeStage stage = EnvelopeStage::idle;
    float filterIc1 = 0.0f;
    float filterIc2 = 0.0f;
    float filterA1 = 1.0f;
    float filterA2 = 0.0f;
    float filterA3 = 0.0f;
    std::uint8_t filterUpdateCountdown = 0;
  };

  static constexpr std::uint8_t kFilterControlBlock = 16;
  // Shortest gain change the synth makes: short enough to keep Attack 0 and
  // Release 0 percussive, long enough that the step is not heard as a click.
  static constexpr double kDeclickMs = 5.0;

  [[nodiscard]] double rampFrames(float milliseconds) const noexcept {
    return sampleRate_ * std::max(kDeclickMs, static_cast<double>(milliseconds)) * 0.001;
  }

  [[nodiscard]] static double frequencyFor(std::uint8_t note) noexcept {
    return 440.0 * std::pow(2.0, (static_cast<double>(note) - 69.0) / 12.0);
  }

  [[nodiscard]] Voice& voiceForPolyNote(std::uint8_t note) noexcept {
    (void)note;
    // Retrigger da mesma altura tambem precisa de uma voz nova. Reaproveitar a
    // voz que ja estava soando cortava o ataque anterior antes do Note Off.
    for (auto& voice : voices_) if (!voice.active) return voice;
    return *std::min_element(voices_.begin(), voices_.end(),
        [](const Voice& left, const Voice& right) { return left.age < right.age; });
  }

  void startVoice(Voice& voice, std::uint8_t note, std::uint8_t velocity, bool retrigger) noexcept {
    // Mono reuses its one voice and must continue the waveform; Poly creates
    // an independent layer and seeds its phase in noteOnWithFilterVelocity.
    const bool sounding = voice.active && voice.envelope > 0.0f;
    if (retrigger && !sounding) voice.moduleCutoff.reset();
    voice.moduleCutoff.configure(cutoffConfig_.frequencyForVelocity(heldFilterVelocity_[note]), sampleRate_);
    const auto voiceIndex = static_cast<std::size_t>(&voice - voices_.data());
    activeVoiceLimit_ = std::max(activeVoiceLimit_, voiceIndex + 1);
    const auto nextFrequency = frequencyFor(note);
    const auto behavior = GlideBehavior::unpack(glideBehavior_.load(std::memory_order_relaxed));
    const bool glideEnabled = config_.glideMs > 0.01f && behavior.glidesAt(heldFilterVelocity_[note]);
    const bool sliding = voice.active && voice.envelope > 0.0f;
    if (!glideEnabled) {
      voice.currentFrequency = nextFrequency;
    } else if (!behavior.portamento) {
      // Auto: every newly activated note begins one whole tone below itself.
      voice.currentFrequency = nextFrequency * std::pow(2.0, -2.0 / 12.0);
    } else if (sliding) {
      // Portamento keeps a sounding voice's current pitch (Mono, Legato, or a
      // note re-pressed in its release) and slides on from there.
    } else {
      voice.currentFrequency = lastNoteFrequency_ > 0.0 ? lastNoteFrequency_ : nextFrequency;
    }
    lastNoteFrequency_ = nextFrequency;
    voice.targetFrequency = nextFrequency;
    if (glideEnabled && voice.currentFrequency != voice.targetFrequency) {
      voice.glideFramesRemaining = static_cast<std::size_t>(
          std::max(1.0, sampleRate_ * static_cast<double>(config_.glideMs) * 0.001));
      voice.glideFrequencyStep = (voice.targetFrequency - voice.currentFrequency)
          / static_cast<double>(voice.glideFramesRemaining);
    } else {
      voice.glideFramesRemaining = 0;
      voice.glideFrequencyStep = 0.0;
    }
    voice.note = note;
    voice.velocity = static_cast<float>(velocity) / 127.0f;
    const auto limits = oscillatorVelocityLimits_.load(std::memory_order_relaxed);
    voice.oscillator1Gate = heldFilterVelocity_[note] <= (limits & 0xff);
    voice.oscillator2Gate = heldFilterVelocity_[note] <= (limits >> 8);
    voice.heldSustain = false;
    voice.age = ++voiceAge_;
    voice.active = true;
    if (!retrigger) return;
    if (!sounding) {
      voice.phase1 = 0.0;
      voice.phase2 = 0.0;
      voice.envelope = 0.0f;
      voice.filterIc1 = 0.0f;
      voice.filterIc2 = 0.0f;
    }
    // Attack always ramps from the current level; Attack 0 uses the de-click
    // ramp instead of jumping to full gain in a single sample.
    voice.holdFrames = static_cast<std::size_t>(sampleRate_ * config_.holdMs * 0.001);
    voice.stage = EnvelopeStage::attack;
    voice.filterUpdateCountdown = 0;
  }

  void releaseVoice(Voice& voice) noexcept {
    if (!voice.active || voice.stage == EnvelopeStage::release) return;
    const auto frames = rampFrames(config_.releaseMs);
    voice.releaseStep = voice.envelope / static_cast<float>(frames);
    voice.stage = EnvelopeStage::release;
  }

  [[nodiscard]] float advanceEnvelope(Voice& voice) noexcept {
    switch (voice.stage) {
      case EnvelopeStage::attack: {
        voice.envelope += static_cast<float>(1.0 / rampFrames(config_.attackMs));
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

  void updateFilterCoefficients(Voice& voice, float cutoffHz) const noexcept {
    constexpr float kPi = 3.14159265358979323846f;
    const auto cutoff = std::clamp(cutoffHz, 20.0f,
        static_cast<float>(std::min(20000.0, sampleRate_ * 0.45)));
    const auto g = std::tan(kPi * cutoff / static_cast<float>(sampleRate_));
    const auto k = 2.0f - config_.filterResonance * 1.92f;
    voice.filterA1 = 1.0f / (1.0f + g * (g + k));
    voice.filterA2 = g * voice.filterA1;
    voice.filterA3 = g * voice.filterA2;
  }

  [[nodiscard]] static float processFilter(Voice& voice, float input) noexcept {
    const auto v3 = input - voice.filterIc2;
    const auto v1 = voice.filterA1 * voice.filterIc1 + voice.filterA2 * v3;
    const auto v2 = voice.filterIc2 + voice.filterA2 * voice.filterIc1 + voice.filterA3 * v3;
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
  // Headroom lets a stolen voice finish its short de-click release while the
  // replacement starts. The user-facing polyphony limit remains 128 notes.
  std::array<Voice, 256> voices_{};
  std::size_t activeVoiceLimit_ = 0;
  std::array<bool, 128> held_{};
  std::array<std::uint8_t, 128> heldVelocity_{};
  std::array<std::uint8_t, 128> heldFilterVelocity_{};
  CutoffConfig cutoffConfig_{};
  bool noVelocitySensitivity_ = false;
  std::array<std::uint64_t, 128> heldOrder_{};
  std::uint64_t noteOrder_ = 0;
  std::uint64_t voiceAge_ = 0;
  bool sustainDown_ = false;
  float modulation_ = 0.0f;
  float pitchBendSemitones_ = 0.0f;
  double lfoPhase_ = 0.0;
  // Pitch of the last note started, the Portamento source for a new voice.
  double lastNoteFrequency_ = 0.0;
  std::atomic<std::uint16_t> glideBehavior_{GlideBehavior{}.pack()};
  std::atomic<std::uint16_t> oscillatorVelocityLimits_{static_cast<std::uint16_t>(127 | (127 << 8))};
  std::atomic<bool> wheelDrivesLfo_{false};
};

} // namespace hook_keys
