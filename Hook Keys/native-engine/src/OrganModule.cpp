#include "hook_keys/OrganModule.hpp"

#include <algorithm>
#include <cmath>

namespace hook_keys {

OrganModule::OrganModule(double sampleRate, std::size_t maximumBlockFrames)
    : voiceScratchLeft_(maximumBlockFrames, 0.0f),
      voiceScratchRight_(maximumBlockFrames, 0.0f) {
  drawbarSmoothing_ = 1.0f - std::exp(-1.0f / (static_cast<float>(sampleRate) * 0.03f));
  clickLengthSamples_ = std::max<std::uint32_t>(1, static_cast<std::uint32_t>(sampleRate * 0.002));
  for (auto& voice : voices_) {
    voice = std::make_unique<TinySoundFontModule>(sampleRate, maximumBlockFrames);
    // Sem envelope de amplitude próprio: quem faz a dinâmica é a mesa de
    // drawbars, não o ADSR de cada SF2 — o registro soa igual do começo ao
    // fim da nota, como um Hammond de verdade.
    voice->setVolumeEnvelope(0.0f, 15000.0f, 0.0f, 30.0f, 0.0f);
    voice->setNoVelocitySensitivity(true);
    CutoffConfig cutoff;
    cutoff.enabled = false;
    voice->setCutoffConfig(cutoff);
  }
  for (auto& gain : drawbarGain_) gain.store(0.0f, std::memory_order_relaxed);
  for (auto& loaded : voiceLoaded_) loaded.store(false, std::memory_order_relaxed);
}

bool OrganModule::loadVoice(std::size_t drawbarIndex, const char* utf8Path) noexcept {
  if (drawbarIndex >= kDrawbarCount) return false;
  const auto loaded = voices_[drawbarIndex]->loadFromFile(utf8Path);
  voiceLoaded_[drawbarIndex].store(loaded, std::memory_order_release);
  return loaded;
}

void OrganModule::setDrawbarPosition(std::size_t drawbarIndex, std::uint8_t position) noexcept {
  if (drawbarIndex >= kDrawbarCount) return;
  const auto clamped = std::min<std::uint8_t>(position, kDrawbarMax);
  drawbarGain_[drawbarIndex].store(
      static_cast<float>(clamped) / static_cast<float>(kDrawbarMax), std::memory_order_release);
}

void OrganModule::setModulationMode(std::uint8_t mode, float rateHz, float intensity) noexcept {
  for (auto& voice : voices_) voice->setModulationMode(mode, rateHz, intensity);
}

void OrganModule::beginBlock() noexcept {
  for (auto& voice : voices_) voice->beginBlock();
}

void OrganModule::noteOn(std::uint8_t note, std::uint8_t velocity) noexcept {
  static_cast<void>(velocity);
  startKeyClick(127);
  for (auto& voice : voices_) voice->noteOn(note, 127);
}

void OrganModule::noteOnWithFilterVelocity(
    std::uint8_t note, std::uint8_t velocity, std::uint8_t) noexcept {
  static_cast<void>(velocity);
  startKeyClick(127);
  for (auto& voice : voices_) voice->noteOnWithFilterVelocity(note, 127, 127);
}

void OrganModule::startKeyClick(std::uint8_t velocity) noexcept {
  if (velocity == 0) return;
  float loudestDrawbar = 0.0f;
  for (std::size_t index = 0; index < kDrawbarCount; ++index) {
    if (!voiceLoaded_[index].load(std::memory_order_acquire)) continue;
    loudestDrawbar = std::max(loudestDrawbar, drawbarGain_[index].load(std::memory_order_acquire));
  }
  if (loudestDrawbar <= 0.0f) return;
  auto* slot = &keyClicks_[0];
  for (auto& click : keyClicks_) {
    if (click.remaining == 0) { slot = &click; break; }
    if (click.remaining < slot->remaining) slot = &click;
  }
  slot->remaining = clickLengthSamples_;
  slot->level = 0.009f * loudestDrawbar * (static_cast<float>(velocity) / 127.0f);
}

void OrganModule::setCutoffConfig(CutoffConfig) noexcept {
  CutoffConfig bypass;
  bypass.enabled = false;
  for (auto& voice : voices_) voice->setCutoffConfig(bypass);
}

void OrganModule::setNoVelocitySensitivity(bool) noexcept {
  for (auto& voice : voices_) voice->setNoVelocitySensitivity(true);
}

void OrganModule::setVolumeEnvelope(
    float attackMs, float holdMs, float decayMs, float releaseMs, float sustainDb) noexcept {
  for (auto& voice : voices_) {
    voice->setVolumeEnvelope(attackMs, holdMs, decayMs, releaseMs, sustainDb);
  }
}

void OrganModule::setVoiceMode(bool mono, bool legato) noexcept {
  for (auto& voice : voices_) voice->setVoiceMode(mono, legato);
}

void OrganModule::setGlideBehavior(GlideBehavior) noexcept {
  for (auto& voice : voices_) voice->setGlideBehavior({});
}

void OrganModule::noteOff(std::uint8_t note) noexcept {
  for (auto& voice : voices_) voice->noteOff(note);
}

void OrganModule::stealNote(std::uint8_t note) noexcept {
  for (auto& voice : voices_) voice->stealNote(note);
}

void OrganModule::controlChange(std::uint8_t controller, std::uint8_t value) noexcept {
  for (auto& voice : voices_) voice->controlChange(controller, value);
}

void OrganModule::pitchBend(std::uint16_t value) noexcept {
  for (auto& voice : voices_) voice->pitchBend(value);
}

void OrganModule::allNotesOff() noexcept {
  for (auto& voice : voices_) voice->allNotesOff();
  for (auto& click : keyClicks_) click.remaining = 0;
}

bool OrganModule::hasActiveVoices() const noexcept {
  for (const auto& click : keyClicks_) if (click.remaining > 0) return true;
  for (const auto& voice : voices_) if (voice->hasActiveVoices()) return true;
  return false;
}

bool OrganModule::isVoicePoolNearlyFull() const noexcept {
  for (const auto& voice : voices_) if (voice->isVoicePoolNearlyFull()) return true;
  return false;
}

void OrganModule::renderAdd(float* left, float* right, std::size_t frames, float gainLinear) noexcept {
  for (std::size_t index = 0; index < kDrawbarCount; ++index) {
    const auto target = drawbarGain_[index].load(std::memory_order_acquire);
    auto& current = currentDrawbarGain_[index];
    if (target <= 0.0f && current <= 0.00001f) { current = 0.0f; continue; }
    std::fill_n(voiceScratchLeft_.data(), frames, 0.0f);
    std::fill_n(voiceScratchRight_.data(), frames, 0.0f);
    voices_[index]->renderAdd(voiceScratchLeft_.data(), voiceScratchRight_.data(), frames, 1.0f);
    for (std::size_t frame = 0; frame < frames; ++frame) {
      current += (target - current) * drawbarSmoothing_;
      const auto gain = gainLinear * current;
      left[frame] += voiceScratchLeft_[frame] * gain;
      right[frame] += voiceScratchRight_[frame] * gain;
    }
  }
  // O key-click do OpenB3 vem do contato de tecla, não de um motor Leslie
  // rodando em silêncio. Um ruído curtíssimo com queda de amplitude acompanha
  // cada Note On, sem alocação, bloqueio ou vazamento para outras notas.
  for (std::size_t frame = 0; frame < frames; ++frame) {
    float clickSample = 0.0f;
    for (auto& click : keyClicks_) {
      if (click.remaining == 0) continue;
      clickSeed_ ^= clickSeed_ << 13;
      clickSeed_ ^= clickSeed_ >> 17;
      clickSeed_ ^= clickSeed_ << 5;
      const auto noise = static_cast<float>(clickSeed_ & 0xffffu) / 32767.5f - 1.0f;
      const auto envelope = static_cast<float>(click.remaining)
          / static_cast<float>(clickLengthSamples_);
      clickSample += noise * envelope * envelope * click.level;
      --click.remaining;
    }
    const auto output = clickSample * gainLinear;
    left[frame] += output;
    right[frame] += output;
  }
}

} // namespace hook_keys
