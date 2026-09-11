#include "hook_keys/HookKeysEngine.hpp"

#include <algorithm>
#include <cmath>
#include <iterator>

namespace hook_keys {

namespace {
constexpr std::uint8_t kMessageTypeMask = 0xF0;
constexpr std::uint8_t kNoteOff = 0x80;
constexpr std::uint8_t kNoteOn = 0x90;
constexpr std::uint8_t kControlChange = 0xB0;
constexpr std::uint8_t kPitchBend = 0xE0;
constexpr std::uint8_t kModulationController = 1;
constexpr std::uint8_t kSustainController = 64;
constexpr std::uint8_t kAllSoundOffController = 120;
constexpr std::uint8_t kAllNotesOffController = 123;

std::uint8_t applyVelocityCurve(
    std::uint8_t velocity, const std::array<std::uint8_t, 5>& curve) noexcept {
  const auto position = (static_cast<float>(velocity) / 127.0f) * 4.0f;
  const auto segment = std::min<std::size_t>(3, static_cast<std::size_t>(position));
  const auto fraction = position - static_cast<float>(segment);
  const auto mapped = static_cast<float>(curve[segment]) +
      (static_cast<float>(curve[segment + 1]) - static_cast<float>(curve[segment])) * fraction;
  return static_cast<std::uint8_t>(std::clamp(std::lround(mapped), 1L, 127L));
}
}

HookKeysEngine::HookKeysEngine(SynthModules modules, EngineSettings settings)
    : modules_(modules), settings_(settings) {
  settings_.normalize();
  scratchLeft_.resize(settings_.maximumBlockFrames);
  scratchRight_.resize(settings_.maximumBlockFrames);
  for (auto& processor : effects_) {
    processor.prepare(settings_.sampleRate);
    processor.setTempo(settings_.tempoBpm);
  }
  for (auto& moduleNotes : activeNotes_) {
    for (auto& inputNotes : moduleNotes) inputNotes.fill(-1);
  }
}

bool HookKeysEngine::enqueueMidi(MidiMessage message) noexcept {
  if (message.inputSlot >= kMidiInputCount) return false;
  message.data1 = std::min<std::uint8_t>(message.data1, 127);
  message.data2 = std::min<std::uint8_t>(message.data2, 127);
  return push(EngineCommand::midiMessage(message));
}

bool HookKeysEngine::setModuleConfig(std::size_t moduleIndex, ModuleConfig config) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  config.normalize();
  return push(EngineCommand::configureModule(moduleIndex, config));
}

bool HookKeysEngine::setTempoBpm(float tempoBpm) noexcept {
  return push(EngineCommand::tempo(std::clamp(tempoBpm, 60.0f, 600.0f)));
}

bool HookKeysEngine::stopAllNotes() noexcept {
  return push(EngineCommand::panic());
}

void HookKeysEngine::render(float* left, float* right, std::size_t frames) noexcept {
  if (left == nullptr || right == nullptr || frames == 0) return;
  std::fill_n(left, frames, 0.0f);
  std::fill_n(right, frames, 0.0f);

  for (auto* synth : modules_) {
    if (synth != nullptr) synth->beginBlock();
  }

  EngineCommand command;
  while (commands_.tryPop(command)) applyCommand(command);

  std::size_t rendered = 0;
  while (rendered < frames) {
    const auto blockFrames = std::min(settings_.maximumBlockFrames, frames - rendered);
    for (std::size_t index = 0; index < kModuleCount; ++index) {
      auto* synth = modules_[index];
      if (synth == nullptr || !configs_[index].enabled) continue;
      std::fill_n(scratchLeft_.data(), blockFrames, 0.0f);
      std::fill_n(scratchRight_.data(), blockFrames, 0.0f);
      synth->renderAdd(scratchLeft_.data(), scratchRight_.data(), blockFrames, 1.0f);
      effects_[index].process(scratchLeft_.data(), scratchRight_.data(), blockFrames);
      const auto gain = configs_[index].gainLinear;
      for (std::size_t frame = 0; frame < blockFrames; ++frame) {
        left[rendered + frame] += scratchLeft_[frame] * gain;
        right[rendered + frame] += scratchRight_[frame] * gain;
      }
    }
    rendered += blockFrames;
  }
}

void HookKeysEngine::renderInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept {
  if (output == nullptr || frames == 0 || channels == 0) return;
  channels = std::min<std::size_t>(channels, 32);
  std::fill_n(output, frames * channels, 0.0f);
  for (auto* synth : modules_) if (synth != nullptr) synth->beginBlock();
  EngineCommand command;
  while (commands_.tryPop(command)) applyCommand(command);
  std::size_t rendered = 0;
  while (rendered < frames) {
    const auto blockFrames = std::min(settings_.maximumBlockFrames, frames - rendered);
    for (std::size_t index = 0; index < kModuleCount; ++index) {
      auto* synth = modules_[index];
      const auto& config = configs_[index];
      if (synth == nullptr || !config.enabled || config.outputChannelStart >= channels) continue;
      std::fill_n(scratchLeft_.data(), blockFrames, 0.0f);
      std::fill_n(scratchRight_.data(), blockFrames, 0.0f);
      synth->renderAdd(scratchLeft_.data(), scratchRight_.data(), blockFrames, 1.0f);
      effects_[index].process(scratchLeft_.data(), scratchRight_.data(), blockFrames);
      const auto first = static_cast<std::size_t>(config.outputChannelStart);
      const bool stereo = config.outputChannelCount == 2 && first + 1 < channels;
      for (std::size_t frame = 0; frame < blockFrames; ++frame) {
        auto* destination = output + (rendered + frame) * channels;
        if (stereo) {
          destination[first] += scratchLeft_[frame] * config.gainLinear;
          destination[first + 1] += scratchRight_[frame] * config.gainLinear;
        } else {
          destination[first] += (scratchLeft_[frame] + scratchRight_[frame]) * 0.5f * config.gainLinear;
        }
      }
    }
    rendered += blockFrames;
  }
}

std::uint64_t HookKeysEngine::droppedCommandCount() const noexcept {
  return droppedCommands_.load(std::memory_order_relaxed);
}

void HookKeysEngine::applyCommand(const EngineCommand& command) noexcept {
  switch (command.type) {
    case CommandType::midi:
      routeMidi(command.midi);
      break;
    case CommandType::setModuleConfig:
      if (command.moduleIndex < kModuleCount) {
        const auto index = static_cast<std::size_t>(command.moduleIndex);
        if (configs_[index].enabled && !command.moduleConfig.enabled && modules_[index] != nullptr) {
          modules_[index]->allNotesOff();
          for (auto& inputNotes : activeNotes_[index]) inputNotes.fill(-1);
        } else if (configs_[index].midiInputSlot != command.moduleConfig.midiInputSlot &&
                   modules_[index] != nullptr && moduleHasActiveNotes(index)) {
          modules_[index]->allNotesOff();
          for (auto& inputNotes : activeNotes_[index]) inputNotes.fill(-1);
        }
        configs_[index] = command.moduleConfig;
        effects_[index].setConfig(configs_[index].effects, settings_.tempoBpm);
      }
      break;
    case CommandType::setTempo:
      settings_.tempoBpm = std::clamp(command.tempoBpm, 60.0f, 600.0f);
      for (auto& processor : effects_) processor.setTempo(settings_.tempoBpm);
      break;
    case CommandType::allNotesOff:
      applyAllNotesOff();
      break;
  }
}

void HookKeysEngine::routeMidi(const MidiMessage& message) noexcept {
  const auto type = static_cast<std::uint8_t>(message.status & kMessageTypeMask);
  if (type == kNoteOn && message.data2 > 0) {
    routeNoteOn(message.inputSlot, message.data1, message.data2);
    return;
  }
  if (type == kNoteOff || (type == kNoteOn && message.data2 == 0)) {
    routeNoteOff(message.inputSlot, message.data1);
    return;
  }
  if (type == kControlChange) {
    if (message.data1 == kAllSoundOffController || message.data1 == kAllNotesOffController) {
      applyAllNotesOff();
      return;
    }
    for (std::size_t index = 0; index < kModuleCount; ++index) {
      auto* synth = modules_[index];
      const auto& config = configs_[index];
      if (synth == nullptr || !config.enabled) continue;
      const auto acceptsInput = config.midiInputSlot == kAllMidiInputs ||
                                message.inputSlot == config.midiInputSlot;
      if (!acceptsInput) continue;
      if (message.data1 == kSustainController && !config.sustainInputEnabled) continue;
      if (message.data1 == kModulationController && !config.modulationInputEnabled) continue;
      synth->controlChange(message.data1, message.data2);
    }
    return;
  }
  if (type == kPitchBend) {
    const auto value = static_cast<std::uint16_t>(message.data1 | (message.data2 << 7));
    for (std::size_t index = 0; index < kModuleCount; ++index) {
      if (modules_[index] != nullptr && configs_[index].enabled &&
          (configs_[index].midiInputSlot == kAllMidiInputs ||
           message.inputSlot == configs_[index].midiInputSlot)) {
        modules_[index]->pitchBend(value);
      }
    }
  }
}

void HookKeysEngine::routeNoteOn(
    std::uint8_t inputSlot, std::uint8_t sourceNote, std::uint8_t velocity) noexcept {
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    auto* synth = modules_[index];
    const auto& config = configs_[index];
    if (synth == nullptr || !config.enabled ||
        (config.midiInputSlot != kAllMidiInputs && inputSlot != config.midiInputSlot) ||
        sourceNote < config.lowNote || sourceNote > config.highNote) {
      continue;
    }
    const auto targetNote = translatedNote(sourceNote, config.octaveShift);
    const auto previousTarget = activeNotes_[index][inputSlot][sourceNote];
    if (previousTarget < 0) {
      std::size_t activeCount = 0;
      for (const auto& inputNotes : activeNotes_[index]) {
        activeCount += static_cast<std::size_t>(std::count_if(
            inputNotes.begin(), inputNotes.end(), [](std::int16_t note) { return note >= 0; }));
      }
      if (activeCount >= config.polyphony) continue;
    }
    if (previousTarget >= 0) synth->noteOff(static_cast<std::uint8_t>(previousTarget));
    activeNotes_[index][inputSlot][sourceNote] = targetNote;
    synth->noteOn(targetNote, applyVelocityCurve(velocity, config.velocityCurve));
  }
}

void HookKeysEngine::routeNoteOff(std::uint8_t inputSlot, std::uint8_t sourceNote) noexcept {
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    const auto targetNote = activeNotes_[index][inputSlot][sourceNote];
    if (targetNote < 0) continue;
    if (modules_[index] != nullptr) modules_[index]->noteOff(static_cast<std::uint8_t>(targetNote));
    activeNotes_[index][inputSlot][sourceNote] = -1;
  }
}

void HookKeysEngine::applyAllNotesOff() noexcept {
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    if (modules_[index] != nullptr) modules_[index]->allNotesOff();
    for (auto& inputNotes : activeNotes_[index]) inputNotes.fill(-1);
  }
}

bool HookKeysEngine::moduleHasActiveNotes(std::size_t moduleIndex) const noexcept {
  for (const auto& inputNotes : activeNotes_[moduleIndex]) {
    if (std::any_of(inputNotes.begin(), inputNotes.end(), [](std::int16_t note) { return note >= 0; })) return true;
  }
  return false;
}

bool HookKeysEngine::push(const EngineCommand& command) noexcept {
  if (commands_.tryPush(command)) return true;
  droppedCommands_.fetch_add(1, std::memory_order_relaxed);
  return false;
}

std::uint8_t HookKeysEngine::translatedNote(std::uint8_t sourceNote, std::int8_t octaveShift) noexcept {
  const auto translated = static_cast<int>(sourceNote) + static_cast<int>(octaveShift) * 12;
  return static_cast<std::uint8_t>(std::clamp(translated, 0, 127));
}

} // namespace hook_keys
