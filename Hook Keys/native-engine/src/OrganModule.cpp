#include "hook_keys/OrganModule.hpp"

#include <algorithm>
#include <cmath>

namespace hook_keys {

OrganModule::OrganModule(double sampleRate, std::size_t maximumBlockFrames)
    : voiceScratchLeft_(maximumBlockFrames, 0.0f),
      voiceScratchRight_(maximumBlockFrames, 0.0f) {
  drawbarSmoothing_ = 1.0f - std::exp(-1.0f / (static_cast<float>(sampleRate) * 0.03f));
  for (auto& voice : voices_) {
    voice = std::make_unique<TinySoundFontModule>(sampleRate, maximumBlockFrames);
    // O estado neutro do Organ precisa reproduzir o SF2 sem reescrever o seu
    // ataque, sustain ou release. A envoltoria do app so entra quando o
    // usuario realmente altera algum desses controles.
    voice->useEmbeddedVolumeEnvelope();
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
  settleDrawbarsBeforeFirstNote();
  for (auto& voice : voices_) voice->noteOn(note, 127);
}

void OrganModule::noteOnWithFilterVelocity(
    std::uint8_t note, std::uint8_t velocity, std::uint8_t) noexcept {
  static_cast<void>(velocity);
  settleDrawbarsBeforeFirstNote();
  for (auto& voice : voices_) voice->noteOnWithFilterVelocity(note, 127, 127);
}

void OrganModule::settleDrawbarsBeforeFirstNote() noexcept {
  for (const auto& voice : voices_) {
    if (voice->hasActiveVoices()) return;
  }
  // Em silencio nao existe sinal para fazer de-click. Comecar a primeira nota
  // numa rampa de 30 ms mudava o ataque original do sample sem o usuario ter
  // ligado efeito nenhum.
  for (std::size_t index = 0; index < kDrawbarCount; ++index) {
    currentDrawbarGain_[index] = drawbarGain_[index].load(std::memory_order_acquire);
  }
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

void OrganModule::useEmbeddedVolumeEnvelope() noexcept {
  for (auto& voice : voices_) voice->useEmbeddedVolumeEnvelope();
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
}

bool OrganModule::hasActiveVoices() const noexcept {
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
    if (target <= 0.0f && current <= 0.00001f) {
      current = 0.0f;
      // Fechado, o drawbar não é renderizado e suas vozes não andam. As já
      // soltas terminariam nunca: o Organ não ficava ocioso (gabinete e
      // Rotary rodando no silêncio) e a nota antiga voltava ao abrir o drawbar.
      // As teclas presas continuam, para o drawbar entrar nelas ao ser aberto.
      voices_[index]->killReleasedVoices();
      continue;
    }
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
}

} // namespace hook_keys
