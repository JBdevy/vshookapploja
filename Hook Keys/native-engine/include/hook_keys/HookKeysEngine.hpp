#pragma once

#include "hook_keys/EngineTypes.hpp"
#include "hook_keys/ModuleEffects.hpp"
#include "hook_keys/ModuleSynth.hpp"
#include "hook_keys/RealtimeCommandQueue.hpp"

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace hook_keys {

class HookKeysEngine final {
public:
  // Input/output do compressor. O RTA foi removido do EQ para manter o
  // callback leve mesmo com buffers pequenos.
  static constexpr std::size_t kAnalysisValueCount = 2;
  using ModuleAnalysis = std::array<float, kAnalysisValueCount>;
  // Interleaved L/R peak pairs: module 1 L/R, module 2 L/R, ...
  using ModulePeaks = std::array<float, kModuleCount * 2>;
  using SynthModules = std::array<ModuleSynth*, kModuleCount>;

  explicit HookKeysEngine(SynthModules modules, EngineSettings settings = {});

  // Producer side: UI and MIDI threads. Returns false for invalid input or
  // when the bounded real-time queue is full.
  [[nodiscard]] bool enqueueMidi(MidiMessage message) noexcept;
  [[nodiscard]] bool setModuleConfig(std::size_t moduleIndex, ModuleConfig config) noexcept;
  [[nodiscard]] bool setTempoBpm(float tempoBpm) noexcept;
  // Transpose geral de entrada (semitons, -60..60), somado por cima do Oct de
  // cada módulo antes de chegar no sintetizador.
  [[nodiscard]] bool setGlobalTranspose(int semitones) noexcept;
  [[nodiscard]] bool stopAllNotes() noexcept;

  // Consumer side: audio callback only.
  void render(float* left, float* right, std::size_t frames) noexcept;
  void renderInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept;

  [[nodiscard]] std::uint64_t droppedCommandCount() const noexcept;
  // Audio thread only; includes long attacks, sustain and release voices.
  [[nodiscard]] bool hasActiveVoices() const noexcept;
  // UI consumes peaks accumulated since its last read; never blocks audio.
  [[nodiscard]] ModulePeaks consumeModulePeaks() noexcept;
  // Picos de entrada e saida do compressor.
  [[nodiscard]] ModuleAnalysis consumeModuleAnalysis(std::size_t moduleIndex) noexcept;

private:
  void publishModulePeak(std::size_t index, float leftPeak, float rightPeak) noexcept;
  void publishProcessorLevels(std::size_t index, ModuleProcessorLevels levels) noexcept;
  [[nodiscard]] float nextModuleGain(std::size_t index) noexcept;
  void setModuleGainTarget(std::size_t index, float target) noexcept;
  void applyCommand(const EngineCommand& command) noexcept;
  void routeMidi(const MidiMessage& message) noexcept;
  void routeNoteOn(std::uint8_t inputSlot, std::uint8_t sourceNote, std::uint8_t velocity) noexcept;
  void routeNoteOff(std::uint8_t inputSlot, std::uint8_t sourceNote) noexcept;
  void applyAllNotesOff() noexcept;
  [[nodiscard]] bool moduleHasActiveNotes(std::size_t moduleIndex) const noexcept;
  [[nodiscard]] std::size_t moduleHeldNoteCount(std::size_t moduleIndex) const noexcept;
  [[nodiscard]] bool stealOldestNote(std::size_t moduleIndex, bool sustainedOnly = false) noexcept;
  void releaseSustainedNotes(std::size_t moduleIndex) noexcept;
  void clearActiveNoteState(std::size_t moduleIndex) noexcept;

  [[nodiscard]] bool push(const EngineCommand& command) noexcept;
  [[nodiscard]] static std::uint8_t translatedNote(
      std::uint8_t sourceNote, std::int8_t octaveShift, std::int8_t globalTransposeSemitones) noexcept;

  SynthModules modules_{};
  EngineSettings settings_{};
  std::array<ModuleConfig, kModuleCount> configs_{};
  std::array<ModuleEffects, kModuleCount> effects_{};
  std::vector<float> scratchLeft_;
  std::vector<float> scratchRight_;
  using ActiveNotesByInput = std::array<std::array<std::int16_t, kMidiNoteCount>, kRoutableMidiInputCount>;
  using ActiveNoteOrdersByInput = std::array<std::array<std::uint64_t, kMidiNoteCount>, kRoutableMidiInputCount>;
  using ActiveNoteCountsByInput = std::array<std::array<std::uint16_t, kMidiNoteCount>, kRoutableMidiInputCount>;
  std::array<ActiveNotesByInput, kModuleCount> activeNotes_{};
  std::array<ActiveNoteOrdersByInput, kModuleCount> activeNoteOrders_{};
  // A mesma tecla pode receber varios Note On antes do Note Off. Cada Note On
  // ocupa uma voz independente; o contador impede que essas camadas escapem
  // do limite de polifonia configurado.
  std::array<ActiveNoteCountsByInput, kModuleCount> activeNoteCounts_{};
  // Quantas camadas da tecla já subiram e estão presas somente pelo sustain.
  // Separar esse número do total mantém correta uma nova pressão da mesma nota
  // enquanto as camadas anteriores continuam no pedal.
  using SustainedNoteCountsByInput = std::array<std::array<std::uint16_t, kMidiNoteCount>, kRoutableMidiInputCount>;
  std::array<SustainedNoteCountsByInput, kModuleCount> sustainedNoteCounts_{};
  std::array<bool, kModuleCount> sustainDown_{};
  std::uint64_t activeNoteOrder_ = 0;
  RealtimeCommandQueue<EngineCommand, 2048> commands_{};
  std::atomic<std::uint64_t> droppedCommands_{0};
  std::array<std::array<std::atomic<float>, 2>, kModuleCount> modulePeaks_{};
  std::array<std::atomic<float>, kModuleCount> compressorInputPeaks_{};
  std::array<std::atomic<float>, kModuleCount> compressorOutputPeaks_{};
  std::array<std::atomic<bool>, kModuleCount> compressorMeterRequests_{};
  std::array<float, kModuleCount> currentModuleGains_{};
  std::array<float, kModuleCount> moduleGainSteps_{};
  std::array<std::size_t, kModuleCount> moduleGainRampFrames_{};
};

} // namespace hook_keys
