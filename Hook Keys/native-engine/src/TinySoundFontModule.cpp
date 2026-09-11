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
}

TinySoundFontModule::TinySoundFontModule(
    double sampleRate, std::size_t maximumBlockFrames, std::size_t maximumVoices)
    : sampleRate_(std::clamp(sampleRate, kMinimumSampleRate, kMaximumSampleRate)),
      maximumBlockFrames_(std::max<std::size_t>(maximumBlockFrames, 1)),
      maximumVoices_(static_cast<int>(std::clamp<std::size_t>(maximumVoices, 1, 256))),
      scratchInterleaved_(maximumBlockFrames_ * 2, 0.0f) {}

TinySoundFontModule::~TinySoundFontModule() {
  collectRetiredSoundFonts();
  if (auto* pending = pending_.exchange(nullptr, std::memory_order_acq_rel);
      pending != nullptr && pending != unloadMarker()) {
    tsf_close(pending);
  }
  if (deferredRetired_ != nullptr) tsf_close(deferredRetired_);
  if (active_ != nullptr) tsf_close(active_);
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
  stage(prepared);
  return true;
}

void TinySoundFontModule::unload() noexcept {
  collectRetiredSoundFonts();
  stage(unloadMarker());
}

void TinySoundFontModule::collectRetiredSoundFonts() noexcept {
  tsf* retired = nullptr;
  while (retired_.tryPop(retired)) {
    if (retired != nullptr) tsf_close(retired);
  }
}

void TinySoundFontModule::setVolumeEnvelope(
    float attackMs, float holdMs, float decayMs, float releaseMs) noexcept {
  attackMs_.store(attackMs < 0.0f ? -1.0f : std::clamp(attackMs, 0.0f, 15000.0f), std::memory_order_relaxed);
  holdMs_.store(holdMs < 0.0f ? -1.0f : std::clamp(holdMs, 0.0f, 15000.0f), std::memory_order_relaxed);
  decayMs_.store(decayMs < 0.0f ? -1.0f : std::clamp(decayMs, 0.0f, 25000.0f), std::memory_order_relaxed);
  releaseMs_.store(releaseMs < 0.0f ? -1.0f : std::clamp(releaseMs, 0.0f, 25000.0f), std::memory_order_relaxed);
  envelopeGeneration_.fetch_add(1, std::memory_order_release);
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
    appliedEnvelopeGeneration_ = 0;
  }

  const auto generation = envelopeGeneration_.load(std::memory_order_acquire);
  if (active_ != nullptr && generation != appliedEnvelopeGeneration_) {
    hook_keys_tsf_set_volume_envelope(
        active_, attackMs_.load(std::memory_order_relaxed) / 1000.0f,
        holdMs_.load(std::memory_order_relaxed) / 1000.0f,
        decayMs_.load(std::memory_order_relaxed) / 1000.0f,
        releaseMs_.load(std::memory_order_relaxed) / 1000.0f);
    appliedEnvelopeGeneration_ = generation;
  }
}

void TinySoundFontModule::noteOn(std::uint8_t note, std::uint8_t velocity) noexcept {
  if (active_ == nullptr) return;
  tsf_channel_note_on(active_, kChannel, note, static_cast<float>(velocity) / 127.0f);
}

void TinySoundFontModule::noteOff(std::uint8_t note) noexcept {
  if (active_ != nullptr) tsf_channel_note_off(active_, kChannel, note);
}

void TinySoundFontModule::controlChange(std::uint8_t controller, std::uint8_t value) noexcept {
  if (active_ != nullptr) tsf_channel_midi_control(active_, kChannel, controller, value);
}

void TinySoundFontModule::pitchBend(std::uint16_t value) noexcept {
  if (active_ != nullptr) tsf_channel_set_pitchwheel(active_, kChannel, value);
}

void TinySoundFontModule::allNotesOff() noexcept {
  if (active_ != nullptr) tsf_channel_note_off_all(active_, kChannel);
}

void TinySoundFontModule::renderAdd(
    float* left, float* right, std::size_t frames, float gainLinear) noexcept {
  if (active_ == nullptr || left == nullptr || right == nullptr || frames == 0 || gainLinear <= 0.0f) return;

  std::size_t rendered = 0;
  while (rendered < frames) {
    const auto blockFrames = std::min(maximumBlockFrames_, frames - rendered);
    tsf_render_float(active_, scratchInterleaved_.data(), static_cast<int>(blockFrames), 0);
    for (std::size_t frame = 0; frame < blockFrames; ++frame) {
      left[rendered + frame] += scratchInterleaved_[frame * 2] * gainLinear;
      right[rendered + frame] += scratchInterleaved_[frame * 2 + 1] * gainLinear;
    }
    rendered += blockFrames;
  }
}

void TinySoundFontModule::stage(tsf* prepared) noexcept {
  auto* replaced = pending_.exchange(prepared, std::memory_order_acq_rel);
  if (replaced != nullptr && replaced != unloadMarker()) tsf_close(replaced);
}

bool TinySoundFontModule::configure(tsf* synth) const noexcept {
  tsf_set_output(synth, TSF_STEREO_INTERLEAVED, static_cast<int>(std::lround(sampleRate_)), 0.0f);
  if (!tsf_set_max_voices(synth, maximumVoices_)) return false;
  if (!tsf_channel_set_presetindex(synth, kChannel, 0)) return false;
  return tsf_channel_set_pitchrange(synth, kChannel, 2.0f) != 0;
}

tsf* TinySoundFontModule::unloadMarker() noexcept {
  static std::max_align_t marker{};
  return reinterpret_cast<tsf*>(&marker);
}

} // namespace hook_keys
