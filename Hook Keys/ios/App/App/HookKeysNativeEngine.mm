#import "HookKeysNativeEngine.h"

#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#import <CoreMIDI/CoreMIDI.h>

#include "hook_keys/NativeEngineRuntime.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <memory>
#include <mutex>
#include <vector>

namespace {

constexpr std::size_t kRenderChunkFrames = 512;
constexpr NSInteger kMidiSlotCount = 3;

struct MidiParser final {
  std::uint8_t runningStatus = 0;
  int firstData = -1;
};

struct AudioState final {
  std::atomic<hook_keys::NativeEngineRuntime*> activeRuntime{nullptr};
  std::atomic<bool> callbackSeen{false};
  std::unique_ptr<hook_keys::NativeEngineRuntime> runtime;
  std::array<float, kRenderChunkFrames * 32> interleaved{};
};

NSString* endpointId(MIDIEndpointRef endpoint) {
  SInt32 value = 0;
  if (MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyUniqueID, &value) != noErr) return @"";
  return [NSString stringWithFormat:@"%d", static_cast<int>(value)];
}

NSString* endpointName(MIDIEndpointRef endpoint) {
  CFStringRef value = nullptr;
  if (MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &value) != noErr || value == nullptr) {
    return @"Controlador MIDI";
  }
  return CFBridgingRelease(value);
}

// ExtAudioFile decodifica MP3, AAC/M4A, WAV, AIFF, CAF e FLAC e já converte
// para a taxa do motor. Só a thread de leitura do player e o controle o usam,
// sempre sob a trava do player.
class ExtAudioFileTrackDecoder final : public hook_keys::TrackDecoder {
public:
  static std::unique_ptr<ExtAudioFileTrackDecoder> open(NSString *path, double sampleRate) {
    ExtAudioFileRef file = nullptr;
    NSURL *url = [NSURL fileURLWithPath:path];
    if (ExtAudioFileOpenURL((__bridge CFURLRef)url, &file) != noErr || file == nullptr) return nullptr;
    AudioStreamBasicDescription fileFormat{};
    UInt32 formatSize = sizeof(fileFormat);
    SInt64 fileFrames = 0;
    UInt32 framesSize = sizeof(fileFrames);
    if (ExtAudioFileGetProperty(file, kExtAudioFileProperty_FileDataFormat, &formatSize, &fileFormat) != noErr ||
        ExtAudioFileGetProperty(file, kExtAudioFileProperty_FileLengthFrames, &framesSize, &fileFrames) != noErr ||
        fileFormat.mSampleRate <= 0 || fileFrames <= 0 || fileFormat.mChannelsPerFrame == 0) {
      ExtAudioFileDispose(file);
      return nullptr;
    }
    // Mono continua mono no conversor e vira estéreo aqui, nos dois lados.
    const UInt32 channels = fileFormat.mChannelsPerFrame == 1 ? 1 : 2;
    AudioStreamBasicDescription client{};
    client.mSampleRate = sampleRate;
    client.mFormatID = kAudioFormatLinearPCM;
    client.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagsNativeEndian;
    client.mBitsPerChannel = 32;
    client.mChannelsPerFrame = channels;
    client.mFramesPerPacket = 1;
    client.mBytesPerFrame = 4 * channels;
    client.mBytesPerPacket = 4 * channels;
    if (ExtAudioFileSetProperty(file, kExtAudioFileProperty_ClientDataFormat, sizeof(client), &client) != noErr) {
      ExtAudioFileDispose(file);
      return nullptr;
    }
    return std::unique_ptr<ExtAudioFileTrackDecoder>(new ExtAudioFileTrackDecoder(
        file, sampleRate / fileFormat.mSampleRate, static_cast<std::uint64_t>(fileFrames), channels));
  }

  ~ExtAudioFileTrackDecoder() override { ExtAudioFileDispose(file_); }

  [[nodiscard]] std::uint64_t frameCount() const noexcept override {
    return static_cast<std::uint64_t>(std::llround(static_cast<double>(fileFrames_) * ratio_));
  }

  [[nodiscard]] bool seek(std::uint64_t frame) noexcept override {
    // ExtAudioFileSeek conta quadros na taxa do arquivo.
    const auto fileFrame = std::min<SInt64>(
        static_cast<SInt64>(fileFrames_), static_cast<SInt64>(std::llround(static_cast<double>(frame) / ratio_)));
    return ExtAudioFileSeek(file_, fileFrame) == noErr;
  }

  [[nodiscard]] std::size_t read(float *stereo, std::size_t frames) noexcept override {
    AudioBufferList list;
    list.mNumberBuffers = 1;
    list.mBuffers[0].mNumberChannels = channels_;
    list.mBuffers[0].mDataByteSize = static_cast<UInt32>(frames * 4 * channels_);
    list.mBuffers[0].mData = stereo;
    UInt32 count = static_cast<UInt32>(frames);
    if (ExtAudioFileRead(file_, &count, &list) != noErr) return 0;
    if (channels_ == 1) {
      for (std::size_t frame = count; frame-- > 0;) {
        stereo[frame * 2] = stereo[frame];
        stereo[frame * 2 + 1] = stereo[frame];
      }
    }
    return count;
  }

private:
  ExtAudioFileTrackDecoder(ExtAudioFileRef file, double ratio, std::uint64_t fileFrames, UInt32 channels) noexcept
      : file_(file), ratio_(ratio), fileFrames_(fileFrames), channels_(channels) {}

  ExtAudioFileRef file_;
  double ratio_;
  std::uint64_t fileFrames_;
  UInt32 channels_;
};

} // namespace

@interface HookKeysNativeEngine () {
  AVAudioEngine *_audioEngine;
  AVAudioSourceNode *_sourceNode;
  std::shared_ptr<AudioState> _audioState;
  std::mutex _controlMutex;
  MIDIClientRef _midiClient;
  MIDIPortRef _midiInputPort;
  std::array<MidiParser, kMidiSlotCount> _parsers;
  NSArray *_selectedDeviceIds;
  std::atomic<bool> _compatibilityMode;
  NSInteger _requestedOutputChannels;
  NSString *_lastAudioErrorMessage;
}
- (void)setAudioErrorStage:(NSString *)stage error:(nullable NSError *)error;
- (void)createMidiClient;
- (void)reconnectMidiSources;
- (void)parseMidiByte:(uint8_t)value slot:(NSInteger)slot timestamp:(uint64_t)timestamp;
- (void)dispatchMidiStatus:(uint8_t)status data1:(uint8_t)data1 data2:(uint8_t)data2
                      slot:(NSInteger)slot timestamp:(uint64_t)timestamp;
@end

@implementation HookKeysNativeEngine

- (instancetype)init {
  self = [super init];
  if (self) {
    _midiClient = 0;
    _midiInputPort = 0;
    _selectedDeviceIds = @[[NSNull null], [NSNull null], [NSNull null]];
    _compatibilityMode.store(false, std::memory_order_relaxed);
    _requestedOutputChannels = 2;
    _lastAudioErrorMessage = @"";
    [self createMidiClient];
  }
  return self;
}

- (void)dealloc {
  [self stop];
  if (_midiInputPort != 0) MIDIPortDispose(_midiInputPort);
  if (_midiClient != 0) MIDIClientDispose(_midiClient);
}

- (NSString *)lastAudioErrorMessage {
  std::scoped_lock lock(_controlMutex);
  return [_lastAudioErrorMessage copy];
}

- (void)setAudioErrorStage:(NSString *)stage error:(NSError *)error {
  NSString *detail = error.localizedDescription;
  if (detail.length == 0) detail = @"erro sem descrição fornecido pelo iOS";
  _lastAudioErrorMessage = [NSString stringWithFormat:@"%@: %@", stage, detail];
}

- (BOOL)startWithBufferFrames:(NSInteger)bufferFrames sampleRate:(double)requestedSampleRate {
  std::scoped_lock lock(_controlMutex);
  _lastAudioErrorMessage = @"";
  requestedSampleRate = std::abs(requestedSampleRate - 44100.0) < 1.0 ? 44100.0 : 48000.0;
  if (_audioEngine != nil && _audioState && _audioState->runtime) {
    if (_audioEngine.isRunning) return YES;
    NSError *restartError = nil;
    AVAudioSession *session = AVAudioSession.sharedInstance;
    [session setPreferredSampleRate:requestedSampleRate error:nil];
    const double preferredRate = requestedSampleRate;
    // Tamanho de buffer é uma preferência, não uma condição para existir áudio.
    // Algumas rotas do iOS recusam a preferência enquanto estão sendo ativadas;
    // o sistema continua perfeitamente capaz de abrir usando o buffer da rota.
    [session setPreferredIOBufferDuration:(std::clamp<NSInteger>(bufferFrames, 64, 512) / preferredRate)
                                    error:nil];
    if (![session setActive:YES error:&restartError]) {
      [self setAudioErrorStage:@"ativar sessão existente" error:restartError];
      return NO;
    }
    _audioState->callbackSeen.store(false, std::memory_order_release);
    _audioState->activeRuntime.store(_audioState->runtime.get(), std::memory_order_release);
    if ([_audioEngine startAndReturnError:&restartError]) return YES;
    _audioState->activeRuntime.store(nullptr, std::memory_order_release);
    [self setAudioErrorStage:@"reiniciar AVAudioEngine" error:restartError];
    return NO;
  }

  AVAudioSession *session = AVAudioSession.sharedInstance;
  NSError *sessionError = nil;
  if (![session setCategory:AVAudioSessionCategoryPlayback
                        mode:AVAudioSessionModeDefault
                     options:AVAudioSessionCategoryOptionMixWithOthers
                       error:&sessionError]) {
    [self setAudioErrorStage:@"configurar sessão" error:sessionError];
    return NO;
  }

  // A Apple recomenda configurar preferências antes de ativar a sessão. A
  // duração pode ser recusada por AirPlay, Bluetooth ou durante uma mudança de
  // rota; isso não deve impedir o Hook Keys de iniciar com o valor do sistema.
  [session setPreferredSampleRate:requestedSampleRate error:nil];
  const double preferredRate = requestedSampleRate;
  [session setPreferredIOBufferDuration:(std::clamp<NSInteger>(bufferFrames, 64, 512) / preferredRate)
                                  error:nil];
  if (![session setActive:YES error:&sessionError]) {
    [self setAudioErrorStage:@"ativar sessão" error:sessionError];
    return NO;
  }

  // A taxa da sessão é uma preferência negociada. O callback precisa usar o
  // mesmo relógio do DSP, não um formato implícito escolhido pelo mainMixer.
  _audioEngine = [[AVAudioEngine alloc] init];
  AVAudioFormat *outputFormat = [_audioEngine.outputNode inputFormatForBus:0];
  const double sampleRate = outputFormat.sampleRate > 0
      ? outputFormat.sampleRate : (session.sampleRate > 0 ? session.sampleRate : 48000.0);
  const auto channelCount = std::clamp<AVAudioChannelCount>(outputFormat.channelCount, 1, 32);
  // initStandardFormatWithSampleRate:channels: devolve nil acima de 2 canais.
  // Abrir o app com uma interface USB de 4+ saídas já conectada caía aqui e
  // falhava em "preparar formato da saída". Acima de estéreo o formato precisa
  // de um layout: canais discretos, na ordem da placa.
  AVAudioFormat *renderFormat = nil;
  if (channelCount <= 2) {
    renderFormat = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:sampleRate channels:channelCount];
  } else {
    AVAudioChannelLayout *layout = [[AVAudioChannelLayout alloc]
        initWithLayoutTag:(kAudioChannelLayoutTag_DiscreteInOrder | channelCount)];
    renderFormat = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:sampleRate channelLayout:layout];
  }
  if (renderFormat == nil) {
    _audioEngine = nil;
    [self setAudioErrorStage:@"preparar formato da saída" error:nil];
    return NO;
  }

  auto state = std::make_shared<AudioState>();
  state->runtime = std::make_unique<hook_keys::NativeEngineRuntime>(sampleRate, kRenderChunkFrames);
  state->runtime->setMidiInputEnabled(false);
  state->activeRuntime.store(state->runtime.get(), std::memory_order_release);

  // O formato vem da rota real (inclusive mono/Bluetooth), sem fixar estéreo
  // ou 48 kHz. Se a rota mudar depois, o AVAudioEngine converte a saída sem
  // reinterpretar os quadros do nosso gerador em outra taxa.
  _sourceNode = [[AVAudioSourceNode alloc] initWithFormat:renderFormat renderBlock:^OSStatus(
      BOOL *isSilence, const AudioTimeStamp *, AVAudioFrameCount frameCount, AudioBufferList *outputData) {
    auto *runtime = state->activeRuntime.load(std::memory_order_acquire);
    if (isSilence) *isSilence = runtime == nullptr ? YES : NO;
    if (outputData == nullptr) return noErr;
    for (UInt32 buffer = 0; buffer < outputData->mNumberBuffers; ++buffer) {
      if (outputData->mBuffers[buffer].mData != nullptr) {
        std::fill_n(static_cast<float *>(outputData->mBuffers[buffer].mData),
                    outputData->mBuffers[buffer].mDataByteSize / sizeof(float), 0.0f);
      }
    }
    if (runtime == nullptr) return noErr;
    state->callbackSeen.store(true, std::memory_order_release);
    std::size_t channelCount = 0;
    for (UInt32 bufferIndex = 0; bufferIndex < outputData->mNumberBuffers; ++bufferIndex) {
      channelCount += std::max<UInt32>(1, outputData->mBuffers[bufferIndex].mNumberChannels);
    }
    channelCount = std::clamp<std::size_t>(channelCount, 1, 32);
    std::size_t offset = 0;
    while (offset < frameCount) {
      const auto frames = std::min(kRenderChunkFrames, static_cast<std::size_t>(frameCount) - offset);
      runtime->renderInterleaved(state->interleaved.data(), frames, channelCount);
      std::size_t firstChannel = 0;
      for (UInt32 bufferIndex = 0; bufferIndex < outputData->mNumberBuffers; ++bufferIndex) {
        auto &buffer = outputData->mBuffers[bufferIndex];
        auto *samples = static_cast<float *>(buffer.mData);
        const std::size_t bufferChannels = std::max<UInt32>(1, buffer.mNumberChannels);
        if (samples != nullptr) {
          for (std::size_t frame = 0; frame < frames; ++frame) {
            for (std::size_t localChannel = 0; localChannel < bufferChannels; ++localChannel) {
              const auto sourceChannel = firstChannel + localChannel;
              if (sourceChannel < channelCount) {
                samples[(offset + frame) * bufferChannels + localChannel] =
                    state->interleaved[frame * channelCount + sourceChannel];
              }
            }
          }
        }
        firstChannel += bufferChannels;
      }
      offset += frames;
    }
    return noErr;
  }];

  [_audioEngine attachNode:_sourceNode];
  [_audioEngine connect:_sourceNode to:_audioEngine.mainMixerNode format:renderFormat];
  [_audioEngine prepare];
  if (![_audioEngine startAndReturnError:&sessionError]) {
    state->activeRuntime.store(nullptr, std::memory_order_release);
    state->runtime.reset();
    _sourceNode = nil;
    _audioEngine = nil;
    [self setAudioErrorStage:@"iniciar AVAudioEngine" error:sessionError];
    return NO;
  }
  _audioState = std::move(state);
  return YES;
}

- (BOOL)setAudioOutputDeviceId:(NSString *)deviceId channels:(NSInteger)channels
                  bufferFrames:(NSInteger)bufferFrames
                    sampleRate:(double)sampleRate
                preserveEngine:(BOOL)preserveEngine {
  AVAudioSession *session = AVAudioSession.sharedInstance;
  if (deviceId.length > 0) {
    BOOL currentRouteContainsDevice = NO;
    for (AVAudioSessionPortDescription *output in session.currentRoute.outputs) {
      if ([output.UID isEqualToString:deviceId]) { currentRouteContainsDevice = YES; break; }
    }
    if (!currentRouteContainsDevice) return NO;
  }
  _requestedOutputChannels = std::clamp<NSInteger>(channels, 1, 32);
  NSError *error = nil;
  if (session.maximumOutputNumberOfChannels > 0) {
    const NSInteger preferred = std::min(_requestedOutputChannels, session.maximumOutputNumberOfChannels);
    // Também é apenas preferência. Se a rota recusar, o grafo negociado usa a
    // quantidade real que o iOS fornecer.
    [session setPreferredOutputNumberOfChannels:preferred error:nil];
    _requestedOutputChannels = std::max<NSInteger>(1, preferred);
  }
  if (preserveEngine) {
    std::scoped_lock lock(_controlMutex);
    if (_audioEngine == nil || !_audioState || !_audioState->runtime) return NO;
    _audioState->activeRuntime.store(nullptr, std::memory_order_release);
    _audioState->callbackSeen.store(false, std::memory_order_release);
    [_audioEngine pause];
    if (![session setActive:YES error:&error]) {
      _audioState->activeRuntime.store(_audioState->runtime.get(), std::memory_order_release);
      [self setAudioErrorStage:@"reativar sessão após trocar buffer" error:error];
      return NO;
    }
    const double sampleRate = session.sampleRate > 0 ? session.sampleRate : 48000.0;
    // Assim como no boot, rejeitar uma preferência de buffer não significa que
    // a rota esteja indisponível. Reinicie usando o tamanho aceito pelo iOS.
    [session setPreferredIOBufferDuration:(std::clamp<NSInteger>(bufferFrames, 64, 512) / sampleRate)
                                    error:nil];
    [_audioEngine prepare];
    _audioState->activeRuntime.store(_audioState->runtime.get(), std::memory_order_release);
    if ([_audioEngine startAndReturnError:&error]) return YES;
    _audioState->activeRuntime.store(nullptr, std::memory_order_release);
    [self setAudioErrorStage:@"reiniciar motor após trocar buffer" error:error];
    return NO;
  }
  [self stop];
  if ([self startWithBufferFrames:bufferFrames sampleRate:sampleRate]) return YES;
  _requestedOutputChannels = 2;
  static_cast<void>([self startWithBufferFrames:bufferFrames sampleRate:sampleRate]);
  return NO;
}

- (BOOL)audioOutputReady {
  std::scoped_lock lock(_controlMutex);
  const BOOL ready = _audioEngine != nil && _audioEngine.isRunning && _audioState &&
      _audioState->callbackSeen.load(std::memory_order_acquire) &&
      _audioState->activeRuntime.load(std::memory_order_acquire) != nullptr;
  if (ready) {
    _lastAudioErrorMessage = @"";
  } else if (_lastAudioErrorMessage.length == 0) {
    if (_audioEngine == nil || !_audioState || !_audioState->runtime) {
      _lastAudioErrorMessage = @"motor de áudio ausente";
    } else if (!_audioEngine.isRunning) {
      _lastAudioErrorMessage = @"AVAudioEngine está parado";
    } else if (_audioState->activeRuntime.load(std::memory_order_acquire) == nullptr) {
      _lastAudioErrorMessage = @"runtime de áudio está desconectado";
    } else {
      AVAudioSession *session = AVAudioSession.sharedInstance;
      NSString *route = session.currentRoute.outputs.firstObject.portName ?: @"sem rota";
      _lastAudioErrorMessage = [NSString stringWithFormat:
          @"callback de áudio não iniciou (rota %@, %.0f Hz, %.2f ms)",
          route, session.sampleRate, session.IOBufferDuration * 1000.0];
    }
  }
  return ready;
}

- (void)setMidiInputEnabled:(BOOL)enabled {
  if (auto* runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr) {
    runtime->setMidiInputEnabled(enabled);
  }
}

- (NSArray<NSNumber *> *)moduleMeterLevels {
  std::unique_lock lock(_controlMutex, std::try_to_lock);
  NSMutableArray<NSNumber *> *levels = [NSMutableArray arrayWithCapacity:hook_keys::kModuleCount * 2];
  const auto state = lock.owns_lock() ? _audioState : std::shared_ptr<AudioState>{};
  if (lock.owns_lock()) lock.unlock();
  const auto peaks = state && state->runtime
      ? state->runtime->consumeModulePeaks() : hook_keys::HookKeysEngine::ModulePeaks{};
  for (float peak : peaks) [levels addObject:@(peak)];
  return levels;
}

- (NSArray<NSNumber *> *)moduleAnalysis:(NSInteger)moduleIndex {
  std::unique_lock lock(_controlMutex, std::try_to_lock);
  NSMutableArray<NSNumber *> *values = [NSMutableArray arrayWithCapacity:hook_keys::HookKeysEngine::kAnalysisValueCount];
  const auto state = lock.owns_lock() ? _audioState : std::shared_ptr<AudioState>{};
  if (lock.owns_lock()) lock.unlock();
  const auto analysis = state && state->runtime && moduleIndex >= 0 && moduleIndex < hook_keys::kModuleCount
      ? state->runtime->consumeModuleAnalysis(static_cast<std::size_t>(moduleIndex))
      : hook_keys::HookKeysEngine::ModuleAnalysis{};
  for (float value : analysis) [values addObject:@(value)];
  return values;
}

- (void)stop {
  std::scoped_lock lock(_controlMutex);
  if (_audioState) _audioState->activeRuntime.store(nullptr, std::memory_order_release);
  [_audioEngine stop];
  if (_sourceNode && _audioEngine) [_audioEngine detachNode:_sourceNode];
  _sourceNode = nil;
  _audioEngine = nil;
  if (_audioState) _audioState->runtime.reset();
  _audioState.reset();
}

- (NSArray<NSDictionary<NSString *,NSString *> *> *)listMidiDevices {
  NSMutableArray *result = [NSMutableArray array];
  const ItemCount count = MIDIGetNumberOfSources();
  for (ItemCount index = 0; index < count; ++index) {
    MIDIEndpointRef source = MIDIGetSource(index);
    NSString *identifier = endpointId(source);
    if (identifier.length == 0) continue;
    [result addObject:@{@"id": identifier, @"name": endpointName(source)}];
  }
  return result;
}

- (void)setMidiDeviceIds:(NSArray *)deviceIds {
  NSMutableArray *normalized = [NSMutableArray arrayWithCapacity:kMidiSlotCount];
  for (NSInteger slot = 0; slot < kMidiSlotCount; ++slot) {
    id value = slot < deviceIds.count ? deviceIds[slot] : nil;
    [normalized addObject:[value isKindOfClass:NSString.class] && [value length] > 0 ? value : NSNull.null];
  }
  _selectedDeviceIds = [normalized copy];
  [self reconnectMidiSources];
}

- (BOOL)loadSoundFontAtPath:(NSString *)path moduleIndex:(NSInteger)moduleIndex {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && moduleIndex >= 0 && moduleIndex < 8 &&
         runtime->loadSoundFont(static_cast<std::size_t>(moduleIndex), path.UTF8String);
}

- (BOOL)cloneSoundFontFromModule:(NSInteger)sourceModuleIndex
                        toModule:(NSInteger)targetModuleIndex {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && sourceModuleIndex >= 0 && sourceModuleIndex < 7 &&
      targetModuleIndex >= 0 && targetModuleIndex < 7 && sourceModuleIndex != targetModuleIndex &&
      runtime->cloneSoundFont(static_cast<std::size_t>(sourceModuleIndex),
                              static_cast<std::size_t>(targetModuleIndex));
}

- (BOOL)configureModule:(NSInteger)moduleIndex enabled:(BOOL)enabled inputSlot:(NSInteger)inputSlot
                 lowNote:(NSInteger)lowNote highNote:(NSInteger)highNote octave:(NSInteger)octave
                 sustain:(BOOL)sustain modulation:(BOOL)modulation volumeDb:(float)volumeDb
                polyphony:(NSInteger)polyphony velocityCurve0:(NSInteger)velocityCurve0
           velocityCurve1:(NSInteger)velocityCurve1 velocityCurve2:(NSInteger)velocityCurve2
           velocityCurve3:(NSInteger)velocityCurve3 velocityCurve4:(NSInteger)velocityCurve4
       outputChannelStart:(NSInteger)outputChannelStart
       outputChannelCount:(NSInteger)outputChannelCount {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr || moduleIndex < 0 || moduleIndex >= 8) return NO;
  hook_keys::ModuleConfig config;
  config.enabled = enabled;
  config.midiInputSlot = inputSlot == hook_keys::kArpeggiatorInput ||
          inputSlot == hook_keys::kSequencerInput
      ? static_cast<std::uint8_t>(inputSlot)
      : inputSlot >= 0 && inputSlot < kMidiSlotCount
          ? static_cast<std::uint8_t>(inputSlot) : hook_keys::kAllMidiInputs;
  config.lowNote = static_cast<std::uint8_t>(std::clamp<NSInteger>(lowNote, 0, 127));
  config.highNote = static_cast<std::uint8_t>(std::clamp<NSInteger>(highNote, 0, 127));
  config.octaveShift = static_cast<std::int8_t>(std::clamp<NSInteger>(octave, -3, 3));
  config.sustainInputEnabled = sustain;
  config.modulationInputEnabled = modulation;
  config.gainLinear = volumeDb <= -90.0f ? 0.0f : std::pow(10.0f, volumeDb / 20.0f);
  config.polyphony = static_cast<std::uint16_t>(std::clamp<NSInteger>(polyphony, 1, 128));
  config.velocityCurve = {
      static_cast<std::uint8_t>(std::clamp<NSInteger>(velocityCurve0, 0, 127)),
      static_cast<std::uint8_t>(std::clamp<NSInteger>(velocityCurve1, 0, 127)),
      static_cast<std::uint8_t>(std::clamp<NSInteger>(velocityCurve2, 0, 127)),
      static_cast<std::uint8_t>(std::clamp<NSInteger>(velocityCurve3, 0, 127)),
      static_cast<std::uint8_t>(std::clamp<NSInteger>(velocityCurve4, 0, 127))};
  config.outputChannelStart = static_cast<std::uint8_t>(std::clamp<NSInteger>(outputChannelStart, 0, 31));
  config.outputChannelCount = outputChannelCount == 1 ? 1 : 2;
  return runtime->setModuleConfig(static_cast<std::size_t>(moduleIndex), config);
}

- (BOOL)setModuleGainDb:(float)db moduleIndex:(NSInteger)moduleIndex {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && moduleIndex >= 0 && moduleIndex < 8 &&
         runtime->setModuleGainDb(static_cast<std::size_t>(moduleIndex), db);
}

- (BOOL)configureModuleEffects:(NSInteger)moduleIndex cutoffHz:(float)cutoffHz
                 cutoffVelocity:(NSArray<NSNumber *> *)cutoffVelocity
                        eqTypes:(NSArray<NSNumber *> *)eqTypes
                  eqFrequencies:(NSArray<NSNumber *> *)eqFrequencies
                        eqGains:(NSArray<NSNumber *> *)eqGains
                    eqQualities:(NSArray<NSNumber *> *)eqQualities
                    eqCutStages:(NSArray<NSNumber *> *)eqCutStages
         compressorThresholdDb:(float)compressorThresholdDb compressorRatio:(float)compressorRatio
             compressorAttackMs:(float)compressorAttackMs compressorReleaseMs:(float)compressorReleaseMs
               compressorGainDb:(float)compressorGainDb compressorMix:(float)compressorMix
                      delaySync:(BOOL)delaySync delayMs:(float)delayMs
            delayBeatMultiplier:(float)delayBeatMultiplier delayFeedback:(float)delayFeedback
                       delayMix:(float)delayMix reverbDecay:(float)reverbDecay
                   reverbDampen:(float)reverbDampen reverbSize:(float)reverbSize
                      reverbMix:(float)reverbMix
                  rotaryEnabled:(BOOL)rotaryEnabled
                    rotarySpeed:(NSInteger)rotarySpeed
                   rotarySlowHz:(float)rotarySlowHz
                   rotaryFastHz:(float)rotaryFastHz
              rotaryRampSeconds:(float)rotaryRampSeconds
                    rotaryDepth:(float)rotaryDepth
                      rotaryMix:(float)rotaryMix
        rotaryModulationEnabled:(BOOL)rotaryModulationEnabled {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr || moduleIndex < 0 || moduleIndex >= 8) return NO;
  hook_keys::ModuleEffectsConfig effects;
  effects.cutoff.enabled = true;
  effects.cutoff.frequencyHz = cutoffHz;
  for (NSUInteger index = 0; index < effects.cutoff.velocityCurve.size(); ++index) {
    const NSInteger value = index < cutoffVelocity.count ? cutoffVelocity[index].integerValue : 127;
    effects.cutoff.velocityCurve[index] = static_cast<std::uint8_t>(std::clamp<NSInteger>(value, 0, 127));
  }
  effects.equalizer.enabled = false;
  for (NSUInteger index = 0; index < effects.equalizer.bands.size(); ++index) {
    auto &band = effects.equalizer.bands[index];
    const NSInteger type = index < eqTypes.count ? eqTypes[index].integerValue : 2;
    band.enabled = true;
    band.type = static_cast<hook_keys::EqBandType>(std::clamp<NSInteger>(type, 0, 4));
    band.frequencyHz = index < eqFrequencies.count ? eqFrequencies[index].floatValue : 1000.0f;
    band.gainDb = index < eqGains.count ? eqGains[index].floatValue : 0.0f;
    band.quality = index < eqQualities.count ? eqQualities[index].floatValue : 0.7071f;
    const NSInteger stages = index < eqCutStages.count ? eqCutStages[index].integerValue : 1;
    band.cutStages = static_cast<std::uint8_t>(std::clamp<NSInteger>(stages, 1, 8));
    const auto cut = band.type == hook_keys::EqBandType::lowCut ||
        band.type == hook_keys::EqBandType::highCut;
    effects.equalizer.enabled = effects.equalizer.enabled || cut || std::abs(band.gainDb) > 0.0001f;
  }
  effects.compressor = {compressorMix > 0.0001f, compressorThresholdDb, compressorRatio, compressorAttackMs,
                        compressorReleaseMs, compressorGainDb, compressorMix};
  effects.delay = {delayMix > 0.0001f, delaySync, delayMs, delayBeatMultiplier, delayFeedback, delayMix};
  effects.reverb = {reverbMix > 0.0001f, reverbDecay, reverbDampen, reverbSize, reverbMix};
  effects.rotary = {rotaryEnabled != NO, static_cast<std::uint8_t>(std::clamp<NSInteger>(rotarySpeed, 0, 2)),
                    rotarySlowHz, rotaryFastHz, rotaryRampSeconds, rotaryDepth, rotaryMix,
                    rotaryModulationEnabled != NO};
  return runtime->setModuleEffects(static_cast<std::size_t>(moduleIndex), effects);
}

- (BOOL)beginPresetTransition {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && runtime->beginPresetTransition();
}

- (BOOL)commitPresetTransition {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && runtime->commitPresetTransition();
}

- (BOOL)configureModuleEnvelope:(NSInteger)moduleIndex attackMs:(float)attackMs
                          holdMs:(float)holdMs decayMs:(float)decayMs releaseMs:(float)releaseMs glideMs:(float)glideMs {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && moduleIndex >= 0 && moduleIndex < 8 &&
         runtime->setModuleEnvelope(
             static_cast<std::size_t>(moduleIndex), attackMs, holdMs, decayMs, releaseMs, glideMs);
}

- (BOOL)configureVelocityLimits:(NSInteger)moduleIndex
                     ignoreAbove:(NSInteger)ignoreAbove
                         ceiling:(NSInteger)ceiling
                oscillator1Limit:(NSInteger)oscillator1Limit
                oscillator2Limit:(NSInteger)oscillator2Limit {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr || moduleIndex < 0 || moduleIndex >= static_cast<NSInteger>(hook_keys::kModuleCount)) return NO;
  const auto limit = [](NSInteger value) { return static_cast<std::uint8_t>(std::clamp<NSInteger>(value, 0, 127)); };
  return runtime->setVelocityLimits(static_cast<std::size_t>(moduleIndex), limit(ignoreAbove), limit(ceiling),
      limit(oscillator1Limit), limit(oscillator2Limit));
}

- (BOOL)configureGlide:(NSInteger)moduleIndex
             portamento:(BOOL)portamento
      velocityGateEnabled:(BOOL)velocityGateEnabled
     velocityGateInverted:(BOOL)velocityGateInverted
        velocityThreshold:(NSInteger)velocityThreshold {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr || moduleIndex < 0 || moduleIndex >= static_cast<NSInteger>(hook_keys::kModuleCount)) return NO;
  hook_keys::GlideBehavior behavior;
  behavior.portamento = portamento;
  behavior.velocityGateEnabled = velocityGateEnabled;
  behavior.velocityGateInverted = velocityGateInverted;
  behavior.velocityThreshold = static_cast<std::uint8_t>(std::clamp<NSInteger>(velocityThreshold, 0, 127));
  return runtime->setGlideBehavior(static_cast<std::size_t>(moduleIndex), behavior);
}

- (BOOL)configureModuleModulation:(NSInteger)moduleIndex lfo:(BOOL)lfo rateHz:(float)rateHz {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && moduleIndex >= 0 && moduleIndex < 8 &&
         runtime->setModuleModulationMode(static_cast<std::size_t>(moduleIndex), lfo, rateHz);
}

- (BOOL)configureTranceGate:(NSInteger)moduleIndex enabled:(BOOL)enabled steps:(NSInteger)steps length:(NSInteger)length beatMultiplier:(float)beatMultiplier gate:(float)gate depth:(float)depth attackMs:(float)attackMs releaseMs:(float)releaseMs swing:(float)swing {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr || moduleIndex < 0 || moduleIndex >= 8) return NO;
  hook_keys::ModuleEffectsConfig::TranceGateConfig config;
  config.enabled = enabled;
  config.steps = static_cast<std::uint16_t>(steps);
  config.length = static_cast<std::uint8_t>(std::clamp<NSInteger>(length, 1, 16));
  config.beatMultiplier = beatMultiplier;
  config.gate = gate;
  config.depth = depth;
  config.attackMs = attackMs;
  config.releaseMs = releaseMs;
  config.swing = swing;
  return runtime->setTranceGate(static_cast<std::size_t>(moduleIndex), config);
}

- (BOOL)configureSynth:(NSInteger)oscillator1
                           oscillator2:(NSInteger)oscillator2
                    oscillator1Enabled:(BOOL)oscillator1Enabled
                    oscillator2Enabled:(BOOL)oscillator2Enabled
                              voiceMode:(NSInteger)voiceMode
                              lfoTarget:(NSInteger)lfoTarget
                      oscillator1Volume:(float)oscillator1Volume
                      oscillator2Volume:(float)oscillator2Volume
                            detuneCents:(float)detuneCents
                               attackMs:(float)attackMs
                                 holdMs:(float)holdMs
                                decayMs:(float)decayMs
                                sustain:(float)sustain
                              releaseMs:(float)releaseMs
                         filterCutoffHz:(float)filterCutoffHz
                        filterResonance:(float)filterResonance
                         filterEnvelope:(float)filterEnvelope
                              lfoRateHz:(float)lfoRateHz
                               lfoDepth:(float)lfoDepth
                                glideMs:(float)glideMs
                      oscillator1Octave:(NSInteger)oscillator1Octave
                      oscillator2Octave:(NSInteger)oscillator2Octave {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr) return NO;
  hook_keys::AnalogSynthConfig config;
  config.oscillator1 = static_cast<std::uint8_t>(std::clamp<NSInteger>(oscillator1, 0, 3));
  config.oscillator2 = static_cast<std::uint8_t>(std::clamp<NSInteger>(oscillator2, 0, 3));
  config.oscillator1Enabled = oscillator1Enabled;
  config.oscillator2Enabled = oscillator2Enabled;
  config.voiceMode = static_cast<std::uint8_t>(std::clamp<NSInteger>(voiceMode, 0, 2));
  config.lfoTarget = static_cast<std::uint8_t>(std::clamp<NSInteger>(lfoTarget, 0, 2));
  config.oscillator1Volume = oscillator1Volume;
  config.oscillator2Volume = oscillator2Volume;
  config.detuneCents = detuneCents;
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
  config.oscillator1Octave = static_cast<std::int8_t>(std::clamp<NSInteger>(oscillator1Octave, -3, 3));
  config.oscillator2Octave = static_cast<std::int8_t>(std::clamp<NSInteger>(oscillator2Octave, -3, 3));
  return runtime->setSynthConfig(config);
}

- (BOOL)sendMidiFromSlot:(NSInteger)slot status:(NSInteger)status data1:(NSInteger)data1
                   data2:(NSInteger)data2 timestamp:(uint64_t)timestamp {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && runtime->sendMidi(
      static_cast<std::uint8_t>(std::clamp<NSInteger>(slot, 0, hook_keys::kSequencerInput)),
      static_cast<std::uint8_t>(status), static_cast<std::uint8_t>(data1),
      static_cast<std::uint8_t>(data2), timestamp);
}

- (BOOL)setTempo:(float)bpm {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && runtime->setTempo(bpm);
}

- (BOOL)setMetronomeOutputChannelStart:(NSInteger)channelStart channelCount:(NSInteger)channelCount {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr) return NO;
  runtime->setMetronomeOutput(
      static_cast<std::uint8_t>(std::clamp<NSInteger>(channelStart, 0, 31)), channelCount == 1 ? 1 : 2);
  return YES;
}

- (BOOL)configureMetronomeEnabled:(BOOL)enabled bpm:(float)bpm volume:(float)volume
                       clickSound:(NSInteger)clickSound accentEnabled:(BOOL)accentEnabled
                doubleTimeEnabled:(BOOL)doubleTimeEnabled
           timeSignatureNumerator:(NSInteger)timeSignatureNumerator {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr) return NO;
  runtime->setMetronome(
      enabled, bpm, volume,
      static_cast<std::uint8_t>(std::clamp<NSInteger>(clickSound, 1, 3)),
      accentEnabled, doubleTimeEnabled,
      static_cast<std::uint8_t>(std::clamp<NSInteger>(timeSignatureNumerator, 1, 16)));
  return YES;
}

- (BOOL)setOutputGainDb:(float)db enabled:(BOOL)enabled {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr) return NO;
  runtime->setOutputGainDb(db, enabled);
  return YES;
}

- (double)loadTrackId:(NSInteger)sourceId path:(NSString *)path {
  std::scoped_lock lock(_controlMutex);
  if (!_audioState || !_audioState->runtime || sourceId <= 0) return -1;
  auto &player = _audioState->runtime->tracks();
  auto decoder = ExtAudioFileTrackDecoder::open(path, player.sampleRate());
  if (!decoder) return -1;
  const auto frames = decoder->frameCount();
  if (!player.load(static_cast<std::uint32_t>(sourceId), std::move(decoder))) return -1;
  return static_cast<double>(frames) / player.sampleRate();
}

- (BOOL)controlTrackId:(NSInteger)sourceId action:(NSString *)action seconds:(double)seconds loop:(BOOL)loop {
  std::scoped_lock lock(_controlMutex);
  if (!_audioState || !_audioState->runtime || sourceId <= 0) return NO;
  auto &player = _audioState->runtime->tracks();
  const auto identifier = static_cast<std::uint32_t>(sourceId);
  if ([action isEqualToString:@"unload"]) {
    player.unload(identifier);
    return YES;
  }
  if (!player.hasSource(identifier)) return NO;
  if ([action isEqualToString:@"play"]) return player.play(identifier);
  if ([action isEqualToString:@"pause"]) { player.pause(identifier); return YES; }
  if ([action isEqualToString:@"loop"]) { player.setLoop(identifier, loop); return YES; }
  if ([action isEqualToString:@"seek"]) {
    const auto frame = std::isfinite(seconds) ? std::max(0.0, seconds) * player.sampleRate() : 0.0;
    return player.seek(identifier, static_cast<std::uint64_t>(std::llround(frame)));
  }
  return NO;
}

- (NSDictionary<NSString *, id> *)trackStatus {
  std::scoped_lock lock(_controlMutex);
  if (!_audioState || !_audioState->runtime) {
    return @{@"activeId": @0, @"playing": @NO, @"ended": @NO, @"positionSeconds": @0};
  }
  auto &player = _audioState->runtime->tracks();
  const auto status = player.status();
  return @{
    @"activeId": @(status.activeId),
    @"playing": @(status.playing),
    @"ended": @(status.ended),
    @"positionSeconds": @(static_cast<double>(status.positionFrames) / player.sampleRate()),
  };
}

- (BOOL)configureTrackOutputChannelStart:(NSInteger)channelStart
                            channelCount:(NSInteger)channelCount
                                  gainDb:(float)gainDb
                                 enabled:(BOOL)enabled {
  std::scoped_lock lock(_controlMutex);
  if (!_audioState || !_audioState->runtime) return NO;
  auto &player = _audioState->runtime->tracks();
  player.setOutput(static_cast<std::uint8_t>(std::clamp<NSInteger>(channelStart, 0, 31)), channelCount == 1 ? 1 : 2);
  player.setGainDb(gainDb, enabled);
  return YES;
}

- (void)setCompatibilityMode:(BOOL)enabled {
  _compatibilityMode.store(enabled, std::memory_order_release);
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime) runtime->setCompatibilityMode(enabled);
}

- (void)setSeamlessPresetSwitching:(BOOL)enabled {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime) runtime->setSeamlessPresetSwitching(enabled);
}

- (void)stopAllNotes {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime) runtime->stopAllNotes();
}

- (void)createMidiClient {
  __weak HookKeysNativeEngine *weakSelf = self;
  OSStatus status = MIDIClientCreateWithBlock(CFSTR("Hook Keys MIDI"), &_midiClient, ^(const MIDINotification *) {
    HookKeysNativeEngine *strongSelf = weakSelf;
    if (!strongSelf) return;
    dispatch_async(dispatch_get_main_queue(), ^{
      [strongSelf reconnectMidiSources];
      if (strongSelf.onMidiDevicesChanged) strongSelf.onMidiDevicesChanged();
    });
  });
  if (status != noErr) return;
  status = MIDIInputPortCreate(_midiClient, CFSTR("Hook Keys Input"),
                              [](const MIDIPacketList *packets, void *readRefCon, void *sourceRefCon) {
    auto *engine = (__bridge HookKeysNativeEngine *)readRefCon;
    const NSInteger slot = std::clamp<NSInteger>(reinterpret_cast<uintptr_t>(sourceRefCon) - 1, 0, 2);
    const MIDIPacket *packet = &packets->packet[0];
    for (UInt32 packetIndex = 0; packetIndex < packets->numPackets; ++packetIndex) {
      for (UInt16 byteIndex = 0; byteIndex < packet->length; ++byteIndex) {
        [engine parseMidiByte:packet->data[byteIndex] slot:slot timestamp:packet->timeStamp];
      }
      packet = MIDIPacketNext(packet);
    }
  }, (__bridge void *)self, &_midiInputPort);
  if (status == noErr) [self reconnectMidiSources];
}

- (void)reconnectMidiSources {
  if (_midiInputPort == 0) return;
  const ItemCount count = MIDIGetNumberOfSources();
  for (ItemCount index = 0; index < count; ++index) MIDIPortDisconnectSource(_midiInputPort, MIDIGetSource(index));
  for (auto &parser : _parsers) parser = {};
  for (ItemCount index = 0; index < count; ++index) {
    MIDIEndpointRef source = MIDIGetSource(index);
    NSString *identifier = endpointId(source);
    for (NSInteger slot = 0; slot < kMidiSlotCount; ++slot) {
      id selected = slot < _selectedDeviceIds.count ? _selectedDeviceIds[slot] : nil;
      if ([selected isKindOfClass:NSString.class] && [selected isEqualToString:identifier]) {
        MIDIPortConnectSource(_midiInputPort, source, reinterpret_cast<void *>(slot + 1));
      }
    }
  }
}

- (void)parseMidiByte:(uint8_t)value slot:(NSInteger)slot timestamp:(uint64_t)timestamp {
  if (value >= 0xf8) return;
  MidiParser &parser = _parsers[static_cast<std::size_t>(slot)];
  if ((value & 0x80) != 0) {
    parser.runningStatus = value < 0xf0 ? value : 0;
    parser.firstData = -1;
    return;
  }
  if (parser.runningStatus == 0) return;
  const int type = parser.runningStatus & 0xf0;
  if (type == 0xc0 || type == 0xd0) {
    [self dispatchMidiStatus:parser.runningStatus data1:value data2:0 slot:slot timestamp:timestamp];
    return;
  }
  if (parser.firstData < 0) {
    parser.firstData = value;
    return;
  }
  [self dispatchMidiStatus:parser.runningStatus data1:parser.firstData data2:value slot:slot timestamp:timestamp];
  parser.firstData = -1;
}

- (void)dispatchMidiStatus:(uint8_t)status data1:(uint8_t)data1 data2:(uint8_t)data2
                      slot:(NSInteger)slot timestamp:(uint64_t)timestamp {
  const NSInteger type = status & 0xf0;
  const bool blockedCompatibilityCC = _compatibilityMode.load(std::memory_order_acquire) &&
      type == 0xb0 && (data1 == 0 || data1 == 6 || data1 == 7 || data1 == 10 ||
                       data1 == 16 || data1 == 32 || data1 == 91 || data1 == 100 || data1 == 101);
  if (!blockedCompatibilityCC) {
    [self sendMidiFromSlot:slot status:status data1:data1 data2:data2 timestamp:timestamp];
  }
  NSString *deviceId = slot < _selectedDeviceIds.count && [_selectedDeviceIds[slot] isKindOfClass:NSString.class]
                           ? _selectedDeviceIds[slot] : @"";
  const NSInteger channel = (status & 0x0f) + 1;
  if ((type == 0x80 || type == 0x90) && self.onMidiNote) {
    const NSInteger velocity = type == 0x90 ? data2 : 0;
    self.onMidiNote(slot, deviceId, channel, data1, velocity);
  } else if (type == 0xb0 && self.onMidiControl) {
    self.onMidiControl(slot, deviceId, channel, data1, data2);
  } else if (type == 0xe0 && self.onMidiPitch) {
    self.onMidiPitch(slot, deviceId, channel, (data1 & 0x7f) | ((data2 & 0x7f) << 7));
  }
}

@end
