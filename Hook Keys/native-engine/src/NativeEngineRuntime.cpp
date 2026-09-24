#include "hook_keys/NativeEngineRuntime.hpp"
#include "hook_keys/MetronomeClickData.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>

#if defined(_MSC_VER) && (defined(_M_IX86) || defined(_M_X64))
#include <xmmintrin.h>
#endif

namespace hook_keys {

namespace {
constexpr float kMasterLimiterCeiling = 0.97723722096f; // -0.2 dBFS
constexpr float kMasterLimiterReleaseSeconds = 0.08f;
// Os pads contínuos tocam uma única nota por vez. Reservar as mesmas 1024
// vozes dos módulos de timbre aumenta o custo e a memória de trabalho sem
// benefício, especialmente no Android/iOS.
constexpr int kPadMaximumVoices = 128;

void prepareRealtimeFloatingPoint() noexcept {
#if defined(_MSC_VER) && (defined(_M_IX86) || defined(_M_X64))
  // Recursive filters and long releases eventually reach denormal values.
  // Processing those values in hardware can suddenly become hundreds of times
  // slower and cause exactly the chord-dependent ticks heard at small buffers.
  thread_local const bool prepared = [] {
    _mm_setcsr(_mm_getcsr() | 0x8040u); // Flush-to-zero + denormals-are-zero.
    return true;
  }();
  static_cast<void>(prepared);
#elif defined(__i386__) || defined(__x86_64__)
  // Clang's Apple cross-target headers do not always expose _mm_getcsr and
  // _mm_setcsr even on x86_64. Read/write MXCSR directly so Intel macOS keeps
  // the realtime denormal protection without depending on those declarations.
  thread_local const bool prepared = [] {
    unsigned int control = 0;
    __asm__ __volatile__("stmxcsr %0" : "=m"(control));
    control |= 0x8040u;
    __asm__ __volatile__("ldmxcsr %0" : : "m"(control));
    return true;
  }();
  static_cast<void>(prepared);
#endif
}
} // namespace

NativeEngineRuntime::NativeEngineRuntime(double sampleRate, std::size_t maximumBlockFrames)
    : sampleRate_(std::clamp(sampleRate, 8000.0, 384000.0)),
      maximumBlockFrames_(std::clamp<std::size_t>(maximumBlockFrames, 16, 8192)),
      organModule_(std::make_unique<OrganModule>(sampleRate_, maximumBlockFrames_)),
      layerScratch_(maximumBlockFrames_ * 32, 0.0f),
      stereoScratch_(maximumBlockFrames_ * 2, 0.0f),
      padLeftScratch_(maximumBlockFrames_, 0.0f),
      padRightScratch_(maximumBlockFrames_, 0.0f),
      tracks_(std::make_unique<TrackPlayer>(sampleRate_)) {
  const auto prepareClick = [this](const auto& sourceLeft, const auto& sourceRight,
                                   std::uint32_t sourceRate,
                                   std::vector<float>& outputLeft,
                                   std::vector<float>& outputRight) {
    const auto sourceFrames = sourceLeft.size();
    const auto outputFrames = static_cast<std::size_t>(std::ceil(
        static_cast<double>(sourceFrames) * sampleRate_ / static_cast<double>(sourceRate)));
    outputLeft.resize(outputFrames);
    outputRight.resize(outputFrames);
    const auto sourceStep = static_cast<double>(sourceRate) / sampleRate_;
    for (std::size_t frame = 0; frame < outputFrames; ++frame) {
      const auto position = std::min(static_cast<double>(sourceFrames - 1), frame * sourceStep);
      const auto first = static_cast<std::size_t>(position);
      const auto second = std::min(first + 1, sourceFrames - 1);
      const auto fraction = static_cast<float>(position - static_cast<double>(first));
      const auto interpolate = [first, second, fraction](const auto& samples) {
        const auto a = static_cast<float>(samples[first]) / 32768.0f;
        const auto b = static_cast<float>(samples[second]) / 32768.0f;
        return a + (b - a) * fraction;
      };
      outputLeft[frame] = interpolate(sourceLeft);
      outputRight[frame] = interpolate(sourceRight);
    }
  };
  prepareClick(embedded_metronome_click::kClick4Left, embedded_metronome_click::kClick4Right,
      embedded_metronome_click::kClick4SampleRate, metronomeClick4Left_, metronomeClick4Right_);
  prepareClick(embedded_metronome_click::kClick5Left, embedded_metronome_click::kClick5Right,
      embedded_metronome_click::kClick5SampleRate, metronomeClick5Left_, metronomeClick5Right_);
  masterLimiterRelease_ = 1.0f - std::exp(
      -1.0f / (static_cast<float>(sampleRate_) * kMasterLimiterReleaseSeconds));
  layers_.reserve(kMaximumPresetLayers);
  for (auto& pad : padModules_) {
    pad = std::make_unique<TinySoundFontModule>(
        sampleRate_, maximumBlockFrames_, kPadMaximumVoices);
  }
  layers_.push_back(createPresetLayer());
  controlLayer_ = renderLayer_ = layers_.back().get();
}

bool NativeEngineRuntime::loadOrganVoice(std::size_t drawbarIndex, const char* utf8Path) noexcept {
  std::scoped_lock lock(soundFontMutex_);
  return organModule_->loadVoice(drawbarIndex, utf8Path);
}

void NativeEngineRuntime::setOrganDrawbarPosition(std::size_t drawbarIndex, std::uint8_t position) noexcept {
  organModule_->setDrawbarPosition(drawbarIndex, position);
}

bool NativeEngineRuntime::loadPadBank(std::size_t bankIndex, const char* utf8Path) noexcept {
  std::scoped_lock lock(soundFontMutex_);
  if (bankIndex >= padModules_.size() || utf8Path == nullptr || *utf8Path == '\0') return false;
  if (!padModules_[bankIndex]->loadFromFile(utf8Path)) return false;
  // Preserva o desenho original do SF2, mas garante que desligar/trocar um
  // pad contínuo não corte seco. O novo pad já entra enquanto o anterior
  // termina esta cauda curta.
  // Pads contínuos: ao parar ou trocar, a voz anterior desaparece em 5 s
  // enquanto o próximo Pad já entra, produzindo uma transição suave.
  padModules_[bankIndex]->setReleaseOverride(5000.0f);
  return true;
}

bool NativeEngineRuntime::setPadNote(
    std::size_t bankIndex, std::uint8_t note, bool enabled, std::uint8_t velocity) noexcept {
  if (bankIndex >= padModules_.size() || note < 60 || note > 71) return false;
  RuntimeCommand command;
  command.kind = RuntimeCommand::Kind::padNote;
  command.midi.data1 = note;
  command.midi.data2 = enabled ? std::clamp<std::uint8_t>(velocity, 1, 127) : 0;
  command.midi.inputSlot = static_cast<std::uint8_t>(bankIndex);
  return runtimeCommands_.tryPush(command);
}

void NativeEngineRuntime::clearPerformanceMappings() noexcept {
  for (auto& mapping : performanceMappings_) mapping.store(0, std::memory_order_release);
}

void NativeEngineRuntime::setPerformanceMapping(
    std::uint8_t midiNote, std::uint8_t kind, std::uint8_t bankIndex,
    std::uint8_t itemIndex, std::uint8_t mode, float gainDb) noexcept {
  if (midiNote > 127) return;
  if (kind == 0 || kind > 2) {
    performanceMappings_[midiNote].store(0, std::memory_order_release);
    return;
  }
  const auto gainTenths = static_cast<std::uint32_t>(std::lround(
      std::clamp(std::isfinite(gainDb) ? gainDb : 0.0f, -90.0f, 6.0f) * 10.0f) + 900.0f);
  const auto packed = static_cast<std::uint32_t>(kind)
      | (static_cast<std::uint32_t>(bankIndex & 7u) << 2)
      | (static_cast<std::uint32_t>(itemIndex & 15u) << 5)
      | (static_cast<std::uint32_t>(mode & 3u) << 9)
      | (gainTenths << 11);
  performanceMappings_[midiNote].store(packed, std::memory_order_release);
}

bool NativeEngineRuntime::loadEffectSample(
    std::size_t sampleIndex, const float* stereoInterleaved,
    std::size_t frames, double sourceSampleRate) noexcept {
  if (sampleIndex >= effectSamples_.size() || stereoInterleaved == nullptr ||
      frames == 0 || !std::isfinite(sourceSampleRate) || sourceSampleRate <= 0.0) return false;
  try {
    auto sample = std::make_unique<EffectSample>();
    const auto outputFrames = std::max<std::size_t>(1, static_cast<std::size_t>(std::llround(
        static_cast<double>(frames) * sampleRate_ / sourceSampleRate)));
    sample->stereo.resize(outputFrames * 2);
    const auto step = sourceSampleRate / sampleRate_;
    for (std::size_t frame = 0; frame < outputFrames; ++frame) {
      const auto position = std::min(static_cast<double>(frames - 1), frame * step);
      const auto first = static_cast<std::size_t>(position);
      const auto second = std::min(first + 1, frames - 1);
      const auto fraction = static_cast<float>(position - static_cast<double>(first));
      for (std::size_t channel = 0; channel < 2; ++channel) {
        const auto a = stereoInterleaved[first * 2 + channel];
        const auto b = stereoInterleaved[second * 2 + channel];
        sample->stereo[frame * 2 + channel] = std::isfinite(a) && std::isfinite(b)
            ? a + (b - a) * fraction : 0.0f;
      }
    }
    auto* published = sample.get();
    std::scoped_lock lock(effectSampleMutex_);
    effectSampleOwners_.push_back(std::move(sample));
    effectSamples_[sampleIndex].store(published, std::memory_order_release);
    return true;
  } catch (...) {
    return false;
  }
}

void NativeEngineRuntime::clearEffectSample(std::size_t sampleIndex) noexcept {
  if (sampleIndex < effectSamples_.size()) {
    effectSamples_[sampleIndex].store(nullptr, std::memory_order_release);
    (void)triggerEffectSample(sampleIndex, false);
  }
}

bool NativeEngineRuntime::triggerEffectSample(
    std::size_t sampleIndex, bool enabled, float gainDb) noexcept {
  if (sampleIndex >= effectSamples_.size()) return false;
  RuntimeCommand command;
  command.kind = RuntimeCommand::Kind::effect;
  command.midi.data1 = static_cast<std::uint8_t>(sampleIndex);
  command.midi.data2 = enabled ? 127 : 0;
  command.value = std::clamp(std::isfinite(gainDb) ? gainDb : 0.0f, -90.0f, 6.0f);
  return runtimeCommands_.tryPush(command);
}

void NativeEngineRuntime::setEffectOutput(
    float db, bool enabled, std::uint8_t channelStart, std::uint8_t channelCount) noexcept {
  effectOutputRoute_.store(static_cast<std::uint16_t>(
      static_cast<std::uint16_t>(std::min<std::uint8_t>(channelStart, 31))
      | (static_cast<std::uint16_t>(channelCount == 1 ? 1 : 2) << 8)), std::memory_order_release);
  effectGainLinear_.store(enabled && db > -90.0f
      ? std::pow(10.0f, std::clamp(db, -90.0f, 0.0f) / 20.0f) : 0.0f,
      std::memory_order_release);
}

void NativeEngineRuntime::setPadOutput(
    float db, bool enabled, std::uint8_t channelStart, std::uint8_t channelCount,
    float lowCutHz, float highCutHz) noexcept {
  const auto route = static_cast<std::uint16_t>(
      static_cast<std::uint16_t>(std::min<std::uint8_t>(channelStart, 31))
      | (static_cast<std::uint16_t>(channelCount == 1 ? 1 : 2) << 8));
  if (padOutputRoute_.exchange(route, std::memory_order_acq_rel) != route) {
    for (auto& peak : padPeaks_) peak.store(0.0f, std::memory_order_relaxed);
  }
  padGainLinear_.store(
      enabled && db > -90.0f ? std::pow(10.0f, std::clamp(db, -90.0f, 0.0f) / 20.0f) : 0.0f,
      std::memory_order_release);
  padLowCutHz_.store(std::clamp(lowCutHz, 20.0f, 20000.0f), std::memory_order_release);
  padHighCutHz_.store(std::clamp(highCutHz, 20.0f, 20000.0f), std::memory_order_release);
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

bool NativeEngineRuntime::beginPresetTransition(bool preserveConfig) noexcept {
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
    if (preserveConfig) {
      next->configs = controlLayer_->configs;
      next->synthConfig = controlLayer_->synthConfig;
      if (!next->synth->setConfig(next->synthConfig)) return false;
      for (std::size_t index = 0; index < kModuleCount; ++index) {
        if (!next->engine->setModuleConfig(index, next->configs[index])) return false;
      }
    }
    previousSoundFontPaths_ = currentSoundFontPaths_;
    layers_.push_back(std::move(layer));
    previousControlLayer_ = controlLayer_;
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
  previousControlLayer_ = nullptr;
  return true;
}

void NativeEngineRuntime::cancelPresetTransition() noexcept {
  std::scoped_lock lock(configMutex_, soundFontMutex_);
  if (pendingTransitionLayer_ == nullptr) return;
  // A pending layer has never been published to the audio callback.
  const auto* discarded = pendingTransitionLayer_;
  controlLayer_ = previousControlLayer_;
  currentSoundFontPaths_.swap(previousSoundFontPaths_);
  pendingTransitionLayer_ = previousControlLayer_ = nullptr;
  layers_.erase(std::remove_if(layers_.begin(), layers_.end(),
      [discarded](const auto& layer) { return layer.get() == discarded; }), layers_.end());
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
        enqueueCurrentExpression(layer);
      }
      return copied;
    }
  }
  if (!layer->modules[moduleIndex]->loadFromFile(utf8Path)) return false;
  currentSoundFontPaths_[moduleIndex] = path;
  retainSoundFontLocked(path, *layer->modules[moduleIndex]);
  enqueueCurrentExpression(layer);
  return true;
}

bool NativeEngineRuntime::cloneSoundFont(
    std::size_t sourceModuleIndex, std::size_t targetModuleIndex) noexcept {
  std::scoped_lock lock(configMutex_, soundFontMutex_);
  const auto copied = sourceModuleIndex < controlLayer_->modules.size() && targetModuleIndex < controlLayer_->modules.size() &&
      sourceModuleIndex != targetModuleIndex &&
      controlLayer_->modules[targetModuleIndex]->copySoundFontFrom(*controlLayer_->modules[sourceModuleIndex]);
  if (copied) {
    currentSoundFontPaths_[targetModuleIndex] = currentSoundFontPaths_[sourceModuleIndex];
    enqueueCurrentExpression(controlLayer_);
  }
  return copied;
}

void NativeEngineRuntime::enqueueCurrentExpression(PresetLayer* layer) noexcept {
  if (layer == nullptr) return;
  for (std::size_t slot = 0; slot < currentExpression_.size(); ++slot) {
    const auto input = static_cast<std::uint8_t>(slot);
    const auto modulation = currentExpression_[slot].modulation.load(std::memory_order_acquire);
    const auto pitch = currentExpression_[slot].pitch.load(std::memory_order_acquire);
    for (std::uint8_t channel = 0; channel < 16; ++channel) {
      const auto sustain = currentExpression_[slot].sustain[channel].load(std::memory_order_acquire);
      if (sustain >= 0) (void)layer->engine->enqueueMidi(
          {static_cast<std::uint8_t>(0xb0 | channel), 64, static_cast<std::uint8_t>(sustain), input, 0});
    }
    if (modulation >= 0) (void)layer->engine->enqueueMidi(
        {0xb0, 1, static_cast<std::uint8_t>(modulation), input, 0});
    if (pitch >= 0) (void)layer->engine->enqueueMidi(
        {0xe0, static_cast<std::uint8_t>(pitch & 127), static_cast<std::uint8_t>(pitch >> 7), input, 0});
  }
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
  const auto messageType = status & 0xf0;
  // Canal 10 pertence exclusivamente a Pads/FX. A decisão é feita aqui, na
  // thread MIDI nativa; a WebView recebe depois apenas a cópia para desenhar.
  if ((status & 0x0f) == 9 && (messageType == 0x80 || messageType == 0x90)) {
    if (data1 > 127 || data2 > 127) return false;
    const auto mapping = performanceMappings_[data1].load(std::memory_order_acquire);
    if (mapping == 0) return true;
    RuntimeCommand command;
    command.kind = RuntimeCommand::Kind::performance;
    command.midi = {status, data1, data2, inputSlot, timestampNanoseconds};
    command.packed = mapping;
    return runtimeCommands_.tryPush(command);
  }
  const bool blockedCompatibilityMessage = compatibilityMode_.load(std::memory_order_acquire) && (
      messageType == 0xc0 ||
      (messageType == 0xb0 &&
       (data1 == 0 || data1 == 6 || data1 == 7 || data1 == 10 || data1 == 16 ||
        data1 == 32 || data1 == 91 || data1 == 100 || data1 == 101)));
  if (blockedCompatibilityMessage) return true;
  if (inputSlot >= kRoutableMidiInputCount || data1 > 127 || data2 > 127) return false;
  if (messageType == 0xb0 && data1 == 64) {
    currentExpression_[inputSlot].sustain[status & 15].store(data2, std::memory_order_release);
  } else if (messageType == 0xb0 && data1 == 1) {
    currentExpression_[inputSlot].modulation.store(data2, std::memory_order_release);
  } else if (messageType == 0xe0) {
    currentExpression_[inputSlot].pitch.store(data1 | (data2 << 7), std::memory_order_release);
  }
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
  config.nativeArpeggiator = controlLayer_->configs[moduleIndex].nativeArpeggiator;
  config.velocityIgnoreAbove = controlLayer_->configs[moduleIndex].velocityIgnoreAbove;
  config.velocityCeiling = controlLayer_->configs[moduleIndex].velocityCeiling;
  if (moduleIndex == 6) {
    config.noVelocitySensitivity = true;
    config.velocityIgnoreAbove = 127;
    config.velocityCeiling = 127;
  }
  config.normalize();
  controlLayer_->configs[moduleIndex] = config;
  return controlLayer_->engine->setPreparedModuleConfig(moduleIndex, config);
}

bool NativeEngineRuntime::setModuleGainDb(std::size_t moduleIndex, float db) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  const float safeDb = std::isfinite(db) ? std::clamp(db, -90.0f, 0.0f) : 0.0f;
  controlLayer_->configs[moduleIndex].gainLinear = safeDb <= -90.0f
      ? 0.0f : std::pow(10.0f, safeDb / 20.0f);
  return controlLayer_->engine->setPreparedModuleConfig(moduleIndex, controlLayer_->configs[moduleIndex]);
}

bool NativeEngineRuntime::setTranceGate(std::size_t moduleIndex, ModuleEffectsConfig::TranceGateConfig config) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  for (float value : {config.beatMultiplier, config.measureBeats, config.gate,
      config.depth, config.attackMs, config.releaseMs, config.swing}) {
    if (!std::isfinite(value)) return false;
  }
  std::scoped_lock lock(configMutex_);
  config.normalize();
  auto next = controlLayer_->configs[moduleIndex];
  next.effects.tranceGate = config;
  if (!controlLayer_->engine->setPreparedModuleConfig(moduleIndex, next)) return false;
  controlLayer_->configs[moduleIndex] = next;
  return true;
}

bool NativeEngineRuntime::setModuleEffects(
    std::size_t moduleIndex, ModuleEffectsConfig effects) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  effects.normalize();
  if (moduleIndex == 6) {
    effects.cutoff.enabled = false;
    effects.loFi.enabled = false;
  }
  effects.tranceGate = controlLayer_->configs[moduleIndex].effects.tranceGate;
  controlLayer_->configs[moduleIndex].effects = effects;
  return controlLayer_->engine->setModuleConfig(moduleIndex, controlLayer_->configs[moduleIndex]);
}

bool NativeEngineRuntime::setModulePerformance(std::size_t moduleIndex, ModuleConfig config) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  const auto& previous = controlLayer_->configs[moduleIndex];
  config.effects = previous.effects;
  config.nativeArpeggiator = previous.nativeArpeggiator;
  config.enabled = previous.enabled;
  config.gainLinear = previous.gainLinear;
  if (moduleIndex == 6) {
    config.noVelocitySensitivity = true;
    config.velocityIgnoreAbove = 127; config.velocityCeiling = 127;
    config.mono = false; config.legato = false;
  }
  config.normalize();
  if (!controlLayer_->engine->setPreparedModuleConfig(moduleIndex, config)) return false;
  controlLayer_->configs[moduleIndex] = config;
  return true;
}

bool NativeEngineRuntime::setNativeArpeggiator(std::size_t moduleIndex, NativeArpeggiatorConfig config) noexcept {
  if (moduleIndex >= kModuleCount || (moduleIndex == 6 && config.enabled) || !config.valid()) return false;
  std::scoped_lock lock(configMutex_);
  auto next = controlLayer_->configs[moduleIndex];
  next.nativeArpeggiator = config;
  next.effects.autoFader = {config.enabled && config.autoFaderEnabled, config.autoFaderBeats, config.autoFaderDepthDb};
  if (!controlLayer_->engine->setPreparedModuleConfig(moduleIndex, next)) return false;
  controlLayer_->configs[moduleIndex] = next;
  return true;
}

bool NativeEngineRuntime::setModuleEqualizer(std::size_t moduleIndex, EqConfig equalizer) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  for (const auto& band : equalizer.bands) {
    if (!std::isfinite(band.frequencyHz) || !std::isfinite(band.gainDb) ||
        !std::isfinite(band.quality) || static_cast<unsigned>(band.type) > 4) return false;
  }
  equalizer.normalize();
  std::scoped_lock lock(configMutex_);
  auto next = controlLayer_->configs[moduleIndex];
  // A band edit must not reconstruct/reset Rotary, Reverb, Pulse or routing.
  next.effects.equalizer = equalizer;
  if (!controlLayer_->engine->setPreparedModuleConfig(moduleIndex, next)) return false;
  controlLayer_->configs[moduleIndex] = next;
  return true;
}

bool NativeEngineRuntime::setModuleTone(std::size_t moduleIndex, CutoffConfig cutoff, float inputGainDb) noexcept {
  if (moduleIndex >= kModuleCount || (moduleIndex == 6 && cutoff.enabled) ||
      static_cast<unsigned>(cutoff.type) > 3 || !std::isfinite(inputGainDb)) return false;
  for (const auto value : {cutoff.frequencyHz, cutoff.envelope.attackMs, cutoff.envelope.decayMs,
      cutoff.envelope.sustain, cutoff.envelope.releaseMs, cutoff.envelope.depthOctaves}) {
    if (!std::isfinite(value)) return false;
  }
  cutoff.normalize();
  std::scoped_lock lock(configMutex_);
  auto next = controlLayer_->configs[moduleIndex];
  next.effects.cutoff = cutoff;
  next.effects.inputGainDb = std::clamp(inputGainDb, -36.0f, 12.0f);
  if (!controlLayer_->engine->setPreparedModuleConfig(moduleIndex, next)) return false;
  controlLayer_->configs[moduleIndex] = next;
  return true;
}

bool NativeEngineRuntime::setModuleEnabledMask(std::uint8_t mask) noexcept {
  std::scoped_lock lock(configMutex_);
  if (!controlLayer_->engine->setModuleEnabledMask(mask)) return false;
  for (std::size_t index = 0; index < kModuleCount; ++index) {
    controlLayer_->configs[index].enabled = (mask & (1u << index)) != 0;
  }
  return true;
}

bool NativeEngineRuntime::setModuleReverb(std::size_t moduleIndex, bool enabled,
    std::uint8_t impulse, float mix, float tail) noexcept {
  if (moduleIndex >= kModuleCount || impulse > 3 || !std::isfinite(mix) || !std::isfinite(tail)) return false;
  tail = std::clamp(tail, 0.1f, 1.0f);
  // Pin the layer on the control thread, but release configMutex_ while the
  // FFT/IR is built. Faders, EQ and meters need not wait for that preparation.
  std::scoped_lock soundLock(soundFontMutex_);
  PresetLayer* layer;
  { std::scoped_lock configLock(configMutex_); layer = controlLayer_; }
  if (enabled && !layer->engine->prepareModuleReverb(moduleIndex, impulse, tail)) return false;
  ReverbConfig previous;
  {
    std::scoped_lock configLock(configMutex_);
    auto next = layer->configs[moduleIndex];
    previous = next.effects.reverb;
    next.effects.reverb.enabled = enabled;
    next.effects.reverb.impulse = impulse;
    next.effects.reverb.mix = std::clamp(mix, 0.0f, 1.0f);
    next.effects.reverb.tail = tail;
    if (layer->engine->setPreparedModuleConfig(moduleIndex, next)) {
      layer->configs[moduleIndex] = next;
      return true;
    }
  }
  // A full command queue must not leave only the rejected IR in the cache.
  // Restore the accepted version on this worker, outside the UI config lock.
  if (previous.enabled) (void)layer->engine->prepareModuleReverb(moduleIndex, previous.impulse, previous.tail);
  return false;
}

bool NativeEngineRuntime::setModuleDelay(std::size_t moduleIndex, DelayConfig delay) noexcept {
  if (moduleIndex >= kModuleCount || !std::isfinite(delay.delayMs) ||
      !std::isfinite(delay.beatMultiplier) || !std::isfinite(delay.feedback) ||
      !std::isfinite(delay.mix)) return false;
  delay.normalize();
  // Allocate on the control worker, without holding the UI configuration lock.
  std::scoped_lock soundLock(soundFontMutex_);
  PresetLayer* layer;
  { std::scoped_lock configLock(configMutex_); layer = controlLayer_; }
  if (delay.enabled && !layer->engine->prepareModuleDelay(moduleIndex)) return false;
  std::scoped_lock configLock(configMutex_);
  auto next = layer->configs[moduleIndex];
  next.effects.delay = delay;
  if (!layer->engine->setPreparedModuleConfig(moduleIndex, next)) return false;
  layer->configs[moduleIndex] = next;
  return true;
}

bool NativeEngineRuntime::setModuleSoundEffects(std::size_t moduleIndex,
    CompressorConfig compressor, ChorusConfig chorus, LoFiConfig vibes) noexcept {
  if (moduleIndex >= kModuleCount || (moduleIndex == 6 && (compressor.enabled || vibes.enabled))) return false;
  for (float value : {compressor.thresholdDb, compressor.ratio, compressor.attackMs,
      compressor.releaseMs, compressor.outputGainDb, compressor.mix, chorus.rateHz,
      chorus.depth, chorus.mix, vibes.rateHz, vibes.amountSemitones, vibes.noiseGainDb}) {
    if (!std::isfinite(value)) return false;
  }
  compressor.normalize();
  chorus.normalize();
  vibes.normalize();
  std::scoped_lock lock(configMutex_);
  auto next = controlLayer_->configs[moduleIndex];
  next.effects.compressor = compressor;
  next.effects.chorus = chorus;
  next.effects.loFi = vibes;
  // These processors are prepared at engine creation. No IR rebuilding,
  // delay allocation, or overwrite of Rotary/EQ/Pulse while dragging a knob.
  if (!controlLayer_->engine->setPreparedModuleConfig(moduleIndex, next)) return false;
  controlLayer_->configs[moduleIndex] = next;
  return true;
}

bool NativeEngineRuntime::setOrganRotaryFast(bool fast) noexcept {
  std::scoped_lock lock(configMutex_);
  auto &config = controlLayer_->configs[6];
  config.effects.rotary.enabled = true;
  config.effects.rotary.speed = fast ? 2 : 1;
  return controlLayer_->engine->setPreparedModuleConfig(6, config);
}

bool NativeEngineRuntime::setOrganCabinetEnabled(bool enabled) noexcept {
  std::scoped_lock lock(configMutex_);
  auto &config = controlLayer_->configs[6];
  config.effects.rotary.cabinetEnabled = enabled;
  return controlLayer_->engine->setPreparedModuleConfig(6, config);
}

bool NativeEngineRuntime::setModuleEnvelope(
    std::size_t moduleIndex, float attackMs, float holdMs,
    float decayMs, float releaseMs, float glideMs, float sustainDb) noexcept {
  std::scoped_lock lock(configMutex_);
  if (moduleIndex == 7) {
    auto config = controlLayer_->synthConfig;
    config.attackMs = attackMs;
    config.holdMs = holdMs;
    config.decayMs = decayMs;
    config.releaseMs = releaseMs;
    config.normalize(sampleRate_);
    if (!controlLayer_->synth->setConfig(config)) return false;
    controlLayer_->synthConfig = config;
    return true;
  }
  if (moduleIndex >= controlLayer_->modules.size()) return false;
  // Estes sao os valores que a interface usa para representar o estado
  // inicial. No estado inicial, qualquer modulo SF2 deve respeitar a
  // envoltoria gravada no proprio arquivo. O override do app so entra quando
  // o usuario realmente altera um dos controles.
  constexpr float epsilon = 0.001f;
  const auto near = [](float left, float right) noexcept {
    return std::abs(left - right) <= epsilon;
  };
  const bool usesFactoryEnvelope = near(attackMs, 0.0f) && near(holdMs, 15000.0f)
      && near(decayMs, 25000.0f) && near(releaseMs, 300.0f)
      && near(sustainDb, 0.0f);
  if (moduleIndex == 6) {
    if (usesFactoryEnvelope) {
      organModule_->useEmbeddedVolumeEnvelope();
    } else {
      organModule_->setVolumeEnvelope(attackMs, holdMs, decayMs, releaseMs, sustainDb);
    }
    return true;
  }
  if (usesFactoryEnvelope) {
    controlLayer_->modules[moduleIndex]->useEmbeddedVolumeEnvelope();
  } else {
    controlLayer_->modules[moduleIndex]->setVolumeEnvelope(
        attackMs, holdMs, decayMs, releaseMs, sustainDb);
  }
  controlLayer_->modules[moduleIndex]->setGlide(std::isfinite(glideMs) ? std::clamp(glideMs, 0.0f, 5000.0f) : 0.0f);
  return true;
}

bool NativeEngineRuntime::setSynthConfig(AnalogSynthConfig config) noexcept {
  std::scoped_lock lock(configMutex_);
  config.normalize(sampleRate_);
  if (!controlLayer_->synth->setConfig(config)) return false;
  controlLayer_->synthConfig = config;
  return true;
}

bool NativeEngineRuntime::setModuleModulationMode(
    std::size_t moduleIndex, std::uint8_t mode, float rateHz, float intensity) noexcept {
  std::scoped_lock lock(configMutex_);
  if (moduleIndex == kModuleCount - 1) {
    controlLayer_->synth->setModulationMode(mode, rateHz);
    return true;
  }
  if (moduleIndex == 6) {
    organModule_->setModulationMode(mode, rateHz, intensity);
    return true;
  }
  if (moduleIndex >= controlLayer_->modules.size()) return false;
  controlLayer_->modules[moduleIndex]->setModulationMode(mode, rateHz, intensity);
  return true;
}

bool NativeEngineRuntime::setGlideBehavior(std::size_t moduleIndex, GlideBehavior behavior) noexcept {
  std::scoped_lock lock(configMutex_);
  behavior.velocityThreshold = std::min<std::uint8_t>(behavior.velocityThreshold, 127);
  if (moduleIndex == kModuleCount - 1) {
    controlLayer_->synth->setGlideBehavior(behavior);
    return true;
  }
  if (moduleIndex == 6) {
    organModule_->setGlideBehavior({});
    return true;
  }
  if (moduleIndex >= controlLayer_->modules.size()) return false;
  controlLayer_->modules[moduleIndex]->setGlideBehavior(behavior);
  return true;
}

bool NativeEngineRuntime::setVelocityLimits(
    std::size_t moduleIndex, std::uint8_t ignoreAbove, std::uint8_t ceiling,
    std::uint8_t oscillator1Limit, std::uint8_t oscillator2Limit,
    std::uint8_t oscillator3Limit) noexcept {
  if (moduleIndex >= kModuleCount) return false;
  std::scoped_lock lock(configMutex_);
  if (moduleIndex == kModuleCount - 1) {
    controlLayer_->synth->setOscillatorVelocityLimits(oscillator1Limit, oscillator2Limit, oscillator3Limit);
  }
  auto& config = controlLayer_->configs[moduleIndex];
  config.velocityIgnoreAbove = moduleIndex == 6 ? 127 : ignoreAbove;
  config.velocityCeiling = moduleIndex == 6 ? 127 : ceiling;
  config.normalize();
  return controlLayer_->engine->setPreparedModuleConfig(moduleIndex, config);
}

bool NativeEngineRuntime::setTempo(float bpm) noexcept {
  std::scoped_lock lock(configMutex_);
  return controlLayer_->engine->setTempoBpm(bpm);
}

bool NativeEngineRuntime::setGlobalTranspose(int semitones) noexcept {
  std::scoped_lock lock(configMutex_);
  return controlLayer_->engine->setGlobalTranspose(semitones);
}

void NativeEngineRuntime::setMetronome(
    bool enabled, float bpm, float volume, std::uint8_t clickSound,
    bool accentEnabled, bool doubleTimeEnabled,
    std::uint8_t timeSignatureNumerator, std::uint8_t timeSignatureDenominator,
    bool restart) noexcept {
  metronomeBpm_.store(std::clamp(bpm, 60.0f, 300.0f), std::memory_order_release);
  metronomeVolume_.store(std::clamp(volume, 0.0f, 1.0f), std::memory_order_release);
  metronomeClickSound_.store(
      static_cast<std::uint8_t>(std::clamp<int>(clickSound, 1, 5)),
      std::memory_order_release);
  metronomeAccentEnabled_.store(accentEnabled, std::memory_order_release);
  metronomeDoubleTimeEnabled_.store(doubleTimeEnabled, std::memory_order_release);
  metronomeNumerator_.store(
      static_cast<std::uint8_t>(std::clamp<int>(timeSignatureNumerator, 1, 16)),
      std::memory_order_release);
  const auto denominator = timeSignatureDenominator == 2 || timeSignatureDenominator == 8 ||
      timeSignatureDenominator == 16 ? timeSignatureDenominator : 4;
  metronomeDenominator_.store(static_cast<std::uint8_t>(denominator), std::memory_order_release);
  if (restart) metronomeResetRequested_.store(true, std::memory_order_release);
  metronomeEnabled_.store(enabled, std::memory_order_release);
}

void NativeEngineRuntime::setOutputGainDb(
    float db, bool enabled, std::uint8_t channelStart, std::uint8_t channelCount) noexcept {
  const auto route = static_cast<std::uint16_t>(
      static_cast<std::uint16_t>(std::min<std::uint8_t>(channelStart, 31))
      | (static_cast<std::uint16_t>(channelCount == 1 ? 1 : 2) << 8));
  if (masterOutputRoute_.exchange(route, std::memory_order_acq_rel) != route) {
    for (auto& peak : masterPeaks_) peak.store(0.0f, std::memory_order_relaxed);
  }
  outputGainLinear_.store(
      enabled && db > -90.0f ? std::pow(10.0f, std::clamp(db, -90.0f, 0.0f) / 20.0f) : 0.0f,
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
      if (renderLayer_ != nullptr) {
        // O Organ é uma instância compartilhada entre as camadas. Renderizá-lo
        // na camada antiga e na nova avançava as mesmas nove vozes duas vezes
        // por callback, dobrando o custo e produzindo som picotado na troca.
        renderLayer_->engine->excludeSharedModuleFromTail(6);
        tailLayers_[tailLayerCount_++] = renderLayer_;
      }
      renderLayer_ = command.layer;
      // A physically held pedal/wheel also applies to NEW notes, without
      // copying voices or synth parameters from the previous preset.
      for (std::size_t slot = 0; slot < liveExpression_.size(); ++slot) {
        const auto& expression = liveExpression_[slot];
        const auto input = static_cast<std::uint8_t>(slot);
        for (std::uint8_t channel = 0; channel < 16; ++channel) {
          if (expression.sustain[channel] >= 0) (void)renderLayer_->engine->enqueueMidi(
              {static_cast<std::uint8_t>(0xb0 | channel), 64, static_cast<std::uint8_t>(expression.sustain[channel]), input, 0});
        }
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
      for (auto& pad : padModules_) pad->allNotesOff();
      activePadBank_ = -1;
      activePadNote_ = -1;
      for (auto& voice : effectVoices_) voice.releasing = true;
      effectToggleActive_.fill(false);
    } else if (command.kind == RuntimeCommand::Kind::padNote) {
      auto& pad = padModules_[std::min<std::size_t>(command.midi.inputSlot, padModules_.size() - 1)];
      if (command.midi.data2 == 0) {
        pad->noteOff(command.midi.data1);
        if (activePadBank_ == command.midi.inputSlot && activePadNote_ == command.midi.data1) {
          activePadBank_ = activePadNote_ = -1;
        }
      } else {
        pad->noteOn(command.midi.data1, command.midi.data2);
        activePadBank_ = command.midi.inputSlot;
        activePadNote_ = command.midi.data1;
      }
    } else if (command.kind == RuntimeCommand::Kind::effect) {
      const auto sampleIndex = command.midi.data1;
      if (command.midi.data2 == 0) releaseEffectVoices(sampleIndex);
      else startEffectVoice(sampleIndex, std::pow(10.0f, command.value / 20.0f));
    } else if (command.kind == RuntimeCommand::Kind::performance) {
      const auto kind = static_cast<std::uint8_t>(command.packed & 3u);
      const auto bank = static_cast<std::uint8_t>((command.packed >> 2) & 7u);
      const auto item = static_cast<std::uint8_t>((command.packed >> 5) & 15u);
      const auto mode = static_cast<std::uint8_t>((command.packed >> 9) & 3u);
      const auto gainDb = (static_cast<int>((command.packed >> 11) & 1023u) - 900) / 10.0f;
      const auto type = command.midi.status & 0xf0;
      const bool pressed = type == 0x90 && command.midi.data2 > 0;
      if (kind == 1 && bank < padModules_.size() && item < 12 && pressed) {
        const auto note = static_cast<std::uint8_t>(60 + item);
        if (activePadBank_ >= 0 && activePadNote_ >= 0) {
          padModules_[static_cast<std::size_t>(activePadBank_)]->noteOff(
              static_cast<std::uint8_t>(activePadNote_));
          if (activePadBank_ == bank && activePadNote_ == note) {
            activePadBank_ = activePadNote_ = -1;
            continue;
          }
        }
        padModules_[bank]->noteOn(note, std::max<std::uint8_t>(1, command.midi.data2));
        activePadBank_ = bank;
        activePadNote_ = note;
      } else if (kind == 2 && bank < 8 && item < 12) {
        const auto sampleIndex = static_cast<std::uint8_t>(bank * 12 + item);
        if (pressed) {
          if (mode == 1 && effectToggleActive_[sampleIndex]) {
            releaseEffectVoices(sampleIndex);
            effectToggleActive_[sampleIndex] = false;
          } else {
            startEffectVoice(sampleIndex, std::pow(10.0f, gainDb / 20.0f));
            effectToggleActive_[sampleIndex] = mode == 1 || mode == 2;
          }
        } else if (mode == 2) {
          releaseEffectVoices(sampleIndex);
          effectToggleActive_[sampleIndex] = false;
        }
      }
    } else {
      (void)renderLayer_->engine->enqueueMidi(command.midi);
      const auto type = command.midi.status & 0xf0;
      auto& expression = liveExpression_[command.midi.inputSlot];
      if (type == 0xb0 && command.midi.data1 == 64) expression.sustain[command.midi.status & 15] = command.midi.data2;
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
    // Cada valor já é o maior pico de todo o intervalo desde a leitura
    // anterior. Somar picos que podem ter ocorrido em instantes diferentes
    // nas caudas de presets antigos inventava um nível que nunca existiu.
    // O maior pico entre as camadas mantém a cauda visível sem esse exagero.
    for (std::size_t index = 0; index < result.size(); ++index) {
      result[index] = std::max(result[index], peaks[index]);
    }
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

std::array<float, 2> NativeEngineRuntime::consumeMasterPeaks() noexcept {
  return {
      masterPeaks_[0].exchange(0.0f, std::memory_order_acq_rel),
      masterPeaks_[1].exchange(0.0f, std::memory_order_acq_rel),
  };
}

std::array<float, 2> NativeEngineRuntime::consumeMetronomePeaks() noexcept {
  return {
      metronomePeaks_[0].exchange(0.0f, std::memory_order_acq_rel),
      metronomePeaks_[1].exchange(0.0f, std::memory_order_acq_rel),
  };
}

std::array<float, 2> NativeEngineRuntime::consumePadPeaks() noexcept {
  for (auto& pad : padModules_) pad->collectRetiredSoundFonts();
  return {
      padPeaks_[0].exchange(0.0f, std::memory_order_acq_rel),
      padPeaks_[1].exchange(0.0f, std::memory_order_acq_rel),
  };
}

std::array<float, 2> NativeEngineRuntime::consumeEffectPeaks() noexcept {
  return {
      effectPeaks_[0].exchange(0.0f, std::memory_order_acq_rel),
      effectPeaks_[1].exchange(0.0f, std::memory_order_acq_rel),
  };
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
  for (auto& pad : padModules_) pad->beginBlock();
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
  const auto masterRoute = masterOutputRoute_.load(std::memory_order_acquire);
  if (masterRoute != masterOutputRouteSeen_) {
    masterOutputRouteSeen_ = masterRoute;
    masterLimiterGain_ = 1.0f;
  }
  std::array<float, 2> masterBlockPeaks{};
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto gain = nextOutputGain();
    for (std::size_t channel = 0; channel < channels; ++channel) {
      output[frame * channels + channel] *= gain;
    }
    applyMasterLimiter(output + frame * channels, channels);
    for (std::size_t channel = 0; channel < channels; ++channel) {
      const auto side = channel & 1u;
      masterBlockPeaks[side] = std::max(masterBlockPeaks[side],
          std::abs(output[frame * channels + channel]));
    }
  }
  for (std::size_t channel = 0; channel < masterBlockPeaks.size(); ++channel) {
    auto previous = masterPeaks_[channel].load(std::memory_order_relaxed);
    while (masterBlockPeaks[channel] > previous && !masterPeaks_[channel].compare_exchange_weak(
        previous, masterBlockPeaks[channel], std::memory_order_release, std::memory_order_relaxed)) {}
  }
  // Pads, FX, Click e Playlist têm volumes/rotas próprios; não passam por Módulos.
  addPadsInterleaved(output, frames, channels);
  addEffectsInterleaved(output, frames, channels);
  // O Play do loop e o primeiro tempo do Click são consumidos pelo mesmo
  // callback de áudio. Assim não existe diferença variável entre duas calls
  // vindas do JavaScript/Capacitor.
  if (tracks_->consumeMetronomeSyncStart()) {
    metronomeResetRequested_.store(true, std::memory_order_release);
  }
  addMetronomeInterleaved(output, frames, channels);
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

float NativeEngineRuntime::nextPadGain() noexcept {
  const auto target = padGainLinear_.load(std::memory_order_acquire);
  if (target != padGainTargetSeen_) {
    padGainTargetSeen_ = target;
    padGainRampFrames_ = std::max<std::size_t>(
        1, static_cast<std::size_t>(sampleRate_ * 0.005));
    padGainStep_ = (target - currentPadGain_) / static_cast<float>(padGainRampFrames_);
  }
  if (padGainRampFrames_ > 0) {
    currentPadGain_ += padGainStep_;
    if (--padGainRampFrames_ == 0) currentPadGain_ = padGainTargetSeen_;
  }
  return currentPadGain_;
}

float NativeEngineRuntime::nextEffectGain() noexcept {
  const auto target = effectGainLinear_.load(std::memory_order_acquire);
  if (target != effectGainTargetSeen_) {
    effectGainTargetSeen_ = target;
    effectGainRampFrames_ = std::max<std::size_t>(
        1, static_cast<std::size_t>(sampleRate_ * 0.005));
    effectGainStep_ = (target - currentEffectGain_) / static_cast<float>(effectGainRampFrames_);
  }
  if (effectGainRampFrames_ > 0) {
    currentEffectGain_ += effectGainStep_;
    if (--effectGainRampFrames_ == 0) currentEffectGain_ = effectGainTargetSeen_;
  }
  return currentEffectGain_;
}

void NativeEngineRuntime::startEffectVoice(std::uint8_t sampleIndex, float gain) noexcept {
  if (sampleIndex >= effectSamples_.size()) return;
  const auto* sample = effectSamples_[sampleIndex].load(std::memory_order_acquire);
  if (sample == nullptr || sample->stereo.empty()) return;
  auto* selected = &effectVoices_[0];
  for (auto& voice : effectVoices_) {
    if (voice.sample == nullptr) { selected = &voice; break; }
    if (voice.serial < selected->serial) selected = &voice;
  }
  *selected = {sample, 0, std::clamp(gain, 0.0f, 2.0f), 1.0f, false,
      sampleIndex, ++effectVoiceSerial_};
}

void NativeEngineRuntime::releaseEffectVoices(std::uint8_t sampleIndex) noexcept {
  for (auto& voice : effectVoices_) {
    if (voice.sample != nullptr && voice.sampleIndex == sampleIndex) voice.releasing = true;
  }
}

void NativeEngineRuntime::addEffectsInterleaved(
    float* output, std::size_t frames, std::size_t channels) noexcept {
  if (output == nullptr || frames == 0 || channels == 0) return;
  const auto route = effectOutputRoute_.load(std::memory_order_acquire);
  const auto requested = static_cast<std::size_t>(route & 0xffu);
  const auto first = requested < channels ? requested : 0;
  const bool stereo = ((route >> 8) & 0xffu) == 2 && first + 1 < channels;
  const auto releaseStep = 1.0f / static_cast<float>(std::max(1.0, sampleRate_ * 0.012));
  std::array<float, 2> peaks{};
  for (std::size_t frame = 0; frame < frames; ++frame) {
    float left = 0.0f;
    float right = 0.0f;
    for (auto& voice : effectVoices_) {
      if (voice.sample == nullptr) continue;
      const auto sampleFrames = voice.sample->stereo.size() / 2;
      if (voice.frame >= sampleFrames || voice.fade <= 0.0f) {
        voice = {};
        continue;
      }
      if (voice.releasing) voice.fade = std::max(0.0f, voice.fade - releaseStep);
      const auto amount = voice.gain * voice.fade;
      left += voice.sample->stereo[voice.frame * 2] * amount;
      right += voice.sample->stereo[voice.frame * 2 + 1] * amount;
      ++voice.frame;
    }
    const auto outputGain = nextEffectGain();
    left *= outputGain;
    right *= outputGain;
    auto* destination = output + frame * channels;
    if (stereo) {
      destination[first] += left;
      destination[first + 1] += right;
      peaks[0] = std::max(peaks[0], std::abs(left));
      peaks[1] = std::max(peaks[1], std::abs(right));
    } else {
      const auto mono = (left + right) * 0.5f;
      destination[first] += mono;
      peaks[0] = peaks[1] = std::max(peaks[0], std::abs(mono));
    }
  }
  for (std::size_t channel = 0; channel < peaks.size(); ++channel) {
    auto previous = effectPeaks_[channel].load(std::memory_order_relaxed);
    while (peaks[channel] > previous && !effectPeaks_[channel].compare_exchange_weak(
        previous, peaks[channel], std::memory_order_release, std::memory_order_relaxed)) {}
  }
  std::array<std::uint64_t, 2> activity{};
  for (const auto& voice : effectVoices_) if (voice.sample != nullptr)
    activity[voice.sampleIndex / 64] |= std::uint64_t{1} << (voice.sampleIndex % 64);
  for (std::size_t i = 0; i < activity.size(); ++i) effectActivity_[i].store(activity[i], std::memory_order_release);
}

void NativeEngineRuntime::addPadsInterleaved(
    float* output, std::size_t frames, std::size_t channels) noexcept {
  if (output == nullptr || frames == 0 || channels == 0) return;
  const auto route = padOutputRoute_.load(std::memory_order_acquire);
  const auto requested = static_cast<std::size_t>(route & 0xffu);
  const auto first = requested < channels ? requested : 0;
  const bool stereo = ((route >> 8) & 0xffu) == 2 && first + 1 < channels;
  std::array<float, 2> blockPeaks{};
  for (std::size_t rendered = 0; rendered < frames;) {
    const auto count = std::min(maximumBlockFrames_, frames - rendered);
    std::fill_n(padLeftScratch_.data(), count, 0.0f);
    std::fill_n(padRightScratch_.data(), count, 0.0f);
    for (auto& pad : padModules_) {
      // Um banco carregado, mas silencioso, não precisa percorrer todas as
      // vozes reservadas em cada callback do celular.
      if (!pad->hasActiveVoices()) continue;
      pad->renderAdd(padLeftScratch_.data(), padRightScratch_.data(), count, 1.0f);
    }
    for (std::size_t frame = 0; frame < count; ++frame) {
      const auto gain = nextPadGain();
      const auto targetLowCut = padLowCutHz_.load(std::memory_order_relaxed);
      const auto targetHighCut = padHighCutHz_.load(std::memory_order_relaxed);
      currentPadLowCutHz_ += (targetLowCut - currentPadLowCutHz_) * 0.0025f;
      currentPadHighCutHz_ += (targetHighCut - currentPadHighCutHz_) * 0.0025f;
      float left = padLeftScratch_[frame];
      float right = padRightScratch_[frame];
      constexpr float kTwoPi = 6.28318530718f;
      if (currentPadLowCutHz_ > 20.05f) {
        const auto alpha = 1.0f - std::exp(
            -kTwoPi * currentPadLowCutHz_ / static_cast<float>(sampleRate_));
        padHighPassLowState_[0] += alpha * (left - padHighPassLowState_[0]);
        padHighPassLowState_[1] += alpha * (right - padHighPassLowState_[1]);
        left -= padHighPassLowState_[0];
        right -= padHighPassLowState_[1];
      } else {
        padHighPassLowState_[0] = 0.0f;
        padHighPassLowState_[1] = 0.0f;
      }
      if (currentPadHighCutHz_ < 19950.0f) {
        const auto cutoff = std::min(currentPadHighCutHz_, static_cast<float>(sampleRate_ * 0.45));
        const auto alpha = 1.0f - std::exp(-kTwoPi * cutoff / static_cast<float>(sampleRate_));
        padLowPassState_[0] += alpha * (left - padLowPassState_[0]);
        padLowPassState_[1] += alpha * (right - padLowPassState_[1]);
        left = padLowPassState_[0];
        right = padLowPassState_[1];
      } else {
        padLowPassState_[0] = left;
        padLowPassState_[1] = right;
      }
      left *= gain;
      right *= gain;
      auto* destination = output + (rendered + frame) * channels;
      if (stereo) {
        destination[first] += left;
        destination[first + 1] += right;
        blockPeaks[0] = std::max(blockPeaks[0], std::abs(left));
        blockPeaks[1] = std::max(blockPeaks[1], std::abs(right));
      } else {
        // Saída mono soma L+R, igual ao modo Mono dos módulos.
        const auto mono = left + right;
        destination[first] += mono;
        blockPeaks[0] = blockPeaks[1] = std::max(blockPeaks[0], std::abs(mono));
      }
    }
    rendered += count;
  }
  for (std::size_t channel = 0; channel < blockPeaks.size(); ++channel) {
    auto previous = padPeaks_[channel].load(std::memory_order_relaxed);
    while (blockPeaks[channel] > previous && !padPeaks_[channel].compare_exchange_weak(
        previous, blockPeaks[channel], std::memory_order_release, std::memory_order_relaxed)) {}
  }
}

void NativeEngineRuntime::applyMasterLimiter(float* frame, std::size_t channels) noexcept {
  if (frame == nullptr || channels == 0) return;
  float peak = 0.0f;
  for (std::size_t channel = 0; channel < channels; ++channel) {
    peak = std::max(peak, std::abs(frame[channel]));
  }
  const auto requiredGain = peak > kMasterLimiterCeiling
      ? kMasterLimiterCeiling / peak
      : 1.0f;
  if (requiredGain < masterLimiterGain_) {
    masterLimiterGain_ = requiredGain;
  } else {
    masterLimiterGain_ += (1.0f - masterLimiterGain_) * masterLimiterRelease_;
    masterLimiterGain_ = std::min(masterLimiterGain_, requiredGain);
  }
  for (std::size_t channel = 0; channel < channels; ++channel) {
    frame[channel] *= masterLimiterGain_;
  }
}

// Reads the control-thread state once per block: the click keeps its own frame
// clock, so its timing never depends on how often the interface calls back.
bool NativeEngineRuntime::beginMetronomeBlock() noexcept {
  // Volume is a gate on the running waveform, not part of the beat trigger.
  // This also mutes long sampled clicks without waiting for the next beat.
  metronomeBlockVolume_ = metronomeVolume_.load(std::memory_order_acquire);
  if (!metronomeEnabled_.load(std::memory_order_acquire)) {
    metronomeWasEnabled_ = false;
    metronomeClickFrame_ = 0;
    metronomeClickLength_ = 0;
    return false;
  }
  const auto resetRequested = metronomeResetRequested_.exchange(false, std::memory_order_acq_rel);
  if (!metronomeWasEnabled_ || resetRequested) {
    metronomeWasEnabled_ = true;
    metronomeFramesUntilBeat_ = 0.0;
    metronomeBeatIndex_ = 0;
    metronomeClickFrame_ = 0;
    metronomeClickLength_ = 0;
  }
  return true;
}

void NativeEngineRuntime::addMetronome(
    float* left, float* right, std::size_t frames) noexcept {
  if (left == nullptr || right == nullptr || frames == 0) return;
  if (!beginMetronomeBlock()) return;
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto sample = renderMetronomeSample();
    left[frame] += sample[0];
    right[frame] += sample[1];
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
  std::array<float, 2> blockPeaks{};
  for (std::size_t frame = 0; frame < frames; ++frame) {
    const auto sample = renderMetronomeSample();
    auto* destination = output + frame * channels;
    if (stereo) {
      destination[first] += sample[0];
      destination[first + 1] += sample[1];
      blockPeaks[0] = std::max(blockPeaks[0], std::abs(sample[0]));
      blockPeaks[1] = std::max(blockPeaks[1], std::abs(sample[1]));
    } else {
      const auto mono = (sample[0] + sample[1]) * 0.5f;
      destination[first] += mono;
      blockPeaks[0] = std::max(blockPeaks[0], std::abs(mono));
    }
  }
  const auto sides = stereo ? 2u : 1u;
  for (std::size_t channel = 0; channel < sides; ++channel) {
    auto previous = metronomePeaks_[channel].load(std::memory_order_relaxed);
    while (blockPeaks[channel] > previous && !metronomePeaks_[channel].compare_exchange_weak(
        previous, blockPeaks[channel], std::memory_order_release, std::memory_order_relaxed)) {}
  }
}

std::array<float, 2> NativeEngineRuntime::renderMetronomeSample() noexcept {
  constexpr double kPi = 3.14159265358979323846;
  if (metronomeFramesUntilBeat_ <= 0.0) {
    const auto sound = metronomeClickSound_.load(std::memory_order_acquire);
    const auto accented = metronomeAccentEnabled_.load(std::memory_order_acquire) &&
                          metronomeBeatIndex_ == 0;
    const float baseFrequency = sound == 2 ? 1900.0f : sound == 3 ? 760.0f : 1350.0f;
    const float duration = sound == 2 ? 0.032f : sound == 3 ? 0.072f : 0.045f;
    metronomeClickFrequency_ = baseFrequency * (accented ? 1.28f : 1.0f);
    metronomeClickAmplitude_ = accented ? 1.33f : 1.0f;
    metronomeClickWaveform_ = sound;
    metronomeClickFrame_ = 0;
    metronomeClickLength_ = sound == 5 && !metronomeClick5Left_.empty()
        ? metronomeClick5Left_.size()
        : sound == 4 && !metronomeClick4Left_.empty() ? metronomeClick4Left_.size()
        : std::max<std::size_t>(1, static_cast<std::size_t>(sampleRate_ * duration));

    const auto bpm = static_cast<double>(
        metronomeBpm_.load(std::memory_order_acquire));
    const auto speed = metronomeDoubleTimeEnabled_.load(std::memory_order_acquire) ? 2.0 : 1.0;
    const auto denominator = static_cast<double>(
        metronomeDenominator_.load(std::memory_order_acquire));
    metronomeFramesUntilBeat_ += sampleRate_ * 60.0 / bpm * (4.0 / denominator) / speed;
    const auto beatsPerMeasure = static_cast<std::size_t>(
        metronomeNumerator_.load(std::memory_order_acquire)) *
        (speed > 1.0 ? 2u : 1u);
    metronomeBeatIndex_ = (metronomeBeatIndex_ + 1) %
        std::max<std::size_t>(1, beatsPerMeasure);
  }
  metronomeFramesUntilBeat_ -= 1.0;

  if (metronomeClickFrame_ >= metronomeClickLength_) return {0.0f, 0.0f};
  if (metronomeClickWaveform_ == 4 && metronomeClickFrame_ < metronomeClick4Left_.size()) {
    const auto frame = metronomeClickFrame_++;
    return {
      metronomeClick4Left_[frame] * metronomeClickAmplitude_ * metronomeBlockVolume_,
      metronomeClick4Right_[frame] * metronomeClickAmplitude_ * metronomeBlockVolume_,
    };
  }
  if (metronomeClickWaveform_ == 5 && metronomeClickFrame_ < metronomeClick5Left_.size()) {
    const auto frame = metronomeClickFrame_++;
    return {
      metronomeClick5Left_[frame] * metronomeClickAmplitude_ * metronomeBlockVolume_,
      metronomeClick5Right_[frame] * metronomeClickAmplitude_ * metronomeBlockVolume_,
    };
  }
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
  const auto sample = static_cast<float>(oscillator * attack * decay) * metronomeClickAmplitude_ * metronomeBlockVolume_;
  return {sample, sample};
}

HookKeysEngine::SynthModules NativeEngineRuntime::modulePointers(
    const std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount - 1>& modules,
    AnalogSynthModule* synth) noexcept {
  HookKeysEngine::SynthModules pointers{};
  for (std::size_t index = 0; index < modules.size(); ++index) pointers[index] = modules[index].get();
  // Módulo 7 (índice 6) é o Organ, não o TinySoundFontModule avulso do
  // array: uma instância só, compartilhada por todas as camadas de preset.
  pointers[6] = organModule_.get();
  pointers[kModuleCount - 1] = synth;
  return pointers;
}

} // namespace hook_keys
