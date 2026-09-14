#include "hook_keys/NativeEngineRuntime.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>

#if defined(_M_IX86) || defined(_M_X64) || defined(__SSE__)
#include <xmmintrin.h>
#endif

namespace hook_keys {

namespace {
void prepareRealtimeFloatingPoint() noexcept {
#if defined(_M_IX86) || defined(_M_X64) || defined(__SSE__)
  // Recursive filters and long releases eventually reach denormal values.
  // Processing those values in hardware can suddenly become hundreds of times
  // slower and cause exactly the chord-dependent ticks heard at small buffers.
  thread_local const bool prepared = [] {
    _mm_setcsr(_mm_getcsr() | 0x8040u); // Flush-to-zero + denormals-are-zero.
    return true;
  }();
  static_cast<void>(prepared);
#endif
}
} // namespace

NativeEngineRuntime::NativeEngineRuntime(double sampleRate, std::size_t maximumBlockFrames)
    : sampleRate_(std::clamp(sampleRate, 8000.0, 384000.0)),
      maximumBlockFrames_(std::clamp<std::size_t>(maximumBlockFrames, 16, 8192)),
      layerScratch_(maximumBlockFrames_ * 32, 0.0f),
      stereoScratch_(maximumBlockFrames_ * 2, 0.0f),
      tracks_(std::make_unique<TrackPlayer>(sampleRate_)) {
  layers_.reserve(kMaximumPresetLayers);
  layers_.push_back(createPresetLayer());
  controlLayer_ = renderLayer_ = layers_.back().get();
}

std::unique_ptr<NativeEngineRuntime::PresetLayer> NativeEngineRuntime::createPresetLayer() {
  auto layer = std::make_unique<PresetLayer>();
  for (auto& module : layer->modules) {
    // O limite publico de polifonia conta notas musicais, enquanto uma nota SF2
    // em camadas acende varias vozes de regiao la dentro. A folga interna e o
    // que mantem o roubo FIFO do motor como autoridade.
    module = std::make_unique<TinySoundFontModule>(
        sampleRate_, maximumBlockFrames_, kHookKeysMaximumVoices);
  }
  layer->synth = std::make_unique<AnalogSynthModule>(sampleRate_);
  EngineSettings settings;
  settings.sampleRate = sampleRate_;
  settings.maximumBlockFrames = maximumBlockFrames_;
  layer->engine = std::make_unique<HookKeysEngine>(modulePointers(layer->modules, layer->synth.get()), settings);
  // O Synth não depende de SF2 e portanto já consegue produzir áudio assim
  // que o runtime nasce. Mantenha-o mudo até a interface enviar o estado do
  // módulo 8, como já acontece naturalmente com os módulos sem timbre.
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    layer->configs[index].enabled = false;
    (void)layer->engine->setModuleConfig(index, layer->configs[index]);
  }
  return layer;
}

NativeEngineRuntime::~NativeEngineRuntime() {
  layers_.clear(); // caller has already stopped the audio callback
}

bool NativeEngineRuntime::beginPresetTransition() noexcept {
  std::scoped_lock lock(configMutex_, soundFontMutex_);
  if (pendingTransitionLayer_ != nullptr) return true;
  collectLayersLocked();
  // Never steal/cut an audible older preset to make room. Fail safely if the
  // user holds voices across sixteen overlapping presets at once.
  if (layers_.size() >= kMaximumPresetLayers) return false;
  try {
    auto layer = createPresetLayer();
    for (std::size_t index = 0; index < layer->modules.size(); ++index) {
      if (controlLayer_->modules[index]->hasShareableSoundFont() &&
          !layer->modules[index]->copySoundFontFrom(*controlLayer_->modules[index])) return false;
    }
    auto* next = layer.get();
    layers_.push_back(std::move(layer));
    controlLayer_ = pendingTransitionLayer_ = next;
    return true;
  } catch (...) {
    return false;
  }
}

bool NativeEngineRuntime::commitPresetTransition() noexcept {
  std::scoped_lock lock(configMutex_);
  if (pendingTransitionLayer_ == nullptr) return true;
  RuntimeCommand command;
  command.kind = RuntimeCommand::Kind::transition;
  command.layer = pendingTransitionLayer_;
  if (!runtimeCommands_.tryPush(command)) return false;
  pendingTransitionLayer_ = nullptr;
  return true;
}

bool NativeEngineRuntime::loadSoundFont(std::size_t moduleIndex, const char* utf8Path) noexcept {
  // Parsing must never own configMutex_: mapped faders/OFF still respond while
  // a large SF2 loads. soundFontMutex_ pins the layer against reclamation.
  std::scoped_lock soundLock(soundFontMutex_);
  PresetLayer* layer;
  { std::scoped_lock configLock(configMutex_); layer = controlLayer_; }
  if (moduleIndex >= layer->modules.size() || utf8Path == nullptr || *utf8Path == '\0') return false;
  const std::string path(utf8Path);
  if (seamlessPresetSwitching_) {
    const auto cached = soundFontCache_.find(path);
    if (cached != soundFontCache_.end()) {
      const auto copied = layer->modules[moduleIndex]->copySoundFontFrom(*cached->second);
      if (copied) {
        currentSoundFontPaths_[moduleIndex] = path;
        touchSoundFontCacheLocked(path);
      }
      return copied;
    }
  }
  if (!layer->modules[moduleIndex]->loadFromFile(utf8Path)) return false;
  currentSoundFontPaths_[moduleIndex] = path;
  retainSoundFontLocked(path, *layer->modules[moduleIndex]);
  return true;
}

bool NativeEngineRuntime::cloneSoundFont(
    std::size_t sourceModuleIndex, std::size_t targetModuleIndex) noexcept {
  std::scoped_lock lock(configMutex_, soundFontMutex_);
  const auto copied = sourceModuleIndex < controlLayer_->modules.size() && targetModuleIndex < controlLayer_->modules.size() &&
      sourceModuleIndex != targetModuleIndex &&
      controlLayer_->modules[targetModuleIndex]->copySoundFontFrom(*controlLayer_->modules[sourceModuleIndex]);
  if (copied) currentSoundFontPaths_[targetModuleIndex] = currentSoundFontPaths_[sourceModuleIndex];
  return copied;
}

void NativeEngineRuntime::unloadSoundFont(std::size_t moduleIndex) noexcept {
  std::scoped_lock lock(configMutex_, soundFontMutex_);
  if (moduleIndex < controlLayer_->modules.size()) {
    controlLayer_->modules[moduleIndex]->unload();
    currentSoundFontPaths_[moduleIndex].clear();
  }
}

void NativeEngineRuntime::setSeamlessPresetSwitching(
    bool enabled, std::size_t cacheBudgetBytes) noexcept {
  std::scoped_lock lock(configMutex_, soundFontMutex_);
  const auto budget = cacheBudgetBytes == 0 ? kDefaultSoundFontCacheBytes : cacheBudgetBytes;
  const auto unchanged = seamlessPresetSwitching_ == enabled && soundFontCacheBudgetBytes_ == budget;
  soundFontCacheBudgetBytes_ = budget;
  if (unchanged) return;
  seamlessPresetSwitching_ = enabled;
  if (!enabled) {
    soundFontCache_.clear();
    soundFontCacheOrder_.clear();
    return;
  }
  trimSoundFontCacheLocked();
  for (std::size_t index = 0; index < currentSoundFontPaths_.size(); ++index) {
    if (currentSoundFontPaths_[index].empty() || !controlLayer_->modules[index]->hasShareableSoundFont()) continue;
    retainSoundFontLocked(currentSoundFontPaths_[index], *controlLayer_->modules[index]);
  }
}

void NativeEngineRuntime::touchSoundFontCacheLocked(const std::string& path) noexcept {
  const auto entry = std::find(soundFontCacheOrder_.begin(), soundFontCacheOrder_.end(), path);
  if (entry == soundFontCacheOrder_.end()) return;
  std::rotate(entry, entry + 1, soundFontCacheOrder_.end());
}

// Um unico SF2 nunca pode tomar o orcamento inteiro: guardar uma copia do
// timbre que esta tocando so o faria disputar RAM com ele mesmo, e e essa
// disputa que empurra as amostras em uso para o arquivo de paginacao.
void NativeEngineRuntime::retainSoundFontLocked(
    const std::string& path, TinySoundFontModule& source) noexcept {
  const auto bytes = source.sampleBytes();
  if (!seamlessPresetSwitching_ || bytes == 0 || bytes * 2 > soundFontCacheBudgetBytes_) return;
  try {
    auto retained = std::make_unique<TinySoundFontModule>(
        sampleRate_, maximumBlockFrames_, kHookKeysMaximumVoices);
    if (!retained->copySoundFontFrom(source)) return;
    soundFontCacheOrder_.erase(
        std::remove(soundFontCacheOrder_.begin(), soundFontCacheOrder_.end(), path),
        soundFontCacheOrder_.end());
    soundFontCacheOrder_.push_back(path);
    soundFontCache_.insert_or_assign(path, std::move(retained));
    trimSoundFontCacheLocked();
  } catch (...) {
    // O cache e uma otimizacao; a reproducao continua se a RAM acabar.
  }
}

void NativeEngineRuntime::trimSoundFontCacheLocked() noexcept {
  std::size_t total = 0;
  for (const auto& entry : soundFontCache_) total += entry.second->sampleBytes();
  while (total > soundFontCacheBudgetBytes_ && !soundFontCacheOrder_.empty()) {
    const auto entry = soundFontCache_.find(soundFontCacheOrder_.front());
    if (entry != soundFontCache_.end()) {
      total -= std::min(total, entry->second->sampleBytes());
      soundFontCache_.erase(entry);
    }
    soundFontCacheOrder_.erase(soundFontCacheOrder_.begin());
  }
  // Uma falta de memoria pode ter deixado o mapa sem sua entrada de ordem.
  if (soundFontCacheOrder_.empty()) soundFontCache_.clear();
}

void NativeEngineRuntime::collectRetiredSoundFonts() noexcept {
  std::scoped_lock lock(configMutex_, soundFontMutex_);
  collectLayersLocked();
  for (const auto& layer : layers_) {
    for (auto& module : layer->modules) module->collectRetiredSoundFonts();
  }
}

void NativeEngineRuntime::collectLayersLocked() noexcept {
  PresetLayer* retired = nullptr;
  while (retiredLayers_.tryPop(retired)) {
    layers_.erase(std::remove_if(layers_.begin(), layers_.end(),
        [retired](const auto& layer) { return layer.get() == retired; }), layers_.end());
  }
}

bool NativeEngineRuntime::sendMidi(
    std::uint8_t inputSlot,
    std::uint8_t status,
    std::uint8_t data1,
    std::uint8_t data2,
    std::uint64_t timestampNanoseconds) noexcept {
  if (!midiInputEnabled_.load(std::memory_order_acquire)) return true;
  if (compatibilityMode_.load(std::memory_order_acquire) && (status & 0xf0) == 0xb0 &&
      (data1 == 7 || data1 == 91)) return true;
  if (inputSlot >= kRoutableMidiInputCount || data1 > 127 || data2 > 127) return false;
  RuntimeCommand command;
  command.midi = {status, data1, data2, inputSlot, timestampNanoseconds};
  return runtimeCommands_.tryPush(command);
}

void NativeEngineRuntime::setMidiInputEnabled(bool enabled) noexcept {
  midiInputEnabled_.store(false, std::memory_order_release);
  stopAllNotes();
  midiInputEnabled_.store(enabled, std::memory_order_release);
}

bool NativeEngineRuntime::setModuleConfig(std::size_t moduleIndex, ModuleConfig config) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  // Effects and the velocity limits arrive through their own commands.
  config.effects = controlLayer_->configs[moduleIndex].effects;
  config.velocityIgnoreAbove = controlLayer_->configs[moduleIndex].velocityIgnoreAbove;
  config.velocityCeiling = controlLayer_->configs[moduleIndex].velocityCeiling;
  config.normalize();
  controlLayer_->configs[moduleIndex] = config;
  return controlLayer_->engine->setModuleConfig(moduleIndex, config);
}

bool NativeEngineRuntime::setModuleGainDb(std::size_t moduleIndex, float db) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  const float safeDb = std::isfinite(db) ? std::clamp(db, -90.0f, 6.0f) : 0.0f;
  controlLayer_->configs[moduleIndex].gainLinear = safeDb <= -90.0f
      ? 0.0f : std::pow(10.0f, safeDb / 20.0f);
  return controlLayer_->engine->setModuleConfig(moduleIndex, controlLayer_->configs[moduleIndex]);
}

bool NativeEngineRuntime::setTranceGate(std::size_t moduleIndex, ModuleEffectsConfig::TranceGateConfig config) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  config.normalize();
  controlLayer_->configs[moduleIndex].effects.tranceGate = config;
  return controlLayer_->engine->setModuleConfig(moduleIndex, controlLayer_->configs[moduleIndex]);
}

bool NativeEngineRuntime::setModuleEffects(
    std::size_t moduleIndex, ModuleEffectsConfig effects) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  effects.normalize();
  effects.tranceGate = controlLayer_->configs[moduleIndex].effects.tranceGate;
  controlLayer_->configs[moduleIndex].effects = effects;
  return controlLayer_->engine->setModuleConfig(moduleIndex, controlLayer_->configs[moduleIndex]);
}

bool NativeEngineRuntime::setModuleEnvelope(
    std::size_t moduleIndex, float attackMs, float holdMs,
    float decayMs, float releaseMs, float glideMs) noexcept {
  std::scoped_lock lock(configMutex_);
  if (moduleIndex >= controlLayer_->modules.size()) return false;
  controlLayer_->modules[moduleIndex]->setVolumeEnvelope(attackMs, holdMs, decayMs, releaseMs);
  controlLayer_->modules[moduleIndex]->setGlide(std::isfinite(glideMs) ? std::clamp(glideMs, 0.0f, 5000.0f) : 0.0f);
  return true;
}

bool NativeEngineRuntime::setSynthConfig(AnalogSynthConfig config) noexcept {
  std::scoped_lock lock(configMutex_);
  return controlLayer_->synth->setConfig(config);
}

bool NativeEngineRuntime::setModuleModulationMode(
    std::size_t moduleIndex, bool lfo, float rateHz) noexcept {
  std::scoped_lock lock(configMutex_);
  if (moduleIndex == kModuleCount - 1) {
    controlLayer_->synth->setModulationMode(lfo, rateHz);
    return true;
  }
  if (moduleIndex >= controlLayer_->modules.size()) return false;
  controlLayer_->modules[moduleIndex]->setModulationMode(lfo, rateHz);
  return true;
}

bool NativeEngineRuntime::setGlideBehavior(std::size_t moduleIndex, GlideBehavior behavior) noexcept {
  std::scoped_lock lock(configMutex_);
  behavior.velocityThreshold = std::min<std::uint8_t>(behavior.velocityThreshold, 127);
  if (moduleIndex == kModuleCount - 1) {
    controlLayer_->synth->setGlideBehavior(behavior);
    return true;
  }
  if (moduleIndex >= controlLayer_->modules.size()) return false;
  controlLayer_->modules[moduleIndex]->setGlideBehavior(behavior);
  return true;
}

bool NativeEngineRuntime::setVelocityLimits(
    std::size_t moduleIndex, std::uint8_t ignoreAbove, std::uint8_t ceiling,
    std::uint8_t oscillator1Limit, std::uint8_t oscillator2Limit) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  if (moduleIndex == kModuleCount - 1) {
    controlLayer_->synth->setOscillatorVelocityLimits(oscillator1Limit, oscillator2Limit);
  }
  auto& config = controlLayer_->configs[moduleIndex];
  config.velocityIgnoreAbove = ignoreAbove;
  config.velocityCeiling = ceiling;
  config.normalize();
  return controlLayer_->engine->setModuleConfig(moduleIndex, config);
}

bool NativeEngineRuntime::setTempo(float bpm) noexcept {
  std::scoped_lock lock(configMutex_);
  return controlLayer_->engine->setTempoBpm(bpm);
}

void NativeEngineRuntime::setMetronome(
    bool enabled, float bpm, float volume, std::uint8_t clickSound,
    bool accentEnabled, bool doubleTimeEnabled,
    std::uint8_t timeSignatureNumerator) noexcept {
  metronomeBpm_.store(std::clamp(bpm, 60.0f, 600.0f), std::memory_order_release);
  metronomeVolume_.store(std::clamp(volume, 0.0f, std::pow(10.0f, 12.0f / 20.0f)), std::memory_order_release);
  metronomeClickSound_.store(
      static_cast<std::uint8_t>(std::clamp<int>(clickSound, 1, 3)),
      std::memory_order_release);
  metronomeAccentEnabled_.store(accentEnabled, std::memory_order_release);
  metronomeDoubleTimeEnabled_.store(doubleTimeEnabled, std::memory_order_release);
  metronomeNumerator_.store(
      static_cast<std::uint8_t>(std::clamp<int>(timeSignatureNumerator, 1, 16)),
      std::memory_order_release);
  metronomeEnabled_.store(enabled, std::memory_order_release);
}

void NativeEngineRuntime::setOutputGainDb(float db, bool enabled) noexcept {
  outputGainLinear_.store(
      enabled && db > -90.0f ? std::pow(10.0f, std::clamp(db, -90.0f, 12.0f) / 20.0f) : 0.0f,
      std::memory_order_release);
}

void NativeEngineRuntime::stopAllNotes() noexcept {
  RuntimeCommand command;
  command.kind = RuntimeCommand::Kind::panic;
  (void)runtimeCommands_.tryPush(command);
}

void NativeEngineRuntime::processRuntimeCommands() noexcept {
  RuntimeCommand command;
  while (runtimeCommands_.tryPop(command)) {
    if (command.kind == RuntimeCommand::Kind::transition) {
      if (renderLayer_ != nullptr) tailLayers_[tailLayerCount_++] = renderLayer_;
      renderLayer_ = command.layer;
      // A physically held pedal/wheel also applies to NEW notes, without
      // copying voices or synth parameters from the previous preset.
      for (std::size_t slot = 0; slot < liveExpression_.size(); ++slot) {
        const auto& expression = liveExpression_[slot];
        const auto input = static_cast<std::uint8_t>(slot);
        if (expression.sustain >= 0) (void)renderLayer_->engine->enqueueMidi(
            {0xb0, 64, static_cast<std::uint8_t>(expression.sustain), input, 0});
        if (expression.modulation >= 0) (void)renderLayer_->engine->enqueueMidi(
            {0xb0, 1, static_cast<std::uint8_t>(expression.modulation), input, 0});
        if (expression.pitch >= 0) (void)renderLayer_->engine->enqueueMidi(
            {0xe0, static_cast<std::uint8_t>(expression.pitch & 127), static_cast<std::uint8_t>(expression.pitch >> 7), input, 0});
      }
    } else if (command.kind == RuntimeCommand::Kind::panic) {
      (void)renderLayer_->engine->stopAllNotes();
      for (std::size_t index = 0; index < tailLayerCount_; ++index) {
        (void)tailLayers_[index]->engine->stopAllNotes();
      }
    } else {
      (void)renderLayer_->engine->enqueueMidi(command.midi);
      const auto type = command.midi.status & 0xf0;
      auto& expression = liveExpression_[command.midi.inputSlot];
      if (type == 0xb0 && command.midi.data1 == 64) expression.sustain = command.midi.data2;
      if (type == 0xb0 && command.midi.data1 == 1) expression.modulation = command.midi.data2;
      if (type == 0xe0) expression.pitch = command.midi.data1 | (command.midi.data2 << 7);
      // Old layers never receive fresh note-ons. Key releases and live MIDI
      // expression keep their ORIGINAL ranges, octaves and input routes.
      const bool releasesOrExpression = type == 0x80 || (type == 0x90 && command.midi.data2 == 0) ||
          type == 0xe0 || (type == 0xb0 && (command.midi.data1 == 1 || command.midi.data1 == 64 ||
              command.midi.data1 == 120 || command.midi.data1 == 123));
      if (releasesOrExpression) {
        for (std::size_t index = 0; index < tailLayerCount_; ++index) {
          (void)tailLayers_[index]->engine->enqueueMidi(command.midi);
        }
      }
    }
  }
}

HookKeysEngine::ModulePeaks NativeEngineRuntime::consumeModulePeaks() noexcept {
  // Meter é telemetria descartável: nunca faça a interface esperar uma troca
  // de preset/configuração. Os picos atômicos ficam para a próxima leitura.
  std::unique_lock configLock(configMutex_, std::try_to_lock);
  if (!configLock.owns_lock()) return {};
  // UI polling reclaims silent layers off the audio thread, but never waits
  // for a file parser that currently owns the sample-sharing mutex.
  std::unique_lock soundLock(soundFontMutex_, std::try_to_lock);
  if (soundLock.owns_lock()) collectLayersLocked();
  HookKeysEngine::ModulePeaks result{};
  for (const auto& layer : layers_) {
    const auto peaks = layer->engine->consumeModulePeaks();
    for (std::size_t index = 0; index < result.size(); ++index) result[index] += peaks[index];
  }
  return result;
}

HookKeysEngine::ModuleAnalysis NativeEngineRuntime::consumeModuleAnalysis(std::size_t moduleIndex) noexcept {
  std::unique_lock configLock(configMutex_, std::try_to_lock);
  if (!configLock.owns_lock()) return {};
  HookKeysEngine::ModuleAnalysis result{};
  for (const auto& layer : layers_) {
    const auto values = layer->engine->consumeModuleAnalysis(moduleIndex);
    for (std::size_t index = 0; index < result.size(); ++index) result[index] += values[index];
  }
  return result;
}

void NativeEngineRuntime::render(float* left, float* right, std::size_t frames) noexcept {
  if (left == nullptr || right == nullptr) return;
  for (std::size_t rendered = 0; rendered < frames;) {
    const auto count = std::min(maximumBlockFrames_, frames - rendered);
    renderInterleaved(stereoScratch_.data(), count, 2);
    for (std::size_t frame = 0; frame < count; ++frame) {
      left[rendered + frame] = stereoScratch_[frame * 2];
      right[rendered + frame] = stereoScratch_[frame * 2 + 1];
    }
    rendered += count;
  }
}

void NativeEngineRuntime::renderInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept {
  if (output == nullptr || channels == 0 || channels > 32) return;
  const auto started = std::chrono::steady_clock::now();
  prepareRealtimeFloatingPoint();
  processRuntimeCommands();
  for (std::size_t rendered = 0; rendered < frames;) {
    const auto count = std::min(maximumBlockFrames_, frames - rendered);
    auto* destination = output + rendered * channels;
    renderLayer_->engine->renderInterleaved(destination, count, channels);
    for (std::size_t index = 0; index < tailLayerCount_;) {
      auto* tail = tailLayers_[index];
      tail->engine->renderInterleaved(layerScratch_.data(), count, channels);
      float peak = 0.0f;
      for (std::size_t sample = 0; sample < count * channels; ++sample) {
        destination[sample] += layerScratch_[sample];
        peak = std::max(peak, std::abs(layerScratch_[sample]));
      }
      tail->silentFrames = !tail->engine->hasActiveVoices() && peak < 0.000001f
          ? tail->silentFrames + count : 0;
      if (tail->silentFrames >= static_cast<std::size_t>(sampleRate_ * 2.0) && retiredLayers_.tryPush(tail)) {
        tailLayers_[index] = tailLayers_[--tailLayerCount_];
      } else ++index;
    }
    rendered += count;
  }
  addMetronomeInterleaved(output, frames, channels);
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto gain = nextOutputGain();
    for (std::size_t channel = 0; channel < channels; ++channel) {
      output[frame * channels + channel] *= gain;
    }
  }
  // Depois do master: o fader Music já controla o volume das músicas.
  tracks_->render(output, frames, channels);
  const auto budgetSeconds = static_cast<double>(frames) / sampleRate_;
  if (budgetSeconds > 0.0) {
    const std::chrono::duration<double> spent = std::chrono::steady_clock::now() - started;
    publishAudioLoad(static_cast<float>(spent.count() / budgetSeconds));
  }
}

// Duas leituras de relogio por bloco, na casa de dezenas de nanossegundos.
// E o preco de ter o unico numero que denuncia um estouro de prazo: uma
// thread de audio saturada aparece como 8% no gerenciador de tarefas de uma
// maquina de doze processadores logicos, e como 0% quando ela esta travada
// esperando uma pagina voltar do disco.
void NativeEngineRuntime::publishAudioLoad(float load) noexcept {
  if (!std::isfinite(load) || load < 0.0f) return;
  // Ataque rapido e queda lenta: o numero na tela denuncia o bloco ruim sem
  // piscar a cada callback.
  audioLoadAverage_ += (load - audioLoadAverage_) * (load > audioLoadAverage_ ? 0.30f : 0.03f);
  audioLoadSmoothed_.store(audioLoadAverage_, std::memory_order_relaxed);
  auto previous = audioLoadPeak_.load(std::memory_order_relaxed);
  while (load > previous && !audioLoadPeak_.compare_exchange_weak(
      previous, load, std::memory_order_relaxed)) {}
  if (load >= 1.0f) audioLoadOverruns_.fetch_add(1, std::memory_order_relaxed);
}

NativeEngineRuntime::AudioLoad NativeEngineRuntime::consumeAudioLoad() noexcept {
  AudioLoad result;
  result.peak = audioLoadPeak_.exchange(0.0f, std::memory_order_relaxed);
  result.smoothed = audioLoadSmoothed_.load(std::memory_order_relaxed);
  result.overruns = audioLoadOverruns_.exchange(0, std::memory_order_relaxed);
  return result;
}

float NativeEngineRuntime::nextOutputGain() noexcept {
  const auto target = outputGainLinear_.load(std::memory_order_acquire);
  if (target != outputGainTargetSeen_) {
    outputGainTargetSeen_ = target;
    outputGainRampFrames_ = std::max<std::size_t>(
        1, static_cast<std::size_t>(sampleRate_ * 0.005));
    outputGainStep_ = (target - currentOutputGain_) /
        static_cast<float>(outputGainRampFrames_);
  }
  if (outputGainRampFrames_ > 0) {
    currentOutputGain_ += outputGainStep_;
    if (--outputGainRampFrames_ == 0) currentOutputGain_ = outputGainTargetSeen_;
  }
  return currentOutputGain_;
}

// Reads the control-thread state once per block: the click keeps its own frame
// clock, so its timing never depends on how often the interface calls back.
bool NativeEngineRuntime::beginMetronomeBlock() noexcept {
  if (!metronomeEnabled_.load(std::memory_order_acquire)) {
    metronomeWasEnabled_ = false;
    metronomeClickFrame_ = 0;
    metronomeClickLength_ = 0;
    return false;
  }
  if (!metronomeWasEnabled_) {
    metronomeWasEnabled_ = true;
    metronomeFramesUntilBeat_ = 0.0;
    metronomeBeatIndex_ = 0;
  }
  return true;
}

void NativeEngineRuntime::addMetronome(
    float* left, float* right, std::size_t frames) noexcept {
  if (left == nullptr || right == nullptr || frames == 0) return;
  if (!beginMetronomeBlock()) return;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto sample = renderMetronomeSample();
    left[frame] += sample;
    right[frame] += sample;
  }
}

void NativeEngineRuntime::addMetronomeInterleaved(
    float* output, std::size_t frames, std::size_t channels) noexcept {
  if (output == nullptr || frames == 0 || channels == 0) return;
  if (!beginMetronomeBlock()) return;
  // Uma saída que a interface atual não tem cai de volta em 1+2 em vez de sumir.
  const auto requested = static_cast<std::size_t>(metronomeOutputStart_.load(std::memory_order_acquire));
  const auto first = requested < channels ? requested : 0;
  const bool stereo = metronomeOutputCount_.load(std::memory_order_acquire) == 2 && first + 1 < channels;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto sample = renderMetronomeSample();
    auto* destination = output + frame * channels;
    destination[first] += sample;
    if (stereo) destination[first + 1] += sample;
  }
}

float NativeEngineRuntime::renderMetronomeSample() noexcept {
  constexpr double kPi = 3.14159265358979323846;
  if (metronomeFramesUntilBeat_ <= 0.0) {
    const auto sound = metronomeClickSound_.load(std::memory_order_acquire);
    const auto accented = metronomeAccentEnabled_.load(std::memory_order_acquire) &&
                          metronomeBeatIndex_ == 0;
    const float baseFrequency = sound == 2 ? 1900.0f : sound == 3 ? 760.0f : 1350.0f;
    const float duration = sound == 2 ? 0.032f : sound == 3 ? 0.072f : 0.045f;
    metronomeClickFrequency_ = baseFrequency * (accented ? 1.28f : 1.0f);
    metronomeClickAmplitude_ = (accented ? 1.33f : 1.0f) *
        metronomeVolume_.load(std::memory_order_acquire);
    metronomeClickWaveform_ = sound;
    metronomeClickFrame_ = 0;
    metronomeClickLength_ = std::max<std::size_t>(
        1, static_cast<std::size_t>(sampleRate_ * duration));

    const auto bpm = static_cast<double>(
        metronomeBpm_.load(std::memory_order_acquire));
    const auto speed = metronomeDoubleTimeEnabled_.load(std::memory_order_acquire) ? 2.0 : 1.0;
    metronomeFramesUntilBeat_ += sampleRate_ * 60.0 / bpm / speed;
    const auto beatsPerMeasure = static_cast<std::size_t>(
        metronomeNumerator_.load(std::memory_order_acquire)) *
        (speed > 1.0 ? 2u : 1u);
    metronomeBeatIndex_ = (metronomeBeatIndex_ + 1) %
        std::max<std::size_t>(1, beatsPerMeasure);
  }
  metronomeFramesUntilBeat_ -= 1.0;

  if (metronomeClickFrame_ >= metronomeClickLength_) return 0.0f;
  const auto frame = static_cast<double>(metronomeClickFrame_++);
  const auto length = static_cast<double>(metronomeClickLength_);
  const auto time = frame / sampleRate_;
  const auto phase = 2.0 * kPi * static_cast<double>(metronomeClickFrequency_) * time;
  const auto attackFrames = std::max(1.0, sampleRate_ * 0.0015);
  const auto attack = std::min(1.0, frame / attackFrames);
  const auto decay = std::exp(-7.0 * frame / length);
  const auto oscillator = metronomeClickWaveform_ == 2
      ? (std::sin(phase) >= 0.0 ? 1.0 : -1.0)
      : metronomeClickWaveform_ == 3
          ? (2.0 / kPi) * std::asin(std::sin(phase))
          : std::sin(phase);
  return static_cast<float>(oscillator * attack * decay) * metronomeClickAmplitude_;
}

HookKeysEngine::SynthModules NativeEngineRuntime::modulePointers(
    const std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount - 1>& modules,
    AnalogSynthModule* synth) noexcept {
  HookKeysEngine::SynthModules pointers{};
  for (std::size_t index = 0; index < modules.size(); ++index) pointers[index] = modules[index].get();
  pointers[kModuleCount - 1] = synth;
  return pointers;
}

} // namespace hook_keys
