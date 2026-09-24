#pragma once

#include "hook_keys/AnalogSynthModule.hpp"
#include "hook_keys/HookKeysEngine.hpp"
#include "hook_keys/OrganModule.hpp"
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
  [[nodiscard]] bool beginPresetTransition(bool preserveConfig = false) noexcept;
  [[nodiscard]] bool commitPresetTransition() noexcept;
  void cancelPresetTransition() noexcept;
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
  [[nodiscard]] bool setModuleEnabledMask(std::uint8_t mask) noexcept;
  [[nodiscard]] bool setModuleEffects(std::size_t moduleIndex, ModuleEffectsConfig effects) noexcept;
  [[nodiscard]] bool setOrganRotaryFast(bool fast) noexcept;
  [[nodiscard]] bool setOrganCabinetEnabled(bool enabled) noexcept;
  // sustainDb: 0 dB segura o som cheio depois do Decay; abaixo disso a nota
  // cai até esse nível e fica nele enquanto a tecla estiver presa.
  [[nodiscard]] bool setModuleEnvelope(
      std::size_t moduleIndex, float attackMs, float holdMs,
      float decayMs, float releaseMs, float glideMs = 0.0f, float sustainDb = 0.0f) noexcept;
  [[nodiscard]] bool setSynthConfig(AnalogSynthConfig config) noexcept;
  // mode: 0 User, 1 LFO de pitch, 2 Tremolo.
  [[nodiscard]] bool setModuleModulationMode(
      std::size_t moduleIndex, std::uint8_t mode, float rateHz, float intensity = 1.0f) noexcept;
  // Modules 0-6 (SF2) and 7 (Synth).
  [[nodiscard]] bool setGlideBehavior(std::size_t moduleIndex, GlideBehavior behavior) noexcept;
  // Modules 0-6: Limite Velocity and limiter. Module 7 (Synth): per-oscillator limits.
  [[nodiscard]] bool setVelocityLimits(
      std::size_t moduleIndex, std::uint8_t ignoreAbove, std::uint8_t ceiling,
      std::uint8_t oscillator1Limit = 127, std::uint8_t oscillator2Limit = 127,
      std::uint8_t oscillator3Limit = 127) noexcept;
  [[nodiscard]] bool setTempo(float bpm) noexcept;
  [[nodiscard]] bool setGlobalTranspose(int semitones) noexcept;
  void setMetronome(
      bool enabled, float bpm, float volume, std::uint8_t clickSound,
      bool accentEnabled, bool doubleTimeEnabled,
      std::uint8_t timeSignatureNumerator, std::uint8_t timeSignatureDenominator,
      bool restart = false) noexcept;
  // Saída do metrônomo: primeiro canal (0 = saídas 1+2) e 1 (mono) ou 2 (estéreo).
  void setMetronomeOutput(std::uint8_t channelStart, std::uint8_t channelCount) noexcept {
    metronomeOutputStart_.store(std::min<std::uint8_t>(channelStart, 31), std::memory_order_release);
    metronomeOutputCount_.store(channelCount == 1 ? 1 : 2, std::memory_order_release);
  }
  void setOutputGainDb(float db, bool enabled,
      std::uint8_t channelStart = 0, std::uint8_t channelCount = 2) noexcept;
  // Músicas: tocam no mesmo callback, com saída e volume próprios.
  [[nodiscard]] TrackPlayer& tracks() noexcept { return *tracks_; }
  void stopAllNotes() noexcept;
  void setMidiInputEnabled(bool enabled) noexcept;
  void setCompatibilityMode(bool enabled) noexcept { compatibilityMode_.store(enabled, std::memory_order_release); }
  bool setTranceGate(std::size_t moduleIndex, ModuleEffectsConfig::TranceGateConfig config) noexcept;
  // Bronze B3: os nove SF2 dos drawbars, fixos e compartilhados por todo
  // preset (carregados uma vez só, nunca por camada — são ~200 MB juntos).
  // drawbarIndex vai de 0 (16') a 8 (1'), a mesma ordem do app.
  [[nodiscard]] bool loadOrganVoice(std::size_t drawbarIndex, const char* utf8Path) noexcept;
  void setOrganDrawbarPosition(std::size_t drawbarIndex, std::uint8_t position) noexcept;
  // Bancos fixos dos Pads. O Pad 1 usa as doze notas C3-B3 (MIDI 60-71)
  // e vive em um barramento próprio, sem consumir nenhum dos oito módulos.
  [[nodiscard]] bool loadPadBank(std::size_t bankIndex, const char* utf8Path) noexcept;
  [[nodiscard]] bool setPadNote(
      std::size_t bankIndex, std::uint8_t note, bool enabled,
      std::uint8_t velocity = 127) noexcept;
  void setPadOutput(float db, bool enabled,
      std::uint8_t channelStart = 0, std::uint8_t channelCount = 2,
      float lowCutHz = 20.0f, float highCutHz = 20000.0f) noexcept;
  // Canal MIDI 10: a associação aprendida vive no runtime para que o callback
  // do Core MIDI/Android MIDI/Midir não precise consultar a interface web.
  // kind: 0 limpa, 1 Pad contínuo, 2 FX. mode do FX: 0 one-shot, 1 toggle,
  // 2 gate enquanto pressionado.
  void clearPerformanceMappings() noexcept;
  void setPerformanceMapping(std::uint8_t midiNote, std::uint8_t kind,
      std::uint8_t bankIndex, std::uint8_t itemIndex, std::uint8_t mode,
      float gainDb = 0.0f) noexcept;
  // O arquivo é decodificado uma vez fora da thread de áudio. O runtime faz
  // somente leitura de PCM pré-alocado durante a performance.
  static constexpr std::size_t kEffectSampleCount = 8 * 12;
  [[nodiscard]] bool loadEffectSample(std::size_t sampleIndex,
      const float* stereoInterleaved, std::size_t frames, double sourceSampleRate) noexcept;
  void clearEffectSample(std::size_t sampleIndex) noexcept;
  [[nodiscard]] bool triggerEffectSample(
      std::size_t sampleIndex, bool enabled, float gainDb = 0.0f) noexcept;
  void setEffectOutput(float db, bool enabled,
      std::uint8_t channelStart = 0, std::uint8_t channelCount = 2) noexcept;
  void render(float* left, float* right, std::size_t frames) noexcept;
  void renderInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept;

  [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }
  [[nodiscard]] HookKeysEngine::ModulePeaks consumeModulePeaks() noexcept;
  [[nodiscard]] std::array<float, 2> consumeMasterPeaks() noexcept;
  [[nodiscard]] std::array<float, 2> consumeTrackPeaks() noexcept { return tracks_->consumePeaks(); }
  [[nodiscard]] std::array<float, 2> consumeMetronomePeaks() noexcept;
  [[nodiscard]] std::array<float, 2> consumePadPeaks() noexcept;
  [[nodiscard]] std::array<float, 2> consumeEffectPeaks() noexcept;
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
  struct PresetLayer;
  void retainSoundFontLocked(const std::string& path, TinySoundFontModule& source) noexcept;
  void touchSoundFontCacheLocked(const std::string& path) noexcept;
  void trimSoundFontCacheLocked() noexcept;
  void enqueueCurrentExpression(PresetLayer* layer) noexcept;
  void publishAudioLoad(float load) noexcept;
  HookKeysEngine::SynthModules modulePointers(
      const std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount - 1>& modules,
      AnalogSynthModule* synth) noexcept;

  double sampleRate_ = 48000.0;
  std::size_t maximumBlockFrames_ = 512;
  // Módulo 7 (índice 6): o Organ não mora no array acima. Uma instância só,
  // dividida entre todas as camadas de preset — ver o comentário da classe.
  std::unique_ptr<OrganModule> organModule_;
  struct PresetLayer final {
    std::array<std::unique_ptr<TinySoundFontModule>, kModuleCount - 1> modules{};
    std::unique_ptr<AnalogSynthModule> synth;
    std::unique_ptr<HookKeysEngine> engine;
    std::array<ModuleConfig, kModuleCount> configs{};
    AnalogSynthConfig synthConfig{};
    std::size_t silentFrames = 0;
  };
  struct RuntimeCommand final {
    enum class Kind : std::uint8_t { midi, transition, panic, padNote, performance, effect } kind = Kind::midi;
    MidiMessage midi{};
    PresetLayer* layer = nullptr;
    std::uint32_t packed = 0;
    float value = 0.0f;
  };
  static constexpr std::size_t kMaximumPresetLayers = 16;
  std::unique_ptr<PresetLayer> createPresetLayer();
  void processRuntimeCommands() noexcept;
  void collectLayersLocked() noexcept;
  std::vector<std::unique_ptr<PresetLayer>> layers_;
  PresetLayer* controlLayer_ = nullptr; // guarded by control mutexes
  PresetLayer* pendingTransitionLayer_ = nullptr;
  PresetLayer* previousControlLayer_ = nullptr;
  std::array<std::string, kModuleCount - 1> previousSoundFontPaths_{};
  PresetLayer* renderLayer_ = nullptr; // audio thread only
  std::array<PresetLayer*, kMaximumPresetLayers - 1> tailLayers_{};
  std::size_t tailLayerCount_ = 0;
  RealtimeCommandQueue<RuntimeCommand, 2048> runtimeCommands_;
  RealtimeCommandQueue<PresetLayer*, 32> retiredLayers_;
  std::vector<float> layerScratch_;
  std::vector<float> stereoScratch_;
  std::array<std::unique_ptr<TinySoundFontModule>, 2> padModules_;
  std::vector<float> padLeftScratch_;
  std::vector<float> padRightScratch_;
  // Mapping compactado: kind(2), bank(3), item(4), mode(2), gain em décimos
  // de dB com offset. Um load atômico basta na thread que recebe o MIDI.
  std::array<std::atomic<std::uint32_t>, 128> performanceMappings_{};
  int activePadBank_ = -1; // audio thread only
  int activePadNote_ = -1; // audio thread only
  struct EffectSample final { std::vector<float> stereo; };
  struct EffectVoice final {
    const EffectSample* sample = nullptr;
    std::size_t frame = 0;
    float gain = 1.0f;
    float fade = 1.0f;
    bool releasing = false;
    std::uint8_t sampleIndex = 0;
    std::uint64_t serial = 0;
  };
  static constexpr std::size_t kEffectVoiceCount = 32;
  std::mutex effectSampleMutex_;
  // Gerações antigas são retidas para garantir que nenhum ponteiro lido pelo
  // callback seja invalidado durante uma troca de arquivo.
  std::vector<std::unique_ptr<EffectSample>> effectSampleOwners_;
  std::array<std::atomic<const EffectSample*>, kEffectSampleCount> effectSamples_{};
  std::array<EffectVoice, kEffectVoiceCount> effectVoices_{}; // audio thread only
  std::array<bool, kEffectSampleCount> effectToggleActive_{}; // audio thread only
  std::uint64_t effectVoiceSerial_ = 0;
  std::atomic<float> effectGainLinear_{1.0f};
  float currentEffectGain_ = 1.0f;
  float effectGainTargetSeen_ = 1.0f;
  float effectGainStep_ = 0.0f;
  std::size_t effectGainRampFrames_ = 0;
  std::atomic<std::uint16_t> effectOutputRoute_{2u << 8};
  std::array<std::atomic<float>, 2> effectPeaks_{};
  struct LiveExpression final {
    int sustain = -1;
    int modulation = -1;
    int pitch = -1;
  };
  std::array<LiveExpression, kRoutableMidiInputCount> liveExpression_{}; // audio thread only
  struct CurrentExpression final {
    std::atomic<int> sustain{-1};
    std::atomic<int> modulation{-1};
    std::atomic<int> pitch{-1};
  };
  // Espelho lock-free para que um SF2 carregado fora da thread de áudio
  // receba imediatamente o pedal/roda que já estão fisicamente pressionados.
  std::array<CurrentExpression, kRoutableMidiInputCount> currentExpression_{};
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
  std::atomic<std::uint8_t> metronomeDenominator_{4};
  std::atomic<bool> metronomeResetRequested_{false};
  bool metronomeWasEnabled_ = false;
  double metronomeFramesUntilBeat_ = 0.0;
  std::size_t metronomeBeatIndex_ = 0;
  std::size_t metronomeClickFrame_ = 0;
  std::size_t metronomeClickLength_ = 0;
  float metronomeClickFrequency_ = 1350.0f;
  float metronomeClickAmplitude_ = 0.0f;
  float metronomeBlockVolume_ = 0.0f;
  std::uint8_t metronomeClickWaveform_ = 1;
  std::vector<float> metronomeClick4Left_;
  std::vector<float> metronomeClick4Right_;
  std::vector<float> metronomeClick5Left_;
  std::vector<float> metronomeClick5Right_;
  std::unique_ptr<TrackPlayer> tracks_;
  std::atomic<float> outputGainLinear_{1.0f};
  float currentOutputGain_ = 1.0f;
  float outputGainTargetSeen_ = 1.0f;
  float outputGainStep_ = 0.0f;
  std::size_t outputGainRampFrames_ = 0;
  // O barramento Módulos controla e mede todos os timbres, em qualquer saída.
  std::atomic<std::uint16_t> masterOutputRoute_{2u << 8};
  std::uint16_t masterOutputRouteSeen_ = 2u << 8; // audio thread only
  float masterLimiterGain_ = 1.0f;
  float masterLimiterRelease_ = 0.0f;
  std::array<std::atomic<float>, 2> masterPeaks_{};
  std::array<std::atomic<float>, 2> metronomePeaks_{};
  std::atomic<float> padGainLinear_{1.0f};
  float currentPadGain_ = 1.0f;
  float padGainTargetSeen_ = 1.0f;
  float padGainStep_ = 0.0f;
  std::size_t padGainRampFrames_ = 0;
  std::atomic<std::uint16_t> padOutputRoute_{2u << 8};
  std::atomic<float> padLowCutHz_{20.0f};
  std::atomic<float> padHighCutHz_{20000.0f};
  float currentPadLowCutHz_ = 20.0f;
  float currentPadHighCutHz_ = 20000.0f;
  std::array<float, 2> padHighPassLowState_{};
  std::array<float, 2> padLowPassState_{};
  std::array<std::atomic<float>, 2> padPeaks_{};
  [[nodiscard]] bool beginMetronomeBlock() noexcept;
  void addMetronome(float* left, float* right, std::size_t frames) noexcept;
  void addMetronomeInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept;
  void addPadsInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept;
  void addEffectsInterleaved(float* output, std::size_t frames, std::size_t channels) noexcept;
  [[nodiscard]] std::array<float, 2> renderMetronomeSample() noexcept;
  [[nodiscard]] float nextOutputGain() noexcept;
  [[nodiscard]] float nextPadGain() noexcept;
  [[nodiscard]] float nextEffectGain() noexcept;
  void startEffectVoice(std::uint8_t sampleIndex, float gain) noexcept;
  void releaseEffectVoices(std::uint8_t sampleIndex) noexcept;
  void applyMasterLimiter(float* frame, std::size_t channels) noexcept;
};

} // namespace hook_keys
