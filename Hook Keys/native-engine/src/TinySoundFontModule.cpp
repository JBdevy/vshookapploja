#include "hook_keys/TinySoundFontModule.hpp"
#include "hook_keys/TinySoundFontExtensions.hpp"

#include "tsf.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace hook_keys {

namespace {
constexpr int kChannel = 0;
constexpr double kMinimumSampleRate = 8000.0;
constexpr double kMaximumSampleRate = 384000.0;
// Samplers reserve nominal polyphonic headroom at their source. This is a
// fixed calibration, not a limiter: adding a note never turns another note
// down and the module/master faders remain true unity-gain controls at 0 dB.
constexpr float kSamplerNominalGainDb = -12.0f;
}

TinySoundFontModule::TinySoundFontModule(
    double sampleRate, std::size_t maximumBlockFrames, std::size_t maximumVoices)
    : sampleRate_(std::clamp(sampleRate, kMinimumSampleRate, kMaximumSampleRate)),
      maximumBlockFrames_(std::max<std::size_t>(maximumBlockFrames, 1)),
      maximumVoices_(static_cast<int>(
          std::clamp<std::size_t>(maximumVoices, 1, kHookKeysMaximumVoices))),
      scratchInterleaved_(maximumBlockFrames_ * 2, 0.0f) {}

TinySoundFontModule::~TinySoundFontModule() {
  collectRetiredSoundFonts();
  if (auto* pending = pending_.exchange(nullptr, std::memory_order_acq_rel);
      pending != nullptr && pending != unloadMarker()) {
    tsf_close(pending);
  }
  if (deferredRetired_ != nullptr) tsf_close(deferredRetired_);
  if (active_ != nullptr) tsf_close(active_);
  if (shareable_ != nullptr) tsf_close(shareable_);
}

bool TinySoundFontModule::loadFromFile(const char* utf8Path) noexcept {
  if (utf8Path == nullptr || *utf8Path == '\0') return false;
  collectRetiredSoundFonts();
  auto* prepared = tsf_load_filename(utf8Path);
  if (prepared == nullptr) return false;
  if (!configure(prepared)) {
    tsf_close(prepared);
    return false;
  }
  auto* shareable = tsf_copy(prepared);
  if (shareable == nullptr) {
    tsf_close(prepared);
    return false;
  }
  if (shareable_ != nullptr) tsf_close(shareable_);
  shareable_ = shareable;
  stage(prepared);
  return true;
}

bool TinySoundFontModule::loadFromMemory(const void* data, std::size_t size) noexcept {
  if (data == nullptr || size == 0 || size > static_cast<std::size_t>(std::numeric_limits<int>::max())) return false;
  collectRetiredSoundFonts();
  auto* prepared = tsf_load_memory(data, static_cast<int>(size));
  if (prepared == nullptr) return false;
  if (!configure(prepared)) {
    tsf_close(prepared);
    return false;
  }
  auto* shareable = tsf_copy(prepared);
  if (shareable == nullptr) {
    tsf_close(prepared);
    return false;
  }
  if (shareable_ != nullptr) tsf_close(shareable_);
  shareable_ = shareable;
  stage(prepared);
  return true;
}

bool TinySoundFontModule::copySoundFontFrom(const TinySoundFontModule& source) noexcept {
  if (source.shareable_ == nullptr || &source == this) return false;
  collectRetiredSoundFonts();
  auto* prepared = tsf_copy(source.shareable_);
  if (prepared == nullptr) return false;
  auto* shareable = tsf_copy(source.shareable_);
  if (shareable == nullptr || !configure(prepared)) {
    if (shareable != nullptr) tsf_close(shareable);
    tsf_close(prepared);
    return false;
  }
  if (shareable_ != nullptr) tsf_close(shareable_);
  shareable_ = shareable;
  stage(prepared);
  return true;
}

void TinySoundFontModule::unload() noexcept {
  collectRetiredSoundFonts();
  if (shareable_ != nullptr) {
    tsf_close(shareable_);
    shareable_ = nullptr;
  }
  stage(unloadMarker());
}

void TinySoundFontModule::collectRetiredSoundFonts() noexcept {
  tsf* retired = nullptr;
  while (retired_.tryPop(retired)) {
    if (retired != nullptr) tsf_close(retired);
  }
}

void TinySoundFontModule::setVolumeEnvelope(
    float attackMs, float holdMs, float decayMs, float releaseMs, float sustainDb) noexcept {
  sustainDb_.store(std::clamp(sustainDb, -60.0f, 0.0f), std::memory_order_relaxed);
  attackMs_.store(attackMs < 0.0f ? -1.0f : std::clamp(attackMs, 0.0f, 15000.0f), std::memory_order_relaxed);
  holdMs_.store(holdMs < 0.0f ? -1.0f : std::clamp(holdMs, 0.0f, 15000.0f), std::memory_order_relaxed);
  decayMs_.store(decayMs < 0.0f ? -1.0f : std::clamp(decayMs, 0.0f, 25000.0f), std::memory_order_relaxed);
  releaseMs_.store(releaseMs < 0.0f ? -1.0f : std::clamp(releaseMs, 0.0f, 25000.0f), std::memory_order_relaxed);
  preserveEmbeddedSustain_.store(false, std::memory_order_relaxed);
  volumeEnvelopeOverrideEnabled_.store(true, std::memory_order_relaxed);
  envelopeGeneration_.fetch_add(1, std::memory_order_release);
}

void TinySoundFontModule::setReleaseOverride(float releaseMs) noexcept {
  attackMs_.store(-1.0f, std::memory_order_relaxed);
  holdMs_.store(-1.0f, std::memory_order_relaxed);
  decayMs_.store(-1.0f, std::memory_order_relaxed);
  releaseMs_.store(std::clamp(releaseMs, 0.0f, 25000.0f), std::memory_order_relaxed);
  preserveEmbeddedSustain_.store(true, std::memory_order_relaxed);
  volumeEnvelopeOverrideEnabled_.store(true, std::memory_order_relaxed);
  envelopeGeneration_.fetch_add(1, std::memory_order_release);
}

void TinySoundFontModule::useEmbeddedVolumeEnvelope() noexcept {
  preserveEmbeddedSustain_.store(false, std::memory_order_relaxed);
  volumeEnvelopeOverrideEnabled_.store(false, std::memory_order_relaxed);
  envelopeGeneration_.fetch_add(1, std::memory_order_release);
}

std::size_t TinySoundFontModule::sampleBytes() const noexcept {
  return hook_keys_tsf_sample_bytes(shareable_);
}

bool TinySoundFontModule::hasPendingSoundFont() const noexcept {
  const auto* pending = pending_.load(std::memory_order_acquire);
  return pending != nullptr && pending != unloadMarker();
}

void TinySoundFontModule::beginBlock() noexcept {
  if (deferredRetired_ != nullptr) {
    if (!retired_.tryPush(deferredRetired_)) return;
    deferredRetired_ = nullptr;
  }

  auto* prepared = pending_.exchange(nullptr, std::memory_order_acq_rel);
  if (prepared != nullptr) {
    if (active_ != nullptr) {
      tsf_channel_note_off_all(active_, kChannel);
      if (!retired_.tryPush(active_)) deferredRetired_ = active_;
    }
      active_ = prepared == unloadMarker() ? nullptr : prepared;
      glide_ = {};
    appliedEnvelopeGeneration_ = 0;
    if (active_ != nullptr) {
      tsf_set_no_velocity_sensitivity(active_, noVelocitySensitivity_ ? 1 : 0);
    }
  }

  const auto generation = envelopeGeneration_.load(std::memory_order_acquire);
  if (active_ != nullptr && generation != appliedEnvelopeGeneration_) {
    if (volumeEnvelopeOverrideEnabled_.load(std::memory_order_relaxed)) {
      const auto sustainDb = sustainDb_.load(std::memory_order_relaxed);
      hook_keys_tsf_set_volume_envelope(
          active_, attackMs_.load(std::memory_order_relaxed) / 1000.0f,
          holdMs_.load(std::memory_order_relaxed) / 1000.0f,
          decayMs_.load(std::memory_order_relaxed) / 1000.0f,
          releaseMs_.load(std::memory_order_relaxed) / 1000.0f,
          preserveEmbeddedSustain_.load(std::memory_order_relaxed)
              ? -1.0f
              : sustainDb <= -60.0f ? 0.0f : std::pow(10.0f, sustainDb / 20.0f));
    } else {
      hook_keys_tsf_use_embedded_volume_envelope(active_);
    }
    appliedEnvelopeGeneration_ = generation;
  }
  // Fora do modo User, a roda não vai para a modulação do SF2: ela vira
  // vibrato ou tremolo aqui dentro.
  const auto mode = modulationMode_.load(std::memory_order_acquire);
  if (active_ != nullptr && mode != appliedModulationMode_) {
    tsf_channel_midi_control(active_, kChannel, 1, mode == 0 ? modulationValue_ : 0);
    tsf_channel_set_pitchwheel(active_, kChannel, pitchBendValue_);
    modulationDepth_ = 0;
  }
  appliedModulationMode_ = mode;
}

void TinySoundFontModule::noteOn(std::uint8_t note, std::uint8_t velocity) noexcept {
  noteOnWithFilterVelocity(note, velocity, velocity);
}

void TinySoundFontModule::setCutoffConfig(CutoffConfig config) noexcept {
  if (cutoffConfig_ == config) return;
  cutoffConfig_ = config;
  hook_keys_tsf_set_cutoff(active_, config);
}

void TinySoundFontModule::setNoVelocitySensitivity(bool enabled) noexcept {
  if (enabled == noVelocitySensitivity_) return;
  noVelocitySensitivity_ = enabled;
  if (active_ != nullptr) tsf_set_no_velocity_sensitivity(active_, enabled ? 1 : 0);
}

void TinySoundFontModule::setVoiceMode(bool mono, bool legato) noexcept {
  mono_ = mono;
  legato_ = legato;
  if (!mono_) monoSounding_ = false;
}

int TinySoundFontModule::newestMonoHeldNote(std::uint8_t excludingNote) const noexcept {
  int newest = -1;
  std::uint64_t newestOrder = 0;
  for (int note = 0; note < 128; ++note) {
    if (note == excludingNote || !monoHeld_[note]) continue;
    if (monoHeldOrder_[note] > newestOrder) {
      newestOrder = monoHeldOrder_[note];
      newest = note;
    }
  }
  return newest;
}

void TinySoundFontModule::noteOnWithFilterVelocity(std::uint8_t note, std::uint8_t velocity,
    std::uint8_t filterVelocity) noexcept {
  if (active_ == nullptr) return;
  const auto milliseconds = glideMs_.load(std::memory_order_relaxed);
  const auto behavior = GlideBehavior::unpack(glideBehavior_.load(std::memory_order_relaxed));
  if (!mono_) {
    hook_keys_tsf_note_on_with_auto_glide(active_, glide_, kChannel, note,
        static_cast<float>(velocity) / 127.0f, milliseconds, &cutoffConfig_, filterVelocity, behavior);
    return;
  }
  monoHeld_[note] = true;
  monoHeldVelocity_[note] = velocity;
  monoHeldFilterVelocity_[note] = filterVelocity;
  monoHeldOrder_[note] = ++monoNoteOrder_;
  // Legato só vale de uma tecla presa pra outra: a primeira nota depois do
  // silêncio sempre ataca o envelope normalmente, como em qualquer sintetizador.
  if (legato_ && monoSounding_ &&
      hook_keys_tsf_legato_retune(active_, glide_, kChannel, monoNote_, note, milliseconds,
          &cutoffConfig_, filterVelocity, behavior)) {
    monoNote_ = note;
    return;
  }
  if (monoSounding_) hook_keys_tsf_steal_note(active_, glide_, kChannel, monoNote_);
  hook_keys_tsf_note_on_with_auto_glide(active_, glide_, kChannel, note,
      static_cast<float>(velocity) / 127.0f, milliseconds, &cutoffConfig_, filterVelocity, behavior);
  monoSounding_ = true;
  monoNote_ = note;
}

void TinySoundFontModule::noteOff(std::uint8_t note) noexcept {
  if (active_ == nullptr) return;
  if (!mono_) {
    tsf_channel_note_off(active_, kChannel, note);
    return;
  }
  monoHeld_[note] = false;
  if (!monoSounding_ || monoNote_ != note) return;
  const auto fallback = newestMonoHeldNote(note);
  if (fallback < 0) {
    tsf_channel_note_off(active_, kChannel, note);
    monoSounding_ = false;
    return;
  }
  // Voltar pra tecla anterior ainda presa é sempre suave (o dedo nunca saiu
  // dela), independente do Legato estar ligado ou não para notas novas.
  const auto milliseconds = glideMs_.load(std::memory_order_relaxed);
  const auto behavior = GlideBehavior::unpack(glideBehavior_.load(std::memory_order_relaxed));
  const auto fallbackFilterVelocity = monoHeldFilterVelocity_[fallback];
  if (!hook_keys_tsf_legato_retune(active_, glide_, kChannel, monoNote_,
      static_cast<std::uint8_t>(fallback), milliseconds, &cutoffConfig_, fallbackFilterVelocity, behavior)) {
    hook_keys_tsf_note_on_with_auto_glide(active_, glide_, kChannel, static_cast<std::uint8_t>(fallback),
        static_cast<float>(monoHeldVelocity_[fallback]) / 127.0f, milliseconds, &cutoffConfig_,
        fallbackFilterVelocity, behavior);
  }
  monoNote_ = static_cast<std::uint8_t>(fallback);
}

void TinySoundFontModule::stealNote(std::uint8_t note) noexcept {
  if (active_ != nullptr) hook_keys_tsf_steal_note(active_, glide_, kChannel, note);
  if (mono_ && monoSounding_ && monoNote_ == note) monoSounding_ = false;
}

void TinySoundFontModule::controlChange(std::uint8_t controller, std::uint8_t value) noexcept {
  if (controller == 1) {
    modulationValue_ = value;
    // Fora do User, a roda já vira vibrato ou tremolo aqui; não pode somar
    // com a modulação do próprio SF2.
    if (appliedModulationMode_ != 0) value = 0;
  }
  if (active_ != nullptr) tsf_channel_midi_control(active_, kChannel, controller, value);
}

void TinySoundFontModule::pitchBend(std::uint16_t value) noexcept {
  pitchBendValue_ = value;
  if (active_ != nullptr) tsf_channel_set_pitchwheel(active_, kChannel, value);
}

void TinySoundFontModule::allNotesOff() noexcept {
  monoHeld_.fill(false);
  monoSounding_ = false;
  if (active_ == nullptr) return;
  // A panic, route change or arpeggiator activation must not leave voices held
  // by an earlier CC64 value inside TinySoundFont.
  tsf_channel_set_sustain(active_, kChannel, 0);
  modulationValue_ = 0;
  tsf_channel_note_off_all(active_, kChannel);
}

bool TinySoundFontModule::hasActiveVoices() const noexcept {
  return active_ != nullptr && tsf_active_voice_count(active_) > 0;
}

bool TinySoundFontModule::isVoicePoolNearlyFull() const noexcept {
  // Folga para as regioes da proxima nota. Abaixo disso o TinySoundFont teria
  // de roubar por conta propria, sem saber qual nota o musico ainda segura.
  constexpr int kHeadroomVoices = 32;
  return active_ != nullptr &&
      tsf_active_voice_count(active_) + kHeadroomVoices > maximumVoices_;
}

void TinySoundFontModule::renderAdd(
    float* left, float* right, std::size_t frames, float gainLinear) noexcept {
  if (active_ == nullptr || left == nullptr || right == nullptr || frames == 0 || gainLinear <= 0.0f) return;

  std::size_t rendered = 0;
  while (rendered < frames) {
    const bool wheelOpen = modulationValue_ > 0 || modulationDepth_ > 0.00001f;
    const bool vibrato = appliedModulationMode_ == 1 && wheelOpen;
    const bool tremolo = appliedModulationMode_ == 2 && wheelOpen;
    const bool panning = appliedModulationMode_ == 3 && wheelOpen;
    const auto blockFrames = std::min((vibrato || tremolo || panning) ? std::min<std::size_t>(16, maximumBlockFrames_) : maximumBlockFrames_, frames - rendered);
    if (vibrato || tremolo || panning) {
      const float target = static_cast<float>(modulationValue_) / 127.0f *
          modulationIntensity_.load(std::memory_order_relaxed);
      const float smoothing = static_cast<float>(1.0 - std::exp(-static_cast<double>(blockFrames) / (sampleRate_ * 0.015)));
      modulationDepth_ += (target - modulationDepth_) * smoothing;
    }
    if (vibrato) {
      // User-selectable pitch LFO, up to +/- 50 cents at full wheel. A separate
      // base pitch preserves MIDI pitch bend and Auto Glide at the same time.
      const int bend = static_cast<int>(pitchBendValue_) + static_cast<int>(std::lround(
          std::sin(modulationPhase_) * modulationDepth_ * 2048.0));
      tsf_channel_set_pitchwheel(active_, kChannel, std::clamp(bend, 0, 16383));
    }
    hook_keys_tsf_advance_filter_envelope(active_, cutoffConfig_, blockFrames, static_cast<float>(sampleRate_));
    const bool gliding = std::any_of(glide_.voices.begin(), glide_.voices.end(),
        [](const auto& voice) { return voice.total > 0; });
    if (gliding) hook_keys_tsf_render_glide(active_, glide_, scratchInterleaved_.data(),
        static_cast<int>(blockFrames), glideMs_.load(std::memory_order_relaxed) > 0);
    else tsf_render_float(active_, scratchInterleaved_.data(), static_cast<int>(blockFrames), 0);
    constexpr double twoPi = 6.28318530717958647692;
    const double phaseStep = twoPi * static_cast<double>(lfoRateHz_.load(std::memory_order_relaxed)) *
        static_cast<double>(blockFrames) / sampleRate_;
    if (panning) {
      // Pan: a roda abre o quanto o som anda para os lados. Um lado sobe
      // enquanto o outro desce, com a soma sempre no mesmo volume.
      const auto panAt = [](double phase, float depth) {
        return depth * static_cast<float>(std::sin(phase));
      };
      const float startPan = panAt(modulationPhase_, modulationDepth_);
      const float endPan = panAt(modulationPhase_ + phaseStep, modulationDepth_);
      for (std::size_t frame = 0; frame < blockFrames; ++frame) {
        const float mix = blockFrames > 1 ? static_cast<float>(frame) / static_cast<float>(blockFrames - 1) : 1.0f;
        const float pan = startPan + (endPan - startPan) * mix;
        left[rendered + frame] += scratchInterleaved_[frame * 2] * gainLinear * (1.0f - std::max(0.0f, pan));
        right[rendered + frame] += scratchInterleaved_[frame * 2 + 1] * gainLinear * (1.0f + std::min(0.0f, pan));
      }
    } else if (tremolo) {
      // Tremolo: a roda abre o quanto o volume balança, até -12 dB no fundo da
      // onda. O ganho anda junto com a fase, sem degrau entre blocos.
      const auto tremoloGain = [](double phase, float depth) {
        return 1.0f - depth * 0.75f * static_cast<float>(0.5 - 0.5 * std::cos(phase));
      };
      const float startGain = tremoloGain(modulationPhase_, modulationDepth_);
      const float endGain = tremoloGain(modulationPhase_ + phaseStep, modulationDepth_);
      for (std::size_t frame = 0; frame < blockFrames; ++frame) {
        const float mix = blockFrames > 1 ? static_cast<float>(frame) / static_cast<float>(blockFrames - 1) : 1.0f;
        const float gain = (startGain + (endGain - startGain) * mix) * gainLinear;
        left[rendered + frame] += scratchInterleaved_[frame * 2] * gain;
        right[rendered + frame] += scratchInterleaved_[frame * 2 + 1] * gain;
      }
    } else {
      for (std::size_t frame = 0; frame < blockFrames; ++frame) {
        left[rendered + frame] += scratchInterleaved_[frame * 2] * gainLinear;
        right[rendered + frame] += scratchInterleaved_[frame * 2 + 1] * gainLinear;
      }
    }
    rendered += blockFrames;
    modulationPhase_ = std::fmod(modulationPhase_ + phaseStep, twoPi);
  }
}

void TinySoundFontModule::stage(tsf* prepared) noexcept {
  auto* replaced = pending_.exchange(prepared, std::memory_order_acq_rel);
  if (replaced != nullptr && replaced != unloadMarker()) tsf_close(replaced);
}

bool TinySoundFontModule::configure(tsf* synth) const noexcept {
  tsf_set_output(synth, TSF_STEREO_INTERLEAVED, static_cast<int>(std::lround(sampleRate_)), kSamplerNominalGainDb);
  if (!tsf_set_max_voices(synth, maximumVoices_)) return false;
  if (!tsf_channel_set_presetindex(synth, kChannel, 0)) return false;
  return tsf_channel_set_pitchrange(synth, kChannel, 2.0f) != 0;
}

tsf* TinySoundFontModule::unloadMarker() noexcept {
  static std::max_align_t marker{};
  return reinterpret_cast<tsf*>(&marker);
}

} // namespace hook_keys
