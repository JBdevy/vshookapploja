#pragma once

#include "hook_keys/ModuleSynth.hpp"
#include "hook_keys/TinySoundFontModule.hpp"

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

namespace hook_keys {

// Hook B3: nove drawbars, cada um o próprio SF2 tocando junto, com o volume
// dependendo de quanto aquela barra foi puxada. Uma nota do módulo 7 dispara
// as nove vozes ao mesmo tempo; renderAdd soma as nove com o ganho de cada
// drawbar aplicado por cima do ganho do módulo.
//
// As nove vozes são compartilhadas por todos os presets (carregadas uma
// única vez no arranque do motor): são arquivos fixos, empacotados com o
// app, não um timbre trocável da biblioteca — duplicar ~200 MB por preset
// não faria sentido nenhum.
class OrganModule final : public ModuleSynth {
public:
  static constexpr std::size_t kDrawbarCount = 9;
  static constexpr std::uint8_t kDrawbarMax = 8;

  OrganModule(double sampleRate, std::size_t maximumBlockFrames);
  ~OrganModule() override = default;

  OrganModule(const OrganModule&) = delete;
  OrganModule& operator=(const OrganModule&) = delete;

  // Control/loader thread. Carrega os nove arquivos (um por drawbar, na
  // ordem 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1'). Uma voz que
  // falhar em carregar fica muda, sem travar as outras oito.
  [[nodiscard]] bool loadVoice(std::size_t drawbarIndex, const char* utf8Path) noexcept;
  // 0 (fechada) a 8 (toda puxada) — o mesmo valor que o drawbar mostra.
  void setDrawbarPosition(std::size_t drawbarIndex, std::uint8_t position) noexcept;
  void setModulationMode(std::uint8_t mode, float rateHz, float intensity = 1.0f) noexcept;

  void beginBlock() noexcept override;
  void noteOn(std::uint8_t note, std::uint8_t velocity) noexcept override;
  void noteOnWithFilterVelocity(std::uint8_t note, std::uint8_t velocity,
      std::uint8_t filterVelocity) noexcept override;
  void setCutoffConfig(CutoffConfig config) noexcept override;
  void setNoVelocitySensitivity(bool enabled) noexcept override;
  void setVoiceMode(bool mono, bool legato) noexcept override;
  void setGlideBehavior(GlideBehavior behavior) noexcept override;
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
  // OpenB3/Beatrix aplica variações aleatórias muito curtas no ataque da
  // tecla. Aqui o key-click é uma camada transitória própria do Organ,
  // pré-alocada para nunca criar objetos no callback de áudio.
  struct KeyClick final {
    std::uint32_t remaining = 0;
    float level = 0.0f;
  };
  static constexpr std::size_t kMaximumKeyClicks = 32;
  void startKeyClick(std::uint8_t velocity) noexcept;

  std::array<std::unique_ptr<TinySoundFontModule>, kDrawbarCount> voices_;
  // Ganho linear por drawbar (0..1), lido no áudio a cada bloco.
  std::array<std::atomic<float>, kDrawbarCount> drawbarGain_{};
  // Suavização por amostra no callback; os buffers são pré-alocados.
  std::array<float, kDrawbarCount> currentDrawbarGain_{};
  float drawbarSmoothing_ = 0.0f;
  std::vector<float> voiceScratchLeft_;
  std::vector<float> voiceScratchRight_;
  std::array<std::atomic<bool>, kDrawbarCount> voiceLoaded_{};
  std::array<KeyClick, kMaximumKeyClicks> keyClicks_{};
  std::uint32_t clickSeed_ = 0x738ac41du;
  std::uint32_t clickLengthSamples_ = 0;
};

} // namespace hook_keys
