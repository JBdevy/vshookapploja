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
#include <mutex>
#include <string>

namespace {

constexpr const char* kLogTag = "HookKeysNative";
constexpr std::size_t kRenderChunkFrames = 512;

class AndroidAudioEngine final {
public:
  bool start(int requestedBufferFrames, int requestedDeviceId = AAUDIO_UNSPECIFIED,
             int requestedChannels = 2) noexcept {
    std::scoped_lock lock(controlMutex_);
    if (stream_ != nullptr && runtime_ != nullptr) return true;
    requestedChannels = std::clamp(requestedChannels, 1, 32);
    auto result = openStream(requestedBufferFrames, requestedDeviceId, requestedChannels,
                             AAUDIO_SHARING_MODE_EXCLUSIVE);
    if (result != AAUDIO_OK) {
      result = openStream(requestedBufferFrames, requestedDeviceId, requestedChannels,
                          AAUDIO_SHARING_MODE_SHARED);
    }
    if (result != AAUDIO_OK || stream_ == nullptr) {
      stream_ = nullptr;
      return false;
    }

    channelCount_ = std::clamp(AAudioStream_getChannelCount(stream_), 1, 32);
    const auto sampleRate = static_cast<double>(AAudioStream_getSampleRate(stream_));
    runtime_ = std::make_unique<hook_keys::NativeEngineRuntime>(sampleRate, kRenderChunkFrames);
    activeRuntime_.store(runtime_.get(), std::memory_order_release);
    result = AAudioStream_requestStart(stream_);
    if (result != AAUDIO_OK) {
      activeRuntime_.store(nullptr, std::memory_order_release);
      runtime_.reset();
      AAudioStream_close(stream_);
      stream_ = nullptr;
      return false;
    }
    return true;
  }

  void stop() noexcept {
    std::scoped_lock lock(controlMutex_);
    activeRuntime_.store(nullptr, std::memory_order_release);
    if (stream_ != nullptr) {
      AAudioStream_requestStop(stream_);
      AAudioStream_close(stream_);
      stream_ = nullptr;
    }
    runtime_.reset();
    channelCount_ = 2;
  }

  bool loadSoundFont(std::size_t moduleIndex, const char* path) noexcept {
    std::scoped_lock lock(controlMutex_);
    return runtime_ != nullptr && runtime_->loadSoundFont(moduleIndex, path);
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

  bool configureModule(
      std::size_t moduleIndex,
      bool enabled,
      std::uint8_t inputSlot,
      std::uint8_t lowNote,
      std::uint8_t highNote,
      std::int8_t octave,
      bool sustain,
      bool modulation,
      float volumeDb,
      int polyphony,
      int outputChannelStart,
      int outputChannelCount) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    hook_keys::ModuleConfig config;
    config.enabled = enabled;
    config.midiInputSlot = inputSlot >= hook_keys::kMidiInputCount
                               ? hook_keys::kAllMidiInputs
                               : inputSlot;
    config.lowNote = lowNote;
    config.highNote = highNote;
    config.octaveShift = octave;
    config.sustainInputEnabled = sustain;
    config.modulationInputEnabled = modulation;
    config.gainLinear = volumeDb <= -60.0f ? 0.0f : std::pow(10.0f, volumeDb / 20.0f);
    config.polyphony = static_cast<std::uint16_t>(std::clamp(polyphony, 1, 128));
    config.outputChannelStart = static_cast<std::uint8_t>(std::clamp(outputChannelStart, 0, 31));
    config.outputChannelCount = outputChannelCount == 1 ? 1 : 2;
    return runtime->setModuleConfig(moduleIndex, config);
  }

  bool configureModuleEffects(
      std::size_t moduleIndex,
      float cutoffHz,
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
      float reverbSize,
      float reverbMix) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    hook_keys::ModuleEffectsConfig effects;
    effects.cutoff.enabled = true;
    effects.cutoff.frequencyHz = cutoffHz;
    effects.equalizer.enabled = true;
    for (std::size_t index = 0; index < effects.equalizer.bands.size(); ++index) {
      auto& band = effects.equalizer.bands[index];
      band.enabled = true;
      band.type = static_cast<hook_keys::EqBandType>(std::clamp(eqTypes[index], 0, 4));
      band.frequencyHz = eqFrequencies[index];
      band.gainDb = eqGains[index];
      band.quality = eqQualities[index];
      band.cutStages = static_cast<std::uint8_t>(std::clamp(eqCutStages[index], 1, 8));
    }
    effects.compressor = {true, compressorThresholdDb, compressorRatio, compressorAttackMs,
                          compressorReleaseMs, compressorGainDb, compressorMix};
    effects.delay = {true, delaySync, delayMs, delayBeatMultiplier, delayFeedback, delayMix};
    effects.reverb = {true, reverbDecay, reverbDampen, reverbSize, reverbMix};
    return runtime->setModuleEffects(moduleIndex, effects);
  }

  bool configureModuleEnvelope(
      std::size_t moduleIndex, float attackMs, float holdMs,
      float decayMs, float releaseMs) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setModuleEnvelope(
        moduleIndex, attackMs, holdMs, decayMs, releaseMs);
  }

  bool setTempo(float bpm) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    return runtime != nullptr && runtime->setTempo(bpm);
  }

  bool setOutputGain(float db, bool enabled) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (runtime == nullptr) return false;
    runtime->setOutputGainDb(db, enabled);
    return true;
  }

  void stopAllNotes() noexcept {
    if (auto* runtime = activeRuntime_.load(std::memory_order_acquire); runtime != nullptr) {
      runtime->stopAllNotes();
    }
  }

private:
  aaudio_result_t openStream(int requestedBufferFrames, int requestedDeviceId,
                             int requestedChannels, aaudio_sharing_mode_t sharingMode) noexcept {
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
    AAudioStreamBuilder_setSampleRate(builder, AAUDIO_UNSPECIFIED);
    AAudioStreamBuilder_setFramesPerDataCallback(
        builder, std::clamp(requestedBufferFrames, 32, static_cast<int>(kRenderChunkFrames)));
    AAudioStreamBuilder_setDataCallback(builder, &AndroidAudioEngine::dataCallback, this);
    AAudioStreamBuilder_setErrorCallback(builder, &AndroidAudioEngine::errorCallback, this);
    const auto result = AAudioStreamBuilder_openStream(builder, &stream_);
    AAudioStreamBuilder_delete(builder);
    return result;
  }

  static aaudio_data_callback_result_t dataCallback(
      AAudioStream*, void* userData, void* audioData, int32_t frames) noexcept {
    return static_cast<AndroidAudioEngine*>(userData)->render(static_cast<float*>(audioData), frames);
  }

  static void errorCallback(AAudioStream*, void*, aaudio_result_t error) noexcept {
    __android_log_print(ANDROID_LOG_ERROR, kLogTag, "AAudio stream error: %s", AAudio_convertResultToText(error));
  }

  aaudio_data_callback_result_t render(float* interleaved, int32_t frameCount) noexcept {
    auto* runtime = activeRuntime_.load(std::memory_order_acquire);
    if (interleaved == nullptr || frameCount <= 0) return AAUDIO_CALLBACK_RESULT_CONTINUE;
    if (runtime == nullptr) {
      std::fill_n(interleaved, static_cast<std::size_t>(frameCount) * channelCount_, 0.0f);
      return AAUDIO_CALLBACK_RESULT_CONTINUE;
    }
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
  std::unique_ptr<hook_keys::NativeEngineRuntime> runtime_;
  std::atomic<hook_keys::NativeEngineRuntime*> activeRuntime_{nullptr};
  std::size_t channelCount_ = 2;
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
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeStart(JNIEnv*, jclass, jint bufferFrames) {
  return gEngine.start(bufferFrames) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeRestart(
    JNIEnv*, jclass, jint bufferFrames, jint deviceId, jint channels) {
  gEngine.stop();
  if (gEngine.start(bufferFrames, deviceId, channels)) return JNI_TRUE;
  static_cast<void>(gEngine.start(bufferFrames));
  return JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeStop(JNIEnv*, jclass) {
  gEngine.stop();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeLoadSoundFont(
    JNIEnv* environment, jclass, jint moduleIndex, jstring path) {
  const auto nativePath = javaString(environment, path);
  return gEngine.loadSoundFont(static_cast<std::size_t>(moduleIndex), nativePath.c_str()) ? JNI_TRUE : JNI_FALSE;
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
    jfloat volumeDb,
    jint polyphony,
    jint outputChannelStart,
    jint outputChannelCount) {
  return gEngine.configureModule(
             static_cast<std::size_t>(moduleIndex),
             enabled == JNI_TRUE,
             static_cast<std::uint8_t>(inputSlot),
             static_cast<std::uint8_t>(lowNote),
             static_cast<std::uint8_t>(highNote),
             static_cast<std::int8_t>(octave),
             sustain == JNI_TRUE,
             modulation == JNI_TRUE,
             volumeDb,
             static_cast<int>(polyphony),
             static_cast<int>(outputChannelStart),
             static_cast<int>(outputChannelCount))
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureModuleEffects(
    JNIEnv* environment,
    jclass,
    jint moduleIndex,
    jfloat cutoffHz,
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
    jfloat reverbSize,
    jfloat reverbMix) {
  const auto readInts = [](JNIEnv* env, jintArray source, jsize start, jsize count, int* target) {
    env->GetIntArrayRegion(source, start, count, reinterpret_cast<jint*>(target));
  };
  const auto readFloats = [](JNIEnv* env, jfloatArray source, jsize start, jsize count, float* target) {
    env->GetFloatArrayRegion(source, start, count, reinterpret_cast<jfloat*>(target));
  };
  const auto types = javaArray<jintArray, int, 5>(environment, eqTypes, 2, readInts);
  const auto frequencies = javaArray<jfloatArray, float, 5>(
      environment, eqFrequencies, 1000.0f, readFloats);
  const auto gains = javaArray<jfloatArray, float, 5>(environment, eqGains, 0.0f, readFloats);
  const auto qualities = javaArray<jfloatArray, float, 5>(
      environment, eqQualities, 0.7071f, readFloats);
  const auto cutStages = javaArray<jintArray, int, 5>(environment, eqCutStages, 1, readInts);
  return gEngine.configureModuleEffects(
             static_cast<std::size_t>(moduleIndex), cutoffHz, types, frequencies, gains, qualities,
             cutStages, compressorThresholdDb, compressorRatio, compressorAttackMs,
             compressorReleaseMs, compressorGainDb, compressorMix, delaySync == JNI_TRUE,
             delayMs, delayBeatMultiplier, delayFeedback, delayMix, reverbDecay, reverbDampen,
             reverbSize, reverbMix)
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeConfigureModuleEnvelope(
    JNIEnv*, jclass, jint moduleIndex, jfloat attackMs, jfloat holdMs,
    jfloat decayMs, jfloat releaseMs) {
  return gEngine.configureModuleEnvelope(
             static_cast<std::size_t>(moduleIndex), attackMs, holdMs, decayMs, releaseMs)
             ? JNI_TRUE
             : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetTempo(JNIEnv*, jclass, jfloat bpm) {
  return gEngine.setTempo(bpm) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeSetOutputGain(
    JNIEnv*, jclass, jfloat db, jboolean enabled) {
  return gEngine.setOutputGain(db, enabled == JNI_TRUE) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_hookdeveloper_hookkeys_HookKeysNativePlugin_nativeStopAllNotes(JNIEnv*, jclass) {
  gEngine.stopAllNotes();
}
