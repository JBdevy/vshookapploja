#include "hook_keys/HookKeysEngine.hpp"

#include <algorithm>
#include <cmath>
#include <iterator>
#include <limits>

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
constexpr float kModuleLimiterCeiling = 0.97723722096f; // -0.2 dBFS
constexpr float kModuleLimiterReleaseSeconds = 0.08f;

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
  for (auto& module : modulePeaks_) {
    for (auto& peak : module) peak.store(0.0f, std::memory_order_relaxed);
  }
  for (auto& peak : compressorInputPeaks_) peak.store(0.0f, std::memory_order_relaxed);
  for (auto& peak : compressorOutputPeaks_) peak.store(0.0f, std::memory_order_relaxed);
  for (auto& request : compressorMeterRequests_) request.store(false, std::memory_order_relaxed);
  currentModuleGains_.fill(1.0f);
  moduleGainSteps_.fill(0.0f);
  moduleGainRampFrames_.fill(0);
  moduleLimiterGains_.fill(1.0f);
  moduleLimiterRelease_ = 1.0f - std::exp(
      -1.0f / (static_cast<float>(settings_.sampleRate) * kModuleLimiterReleaseSeconds));
  scratchLeft_.resize(settings_.maximumBlockFrames);
  scratchRight_.resize(settings_.maximumBlockFrames);
  for (auto& processor : effects_) {
    processor.prepare(settings_.sampleRate);
    processor.setTempo(settings_.tempoBpm);
  }
  for (auto& moduleNotes : activeNotes_) {
    for (auto& inputNotes : moduleNotes) inputNotes.fill(-1);
  }
  for (auto& moduleOrders : activeNoteOrders_) {
    for (auto& inputOrders : moduleOrders) inputOrders.fill(0);
  }
  for (auto& moduleCounts : activeNoteCounts_) {
    for (auto& inputCounts : moduleCounts) inputCounts.fill(0);
  }
  sustainDown_.fill(false);
}

bool HookKeysEngine::enqueueMidi(MidiMessage message) noexcept {
  if (message.inputSlot >= kMidiInputCount) {
    const auto type = static_cast<std::uint8_t>(message.status & kMessageTypeMask);
    const auto virtualInput = message.inputSlot == kKeyboardBroadcastInput ||
        (message.inputSlot >= kArpeggiatorInputBase && message.inputSlot < kRoutableMidiInputCount);
    const auto virtualMessage = type == kNoteOn || type == kNoteOff ||
        (message.inputSlot == kKeyboardBroadcastInput &&
         (type == kControlChange || type == kPitchBend));
    if (!virtualInput || !virtualMessage) return false;
  }
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

bool HookKeysEngine::setGlobalTranspose(int semitones) noexcept {
  return push(EngineCommand::globalTranspose(
      static_cast<std::int8_t>(std::clamp(semitones, -60, 60))));
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
      // Desligar o módulo só fecha a porta do MIDI: o que já estava soando
      // continua até acabar, então ele segue sendo renderizado.
      auto* synth = modules_[index];
      if (synth == nullptr) continue;
      if (synth->canSkipRenderingWhenIdle() && !synth->hasActiveVoices() &&
          !effects_[index].requiresSilentProcessing()) {
        // O relógio do fader pertence ao áudio, não às vozes. Se a rampa
        // congelar durante o silêncio, a primeira nota seguinte começa no
        // ganho antigo e faz um vai-e-volta antes de alcançar o valor salvo.
        advanceSilentModuleGain(index, blockFrames);
        moduleLimiterGains_[index] = 1.0f;
        continue;
      }
      std::fill_n(scratchLeft_.data(), blockFrames, 0.0f);
      std::fill_n(scratchRight_.data(), blockFrames, 0.0f);
      synth->renderAdd(scratchLeft_.data(), scratchRight_.data(), blockFrames, 1.0f);
      const auto processorLevels = effects_[index].process(
          scratchLeft_.data(), scratchRight_.data(), blockFrames,
          compressorMeterRequests_[index].exchange(false, std::memory_order_acq_rel));
      publishProcessorLevels(index, processorLevels);
      float leftPeak = 0.0f;
      float rightPeak = 0.0f;
      for (std::size_t frame = 0; frame < blockFrames; ++frame) {
        const auto gain = nextModuleGain(index);
        auto sampleLeft = scratchLeft_[frame] * gain;
        auto sampleRight = scratchRight_[frame] * gain;
        applyModuleLimiter(index, sampleLeft, sampleRight);
        leftPeak = std::max(leftPeak, std::abs(sampleLeft));
        rightPeak = std::max(rightPeak, std::abs(sampleRight));
        left[rendered + frame] += sampleLeft;
        right[rendered + frame] += sampleRight;
        scratchLeft_[frame] = sampleLeft;
        scratchRight_[frame] = sampleRight;
      }
      publishModulePeak(index, leftPeak, rightPeak);
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
      if (synth == nullptr || config.outputChannelStart >= channels) continue;
      if (synth->canSkipRenderingWhenIdle() && !synth->hasActiveVoices() &&
          !effects_[index].requiresSilentProcessing()) {
        advanceSilentModuleGain(index, blockFrames);
        moduleLimiterGains_[index] = 1.0f;
        continue;
      }
      std::fill_n(scratchLeft_.data(), blockFrames, 0.0f);
      std::fill_n(scratchRight_.data(), blockFrames, 0.0f);
      synth->renderAdd(scratchLeft_.data(), scratchRight_.data(), blockFrames, 1.0f);
      const auto processorLevels = effects_[index].process(
          scratchLeft_.data(), scratchRight_.data(), blockFrames,
          compressorMeterRequests_[index].exchange(false, std::memory_order_acq_rel));
      publishProcessorLevels(index, processorLevels);
      const auto first = static_cast<std::size_t>(config.outputChannelStart);
      const bool stereo = config.outputChannelCount == 2 && first + 1 < channels;
      float leftPeak = 0.0f;
      float rightPeak = 0.0f;
      for (std::size_t frame = 0; frame < blockFrames; ++frame) {
        const auto gain = nextModuleGain(index);
        auto sampleLeft = scratchLeft_[frame] * gain;
        auto sampleRight = scratchRight_[frame] * gain;
        applyModuleLimiter(index, sampleLeft, sampleRight);
        auto* destination = output + (rendered + frame) * channels;
        leftPeak = std::max(leftPeak, std::abs(sampleLeft));
        rightPeak = std::max(rightPeak, std::abs(sampleRight));
        if (stereo && !config.outputDualMono) {
          destination[first] += sampleLeft;
          destination[first + 1] += sampleRight;
        } else {
          const auto mono = (sampleLeft + sampleRight) * 0.5f;
          destination[first] += mono;
          if (stereo) destination[first + 1] += mono;
        }
        scratchLeft_[frame] = sampleLeft;
        scratchRight_[frame] = sampleRight;
      }
      publishModulePeak(index, leftPeak, rightPeak);
    }
    rendered += blockFrames;
  }
}

std::uint64_t HookKeysEngine::droppedCommandCount() const noexcept {
  return droppedCommands_.load(std::memory_order_relaxed);
}

bool HookKeysEngine::hasActiveVoices() const noexcept {
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    if (modules_[index] != nullptr &&
        (moduleHasActiveNotes(index) || modules_[index]->hasActiveVoices())) return true;
  }
  return false;
}

void HookKeysEngine::publishModulePeak(
    std::size_t index, float leftPeak, float rightPeak) noexcept {
  static_assert(std::atomic<float>::is_always_lock_free, "Meters must not lock the audio thread");
  const std::array<float, 2> peaks{leftPeak, rightPeak};
  for (std::size_t channel = 0; channel < peaks.size(); ++channel) {
    const auto peak = peaks[channel];
    if (!std::isfinite(peak)) continue;
    auto& destination = modulePeaks_[index][channel];
    auto previous = destination.load(std::memory_order_relaxed);
    while (peak > previous && !destination.compare_exchange_weak(
        previous, peak, std::memory_order_relaxed)) {}
  }
}

HookKeysEngine::ModulePeaks HookKeysEngine::consumeModulePeaks() noexcept {
  ModulePeaks peaks{};
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    peaks[index * 2] = modulePeaks_[index][0].exchange(0.0f, std::memory_order_relaxed);
    peaks[index * 2 + 1] = modulePeaks_[index][1].exchange(0.0f, std::memory_order_relaxed);
  }
  return peaks;
}

HookKeysEngine::ModuleAnalysis HookKeysEngine::consumeModuleAnalysis(
    std::size_t moduleIndex) noexcept {
  ModuleAnalysis result{};
  if (moduleIndex >= kModuleCount) return result;
  compressorMeterRequests_[moduleIndex].store(true, std::memory_order_release);
  result[0] = compressorInputPeaks_[moduleIndex].exchange(0.0f, std::memory_order_relaxed);
  result[1] = compressorOutputPeaks_[moduleIndex].exchange(0.0f, std::memory_order_relaxed);
  return result;
}

void HookKeysEngine::publishProcessorLevels(
    std::size_t index, ModuleProcessorLevels levels) noexcept {
  const auto publish = [](std::atomic<float>& destination, float peak) {
    if (!std::isfinite(peak)) return;
    auto previous = destination.load(std::memory_order_relaxed);
    while (peak > previous && !destination.compare_exchange_weak(
        previous, peak, std::memory_order_relaxed)) {}
  };
  publish(compressorInputPeaks_[index], levels.compressorInput);
  publish(compressorOutputPeaks_[index], levels.compressorOutput);
}

float HookKeysEngine::nextModuleGain(std::size_t index) noexcept {
  if (moduleGainRampFrames_[index] > 0) {
    currentModuleGains_[index] += moduleGainSteps_[index];
    if (--moduleGainRampFrames_[index] == 0) {
      currentModuleGains_[index] = configs_[index].gainLinear;
    }
  }
  return currentModuleGains_[index];
}

void HookKeysEngine::advanceSilentModuleGain(
    std::size_t index, std::size_t frames) noexcept {
  auto& remaining = moduleGainRampFrames_[index];
  if (remaining == 0 || frames == 0) return;
  if (frames >= remaining) {
    currentModuleGains_[index] = configs_[index].gainLinear;
    moduleGainSteps_[index] = 0.0f;
    remaining = 0;
    return;
  }
  currentModuleGains_[index] += moduleGainSteps_[index] * static_cast<float>(frames);
  remaining -= frames;
}

void HookKeysEngine::applyModuleLimiter(
    std::size_t index, float& left, float& right) noexcept {
  const auto peak = std::max(std::abs(left), std::abs(right));
  auto& limiterGain = moduleLimiterGains_[index];
  const auto requiredGain = peak > kModuleLimiterCeiling
      ? kModuleLimiterCeiling / peak
      : 1.0f;

  if (requiredGain < limiterGain) {
    // Ataque instantâneo: nenhum pico do módulo ultrapassa -0,2 dBFS.
    limiterGain = requiredGain;
  } else {
    limiterGain += (1.0f - limiterGain) * moduleLimiterRelease_;
    // Durante a soltura, um novo pico continua respeitando o teto.
    limiterGain = std::min(limiterGain, requiredGain);
  }

  left *= limiterGain;
  right *= limiterGain;
}

void HookKeysEngine::setModuleGainTarget(std::size_t index, float target) noexcept {
  if (std::abs(target - currentModuleGains_[index]) < 0.000001f) {
    currentModuleGains_[index] = target;
    moduleGainSteps_[index] = 0.0f;
    moduleGainRampFrames_[index] = 0;
    return;
  }
  const auto frames = std::max<std::size_t>(1, static_cast<std::size_t>(settings_.sampleRate * 0.005));
  moduleGainSteps_[index] = (target - currentModuleGains_[index]) / static_cast<float>(frames);
  moduleGainRampFrames_[index] = frames;
}

void HookKeysEngine::applyCommand(const EngineCommand& command) noexcept {
  switch (command.type) {
    case CommandType::midi:
      routeMidi(command.midi);
      break;
    case CommandType::setModuleConfig:
      if (command.moduleIndex < kModuleCount) {
        const auto index = static_cast<std::size_t>(command.moduleIndex);
        if (configs_[index].midiInputSlot != command.moduleConfig.midiInputSlot &&
            modules_[index] != nullptr) {
          // Reset CC64 even if no key is physically down: an SF2 can still
          // contain pedal-held voices from the previous input route.
          if (sustainDown_[index]) modules_[index]->controlChange(kSustainController, 0);
          sustainDown_[index] = false;
          if (moduleHasActiveNotes(index)) modules_[index]->allNotesOff();
          clearActiveNoteState(index);
        } else if (configs_[index].sustainInputEnabled &&
                   !command.moduleConfig.sustainInputEnabled && modules_[index] != nullptr) {
          if (sustainDown_[index]) modules_[index]->controlChange(kSustainController, 0);
          sustainDown_[index] = false;
          releaseSustainedNotes(index);
        }
        if (configs_[index].gainLinear != command.moduleConfig.gainLinear) {
          setModuleGainTarget(index, command.moduleConfig.gainLinear);
        }
        if (configs_[index].modulationInputEnabled && !command.moduleConfig.modulationInputEnabled && modules_[index] != nullptr) {
          modules_[index]->controlChange(kModulationController, 0);
          effects_[index].setModulation(0);
        }
        if (!command.moduleConfig.effects.compressor.enabled) {
          compressorInputPeaks_[index].store(0.0f, std::memory_order_relaxed);
          compressorOutputPeaks_[index].store(0.0f, std::memory_order_relaxed);
          compressorMeterRequests_[index].store(false, std::memory_order_release);
        }
        configs_[index] = command.moduleConfig;
        while (moduleHeldNoteCount(index) > configs_[index].polyphony) {
          if (!stealOldestNote(index)) break;
        }
        if (modules_[index]) modules_[index]->setCutoffConfig(configs_[index].effects.cutoff);
        if (modules_[index]) modules_[index]->setNoVelocitySensitivity(configs_[index].noVelocitySensitivity);
        if (modules_[index]) modules_[index]->setVoiceMode(configs_[index].mono, configs_[index].legato);
        auto sharedEffects = configs_[index].effects;
        // Cutoff belongs to each voice, never to the sum of a polyphonic chord.
        sharedEffects.cutoff.enabled = false;
        effects_[index].setConfig(sharedEffects, settings_.tempoBpm);
      }
      break;
    case CommandType::setTempo:
      settings_.tempoBpm = std::clamp(command.tempoBpm, 60.0f, 600.0f);
      for (auto& processor : effects_) processor.setTempo(settings_.tempoBpm);
      break;
    case CommandType::allNotesOff:
      applyAllNotesOff();
      break;
    case CommandType::setGlobalTranspose:
      settings_.globalTransposeSemitones = command.globalTransposeSemitones;
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
      if (synth == nullptr) continue;
      // Módulo desligado ignora todo controle, menos soltar o sustain: sem
      // isso um pad que ficou preso no pedal nunca mais solta.
      const auto pedalRelease = message.data1 == kSustainController && message.data2 < 64;
      if (!config.enabled && !pedalRelease) continue;
      // O módulo tocado pelo arpeggiator recebe as notas pela entrada gerada,
      // mas pedal, roda e expressão só existem no teclado físico: para eles
      // vale qualquer entrada, senão o pedal nunca alcançaria o módulo.
      const auto generatedNotes = config.midiInputSlot != kAllMidiInputs && config.midiInputSlot >= kArpeggiatorInputBase;
      const auto acceptsInput = config.midiInputSlot == kAllMidiInputs || generatedNotes ||
                                message.inputSlot == kKeyboardBroadcastInput ||
                                message.inputSlot == config.midiInputSlot;
      if (!acceptsInput) continue;
      if (message.data1 == kSustainController && !config.sustainInputEnabled) continue;
      if (message.data1 == kModulationController && !config.modulationInputEnabled) continue;
      if (message.data1 == kModulationController) effects_[index].setModulation(message.data2);
      if (message.data1 == kSustainController) {
        // Ao soltar o pedal as vozes seguradas entram em release dentro do SF2.
        // Tira-las da contagem aqui devolve a polifonia as proximas notas.
        if (message.data2 < 64) releaseSustainedNotes(index);
        sustainDown_[index] = message.data2 >= 64;
      }
      synth->controlChange(message.data1, message.data2);
    }
    return;
  }
  if (type == kPitchBend) {
    const auto value = static_cast<std::uint16_t>(message.data1 | (message.data2 << 7));
    for (std::size_t index = 0; index < kModuleCount; ++index) {
      const auto& config = configs_[index];
      const auto generatedNotes = config.midiInputSlot != kAllMidiInputs && config.midiInputSlot >= kArpeggiatorInputBase;
      if (modules_[index] != nullptr && config.enabled &&
          (config.midiInputSlot == kAllMidiInputs || generatedNotes ||
           message.inputSlot == kKeyboardBroadcastInput ||
           message.inputSlot == config.midiInputSlot)) {
        modules_[index]->pitchBend(value);
      }
    }
  }
}

void HookKeysEngine::routeNoteOn(
    std::uint8_t inputSlot, std::uint8_t sourceNote, std::uint8_t velocity) noexcept {
  // Cada módulo escuta seu próprio slot gerado (base + índice do módulo): a
  // frase do Arpeggiator de um módulo nunca soa em outro.
  const auto generatedModule = inputSlot >= kArpeggiatorInputBase
      ? static_cast<int>(inputSlot - kArpeggiatorInputBase) : -1;
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    auto* synth = modules_[index];
    const auto& config = configs_[index];
    const auto generatedForDifferentModule = generatedModule >= 0 &&
        index != static_cast<std::size_t>(generatedModule);
    const auto generatedConfig = config.midiInputSlot != kAllMidiInputs && config.midiInputSlot >= kArpeggiatorInputBase;
    const auto regularInputMismatch = generatedModule < 0 && (
        (inputSlot == kKeyboardBroadcastInput && generatedConfig) ||
        (inputSlot != kKeyboardBroadcastInput && config.midiInputSlot != kAllMidiInputs &&
         inputSlot != config.midiInputSlot));
    // Limite Velocity reads the raw key: above it the key plays nothing here.
    if (velocity > config.velocityIgnoreAbove) continue;
    if (synth == nullptr || !config.enabled ||
        generatedForDifferentModule || regularInputMismatch ||
        (generatedModule < 0 && (sourceNote < config.lowNote || sourceNote > config.highNote))) {
      continue;
    }
    const auto isGmHiHat = config.gmDrumHiHatChoke &&
        (sourceNote == 42 || sourceNote == 44 || sourceNote == 46);
    if (isGmHiHat) {
      // GM: closed (42), pedal (44) and open (46) are mutually exclusive.
      // A cauda continua depois que a tecla sobe, então não podemos depender
      // apenas de activeNotes_: o próximo chimbal corta todas as caudas do
      // grupo com a soltura rápida, inclusive sob sustain.
      for (std::size_t note = 0; note < kMidiNoteCount; ++note) {
        if (hiHatTailNotes_[index][note]) synth->stealNote(static_cast<std::uint8_t>(note));
      }
      hiHatTailNotes_[index].fill(false);
      constexpr std::array<std::uint8_t, 3> kGmHiHats{42, 44, 46};
      for (std::size_t input = 0; input < kRoutableMidiInputCount; ++input) {
        for (const auto hiHat : kGmHiHats) {
          activeNotes_[index][input][hiHat] = -1;
          activeNoteOrders_[index][input][hiHat] = 0;
          activeNoteCounts_[index][input][hiHat] = 0;
          sustainedNoteCounts_[index][input][hiHat] = 0;
        }
      }
    }
    const auto targetNote = translatedNote(sourceNote, config.octaveShift, settings_.globalTransposeSemitones);
    // Lido antes do roubo: no Mono a nota nova tira a anterior, e o Trance Gate
    // não pode recomeçar o padrão a cada nota tocada ligada.
    const auto startsFromSilence = !moduleHasActiveNotes(index);
    while (moduleHeldNoteCount(index) >= config.polyphony) {
      if (!stealOldestNote(index)) break;
    }
    // Uma voz roubada leva 10 ms para morrer, entao a contagem interna nao
    // cai na hora: um resgate por nota basta para acompanhar quem toca, e
    // limitar aqui evita esvaziar o modulo inteiro de uma vez.
    if (synth->isVoicePoolNearlyFull()) (void)stealOldestNote(index, true);

    // Nao encerra a voz anterior ao repetir a mesma nota. Camadas repetidas
    // sao parte do som (piano, pads e retriggers); sem sustain, o Note Off
    // encerra o grupo inteiro dessa tecla.
    if (startsFromSilence) effects_[index].triggerTranceGate();
    auto& count = activeNoteCounts_[index][inputSlot][sourceNote];
    auto& sustainedCount = sustainedNoteCounts_[index][inputSlot][sourceNote];
    if (activeNotes_[index][inputSlot][sourceNote] < 0) {
      activeNotes_[index][inputSlot][sourceNote] = targetNote;
      activeNoteOrders_[index][inputSlot][sourceNote] = ++activeNoteOrder_;
    } else if (count > 0 && count == sustainedCount) {
      // Todas as camadas anteriores desta tecla estão apenas no pedal; esta é
      // uma nova tecla física e passa a ser a mais recente para o roubo FIFO.
      activeNoteOrders_[index][inputSlot][sourceNote] = ++activeNoteOrder_;
    }
    if (count < std::numeric_limits<std::uint16_t>::max()) ++count;
    synth->noteOnWithFilterVelocity(targetNote,
        std::min(applyVelocityCurve(velocity, config.velocityCurve), config.velocityCeiling), velocity);
    if (isGmHiHat) hiHatTailNotes_[index][targetNote] = true;
  }
}

void HookKeysEngine::routeNoteOff(std::uint8_t inputSlot, std::uint8_t sourceNote) noexcept {
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    const auto targetNote = activeNotes_[index][inputSlot][sourceNote];
    if (targetNote < 0) continue;
    if (modules_[index] != nullptr) {
      if (configs_[index].gmDrumHiHatChoke && configs_[index].drumNoteUsesZeroRelease(sourceNote)) {
        modules_[index]->stealNote(static_cast<std::uint8_t>(targetNote));
      } else {
        modules_[index]->noteOff(static_cast<std::uint8_t>(targetNote));
      }
    }
    if (configs_[index].gmDrumHiHatChoke && configs_[index].drumNoteUsesZeroRelease(sourceNote)) {
      activeNotes_[index][inputSlot][sourceNote] = -1;
      activeNoteOrders_[index][inputSlot][sourceNote] = 0;
      activeNoteCounts_[index][inputSlot][sourceNote] = 0;
      sustainedNoteCounts_[index][inputSlot][sourceNote] = 0;
      hiHatTailNotes_[index][targetNote] = false;
      continue;
    }
    if (sustainDown_[index]) {
      // A voz segue soando presa pelo pedal, entao a nota continua ocupando
      // polifonia ate o CC64 descer ou o roubo FIFO alcanca-la.
      sustainedNoteCounts_[index][inputSlot][sourceNote] =
          activeNoteCounts_[index][inputSlot][sourceNote];
      continue;
    }
    activeNotes_[index][inputSlot][sourceNote] = -1;
    activeNoteOrders_[index][inputSlot][sourceNote] = 0;
    activeNoteCounts_[index][inputSlot][sourceNote] = 0;
    sustainedNoteCounts_[index][inputSlot][sourceNote] = 0;
  }
}

void HookKeysEngine::releaseSustainedNotes(std::size_t moduleIndex) noexcept {
  for (std::size_t input = 0; input < kRoutableMidiInputCount; ++input) {
    for (std::size_t note = 0; note < kMidiNoteCount; ++note) {
      auto& total = activeNoteCounts_[moduleIndex][input][note];
      auto& sustained = sustainedNoteCounts_[moduleIndex][input][note];
      if (sustained == 0) continue;
      total = total > sustained ? static_cast<std::uint16_t>(total - sustained) : 0;
      sustained = 0;
      if (total == 0) {
        activeNotes_[moduleIndex][input][note] = -1;
        activeNoteOrders_[moduleIndex][input][note] = 0;
      }
    }
  }
}

void HookKeysEngine::applyAllNotesOff() noexcept {
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    if (modules_[index] != nullptr) modules_[index]->allNotesOff();
    // Panic deve cortar também as caudas de delay/reverb e estados dos demais
    // processadores, em vez de apenas soltar as teclas.
    effects_[index].reset();
    sustainDown_[index] = false;
    clearActiveNoteState(index);
  }
}

bool HookKeysEngine::moduleHasActiveNotes(std::size_t moduleIndex) const noexcept {
  for (const auto& inputNotes : activeNotes_[moduleIndex]) {
    if (std::any_of(inputNotes.begin(), inputNotes.end(), [](std::int16_t note) { return note >= 0; })) return true;
  }
  return false;
}

// So teclas fisicamente pressionadas. O pedal de sustain prende vozes sem
// consumir a polifonia que o musico escolheu: quem devolve lugar para elas e
// a folga do banco interno, nao este limite.
std::size_t HookKeysEngine::moduleHeldNoteCount(std::size_t moduleIndex) const noexcept {
  std::size_t count = 0;
  for (std::size_t input = 0; input < kRoutableMidiInputCount; ++input) {
    for (std::size_t note = 0; note < kMidiNoteCount; ++note) {
      if (activeNotes_[moduleIndex][input][note] >= 0) {
        const auto total = activeNoteCounts_[moduleIndex][input][note];
        const auto sustained = sustainedNoteCounts_[moduleIndex][input][note];
        count += total > sustained ? total - sustained : 0;
      }
    }
  }
  return count;
}

// Uma nota presa so pelo pedal e sempre o sacrificio preferido: a tecla que o
// musico ainda segura continua soando.
bool HookKeysEngine::stealOldestNote(std::size_t moduleIndex, bool sustainedOnly) noexcept {
  for (const bool sustainedPass : {true, false}) {
    if (!sustainedPass && sustainedOnly) break;
    auto oldestOrder = std::numeric_limits<std::uint64_t>::max();
    std::size_t oldestInput = 0;
    std::size_t oldestSourceNote = 0;
    bool found = false;
    for (std::size_t input = 0; input < kRoutableMidiInputCount; ++input) {
      for (std::size_t note = 0; note < kMidiNoteCount; ++note) {
        const auto order = activeNoteOrders_[moduleIndex][input][note];
        if (activeNotes_[moduleIndex][input][note] < 0 || order == 0 || order >= oldestOrder) continue;
        const auto total = activeNoteCounts_[moduleIndex][input][note];
        const auto sustained = sustainedNoteCounts_[moduleIndex][input][note];
        const bool sustainedOnlyGroup = total > 0 && total == sustained;
        if (sustainedOnlyGroup != sustainedPass) continue;
        oldestOrder = order;
        oldestInput = input;
        oldestSourceNote = note;
        found = true;
      }
    }
    if (!found) continue;
    const auto target = activeNotes_[moduleIndex][oldestInput][oldestSourceNote];
    if (target >= 0 && modules_[moduleIndex] != nullptr) {
      modules_[moduleIndex]->stealNote(static_cast<std::uint8_t>(target));
    }
    activeNotes_[moduleIndex][oldestInput][oldestSourceNote] = -1;
    activeNoteOrders_[moduleIndex][oldestInput][oldestSourceNote] = 0;
    activeNoteCounts_[moduleIndex][oldestInput][oldestSourceNote] = 0;
    sustainedNoteCounts_[moduleIndex][oldestInput][oldestSourceNote] = 0;
    return true;
  }
  return false;
}

void HookKeysEngine::clearActiveNoteState(std::size_t moduleIndex) noexcept {
  for (auto& inputNotes : activeNotes_[moduleIndex]) inputNotes.fill(-1);
  for (auto& inputOrders : activeNoteOrders_[moduleIndex]) inputOrders.fill(0);
  for (auto& inputCounts : activeNoteCounts_[moduleIndex]) inputCounts.fill(0);
  for (auto& inputSustained : sustainedNoteCounts_[moduleIndex]) inputSustained.fill(0);
  hiHatTailNotes_[moduleIndex].fill(false);
}

bool HookKeysEngine::push(const EngineCommand& command) noexcept {
  if (commands_.tryPush(command)) return true;
  droppedCommands_.fetch_add(1, std::memory_order_relaxed);
  return false;
}

std::uint8_t HookKeysEngine::translatedNote(
    std::uint8_t sourceNote, std::int8_t octaveShift, std::int8_t globalTransposeSemitones) noexcept {
  const auto translated = static_cast<int>(sourceNote) + static_cast<int>(octaveShift) * 12
      + static_cast<int>(globalTransposeSemitones);
  return static_cast<std::uint8_t>(std::clamp(translated, 0, 127));
}

} // namespace hook_keys
