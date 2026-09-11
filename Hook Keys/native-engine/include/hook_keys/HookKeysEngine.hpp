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
  using SynthModules = std::array<ModuleSynth*, kModuleCount>;

  explicit HookKeysEngine(SynthModules modules, EngineSettings settings = {});

  // Producer side: UI and MIDI threads. Returns false for invalid input or
  // when the bounded real-time queue is full.
  [[nodiscard]] bool enqueueMidi(MidiMessage message) noexcept;
  [[nodiscard]] bool setModuleConfig(std::size_t moduleIndex, ModuleConfig config) noexcept;
  [[nodiscard]] bool setTempoBpm(float tempoBpm) noexcept;
  [[nodiscard]] bool stopAllNotes() noexcept;

  // Consumer side: audio callback only.
  void render(float* left, float* right, std::size_t frames) noexcept;

  [[nodiscard]] std::uint64_t droppedCommandCount() const noexcept;

private:
  void applyCommand(const EngineCommand& command) noexcept;
  void routeMidi(const MidiMessage& message) noexcept;
  void routeNoteOn(std::uint8_t inputSlot, std::uint8_t sourceNote, std::uint8_t velocity) noexcept;
  void routeNoteOff(std::uint8_t inputSlot, std::uint8_t sourceNote) noexcept;
  void applyAllNotesOff() noexcept;
  [[nodiscard]] bool moduleHasActiveNotes(std::size_t moduleIndex) const noexcept;

  [[nodiscard]] bool push(const EngineCommand& command) noexcept;
  [[nodiscard]] static std::uint8_t translatedNote(std::uint8_t sourceNote, std::int8_t octaveShift) noexcept;

  SynthModules modules_{};
  EngineSettings settings_{};
  std::array<ModuleConfig, kModuleCount> configs_{};
  std::array<ModuleEffects, kModuleCount> effects_{};
  std::vector<float> scratchLeft_;
  std::vector<float> scratchRight_;
  using ActiveNotesByInput = std::array<std::array<std::int16_t, kMidiNoteCount>, kMidiInputCount>;
  std::array<ActiveNotesByInput, kModuleCount> activeNotes_{};
  RealtimeCommandQueue<EngineCommand, 2048> commands_{};
  std::atomic<std::uint64_t> droppedCommands_{0};
};

} // namespace hook_keys
