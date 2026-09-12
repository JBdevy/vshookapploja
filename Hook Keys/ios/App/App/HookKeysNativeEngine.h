#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^HKMidiNoteHandler)(NSInteger slot, NSString *deviceId, NSInteger channel,
                                  NSInteger note, NSInteger velocity);
typedef void (^HKMidiControlHandler)(NSInteger slot, NSString *deviceId, NSInteger channel,
                                     NSInteger controller, NSInteger value);
typedef void (^HKMidiDevicesChangedHandler)(void);

@interface HookKeysNativeEngine : NSObject

@property(nonatomic, copy, nullable) HKMidiNoteHandler onMidiNote;
@property(nonatomic, copy, nullable) HKMidiControlHandler onMidiControl;
@property(nonatomic, copy, nullable) HKMidiDevicesChangedHandler onMidiDevicesChanged;

- (BOOL)startWithBufferFrames:(NSInteger)bufferFrames;
- (BOOL)setAudioOutputDeviceId:(NSString *)deviceId
                      channels:(NSInteger)channels
                  bufferFrames:(NSInteger)bufferFrames;
- (void)stop;
- (NSArray<NSDictionary<NSString *, NSString *> *> *)listMidiDevices;
- (void)setMidiDeviceIds:(NSArray *)deviceIds;
- (BOOL)loadSoundFontAtPath:(NSString *)path moduleIndex:(NSInteger)moduleIndex;
- (BOOL)configureModule:(NSInteger)moduleIndex
                 enabled:(BOOL)enabled
               inputSlot:(NSInteger)inputSlot
                 lowNote:(NSInteger)lowNote
                highNote:(NSInteger)highNote
                  octave:(NSInteger)octave
                 sustain:(BOOL)sustain
              modulation:(BOOL)modulation
                volumeDb:(float)volumeDb
               polyphony:(NSInteger)polyphony
          velocityCurve0:(NSInteger)velocityCurve0
          velocityCurve1:(NSInteger)velocityCurve1
          velocityCurve2:(NSInteger)velocityCurve2
          velocityCurve3:(NSInteger)velocityCurve3
          velocityCurve4:(NSInteger)velocityCurve4
      outputChannelStart:(NSInteger)outputChannelStart
      outputChannelCount:(NSInteger)outputChannelCount;
- (BOOL)configureModuleEffects:(NSInteger)moduleIndex
                       cutoffHz:(float)cutoffHz
                        eqTypes:(NSArray<NSNumber *> *)eqTypes
                  eqFrequencies:(NSArray<NSNumber *> *)eqFrequencies
                        eqGains:(NSArray<NSNumber *> *)eqGains
                    eqQualities:(NSArray<NSNumber *> *)eqQualities
                    eqCutStages:(NSArray<NSNumber *> *)eqCutStages
         compressorThresholdDb:(float)compressorThresholdDb
                compressorRatio:(float)compressorRatio
             compressorAttackMs:(float)compressorAttackMs
            compressorReleaseMs:(float)compressorReleaseMs
               compressorGainDb:(float)compressorGainDb
                  compressorMix:(float)compressorMix
                      delaySync:(BOOL)delaySync
                        delayMs:(float)delayMs
            delayBeatMultiplier:(float)delayBeatMultiplier
                  delayFeedback:(float)delayFeedback
                       delayMix:(float)delayMix
                    reverbDecay:(float)reverbDecay
                   reverbDampen:(float)reverbDampen
                     reverbSize:(float)reverbSize
                      reverbMix:(float)reverbMix;
- (BOOL)configureModuleEnvelope:(NSInteger)moduleIndex
                        attackMs:(float)attackMs
                          holdMs:(float)holdMs
                         decayMs:(float)decayMs
                       releaseMs:(float)releaseMs;
- (BOOL)configureSynth:(NSInteger)oscillator1
                           oscillator2:(NSInteger)oscillator2
                              voiceMode:(NSInteger)voiceMode
                              lfoTarget:(NSInteger)lfoTarget
                          oscillatorMix:(float)oscillatorMix
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
                                glideMs:(float)glideMs;
- (BOOL)sendMidiFromSlot:(NSInteger)slot
                  status:(NSInteger)status
                   data1:(NSInteger)data1
                   data2:(NSInteger)data2
               timestamp:(uint64_t)timestamp;
- (BOOL)setTempo:(float)bpm;
- (BOOL)configureMetronomeEnabled:(BOOL)enabled
                              bpm:(float)bpm
                           volume:(float)volume
                       clickSound:(NSInteger)clickSound
                    accentEnabled:(BOOL)accentEnabled
                doubleTimeEnabled:(BOOL)doubleTimeEnabled
           timeSignatureNumerator:(NSInteger)timeSignatureNumerator;
- (BOOL)setOutputGainDb:(float)db enabled:(BOOL)enabled;
- (void)setCompatibilityMode:(BOOL)enabled;
- (void)stopAllNotes;

@end

NS_ASSUME_NONNULL_END
