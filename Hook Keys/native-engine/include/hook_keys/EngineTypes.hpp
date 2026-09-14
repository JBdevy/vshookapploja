#pragma once

#include "hook_keys/DspTypes.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>

namespace hook_keys {

inline constexpr std::size_t kModuleCount = 8;
inline constexpr std::size_t kMidiInputCount = 3;
inline constexpr std::uint8_t kKeyboardBroadcastInput = 3;
inline constexpr std::uint8_t kArpeggiatorInput = 4;
inline constexpr std::uint8_t kSequencerInput = 5;
inline constexpr std::size_t kRoutableMidiInputCount = 6;
inline constexpr std::uint8_t kAllMidiInputs = 0xff;
inline constexpr std::uint8_t kMidiNoteCount = 128;

struct MidiMessage final {
  std::uint8_t status = 0;
  std::uint8_t data1 = 0;
  std::uint8_t data2 = 0;
  std::uint8_t inputSlot = 0;
  std::uint64_t timestampNanoseconds = 0;
};

struct ModuleConfig final {
  bool enabled = true;
  bool sustainInputEnabled = true;
  bool modulationInputEnabled = true;
  std::uint8_t lowNote = 0;
  std::uint8_t highNote = 127;
  std::uint8_t midiInputSlot = 0;
  std::int8_t octaveShift = 0;
  std::uint8_t outputChannelStart = 0;
  std::uint8_t outputChannelCount = 2;
  std::array<std::uint8_t, 5> velocityCurve{0, 32, 64, 96, 127};
  // Limite Velocity: a key struck harder than this plays no note at all.
  std::uint8_t velocityIgnoreAbove = 127;
  // Velocity limiter: the curve output never goes above this value.
  std::uint8_t velocityCeiling = 127;
  std::uint16_t polyphony = 128;
  float gainLinear = 1.0f;
  ModuleEffectsConfig effects{};

  void normalize() noexcept {
    lowNote = std::min<std::uint8_t>(lowNote, 127);
    highNote = std::min<std::uint8_t>(highNote, 127);
    if (lowNote > highNote) std::swap(lowNote, highNote);
    if (midiInputSlot != kAllMidiInputs && midiInputSlot != kArpeggiatorInput &&
        midiInputSlot != kSequencerInput) {
      midiInputSlot = std::min<std::uint8_t>(midiInputSlot, static_cast<std::uint8_t>(kMidiInputCount - 1));
    }
    octaveShift = std::clamp<std::int8_t>(octaveShift, -3, 3);
    outputChannelStart = std::min<std::uint8_t>(outputChannelStart, 31);
    outputChannelCount = outputChannelCount == 1 ? 1 : 2;
    for (auto& point : velocityCurve) point = std::min<std::uint8_t>(point, 127);
    velocityIgnoreAbove = std::min<std::uint8_t>(velocityIgnoreAbove, 127);
    velocityCeiling = std::clamp<std::uint8_t>(velocityCeiling, 1, 127);
    polyphony = std::clamp<std::uint16_t>(polyphony, 1, 128);
    gainLinear = std::clamp(gainLinear, 0.0f, 2.0f);
    effects.normalize();
  }
};

struct EngineSettings final {
  double sampleRate = 48000.0;
  std::size_t maximumBlockFrames = 512;
  float tempoBpm = 120.0f;

  void normalize() noexcept {
    sampleRate = std::clamp(sampleRate, 8000.0, 384000.0);
    maximumBlockFrames = std::clamp<std::size_t>(maximumBlockFrames, 16, 8192);
    tempoBpm = std::clamp(tempoBpm, 60.0f, 600.0f);
  }
};

enum class CommandType : std::uint8_t {
  midi,
  setModuleConfig,
  setTempo,
  allNotesOff,
};

struct EngineCommand final {
  CommandType type = CommandType::midi;
  std::uint8_t moduleIndex = 0;
  MidiMessage midi{};
  ModuleConfig moduleConfig{};
  float tempoBpm = 120.0f;

  static EngineCommand midiMessage(MidiMessage message) noexcept {
    EngineCommand command;
    command.type = CommandType::midi;
    command.midi = message;
    return command;
  }

  static EngineCommand configureModule(std::size_t index, ModuleConfig config) noexcept {
    EngineCommand command;
    command.type = CommandType::setModuleConfig;
    command.moduleIndex = static_cast<std::uint8_t>(index);
    command.moduleConfig = config;
    return command;
  }

  static EngineCommand panic() noexcept {
    EngineCommand command;
    command.type = CommandType::allNotesOff;
    return command;
  }

  static EngineCommand tempo(float bpm) noexcept {
    EngineCommand command;
    command.type = CommandType::setTempo;
    command.tempoBpm = bpm;
    return command;
  }
};

} // namespace hook_keys
