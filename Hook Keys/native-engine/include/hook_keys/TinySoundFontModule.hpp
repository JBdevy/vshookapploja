#pragma once

#include "hook_keys/ModuleSynth.hpp"
#include "hook_keys/TinySoundFontExtensions.hpp"
#include "hook_keys/RealtimeCommandQueue.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

struct tsf;

namespace hook_keys {

// One independently playable Hook Keys module backed by TinySoundFont.
// SoundFont parsing happens on a control/loader thread. The prepared synth is
// activated by beginBlock() without allocation, locks, or file access.
class TinySoundFontModule final : public ModuleSynth {
public:
  TinySoundFontModule(
      double sampleRate, std::size_t maximumBlockFrames,
      std::size_t maximumVoices = kHookKeysMaximumVoices);
  ~TinySoundFontModule() override;

  TinySoundFontModule(const TinySoundFontModule&) = delete;
  TinySoundFontModule& operator=(const TinySoundFontModule&) = delete;

  // Control/loader thread only. A successful load becomes active on the next
  // audio block. Calling this never blocks the audio callback.
  [[nodiscard]] bool loadFromFile(const char* utf8Path) noexcept;
  [[nodiscard]] bool loadFromMemory(const void* data, std::size_t size) noexcept;
  // Creates another playback instance sharing only the immutable SoundFont
  // regions/samples. Voices, channels, envelopes and effects stay independent.
  // Both modules must be accessed from the same serialized loader thread.
  [[nodiscard]] bool copySoundFontFrom(const TinySoundFontModule& source) noexcept;
  void unload() noexcept;
  void collectRetiredSoundFonts() noexcept;
  // sustainDb: quanto o som cai depois do Decay, de -60 dB a 0 dB (0 = cheio).
  void setVolumeEnvelope(
      float attackMs, float holdMs, float decayMs, float releaseMs, float sustainDb = 0.0f) noexcept;
  // Caminho seco: preserva a envoltoria original armazenada no proprio SF2.
  void useEmbeddedVolumeEnvelope() noexcept;
  void setGlide(float milliseconds) noexcept { glideMs_.store(milliseconds, std::memory_order_relaxed); }
  void setGlideBehavior(GlideBehavior behavior) noexcept override {
    glideBehavior_.store(behavior.pack(), std::memory_order_relaxed);
  }
  // 0 = User (a roda vai para a modulação do próprio SF2), 1 = LFO de pitch
  // (vibrato), 2 = Tremolo (o volume balança), 3 = Pan (o som anda de um lado
  // ao outro no mesmo rate).
  void setModulationMode(std::uint8_t mode, float rateHz, float intensity = 1.0f) noexcept {
    lfoRateHz_.store(std::clamp(rateHz, 0.1f, 20.0f), std::memory_order_release);
    modulationIntensity_.store(std::clamp(intensity, 0.0f, 1.0f), std::memory_order_release);
    // 4 = roda reservada ao Rotary do Organ; não envia CC1 nem cria LFO aqui.
    modulationMode_.store(mode > 4 ? 0 : mode, std::memory_order_release);
  }

  [[nodiscard]] bool hasPendingSoundFont() const noexcept;
  // Bytes do banco de amostras compartilhado, para o host orcar quanto de
  // SF2 mantem em RAM. Thread de carregamento.
  [[nodiscard]] std::size_t sampleBytes() const noexcept;
  [[nodiscard]] bool hasShareableSoundFont() const noexcept { return shareable_ != nullptr; }

  // Audio thread only.
  void beginBlock() noexcept override;
  void noteOn(std::uint8_t note, std::uint8_t velocity) noexcept override;
  void noteOnWithFilterVelocity(std::uint8_t note, std::uint8_t velocity,
      std::uint8_t filterVelocity) noexcept override;
  void setCutoffConfig(CutoffConfig config) noexcept override;
  void setNoVelocitySensitivity(bool enabled) noexcept override;
  void setVoiceMode(bool mono, bool legato) noexcept override;
  void noteOff(std::uint8_t note) noexcept override;
  void stealNote(std::uint8_t note) noexcept override;
  void controlChange(std::uint8_t controller, std::uint8_t value) noexcept override;
  void pitchBend(std::uint16_t value) noexcept override;
  void allNotesOff() noexcept override;
  bool hasActiveVoices() const noexcept override;
  bool isVoicePoolNearlyFull() const noexcept override;
  bool canSkipRenderingWhenIdle() const noexcept override { return true; }
  void renderAdd(float* left, float* right, std::size_t frames, float gainLinear) noexcept override;

private:
  void stage(tsf* prepared) noexcept;
  [[nodiscard]] bool configure(tsf* synth) const noexcept;
  [[nodiscard]] static tsf* unloadMarker() noexcept;

  double sampleRate_ = 48000.0;
  std::size_t maximumBlockFrames_ = 0;
  int maximumVoices_ = 64;
  std::vector<float> scratchInterleaved_;

  tsf* active_ = nullptr;
  // Loader-thread-only reference used as a stable tsf_copy source even while
  // the audio callback swaps active_/pending_.
  tsf* shareable_ = nullptr;
  std::atomic<float> glideMs_{0.0f};
  std::atomic<std::uint16_t> glideBehavior_{GlideBehavior{}.pack()};
  HookKeysGlideState glide_{};
  CutoffConfig cutoffConfig_{};
  // Reaplicado a cada troca de tsf ativo (novo timbre carregado), já que a
  // instância nova nasce zerada e perderia o No Sens sem isso.
  bool noVelocitySensitivity_ = false;
  // Mono/Legato: mesmo desenho do AnalogSynthModule (held_/heldOrder_/
  // newestHeldNote), só que aqui uma nota devolvida ou um novo Note On em
  // Legato usam hook_keys_tsf_legato_retune em vez de reiniciar a voz.
  bool mono_ = false;
  bool legato_ = false;
  bool monoSounding_ = false;
  std::uint8_t monoNote_ = 0;
  std::array<bool, 128> monoHeld_{};
  std::array<std::uint8_t, 128> monoHeldVelocity_{};
  std::array<std::uint8_t, 128> monoHeldFilterVelocity_{};
  std::array<std::uint64_t, 128> monoHeldOrder_{};
  std::uint64_t monoNoteOrder_ = 0;
  [[nodiscard]] int newestMonoHeldNote(std::uint8_t excludingNote) const noexcept;
  std::atomic<std::uint8_t> modulationMode_{1};
  std::atomic<float> lfoRateHz_{6.85f};
  std::atomic<float> modulationIntensity_{1.0f};
  std::uint8_t appliedModulationMode_ = 1;
  std::uint8_t modulationValue_ = 0;
  std::uint16_t pitchBendValue_ = 8192;
  double modulationPhase_ = 0.0;
  float modulationDepth_ = 0.0f;
  tsf* deferredRetired_ = nullptr;
  std::atomic<tsf*> pending_{nullptr};
  std::atomic<float> attackMs_{0.0f};
  std::atomic<float> holdMs_{15000.0f};
  std::atomic<float> decayMs_{25000.0f};
  std::atomic<float> sustainDb_{0.0f};
  std::atomic<float> releaseMs_{300.0f};
  // O runtime desliga esse override no estado neutro do app. A classe mantem
  // os defaults historicos para hosts que a usam diretamente sem configurar.
  std::atomic<bool> volumeEnvelopeOverrideEnabled_{true};
  std::atomic<std::uint32_t> envelopeGeneration_{1};
  std::uint32_t appliedEnvelopeGeneration_ = 0;
  RealtimeCommandQueue<tsf*, 64> retired_{};
};

} // namespace hook_keys
