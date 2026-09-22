#include "hook_keys/NativeEngineRuntime.hpp"

#include <aaudio/AAudio.h>
#include <android/log.h>
#include <jni.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <chrono>
#include <cstdio>
#include <mutex>
#include <string>
#include <thread>

namespace {

constexpr const char* kLogTag = "HookKeysNative";
constexpr std::size_t kRenderChunkFrames = 512;

class AndroidAudioEngine final {
public:
  bool start(int requestedBufferFrames, int requestedDeviceId = AAUDIO_UNSPECIFIED,
             int requestedChannels = 2, int requestedSampleRate = 48000,
             bool forceRestart = false,
             bool preserveRuntime = false) noexcept {
    std::scoped_lock lock(controlMutex_);
    if (!forceRestart && stream_ != nullptr && runtime_ != nullptr &&
        streamReady_.load(std::memory_order_acquire)) {
      return true;
    }
    // Um erro assíncrono do AAudio deixa o ponteiro do stream existente, mas
    // ele já não entrega callbacks. Descarte essa instância antes da tentativa
    // de recuperação em vez de declarar o motor pronto.
    activeRuntime_.store(nullptr, std::memory_order_release);
    streamReady_.store(false, std::memory_order_release);
    callbackSeen_.store(false, std::memory_order_release);
    if (stream_ != nullptr) {
      AAudioStream_requestStop(stream_);
      AAudioStream_close(stream_);
      stream_ = nullptr;
    }
    auto preservedRuntime = preserveRuntime ? std::move(runtime_) : nullptr;
    const auto preservedSampleRate = sampleRate_;
    if (!preserveRuntime) runtime_.reset();
    requestedChannels = std::clamp(requestedChannels, 1, 32);
    requestedSampleRate = requestedSampleRate == 44100 ? 44100 : 48000;
    lastBufferFrames_ = requestedBufferFrames;
    lastDeviceId_ = requestedDeviceId;
    lastChannels_ = requestedChannels;
    lastSampleRate_ = requestedSampleRate;
    auto result = openStream(requestedBufferFrames, requestedDeviceId, requestedChannels,
                             requestedSampleRate, AAUDIO_SHARING_MODE_EXCLUSIVE);
    if (result != AAUDIO_OK) {
      result = openStream(requestedBufferFrames, requestedDeviceId, requestedChannels,
                          requestedSampleRate, AAUDIO_SHARING_MODE_SHARED);
    }
    // Algumas placas USB recusam a contagem máxima de canais que anunciam.
    // Estéreo sempre existe; é melhor tocar em 1+2 do que ficar mudo.
    if (result != AAUDIO_OK && requestedChannels > 2) {
      result = openStream(requestedBufferFrames, requestedDeviceId, 2,
                          requestedSampleRate, AAUDIO_SHARING_MODE_SHARED);
    }
    if (result != AAUDIO_OK || stream_ == nullptr) {
      stream_ = nullptr;
      runtime_ = std::move(preservedRuntime);
      return false;
    }

    channelCount_ = std::clamp(AAudioStream_getChannelCount(stream_), 1, 32);
    const auto sampleRate = static_cast<double>(AAudioStream_getSampleRate(stream_));
    if (preservedRuntime != nullptr && std::abs(sampleRate - preservedSampleRate) >= 0.5) {
      AAudioStream_close(stream_);
      stream_ = nullptr;
      runtime_ = std::move(preservedRuntime);
      return false;
    }
    if (preservedRuntime != nullptr) {
      runtime_ = std::move(preservedRuntime);
    } else {
      runtime_ = std::make_shared<hook_keys::NativeEngineRuntime>(sampleRate, kRenderChunkFrames);
      runtime_->setMidiInputEnabled(false);
    }
    sampleRate_ = sampleRate;
    activeRuntime_.store(runtime_.get(), std::memory_order_release);
    result = AAudioStream_requestStart(stream_);
    if (result != AAUDIO_OK) {
      activeRuntime_.store(nullptr, std::memory_order_release);
      if (!preserveRuntime) runtime_.reset();
      AAudioStream_close(stream_);
      stream_ = nullptr;
      return false;
    }
    streamReady_.store(true, std::memory_order_release);
    lastError_.store(AAUDIO_OK, std::memory_order_release);
    return true;
  }

  // Estado do stream para o "Diagnóstico da rota" do app.
  std::string diagnostics() noexcept {
    std::scoped_lock lock(controlMutex_);
    char text[320];
    if (stream_ == nullptr) {
      std::snprintf(text, sizeof(text), "sem stream · pedido %d · último erro %s",
                    lastDeviceId_, AAudio_convertResultToText(lastError_.load()));
      return text;
    }
    std::snprintf(
        text, sizeof(text),
        "pedido %d → aberto %d · %d ch · %d Hz · %s · %s · buffer %d · xruns %d · callback %s · último erro %s",
        lastDeviceId_, AAudioStream_getDeviceId(stream_), AAudioStream_getChannelCount(stream_),
        AAudioStream_getSampleRate(stream_),
        AAudioStream_getSharingMode(stream_) == AAUDIO_SHARING_MODE_EXCLUSIVE ? "exclusivo" : "compartilhado",
        AAudioStream_getPerformanceMode(stream_) == AAUDIO_PERFORMANCE_MODE_LOW_LATENCY ? "baixa latência" : "latência normal",
        AAudioStream_getBufferSizeInFrames(stream_), AAudioStream_getXRunCount(stream_),
        callbackSeen_.load() ? "ok" : "parado", AAudio_convertResultToText(lastError_.load()));
    return text;
  }

  void stop() noexcept {
    std::scoped_lock lock(controlMutex_);
    streamReady_.store(false, std::memory_order_release);
    callbackSeen_.store(false, std::memory_order_release);
    activeRuntime_.store(nullptr, std::memory_order_release);
    if (stream_ != nullptr) {
      AAudioStream_requestStop(stream_);
      AAudioStream_close(stream_);
      stream_ = nullptr;
    }
    runtime_.reset();
    sampleRate_ = 0.0;
    channelCount_ = 2;
  }

  bool audioOutputReady() const noexcept {
    return streamReady_.load(std::memory_order_acquire) &&
        callbackSeen_.load(std::memory_order_acquire) &&
        activeRuntime_.load(std::memory_order_acquire) != nullptr;
  }

  bool loadSoundFont(std::size_t moduleIndex, const char* path) noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> engine;
    {
      std::scoped_lock lock(controlMutex_);
      engine = runtime_;
    }
    return engine != nullptr && engine->loadSoundFont(moduleIndex, path);
  }

  bool loadOrganVoice(std::size_t drawbarIndex, const char* path) noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> engine;
    {
      std::scoped_lock lock(controlMutex_);
      engine = runtime_;
    }
    return engine != nullptr && engine->loadOrganVoice(drawbarIndex, path);
  }

  void setOrganDrawbarPosition(std::size_t drawbarIndex, std::uint8_t position) noexcept {
    if (auto* runtime = activeRuntime_.load(std::memory_order_acquire)) {
      runtime->setOrganDrawbarPosition(drawbarIndex, position);
    }
  }

  bool cloneSoundFont(std::size_t sourceModuleIndex, std::size_t targetModuleIndex) noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> engine;
    {
      std::scoped_lock lock(controlMutex_);
      engine = runtime_;
    }
    return engine != nullptr && engine->cloneSoundFont(sourceModuleIndex, targetModuleIndex);
  }

  void unloadSoundFont(std::size_t moduleIndex) noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> engine;
    {
      std::scoped_lock lock(controlMutex_);
      engine = runtime_;
    }
    if (engine) engine->unloadSoundFont(moduleIndex);
  }

  hook_keys::HookKeysEngine::ModulePeaks consumeModulePeaks() noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> runtime;
    {
      std::unique_lock lock(controlMutex_, std::try_to_lock);
      if (!lock.owns_lock()) return {};
      runtime = runtime_;
    }
    return runtime ? runtime->consumeModulePeaks() : hook_keys::HookKeysEngine::ModulePeaks{};
  }

  std::array<float, 2> consumeMasterPeaks() noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> runtime;
    {
      std::unique_lock lock(controlMutex_, std::try_to_lock);
      if (!lock.owns_lock()) return {};
      runtime = runtime_;
    }
    return runtime ? runtime->consumeMasterPeaks() : std::array<float, 2>{};
  }

  std::array<float, 2> consumeTrackPeaks() noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> runtime;
    {
      std::unique_lock lock(controlMutex_, std::try_to_lock);
      if (!lock.owns_lock()) return {};
      runtime = runtime_;
    }
    return runtime ? runtime->consumeTrackPeaks() : std::array<float, 2>{};
  }

  std::array<float, 2> consumeMetronomePeaks() noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> runtime;
    {
      std::unique_lock lock(controlMutex_, std::try_to_lock);
      if (!lock.owns_lock()) return {};
      runtime = runtime_;
    }
    return runtime ? runtime->consumeMetronomePeaks() : std::array<float, 2>{};
  }

  hook_keys::HookKeysEngine::ModuleAnalysis consumeModuleAnalysis(
      std::size_t moduleIndex) noexcept {
    std::shared_ptr<hook_keys::NativeEngineRuntime> runtime;
    {
      std::unique_lock lock(controlMutex_, std::try_to_lock);
      if (!lock.owns_lock()) return {};
      runtime = runtime_;
    }
    return runtime ? runtime->consumeModuleAnalysis(moduleIndex)
                   : hook_keys::HookKeysEngine::ModuleAnalysis{};
  }

  bool sendMidi(
      std::uint8_t slot,
      std::uint8_t status,
      std::uint8_t data1,
      std::uint8_t data2,
      std::uint64_t timestamp) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->sendMidi(slot, status, data1, data2, timestamp);
  }

  void setMidiInputEnabled(bool enabled) noexcept {
    if (auto* runtime = activeRuntime_.load(std::memory_order_acquire)) {
      runtime->setMidiInputEnabled(enabled);
    }
  }

  bool configureModule(
      std::size_t moduleIndex,
      bool enabled,
      std::uint8_t inputSlot,
      std::uint8_t lowNote,
      std::uint8_t highNote,
      std::int8_t octave,
      bool sustain,
      bool modulation,
      bool gmDrumHiHatChoke,
      std::uint32_t drumZeroReleaseMask0,
      std::uint32_t drumZeroReleaseMask1,
      std::uint32_t drumZeroReleaseMask2,
      std::uint32_t drumZeroReleaseMask3,
      float volumeDb,
      int polyphony,
      int velocityCurve0,
      int velocityCurve1,
      int velocityCurve2,
      int velocityCurve3,
      int velocityCurve4,
      bool noVelocitySensitivity,
      bool mono,
      bool legato,
      int outputChannelStart,
      int outputChannelCount,
      bool outputDualMono) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    hook_keys::ModuleConfig config;
    config.enabled = enabled;
    config.midiInputSlot = inputSlot == hook_keys::kArpeggiatorInput
        ? inputSlot
        : inputSlot >= hook_keys::kMidiInputCount ? hook_keys::kAllMidiInputs : inputSlot;
    config.lowNote = lowNote;
    config.highNote = highNote;
    config.octaveShift = octave;
    config.sustainInputEnabled = sustain;
    config.modulationInputEnabled = modulation;
    config.gmDrumHiHatChoke = gmDrumHiHatChoke;
    config.drumZeroReleaseNoteMasks = {drumZeroReleaseMask0, drumZeroReleaseMask1,
                                      drumZeroReleaseMask2, drumZeroReleaseMask3};
    config.gainLinear = volumeDb <= -90.0f ? 0.0f : std::pow(10.0f, volumeDb / 20.0f);
    config.polyphony = static_cast<std::uint16_t>(std::clamp(polyphony, 1, 128));
    config.velocityCurve = {
        static_cast<std::uint8_t>(std::clamp(velocityCurve0, 0, 127)),
        static_cast<std::uint8_t>(std::clamp(velocityCurve1, 0, 127)),
        static_cast<std::uint8_t>(std::clamp(velocityCurve2, 0, 127)),
        static_cast<std::uint8_t>(std::clamp(velocityCurve3, 0, 127)),
        static_cast<std::uint8_t>(std::clamp(velocityCurve4, 0, 127))};
    config.noVelocitySensitivity = noVelocitySensitivity;
    config.mono = mono;
    config.legato = legato;
    config.outputChannelStart = static_cast<std::uint8_t>(std::clamp(outputChannelStart, 0, 31));
    config.outputChannelCount = outputChannelCount == 1 ? 1 : 2;
    config.outputDualMono = outputDualMono;
    return runtime->setModuleConfig(moduleIndex, config);
  }

  bool setModuleGain(std::size_t moduleIndex, float db) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setModuleGainDb(moduleIndex, db);
  }

  bool configureModuleEffects(
      std::size_t moduleIndex,
      float cutoffHz,
      const std::array<int, 5>& cutoffVelocity,
      int cutoffFilterType,
      bool cutoffEnvelopeEnabled,
      float cutoffEnvelopeAttackMs,
      float cutoffEnvelopeDecayMs,
      float cutoffEnvelopeSustain,
      float cutoffEnvelopeReleaseMs,
      float cutoffEnvelopeDepthOctaves,
      const std::array<int, 5>& eqTypes,
      const std::array<float, 5>& eqFrequencies,
      const std::array<float, 5>& eqGains,
      const std::array<float, 5>& eqQualities,
      const std::array<int, 5>& eqCutStages,
      float compressorThresholdDb,
      float compressorRatio,
      float compressorAttackMs,
      float compressorReleaseMs,
      float compressorGainDb,
      float compressorMix,
      bool delaySync,
      float delayMs,
      float delayBeatMultiplier,
      float delayFeedback,
      float delayMix,
      float reverbDecay,
      float reverbDampen,
      float reverbMod,
      float reverbSize,
      float reverbMix, bool rotaryEnabled, int rotarySpeed,
      float rotarySlowHz, float rotaryFastHz, float rotaryRampSeconds,
      float rotaryDepth, float rotaryMix, bool rotaryModulationEnabled,
      bool chorusEnabled, float chorusRateHz, float chorusDepth, float chorusMix,
      bool autoFaderEnabled, float autoFaderBeats, float autoFaderDepthDb,
      float inputGainDb) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    hook_keys::ModuleEffectsConfig effects;
    effects.cutoff.enabled = true;
    effects.cutoff.frequencyHz = cutoffHz;
    effects.cutoff.type = static_cast<hook_keys::FilterKind>(std::clamp(cutoffFilterType, 0, 3));
    effects.cutoff.envelope.enabled = cutoffEnvelopeEnabled;
    effects.cutoff.envelope.attackMs = cutoffEnvelopeAttackMs;
    effects.cutoff.envelope.decayMs = cutoffEnvelopeDecayMs;
    effects.cutoff.envelope.sustain = cutoffEnvelopeSustain;
    effects.cutoff.envelope.releaseMs = cutoffEnvelopeReleaseMs;
    effects.cutoff.envelope.depthOctaves = cutoffEnvelopeDepthOctaves;
    for (std::size_t index = 0; index < effects.cutoff.velocityCurve.size(); ++index) {
      effects.cutoff.velocityCurve[index] = static_cast<std::uint8_t>(
          std::clamp(cutoffVelocity[index], 0, 127));
    }
    effects.equalizer.enabled = false;
    for (std::size_t index = 0; index < effects.equalizer.bands.size(); ++index) {
      auto& band = effects.equalizer.bands[index];
      band.enabled = true;
      band.type = static_cast<hook_keys::EqBandType>(std::clamp(eqTypes[index], 0, 4));
      band.frequencyHz = eqFrequencies[index];
      band.gainDb = eqGains[index];
      band.quality = eqQualities[index];
      band.cutStages = static_cast<std::uint8_t>(std::clamp(eqCutStages[index], 1, 8));
      const auto cut = band.type == hook_keys::EqBandType::lowCut ||
          band.type == hook_keys::EqBandType::highCut;
      effects.equalizer.enabled = effects.equalizer.enabled || cut || std::abs(band.gainDb) > 0.0001f;
    }
    effects.compressor = {compressorMix > 0.0001f, compressorThresholdDb, compressorRatio, compressorAttackMs,
                          compressorReleaseMs, compressorGainDb, compressorMix};
    effects.delay = {delayMix > 0.0001f, delaySync, delayMs, delayBeatMultiplier, delayFeedback, delayMix};
    effects.reverb = {reverbMix > 0.0001f, reverbDecay, reverbDampen, reverbSize, reverbMix, reverbMod};
    effects.rotary = {rotaryEnabled, static_cast<std::uint8_t>(std::clamp(rotarySpeed, 0, 2)),
                      rotarySlowHz, rotaryFastHz, rotaryRampSeconds, rotaryDepth, rotaryMix,
                      rotaryModulationEnabled};
    effects.chorus = {chorusEnabled, chorusRateHz, chorusDepth, chorusMix};
    effects.autoFader = {autoFaderEnabled, autoFaderBeats, autoFaderDepthDb};
    effects.inputGainDb = inputGainDb;
    return runtime->setModuleEffects(moduleIndex, effects);
  }

  bool configureModuleEnvelope(
      std::size_t moduleIndex, float attackMs, float holdMs,
      float decayMs, float releaseMs, float glideMs, float sustainDb) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setModuleEnvelope(
        moduleIndex, attackMs, holdMs, decayMs, releaseMs, glideMs, sustainDb);
  }

  bool configureVelocityLimits(std::size_t moduleIndex, std::uint8_t ignoreAbove, std::uint8_t ceiling,
      std::uint8_t oscillator1Limit, std::uint8_t oscillator2Limit, std::uint8_t oscillator3Limit) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setVelocityLimits(
        moduleIndex, ignoreAbove, ceiling, oscillator1Limit, oscillator2Limit, oscillator3Limit);
  }

  bool configureGlide(std::size_t moduleIndex, hook_keys::GlideBehavior behavior) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setGlideBehavior(moduleIndex, behavior);
  }

  // mode: 0 User, 1 LFO de pitch, 2 Tremolo.
  bool configureModuleModulation(
      std::size_t moduleIndex, std::uint8_t mode, float rateHz, float intensity) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setModuleModulationMode(moduleIndex, mode, rateHz, intensity);
  }

  bool beginPresetTransition() noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->beginPresetTransition();
  }

  bool commitPresetTransition() noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->commitPresetTransition();
  }

  void setCompatibilityMode(bool enabled) noexcept {
    if (auto* runtime = activeRuntime_.load(std::memory_order_acquire)) runtime->setCompatibilityMode(enabled);
  }

  void setSeamlessPresetSwitching(bool enabled) noexcept {
    if (auto* runtime = activeRuntime_.load(std::memory_order_acquire)) runtime->setSeamlessPresetSwitching(enabled);
  }

  bool configureTranceGate(std::size_t moduleIndex, bool enabled, int steps, int length,
      float beatMultiplier, float gate, float depth, float attackMs, float releaseMs, float swing) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    hook_keys::ModuleEffectsConfig::TranceGateConfig config;
    config.enabled = enabled;
    config.steps = static_cast<std::uint16_t>(steps);
    config.length = static_cast<std::uint8_t>(std::clamp(length, 1, 16));
    config.beatMultiplier = beatMultiplier;
    config.gate = gate;
    config.depth = depth;
    config.attackMs = attackMs;
    config.releaseMs = releaseMs;
    config.swing = swing;
    return runtime->setTranceGate(moduleIndex, config);
  }

  bool configureSynth(
      int oscillator1, int oscillator2, int oscillator3, bool oscillator1Enabled,
      bool oscillator2Enabled, bool oscillator3Enabled, int voiceMode, int lfoTarget,
      float oscillator1Volume, float oscillator2Volume, float oscillator3Volume,
      float oscillator1DetuneCents, float oscillator2DetuneCents, float oscillator3DetuneCents,
      float attackMs, float holdMs,
      float decayMs, float sustain, float releaseMs, float filterCutoffHz,
      float filterResonance, float filterEnvelope, float lfoRateHz,
      float lfoDepth, float glideMs, int oscillator1Octave, int oscillator2Octave, int oscillator3Octave) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    hook_keys::AnalogSynthConfig config;
    config.oscillator1 = static_cast<std::uint8_t>(std::clamp(oscillator1, 0, 3));
    config.oscillator2 = static_cast<std::uint8_t>(std::clamp(oscillator2, 0, 3));
    config.oscillator3 = static_cast<std::uint8_t>(std::clamp(oscillator3, 0, 3));
    config.oscillator1Enabled = oscillator1Enabled;
    config.oscillator2Enabled = oscillator2Enabled;
    config.oscillator3Enabled = oscillator3Enabled;
    config.voiceMode = static_cast<std::uint8_t>(std::clamp(voiceMode, 0, 2));
    config.lfoTarget = static_cast<std::uint8_t>(std::clamp(lfoTarget, 0, 2));
    config.oscillator1Volume = oscillator1Volume;
    config.oscillator2Volume = oscillator2Volume;
    config.oscillator3Volume = oscillator3Volume;
    config.oscillator1DetuneCents = oscillator1DetuneCents;
    config.oscillator2DetuneCents = oscillator2DetuneCents;
    config.oscillator3DetuneCents = oscillator3DetuneCents;
    config.attackMs = attackMs;
    config.holdMs = holdMs;
    config.decayMs = decayMs;
    config.sustain = sustain;
    config.releaseMs = releaseMs;
    config.filterCutoffHz = filterCutoffHz;
    config.filterResonance = filterResonance;
    config.filterEnvelope = filterEnvelope;
    config.lfoRateHz = lfoRateHz;
    config.lfoDepth = lfoDepth;
    config.glideMs = glideMs;
    config.oscillator1Octave = static_cast<std::int8_t>(std::clamp(oscillator1Octave, -3, 3));
    config.oscillator2Octave = static_cast<std::int8_t>(std::clamp(oscillator2Octave, -3, 3));
    config.oscillator3Octave = static_cast<std::int8_t>(std::clamp(oscillator3Octave, -3, 3));
    return runtime->setSynthConfig(config);
  }

  bool setTempo(float bpm) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setTempo(bpm);
  }

  bool setGlobalTranspose(int semitones) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setGlobalTranspose(semitones);
  }

  bool setMetronomeOutput(int channelStart, int channelCount) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    runtime->setMetronomeOutput(
        static_cast<std::uint8_t>(std::clamp(channelStart, 0, 31)), channelCount == 1 ? 1 : 2);
    return true;
  }

  bool configureMetronome(
      bool enabled, float bpm, float volume, int clickSound,
      bool accentEnabled, bool doubleTimeEnabled, int numerator) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    runtime->setMetronome(
        enabled, bpm, volume,
        static_cast<std::uint8_t>(std::clamp(clickSound, 1, 3)),
        accentEnabled, doubleTimeEnabled,
        static_cast<std::uint8_t>(std::clamp(numerator, 1, 16)));
    return true;
  }

  bool setOutputGain(float db, bool enabled, int channelStart, int channelCount) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    runtime->setOutputGainDb(db, enabled,
        static_cast<std::uint8_t>(std::clamp(channelStart, 0, 31)), channelCount == 1 ? 1 : 2);
    return true;
  }

  void stopAllNotes() noexcept {
    if (auto* runtime = activeRuntime_.load(std::memory_order_acquire); runtime != nullptr) {
      runtime->stopAllNotes();
    }
  }

private:
  aaudio_result_t openStream(int requestedBufferFrames, int requestedDeviceId,
                             int requestedChannels, int requestedSampleRate,
                             aaudio_sharing_mode_t sharingMode) noexcept {
    requestedBufferFrames = std::clamp(requestedBufferFrames, 64, 512);
    if (stream_ != nullptr) {
      AAudioStream_close(stream_);
      stream_ = nullptr;
    }
    AAudioStreamBuilder* builder = nullptr;
    if (AAudio_createStreamBuilder(&builder) != AAUDIO_OK || builder == nullptr) {
      return AAUDIO_ERROR_INTERNAL;
    }
    AAudioStreamBuilder_setDirection(builder, AAUDIO_DIRECTION_OUTPUT);
    AAudioStreamBuilder_setPerformanceMode(builder, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    AAudioStreamBuilder_setSharingMode(builder, sharingMode);
    AAudioStreamBuilder_setFormat(builder, AAUDIO_FORMAT_PCM_FLOAT);
    AAudioStreamBuilder_setChannelCount(builder, requestedChannels);
    AAudioStreamBuilder_setDeviceId(builder, requestedDeviceId);
    AAudioStreamBuilder_setSampleRate(builder, requestedSampleRate);
    AAudioStreamBuilder_setDataCallback(builder, &AndroidAudioEngine::dataCallback, this);
    AAudioStreamBuilder_setErrorCallback(builder, &AndroidAudioEngine::errorCallback, this);
    auto result = AAudioStreamBuilder_openStream(builder, &stream_);
    AAudioStreamBuilder_delete(builder);
    // No modo exclusivo (MMAP) vários aparelhos ignoram o dispositivo pedido e
    // abrem no alto-falante interno, que fica mudo com a placa USB conectada:
    // a placa aparece selecionada e o som não sai em lugar nenhum. Se o stream
    // não abriu na placa escolhida, desista do exclusivo para o compartilhado.
    if (result == AAUDIO_OK && stream_ != nullptr && sharingMode == AAUDIO_SHARING_MODE_EXCLUSIVE &&
        requestedDeviceId != AAUDIO_UNSPECIFIED && AAudioStream_getDeviceId(stream_) != requestedDeviceId) {
      __android_log_print(ANDROID_LOG_WARN, kLogTag, "Exclusive stream opened on device %d instead of %d",
                          AAudioStream_getDeviceId(stream_), requestedDeviceId);
      AAudioStream_close(stream_);
      stream_ = nullptr;
      result = AAUDIO_ERROR_UNAVAILABLE;
    }
    if (result == AAUDIO_OK && stream_ != nullptr) {
      // O tamanho do callback pertence ao AAudio. Ajustamos apenas a capacidade
      // em multiplos do burst nativo para nao provocar underrun em celulares.
      const auto burst = std::max(1, AAudioStream_getFramesPerBurst(stream_));
      const auto capacity = std::max(burst, AAudioStream_getBufferCapacityInFrames(stream_));
      const auto requested = std::max(requestedBufferFrames, burst * 2);
      const auto wholeBursts = ((requested + burst - 1) / burst) * burst;
      static_cast<void>(AAudioStream_setBufferSizeInFrames(
          stream_, std::min(capacity, wholeBursts)));
    }
    return result;
  }

  static aaudio_data_callback_result_t dataCallback(
      AAudioStream*, void* userData, void* audioData, int32_t frames) noexcept {
    return static_cast<AndroidAudioEngine*>(userData)->render(static_cast<float*>(audioData), frames);
  }

  static void errorCallback(AAudioStream*, void* userData, aaudio_result_t error) noexcept {
    auto* engine = static_cast<AndroidAudioEngine*>(userData);
    engine->streamReady_.store(false, std::memory_order_release);
    engine->callbackSeen_.store(false, std::memory_order_release);
    engine->activeRuntime_.store(nullptr, std::memory_order_release);
    engine->lastError_.store(error, std::memory_order_release);
    __android_log_print(ANDROID_LOG_ERROR, kLogTag, "AAudio stream error: %s", AAudio_convertResultToText(error));
    // Plugar/desplugar a placa (ou o Android trocar a rota) desconecta o stream.
    // O AAudio pede para reabrir fora deste callback; mantém os SF2 carregados.
    if (error != AAUDIO_ERROR_DISCONNECTED || engine->recovering_.exchange(true)) return;
    std::thread([engine] {
      std::this_thread::sleep_for(std::chrono::milliseconds(250));
      static_cast<void>(engine->start(engine->lastBufferFrames_, engine->lastDeviceId_,
                                      engine->lastChannels_, engine->lastSampleRate_, true, true));
      engine->recovering_.store(false, std::memory_order_release);
    }).detach();
  }

  aaudio_data_callback_result_t render(float* interleaved, int32_t frameCount) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (interleaved == nullptr || frameCount <= 0) return AAUDIO_CALLBACK_RESULT_CONTINUE;
    if (runtime == nullptr) {
      std::fill_n(interleaved, static_cast<std::size_t>(frameCount) * channelCount_, 0.0f);
      return AAUDIO_CALLBACK_RESULT_CONTINUE;
    }
    callbackSeen_.store(true, std::memory_order_release);
    std::size_t offset = 0;
    while (offset < static_cast<std::size_t>(frameCount)) {
      const auto frames = std::min(kRenderChunkFrames, static_cast<std::size_t>(frameCount) - offset);
      runtime->renderInterleaved(interleaved + offset * channelCount_, frames, channelCount_);
      offset += frames;
    }
    return AAUDIO_CALLBACK_RESULT_CONTINUE;
  }

  std::mutex controlMutex_;
  AAudioStream* stream_ = nullptr;
  std::shared_ptr<hook_keys::NativeEngineRuntime> runtime_;
  std::atomic<hook_keys::NativeEngineRuntime*> activeRuntime_{nullptr};
  std::atomic<bool> streamReady_{false};
  std::atomic<bool> callbackSeen_{false};
  std::size_t channelCount_ = 2;
  double sampleRate_ = 0.0;
  std::atomic<aaudio_result_t> lastError_{AAUDIO_OK};
  std::atomic<bool> recovering_{false};
  int lastBufferFrames_ = 128;
  int lastDeviceId_ = AAUDIO_UNSPECIFIED;
  int lastChannels_ = 2;
  int lastSampleRate_ = 48000;
};

AndroidAudioEngine gEngine;

std::string javaString(JNIEnv* environment, jstring value) {
  if (value == nullptr) return {};
  const auto* characters = environment->GetStringUTFChars(value, nullptr);
  if (characters == nullptr) return {};
  std::string result(characters);
  environment->ReleaseStringUTFChars(value, characters);
  return result;
}

template <typename JavaArray, typename Value, std::size_t Size, typename Reader>
std::array<Value, Size> javaArray(
    JNIEnv* environment, JavaArray source, Value fallback, Reader reader) {
  std::array<Value, Size> result{};
  result.fill(fallback);
  if (source == nullptr) return result;
  const auto count = std::min<jsize>(static_cast<jsize>(Size), environment->GetArrayLength(source));
  reader(environment, source, 0, count, result.data());
  return result;
}

} // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeStart(
    JNIEnv*, jclass, jint bufferFrames, jint sampleRate) {
  return gEngine.start(bufferFrames, AAUDIO_UNSPECIFIED, 2, sampleRate) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeRestart(
    JNIEnv*, jclass, jint bufferFrames, jint deviceId, jint channels, jint sampleRate,
    jboolean preserveRuntime) {
  const bool preserve = preserveRuntime == JNI_TRUE;
  if (gEngine.start(bufferFrames, deviceId, channels, sampleRate, true, preserve)) return JNI_TRUE;
  static_cast<void>(gEngine.start(
      bufferFrames, AAUDIO_UNSPECIFIED, 2, sampleRate, true, preserve));
  return JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeStop(JNIEnv*, jclass) {
  gEngine.stop();
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetMidiInputEnabled(
    JNIEnv*, jclass, jboolean enabled) {
  gEngine.setMidiInputEnabled(enabled == JNI_TRUE);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeAudioDiagnostics(JNIEnv* env, jclass) {
  return env->NewStringUTF(gEngine.diagnostics().c_str());
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeAudioOutputReady(JNIEnv*, jclass) {
  return gEngine.audioOutputReady() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeModuleMeterLevels(JNIEnv* env, jclass) {
  const auto peaks = gEngine.consumeModulePeaks();
  const auto master = gEngine.consumeMasterPeaks();
  const auto tracks = gEngine.consumeTrackPeaks();
  const auto click = gEngine.consumeMetronomePeaks();
  auto result = env->NewFloatArray(static_cast<jsize>(
      peaks.size() + master.size() + tracks.size() + click.size()));
  if (result) {
    env->SetFloatArrayRegion(result, 0, static_cast<jsize>(peaks.size()), peaks.data());
    env->SetFloatArrayRegion(result, static_cast<jsize>(peaks.size()),
        static_cast<jsize>(master.size()), master.data());
    env->SetFloatArrayRegion(result, static_cast<jsize>(peaks.size() + master.size()),
        static_cast<jsize>(tracks.size()), tracks.data());
    env->SetFloatArrayRegion(result, static_cast<jsize>(peaks.size() + master.size() + tracks.size()),
        static_cast<jsize>(click.size()), click.data());
  }
  return result;
}

extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeModuleAnalysis(
    JNIEnv* env, jclass, jint moduleIndex) {
  const auto analysis = gEngine.consumeModuleAnalysis(static_cast<std::size_t>(moduleIndex));
  auto result = env->NewFloatArray(static_cast<jsize>(analysis.size()));
  if (result) env->SetFloatArrayRegion(
      result, 0, static_cast<jsize>(analysis.size()), analysis.data());
  return result;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeLoadSoundFont(
    JNIEnv* environment, jclass, jint moduleIndex, jstring path) {
  const auto nativePath = javaString(environment, path);
  return gEngine.loadSoundFont(static_cast<std::size_t>(moduleIndex), nativePath.c_str()) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeLoadOrganVoice(
    JNIEnv* environment, jclass, jint drawbarIndex, jstring path) {
  const auto nativePath = javaString(environment, path);
  return gEngine.loadOrganVoice(static_cast<std::size_t>(drawbarIndex), nativePath.c_str())
      ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetOrganDrawbarPosition(
    JNIEnv*, jclass, jint drawbarIndex, jint position) {
  gEngine.setOrganDrawbarPosition(
      static_cast<std::size_t>(drawbarIndex),
      static_cast<std::uint8_t>(std::clamp(position, 0, 8)));
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeCloneSoundFont(
    JNIEnv*, jclass, jint sourceModuleIndex, jint targetModuleIndex) {
  return gEngine.cloneSoundFont(
      static_cast<std::size_t>(sourceModuleIndex), static_cast<std::size_t>(targetModuleIndex))
      ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeUnloadSoundFont(
    JNIEnv*, jclass, jint moduleIndex) {
  gEngine.unloadSoundFont(static_cast<std::size_t>(moduleIndex));
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSendMidi(
    JNIEnv*, jclass, jint slot, jint status, jint data1, jint data2, jlong timestamp) {
  return gEngine.sendMidi(
             static_cast<std::uint8_t>(slot),
             static_cast<std::uint8_t>(status),
             static_cast<std::uint8_t>(data1),
             static_cast<std::uint8_t>(data2),
             static_cast<std::uint64_t>(timestamp))
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureModule(
    JNIEnv*,
    jclass,
    jint moduleIndex,
    jboolean enabled,
    jint inputSlot,
    jint lowNote,
    jint highNote,
    jint octave,
    jboolean sustain,
    jboolean modulation,
    jboolean gmDrumHiHatChoke,
    jint drumZeroReleaseMask0,
    jint drumZeroReleaseMask1,
    jint drumZeroReleaseMask2,
    jint drumZeroReleaseMask3,
    jfloat volumeDb,
    jint polyphony,
    jint velocityCurve0,
    jint velocityCurve1,
    jint velocityCurve2,
    jint velocityCurve3,
    jint velocityCurve4,
    jboolean noVelocitySensitivity,
    jboolean mono,
    jboolean legato,
    jint outputChannelStart,
    jint outputChannelCount,
    jboolean outputDualMono) {
  return gEngine.configureModule(
             static_cast<std::size_t>(moduleIndex),
             enabled == JNI_TRUE,
             static_cast<std::uint8_t>(inputSlot),
             static_cast<std::uint8_t>(lowNote),
             static_cast<std::uint8_t>(highNote),
             static_cast<std::int8_t>(octave),
             sustain == JNI_TRUE,
             modulation == JNI_TRUE,
             gmDrumHiHatChoke == JNI_TRUE,
             static_cast<std::uint32_t>(drumZeroReleaseMask0),
             static_cast<std::uint32_t>(drumZeroReleaseMask1),
             static_cast<std::uint32_t>(drumZeroReleaseMask2),
             static_cast<std::uint32_t>(drumZeroReleaseMask3),
             volumeDb,
             static_cast<int>(polyphony),
             static_cast<int>(velocityCurve0),
             static_cast<int>(velocityCurve1),
             static_cast<int>(velocityCurve2),
             static_cast<int>(velocityCurve3),
             static_cast<int>(velocityCurve4),
             noVelocitySensitivity == JNI_TRUE,
             mono == JNI_TRUE,
             legato == JNI_TRUE,
             static_cast<int>(outputChannelStart),
             static_cast<int>(outputChannelCount),
             outputDualMono == JNI_TRUE)
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetModuleGain(
    JNIEnv*, jclass, jint moduleIndex, jfloat db) {
  return gEngine.setModuleGain(static_cast<std::size_t>(moduleIndex), db)
      ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureTranceGate(
    JNIEnv*, jclass, jint moduleIndex, jboolean enabled, jint steps, jint length,
    jfloat beatMultiplier, jfloat gate, jfloat depth, jfloat attackMs, jfloat releaseMs, jfloat swing) {
  return gEngine.configureTranceGate(static_cast<std::size_t>(moduleIndex), enabled == JNI_TRUE,
      steps, length, beatMultiplier, gate, depth, attackMs, releaseMs, swing) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeBeginPresetTransition(JNIEnv*, jclass) {
  return gEngine.beginPresetTransition() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeCommitPresetTransition(JNIEnv*, jclass) {
  return gEngine.commitPresetTransition() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetCompatibilityMode(JNIEnv*, jclass, jboolean enabled) {
  gEngine.setCompatibilityMode(enabled == JNI_TRUE);
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetSeamlessPresetSwitching(JNIEnv*, jclass, jboolean enabled) {
  gEngine.setSeamlessPresetSwitching(enabled == JNI_TRUE);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureModuleEffects(
    JNIEnv* environment,
    jclass,
    jint moduleIndex,
    jfloat cutoffHz,
    jintArray cutoffVelocity,
    jint cutoffFilterType,
    jboolean cutoffEnvelopeEnabled,
    jfloat cutoffEnvelopeAttackMs,
    jfloat cutoffEnvelopeDecayMs,
    jfloat cutoffEnvelopeSustain,
    jfloat cutoffEnvelopeReleaseMs,
    jfloat cutoffEnvelopeDepthOctaves,
    jintArray eqTypes,
    jfloatArray eqFrequencies,
    jfloatArray eqGains,
    jfloatArray eqQualities,
    jintArray eqCutStages,
    jfloat compressorThresholdDb,
    jfloat compressorRatio,
    jfloat compressorAttackMs,
    jfloat compressorReleaseMs,
    jfloat compressorGainDb,
    jfloat compressorMix,
    jboolean delaySync,
    jfloat delayMs,
    jfloat delayBeatMultiplier,
    jfloat delayFeedback,
    jfloat delayMix,
    jfloat reverbDecay,
    jfloat reverbDampen,
    jfloat reverbMod,
    jfloat reverbSize,
    jfloat reverbMix, jboolean rotaryEnabled, jint rotarySpeed,
    jfloat rotarySlowHz, jfloat rotaryFastHz, jfloat rotaryRampSeconds,
    jfloat rotaryDepth, jfloat rotaryMix, jboolean rotaryModulationEnabled,
    jboolean chorusEnabled, jfloat chorusRateHz, jfloat chorusDepth, jfloat chorusMix,
    jboolean autoFaderEnabled, jfloat autoFaderBeats, jfloat autoFaderDepthDb,
    jfloat inputGainDb) {
  const auto readInts = [](JNIEnv* env, jintArray source, jsize start, jsize count, int* target) {
    env->GetIntArrayRegion(source, start, count, reinterpret_cast<jint*>(target));
  };
  const auto readFloats = [](JNIEnv* env, jfloatArray source, jsize start, jsize count, float* target) {
    env->GetFloatArrayRegion(source, start, count, reinterpret_cast<jfloat*>(target));
  };
  const auto types = javaArray<jintArray, int, 5>(environment, eqTypes, 2, readInts);
  const auto velocity = javaArray<jintArray, int, 5>(environment, cutoffVelocity, 127, readInts);
  const auto frequencies = javaArray<jfloatArray, float, 5>(
      environment, eqFrequencies, 1000.0f, readFloats);
  const auto gains = javaArray<jfloatArray, float, 5>(environment, eqGains, 0.0f, readFloats);
  const auto qualities = javaArray<jfloatArray, float, 5>(
      environment, eqQualities, 0.7071f, readFloats);
  const auto cutStages = javaArray<jintArray, int, 5>(environment, eqCutStages, 1, readInts);
  return gEngine.configureModuleEffects(
             static_cast<std::size_t>(moduleIndex), cutoffHz, velocity,
             cutoffFilterType, cutoffEnvelopeEnabled == JNI_TRUE, cutoffEnvelopeAttackMs,
             cutoffEnvelopeDecayMs, cutoffEnvelopeSustain, cutoffEnvelopeReleaseMs, cutoffEnvelopeDepthOctaves,
             types, frequencies, gains, qualities,
             cutStages, compressorThresholdDb, compressorRatio, compressorAttackMs,
             compressorReleaseMs, compressorGainDb, compressorMix, delaySync == JNI_TRUE,
             delayMs, delayBeatMultiplier, delayFeedback, delayMix, reverbDecay, reverbDampen,
             reverbMod, reverbSize, reverbMix, rotaryEnabled == JNI_TRUE, rotarySpeed,
             rotarySlowHz, rotaryFastHz, rotaryRampSeconds, rotaryDepth, rotaryMix,
             rotaryModulationEnabled == JNI_TRUE,
             chorusEnabled == JNI_TRUE, chorusRateHz, chorusDepth, chorusMix,
             autoFaderEnabled == JNI_TRUE, autoFaderBeats, autoFaderDepthDb, inputGainDb)
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureModuleEnvelope(
    JNIEnv*, jclass, jint moduleIndex, jfloat attackMs, jfloat holdMs,
    jfloat decayMs, jfloat releaseMs, jfloat glideMs, jfloat sustainDb) {
  return gEngine.configureModuleEnvelope(
             static_cast<std::size_t>(moduleIndex), attackMs, holdMs, decayMs, releaseMs, glideMs,
             sustainDb)
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureVelocityLimits(
    JNIEnv*, jclass, jint moduleIndex, jint ignoreAbove, jint ceiling,
    jint oscillator1Limit, jint oscillator2Limit, jint oscillator3Limit) {
  if (moduleIndex < 0) return JNI_FALSE;
  const auto limit = [](jint value) { return static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 127)); };
  return gEngine.configureVelocityLimits(static_cast<std::size_t>(moduleIndex), limit(ignoreAbove),
             limit(ceiling), limit(oscillator1Limit), limit(oscillator2Limit), limit(oscillator3Limit)) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureGlide(
    JNIEnv*, jclass, jint moduleIndex, jboolean portamento, jboolean velocityGateEnabled,
    jboolean velocityGateInverted, jint velocityThreshold) {
  if (moduleIndex < 0) return JNI_FALSE;
  hook_keys::GlideBehavior behavior;
  behavior.portamento = portamento == JNI_TRUE;
  behavior.velocityGateEnabled = velocityGateEnabled == JNI_TRUE;
  behavior.velocityGateInverted = velocityGateInverted == JNI_TRUE;
  behavior.velocityThreshold = static_cast<std::uint8_t>(std::clamp(static_cast<int>(velocityThreshold), 0, 127));
  return gEngine.configureGlide(static_cast<std::size_t>(moduleIndex), behavior) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureModuleModulation(
    JNIEnv*, jclass, jint moduleIndex, jint mode, jfloat rateHz, jfloat intensity) {
  return gEngine.configureModuleModulation(
             static_cast<std::size_t>(moduleIndex),
             static_cast<std::uint8_t>(std::clamp(static_cast<int>(mode), 0, 4)), rateHz, intensity)
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureSynth(
    JNIEnv*, jclass, jint oscillator1, jint oscillator2, jint oscillator3, jboolean oscillator1Enabled,
    jboolean oscillator2Enabled, jboolean oscillator3Enabled, jint voiceMode, jint lfoTarget,
    jfloat oscillator1Volume, jfloat oscillator2Volume, jfloat oscillator3Volume,
    jfloat oscillator1DetuneCents, jfloat oscillator2DetuneCents, jfloat oscillator3DetuneCents, jfloat attackMs,
    jfloat holdMs, jfloat decayMs, jfloat sustain, jfloat releaseMs,
    jfloat filterCutoffHz, jfloat filterResonance, jfloat filterEnvelope,
    jfloat lfoRateHz, jfloat lfoDepth, jfloat glideMs, jint oscillator1Octave, jint oscillator2Octave, jint oscillator3Octave) {
  return gEngine.configureSynth(
             oscillator1, oscillator2, oscillator3, oscillator1Enabled == JNI_TRUE,
             oscillator2Enabled == JNI_TRUE, oscillator3Enabled == JNI_TRUE, voiceMode, lfoTarget, oscillator1Volume, oscillator2Volume, oscillator3Volume,
             oscillator1DetuneCents, oscillator2DetuneCents, oscillator3DetuneCents,
             attackMs, holdMs, decayMs, sustain, releaseMs,
             filterCutoffHz, filterResonance, filterEnvelope, lfoRateHz,
             lfoDepth, glideMs, oscillator1Octave, oscillator2Octave, oscillator3Octave)
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetTempo(JNIEnv*, jclass, jfloat bpm) {
  return gEngine.setTempo(bpm) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetGlobalTranspose(JNIEnv*, jclass, jint semitones) {
  return gEngine.setGlobalTranspose(static_cast<int>(semitones)) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetMetronomeOutput(
    JNIEnv*, jclass, jint channelStart, jint channelCount) {
  return gEngine.setMetronomeOutput(static_cast<int>(channelStart), static_cast<int>(channelCount)) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureMetronome(
    JNIEnv*, jclass, jboolean enabled, jfloat bpm, jfloat volume, jint clickSound,
    jboolean accentEnabled, jboolean doubleTimeEnabled, jint numerator) {
  return gEngine.configureMetronome(
             enabled == JNI_TRUE, bpm, volume, clickSound,
             accentEnabled == JNI_TRUE, doubleTimeEnabled == JNI_TRUE, numerator)
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetOutputGain(
    JNIEnv*, jclass, jfloat db, jboolean enabled, jint channelStart, jint channelCount) {
  return gEngine.setOutputGain(db, enabled == JNI_TRUE, channelStart, channelCount)
      ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeStopAllNotes(JNIEnv*, jclass) {
  gEngine.stopAllNotes();
}
