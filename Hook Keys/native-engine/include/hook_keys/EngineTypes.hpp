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
// Cada módulo tem seu próprio Arpeggiator: cada um precisa de uma entrada
// virtual só sua, senão dois módulos com Arpeggiator ligado ouviriam a mesma
// frase gerada um do outro. kArpeggiatorInput continua valendo como o slot
// do módulo 0 (compatibilidade); os demais vêm em sequência a partir dele.
inline constexpr std::uint8_t kArpeggiatorInputBase = 4;
inline constexpr std::uint8_t kArpeggiatorInput = kArpeggiatorInputBase;
inline constexpr std::size_t kRoutableMidiInputCount = kArpeggiatorInputBase + kModuleCount;
inline constexpr std::uint8_t kAllMidiInputs = 0xff;
inline constexpr std::uint8_t kMidiNoteCount = 128;

inline constexpr std::uint8_t arpeggiatorInputForModule(std::size_t moduleIndex) noexcept {
  return static_cast<std::uint8_t>(kArpeggiatorInputBase + moduleIndex);
}

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
  // GM closed/pedal/open hi-hats (42/44/46) form one exclusive choke group.
  bool gmDrumHiHatChoke = false;
  // Bit por nota MIDI. Quando ligado, o Note Off usa a soltura rápida
  // anti-click em vez do Release geral configurado para o timbre Drum.
  std::array<std::uint32_t, 4> drumZeroReleaseNoteMasks{};
  std::uint8_t lowNote = 0;
  std::uint8_t highNote = 127;
  std::uint8_t midiInputSlot = 0;
  std::int8_t octaveShift = 0;
  std::uint8_t outputChannelStart = 0;
  std::uint8_t outputChannelCount = 2;
  // Quando ativo, a soma mono integral L+R, sem compensação de ganho, vai para
  // cada canal da rota. Em 1+2, os canais 1 e 2 recebem o mesmo sinal somado.
  bool outputDualMono = false;
  std::array<std::uint8_t, 5> velocityCurve{0, 32, 64, 96, 127};
  // Limite Velocity: a key struck harder than this plays no note at all.
  std::uint8_t velocityIgnoreAbove = 127;
  // Velocity limiter: the curve output never goes above this value.
  std::uint8_t velocityCeiling = 127;
  std::uint16_t polyphony = 128;
  float gainLinear = 1.0f;
  // No Sens: toda nota soa no ganho pleno da wave, ignorando o velocity da
  // tecla. É retroativo — muda o ganho de notas já soando na hora.
  bool noVelocitySensitivity = false;
  // Mono: uma nota nova substitui a que estiver soando; soltar volta pra
  // tecla anterior ainda presa. Legato: só a primeira nota depois do
  // silêncio reinicia o envelope. O Synth (módulo 8) tem seu próprio
  // controle de voz e ignora estes dois campos.
  bool mono = false;
  bool legato = false;
  ModuleEffectsConfig effects{};

  [[nodiscard]] bool drumNoteUsesZeroRelease(std::uint8_t note) const noexcept {
    return (drumZeroReleaseNoteMasks[note / 32] & (std::uint32_t{1} << (note % 32))) != 0;
  }

  void normalize() noexcept {
    lowNote = std::min<std::uint8_t>(lowNote, 127);
    highNote = std::min<std::uint8_t>(highNote, 127);
    if (lowNote > highNote) std::swap(lowNote, highNote);
    if (midiInputSlot != kAllMidiInputs && midiInputSlot < kArpeggiatorInputBase) {
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
  // Transpose geral: soma (em semitons) por cima do Oct de cada módulo, antes
  // de chegar no sintetizador. Ao contrário do Oct por módulo, este é um só
  // valor para o motor inteiro.
  std::int8_t globalTransposeSemitones = 0;

  void normalize() noexcept {
    sampleRate = std::clamp(sampleRate, 8000.0, 384000.0);
    maximumBlockFrames = std::clamp<std::size_t>(maximumBlockFrames, 16, 8192);
    tempoBpm = std::clamp(tempoBpm, 60.0f, 600.0f);
    globalTransposeSemitones = std::clamp<std::int8_t>(globalTransposeSemitones, -60, 60);
  }
};

enum class CommandType : std::uint8_t {
  midi,
  setModuleConfig,
  setTempo,
  allNotesOff,
  setGlobalTranspose,
};

struct EngineCommand final {
  CommandType type = CommandType::midi;
  std::uint8_t moduleIndex = 0;
  MidiMessage midi{};
  ModuleConfig moduleConfig{};
  float tempoBpm = 120.0f;
  std::int8_t globalTransposeSemitones = 0;

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

  static EngineCommand globalTranspose(std::int8_t semitones) noexcept {
    EngineCommand command;
    command.type = CommandType::setGlobalTranspose;
    command.globalTransposeSemitones = semitones;
    return command;
  }
};

} // namespace hook_keys
