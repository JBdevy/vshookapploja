#pragma once

#include "hook_keys/AnalogSynthModule.hpp"
#include "hook_keys/HookKeysEngine.hpp"
#include "hook_keys/TinySoundFontModule.hpp"
#include "hook_keys/TrackPlayer.hpp"

#include <array>
#include <atomic>
#include <vector>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

namespace hook_keys {

// Platform-neutral owner used by the Android and iOS audio callbacks.
// File loading stays on a control thread; render() is the only audio-thread API.
class NativeEngineRuntime final {
public:
  explicit NativeEngineRuntime(double sampleRate, std::size_t maximumBlockFrames = 512);
  ~NativeEngineRuntime();

  NativeEngineRuntime(const NativeEngineRuntime&) = delete;
  NativeEngineRuntime& operator=(const NativeEngineRuntime&) = delete;

  [[nodiscard]] bool loadSoundFont(std::size_t moduleIndex, const char* utf8Path) noexcept;
  [[nodiscard]] bool cloneSoundFont(
      std::size_t sourceModuleIndex, std::size_t targetModuleIndex) noexcept;
  void unloadSoundFont(std::size_t moduleIndex) noexcept;
  void collectRetiredSoundFonts() noexcept;
  // Control thread: create an independent preset layer, sharing sample data
  // only. The audio callback keeps the previous voices/effects until silent.
  [[nodiscard]] bool beginPresetTransition() noexcept;
  [[nodiscard]] bool commitPresetTransition() noexcept;
  // O cache de SF2 retem bancos de amostras inteiros: um SoundFont de 480 MB
  // ocupa 458 MB. Sem teto, alternar timbres empurrava o banco em uso para o
  // disco e o callback passava a travar em I/O. O host informa o orcamento a
  // partir da RAM fisica do aparelho.
  static constexpr std::size_t kDefaultSoundFontCacheBytes = 384u * 1024u * 1024u;
  void setSeamlessPresetSwitching(
      bool enabled, std::size_t cacheBudgetBytes = kDefaultSoundFontCacheBytes) noexcept;

  [[nodiscard]] bool sendMidi(
      std::uint8_t inputSlot,
      std::uint8_t status,
      std::uint8_t data1,
      std::uint8_t data2,
      std::uint64_t timestampNanoseconds = 0) noexcept;
  [[nodiscard]] bool setModuleConfig(std::size_t moduleIndex, ModuleConfig config) noexcept;
  [[nodiscard]] bool setModuleGainDb(std::size_t moduleIndex, float db) noexcept;
  [[nodiscard]] bool setModuleEffects(std::size_t moduleIndex, ModuleEffectsConfig effects) noexcept;
  [[nodiscard]] bool setModuleEnvelope(
      std::size_t moduleIndex, float attackMs, float holdMs,
      float decayMs, float releaseMs, float glideMs = 0.0f) noexcept;
  [[nodiscard]] bool setSynthConfig(AnalogSynthConfig config) noexcept;
  // mode: 0 User, 1 LFO de pitch, 2 Tremolo.
  [[nodiscard]] bool setModuleModulationMode(std::size_t moduleIndex, std::uint8_t mode, float rateHz) noexcept;
  // Modules 0-6 (SF2) and 7 (Synth).
  [[nodiscard]] bool setGlideBehavior(std::size_t moduleIndex, GlideBehavior behavior) noexcept;
  // Modules 0-6: Limite Velocity and limiter. Module 7 (Synth): per-oscillator limits.
  [[nodiscard]] bool setVelocityLimits(
      std::size_t moduleIndex, std::uint8_t ignoreAbove, std::uint8_t ceiling,
      std::uint8_t oscillator1Limit = 127, std::uint8_t oscillator2Limit = 127) noexcept;
  [[nodiscard]] bool setTempo(float bpm) noexcept;
  void setMetronome(
      bool enabled, float bpm, float volume, std::uint8_t clickSound,
      bool accentEnabled, bool doubleTimeEnabled,
      std::uint8_t timeSignatureNumerator) noexcept;
  // Saída do metrônomo: primeiro canal (0 = saídas 1+2) e 1 (mono) ou 2 (estéreo).
  void setMetronomeOutput(std::uint8_t channelStart, std::uint8_t channelCount) noexcept {
    metronomeOutputStart_.store(std::min<std::uint8_t>(channelStart, 31), std::memory_order_release);
    metronomeOutputCount_.store(channelCount == 1 ? 1 : 2, std::memory_order_release);
  }
  void setOutputGainDb(float db, bool enabled) noexcept;
  // Músicas: tocam no mesmo callback, com saída e volume próprios.
  [[nodiscard]] TrackPlayer& tracks() noexcept { return *tracks_; }
  void stopAllNotes() noexcept;
  void setMidiInputEnabled(bool enabled) noexcept;
  void setCompatibilityMode(bool enabled) noexcept { compatibilityMode_.store(enabled, std::memory_order_release); }
  bool setTranceGate(std::size_t moduleIndex, ModuleEffectsConfig::TranceGateConfig config) noexcept;
  void render(float* left, float* right, std::size_t frames) noexcept;
  void renderInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept;

  [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }
  [[nodiscard]] HookKeysEngine::ModulePeaks consumeModulePeaks() noexcept;
  [[nodiscard]] HookKeysEngine::ModuleAnalysis consumeModuleAnalysis(
      std::size_t moduleIndex) noexcept;
  [[nodiscard]] std::size_t maximumBlockFrames() const noexcept { return maximumBlockFrames_; }

  // Custo real do callback de audio medido contra o prazo do bloco. E o unico
  // numero que denuncia um estouro: a CPU total da maquina fica baixa tanto
  // quando uma thread satura um nucleo entre doze quanto quando ela trava
  // esperando disco.
  struct AudioLoad final {
    float peak = 0.0f;          // pior bloco desde a ultima leitura; 1.0 = prazo inteiro
    float smoothed = 0.0f;      // media suavizada, para um numero legivel
    std::uint32_t overruns = 0; // blocos que estouraram o prazo desde a ultima leitura
  };
  [[nodiscard]] AudioLoad consumeAudioLoad() noexcept;

private:
  void retainSoundFontLocked(const std::string& path, TinySoundFontModule& source) noexcept;
  void touchSoundFontCacheLocked(const std::string& path) noexcept;
  void trimSoundFontCacheLocked() noexcept;
  void publishAudioLoad(float load) noexcept;
  static HookKeysEngine::SynthModules modulePointers(
      const std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount - 1>& modules,
      AnalogSynthModule* synth) noexcept;

  double sampleRate_ = 48000.0;
  std::size_t maximumBlockFrames_ = 512;
  struct PresetLayer final {
    std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount - 1> modules{};
    std::unique_ptr<AnalogSynthModule> synth;
    std::unique_ptr<HookKeysEngine> engine;
    std::array<ModuleConfig, kModuleCount> configs{};
    std::size_t silentFrames = 0;
  };
  struct RuntimeCommand final {
    enum class Kind : std::uint8_t { midi, transition, panic } kind = Kind::midi;
    MidiMessage midi{};
    PresetLayer* layer = nullptr;
  };
  static constexpr std::size_t kMaximumPresetLayers = 16;
  std::unique_ptr<PresetLayer> createPresetLayer();
  void processRuntimeCommands() noexcept;
  void collectLayersLocked() noexcept;
  std::vector<std::unique_ptr<PresetLayer>> layers_;
  PresetLayer* controlLayer_ = nullptr; // guarded by control mutexes
  PresetLayer* pendingTransitionLayer_ = nullptr;
  PresetLayer* renderLayer_ = nullptr; // audio thread only
  std::array<PresetLayer*, kMaximumPresetLayers - 1> tailLayers_{};
  std::size_t tailLayerCount_ = 0;
  RealtimeCommandQueue<RuntimeCommand, 2048> runtimeCommands_;
  RealtimeCommandQueue<PresetLayer*, 32> retiredLayers_;
  std::vector<float> layerScratch_;
  std::vector<float> stereoScratch_;
  struct LiveExpression final {
    int sustain = -1;
    int modulation = -1;
    int pitch = -1;
  };
  std::array<LiveExpression, kRoutableMidiInputCount> liveExpression_{}; // audio thread only
  std::mutex configMutex_;
  std::mutex soundFontMutex_;
  bool seamlessPresetSwitching_ = false;
  std::array<std::string, kModuleCount - 1> currentSoundFontPaths_{};
  std::unordered_map<std::string, std::unique_ptr<TinySoundFontModule>> soundFontCache_;
  std::vector<std::string> soundFontCacheOrder_; // menos usado no inicio
  std::size_t soundFontCacheBudgetBytes_ = kDefaultSoundFontCacheBytes;
  std::atomic<float> audioLoadPeak_{0.0f};
  std::atomic<float> audioLoadSmoothed_{0.0f};
  std::atomic<std::uint32_t> audioLoadOverruns_{0};
  float audioLoadAverage_ = 0.0f; // audio thread only
  std::atomic<bool> midiInputEnabled_{true};
  std::atomic<bool> compatibilityMode_{false};
  std::atomic<bool> metronomeEnabled_{false};
  std::atomic<std::uint8_t> metronomeOutputStart_{0};
  std::atomic<std::uint8_t> metronomeOutputCount_{2};
  std::atomic<float> metronomeBpm_{120.0f};
  std::atomic<float> metronomeVolume_{1.0f};
  std::atomic<std::uint8_t> metronomeClickSound_{1};
  std::atomic<bool> metronomeAccentEnabled_{false};
  std::atomic<bool> metronomeDoubleTimeEnabled_{false};
  std::atomic<std::uint8_t> metronomeNumerator_{4};
  bool metronomeWasEnabled_ = false;
  double metronomeFramesUntilBeat_ = 0.0;
  std::size_t metronomeBeatIndex_ = 0;
  std::size_t metronomeClickFrame_ = 0;
  std::size_t metronomeClickLength_ = 0;
  float metronomeClickFrequency_ = 1350.0f;
  float metronomeClickAmplitude_ = 0.0f;
  std::uint8_t metronomeClickWaveform_ = 1;
  std::unique_ptr<TrackPlayer> tracks_;
  std::atomic<float> outputGainLinear_{1.0f};
  float currentOutputGain_ = 1.0f;
  float outputGainTargetSeen_ = 1.0f;
  float outputGainStep_ = 0.0f;
  std::size_t outputGainRampFrames_ = 0;
  [[nodiscard]] bool beginMetronomeBlock() noexcept;
  void addMetronome(float* left, float* right, std::size_t frames) noexcept;
  void addMetronomeInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept;
  [[nodiscard]] float renderMetronomeSample() noexcept;
  [[nodiscard]] float nextOutputGain() noexcept;
};

} // namespace hook_keys
