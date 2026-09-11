#import "HookKeysNativeEngine.h"

#import <AVFoundation/AVFoundation.h>
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
}
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
    [self createMidiClient];
  }
  return self;
}

- (void)dealloc {
  [self stop];
  if (_midiInputPort != 0) MIDIPortDispose(_midiInputPort);
  if (_midiClient != 0) MIDIClientDispose(_midiClient);
}

- (BOOL)startWithBufferFrames:(NSInteger)bufferFrames {
  std::scoped_lock lock(_controlMutex);
  if (_audioEngine != nil && _audioState && _audioState->runtime) return YES;

  AVAudioSession *session = AVAudioSession.sharedInstance;
  NSError *sessionError = nil;
  if (![session setCategory:AVAudioSessionCategoryPlayback
                        mode:AVAudioSessionModeDefault
                     options:(AVAudioSessionCategoryOptionMixWithOthers |
                              AVAudioSessionCategoryOptionAllowBluetooth |
                              AVAudioSessionCategoryOptionAllowBluetoothA2DP)
                       error:&sessionError] ||
      ![session setPreferredIOBufferDuration:(std::clamp<NSInteger>(bufferFrames, 32, 512) / 48000.0)
                                       error:&sessionError] ||
      ![session setActive:YES error:&sessionError]) {
    return NO;
  }

  const double sampleRate = session.sampleRate > 0 ? session.sampleRate : 48000.0;
  const AVAudioChannelCount channelCount = static_cast<AVAudioChannelCount>(
      std::clamp<NSInteger>(_requestedOutputChannels, 1, 32));
  AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:sampleRate
                                                                         channels:channelCount];
  if (format == nil) return NO;

  auto state = std::make_shared<AudioState>();
  state->runtime = std::make_unique<hook_keys::NativeEngineRuntime>(sampleRate, kRenderChunkFrames);
  state->activeRuntime.store(state->runtime.get(), std::memory_order_release);

  _sourceNode = [[AVAudioSourceNode alloc] initWithFormat:format
                                             renderBlock:^OSStatus(BOOL *, const AudioTimeStamp *,
                                                                   AVAudioFrameCount frameCount,
                                                                   AudioBufferList *outputData) {
    auto *runtime = state->activeRuntime.load(std::memory_order_acquire);
    if (outputData == nullptr) return noErr;
    for (UInt32 buffer = 0; buffer < outputData->mNumberBuffers; ++buffer) {
      if (outputData->mBuffers[buffer].mData != nullptr) {
        std::fill_n(static_cast<float *>(outputData->mBuffers[buffer].mData),
                    outputData->mBuffers[buffer].mDataByteSize / sizeof(float), 0.0f);
      }
    }
    if (runtime == nullptr) return noErr;
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

  _audioEngine = [[AVAudioEngine alloc] init];
  [_audioEngine attachNode:_sourceNode];
  [_audioEngine connect:_sourceNode to:_audioEngine.mainMixerNode format:format];
  [_audioEngine prepare];
  if (![_audioEngine startAndReturnError:&sessionError]) {
    state->activeRuntime.store(nullptr, std::memory_order_release);
    state->runtime.reset();
    _sourceNode = nil;
    _audioEngine = nil;
    return NO;
  }
  _audioState = std::move(state);
  return YES;
}

- (BOOL)setAudioOutputDeviceId:(NSString *)deviceId channels:(NSInteger)channels
                  bufferFrames:(NSInteger)bufferFrames {
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
    if (![session setPreferredOutputNumberOfChannels:preferred error:&error]) return NO;
    _requestedOutputChannels = preferred;
  }
  [self stop];
  if ([self startWithBufferFrames:bufferFrames]) return YES;
  _requestedOutputChannels = 2;
  static_cast<void>([self startWithBufferFrames:bufferFrames]);
  return NO;
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
  config.midiInputSlot = inputSlot >= 0 && inputSlot < kMidiSlotCount
                             ? static_cast<std::uint8_t>(inputSlot)
                             : hook_keys::kAllMidiInputs;
  config.lowNote = static_cast<std::uint8_t>(std::clamp<NSInteger>(lowNote, 0, 127));
  config.highNote = static_cast<std::uint8_t>(std::clamp<NSInteger>(highNote, 0, 127));
  config.octaveShift = static_cast<std::int8_t>(std::clamp<NSInteger>(octave, -3, 3));
  config.sustainInputEnabled = sustain;
  config.modulationInputEnabled = modulation;
  config.gainLinear = volumeDb <= -60.0f ? 0.0f : std::pow(10.0f, volumeDb / 20.0f);
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

- (BOOL)configureModuleEffects:(NSInteger)moduleIndex cutoffHz:(float)cutoffHz
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
                      reverbMix:(float)reverbMix {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  if (runtime == nullptr || moduleIndex < 0 || moduleIndex >= 8) return NO;
  hook_keys::ModuleEffectsConfig effects;
  effects.cutoff.enabled = true;
  effects.cutoff.frequencyHz = cutoffHz;
  effects.equalizer.enabled = true;
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
  }
  effects.compressor = {true, compressorThresholdDb, compressorRatio, compressorAttackMs,
                        compressorReleaseMs, compressorGainDb, compressorMix};
  effects.delay = {true, delaySync, delayMs, delayBeatMultiplier, delayFeedback, delayMix};
  effects.reverb = {true, reverbDecay, reverbDampen, reverbSize, reverbMix};
  return runtime->setModuleEffects(static_cast<std::size_t>(moduleIndex), effects);
}

- (BOOL)configureModuleEnvelope:(NSInteger)moduleIndex attackMs:(float)attackMs
                          holdMs:(float)holdMs decayMs:(float)decayMs releaseMs:(float)releaseMs {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && moduleIndex >= 0 && moduleIndex < 8 &&
         runtime->setModuleEnvelope(
             static_cast<std::size_t>(moduleIndex), attackMs, holdMs, decayMs, releaseMs);
}

- (BOOL)sendMidiFromSlot:(NSInteger)slot status:(NSInteger)status data1:(NSInteger)data1
                   data2:(NSInteger)data2 timestamp:(uint64_t)timestamp {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && runtime->sendMidi(
      static_cast<std::uint8_t>(std::clamp<NSInteger>(slot, 0, 2)),
      static_cast<std::uint8_t>(status), static_cast<std::uint8_t>(data1),
      static_cast<std::uint8_t>(data2), timestamp);
}

- (BOOL)setTempo:(float)bpm {
  auto *runtime = _audioState ? _audioState->activeRuntime.load(std::memory_order_acquire) : nullptr;
  return runtime != nullptr && runtime->setTempo(bpm);
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

- (void)setCompatibilityMode:(BOOL)enabled {
  _compatibilityMode.store(enabled, std::memory_order_release);
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
                       data1 == 16 || data1 == 32 || data1 == 100 || data1 == 101);
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
  }
}

@end
