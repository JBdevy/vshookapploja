#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^HKMidiNoteHandler)(NSInteger slot, NSString *deviceId, NSInteger channel,
                                  NSInteger note, NSInteger velocity);
typedef void (^HKMidiControlHandler)(NSInteger slot, NSString *deviceId, NSInteger channel,
                                     NSInteger controller, NSInteger value);
typedef void (^HKMidiDevicesChangedHandler)(void);
typedef void (^HKMidiPitchHandler)(NSInteger slot, NSString *deviceId, NSInteger channel, NSInteger value);

@interface HookKeysNativeEngine : NSObject
- (BOOL)beginPresetTransition;
- (BOOL)commitPresetTransition;
- (BOOL)configureTranceGate:(NSInteger)moduleIndex enabled:(BOOL)enabled steps:(NSInteger)steps length:(NSInteger)length beatMultiplier:(float)beatMultiplier gate:(float)gate depth:(float)depth attackMs:(float)attackMs releaseMs:(float)releaseMs swing:(float)swing;

@property(nonatomic, copy, nullable) HKMidiNoteHandler onMidiNote;
@property(nonatomic, copy, nullable) HKMidiControlHandler onMidiControl;
@property(nonatomic, copy, nullable) HKMidiPitchHandler onMidiPitch;
@property(nonatomic, copy, nullable) HKMidiDevicesChangedHandler onMidiDevicesChanged;
@property(nonatomic, readonly, copy) NSString *lastAudioErrorMessage;

- (BOOL)startWithBufferFrames:(NSInteger)bufferFrames sampleRate:(double)sampleRate;
- (BOOL)setAudioOutputDeviceId:(NSString *)deviceId
                      channels:(NSInteger)channels
                  bufferFrames:(NSInteger)bufferFrames
                    sampleRate:(double)sampleRate
                preserveEngine:(BOOL)preserveEngine;
- (BOOL)audioOutputReady;
// Caminho do gerador até a saída (mixer ou direto), formatos e layouts de canais.
- (NSString *)outputGraphDescription;
- (void)setMidiInputEnabled:(BOOL)enabled;
- (NSArray<NSNumber *> *)moduleMeterLevels;
- (NSArray<NSNumber *> *)moduleAnalysis:(NSInteger)moduleIndex;
- (void)stop;
- (NSArray<NSDictionary<NSString *, NSString *> *> *)listMidiDevices;
- (void)setMidiDeviceIds:(NSArray *)deviceIds;
- (BOOL)loadSoundFontAtPath:(NSString *)path moduleIndex:(NSInteger)moduleIndex;
- (BOOL)configureOrganDrawbars:(NSArray<NSNumber *> *)drawbars;
- (BOOL)cloneSoundFontFromModule:(NSInteger)sourceModuleIndex
                        toModule:(NSInteger)targetModuleIndex;
- (void)unloadSoundFontFromModule:(NSInteger)moduleIndex;
- (BOOL)configureModule:(NSInteger)moduleIndex
                 enabled:(BOOL)enabled
               inputSlot:(NSInteger)inputSlot
                 lowNote:(NSInteger)lowNote
                highNote:(NSInteger)highNote
                  octave:(NSInteger)octave
                 sustain:(BOOL)sustain
              modulation:(BOOL)modulation
       gmDrumHiHatChoke:(BOOL)gmDrumHiHatChoke
                volumeDb:(float)volumeDb
               polyphony:(NSInteger)polyphony
          velocityCurve0:(NSInteger)velocityCurve0
          velocityCurve1:(NSInteger)velocityCurve1
          velocityCurve2:(NSInteger)velocityCurve2
          velocityCurve3:(NSInteger)velocityCurve3
          velocityCurve4:(NSInteger)velocityCurve4
  noVelocitySensitivity:(BOOL)noVelocitySensitivity
                    mono:(BOOL)mono
                  legato:(BOOL)legato
      outputChannelStart:(NSInteger)outputChannelStart
      outputChannelCount:(NSInteger)outputChannelCount
            outputDualMono:(BOOL)outputDualMono;
- (BOOL)setModuleGainDb:(float)db moduleIndex:(NSInteger)moduleIndex;
- (BOOL)configureModuleEffects:(NSInteger)moduleIndex
                       cutoffHz:(float)cutoffHz
                 cutoffVelocity:(NSArray<NSNumber *> *)cutoffVelocity
               cutoffFilterType:(NSInteger)cutoffFilterType
        cutoffEnvelopeEnabled:(BOOL)cutoffEnvelopeEnabled
       cutoffEnvelopeAttackMs:(float)cutoffEnvelopeAttackMs
        cutoffEnvelopeDecayMs:(float)cutoffEnvelopeDecayMs
         cutoffEnvelopeSustain:(float)cutoffEnvelopeSustain
      cutoffEnvelopeReleaseMs:(float)cutoffEnvelopeReleaseMs
   cutoffEnvelopeDepthOctaves:(float)cutoffEnvelopeDepthOctaves
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
                      reverbMod:(float)reverbMod
                     reverbSize:(float)reverbSize
                      reverbMix:(float)reverbMix
                  rotaryEnabled:(BOOL)rotaryEnabled
                    rotarySpeed:(NSInteger)rotarySpeed
                   rotarySlowHz:(float)rotarySlowHz
                   rotaryFastHz:(float)rotaryFastHz
              rotaryRampSeconds:(float)rotaryRampSeconds
                    rotaryDepth:(float)rotaryDepth
                      rotaryMix:(float)rotaryMix
        rotaryModulationEnabled:(BOOL)rotaryModulationEnabled
                  chorusEnabled:(BOOL)chorusEnabled
                   chorusRateHz:(float)chorusRateHz
                    chorusDepth:(float)chorusDepth
                      chorusMix:(float)chorusMix
               autoFaderEnabled:(BOOL)autoFaderEnabled
                 autoFaderBeats:(float)autoFaderBeats
               autoFaderDepthDb:(float)autoFaderDepthDb
                    inputGainDb:(float)inputGainDb;
- (BOOL)configureModuleEnvelope:(NSInteger)moduleIndex
                        attackMs:(float)attackMs
                          holdMs:(float)holdMs
                         decayMs:(float)decayMs
                       releaseMs:(float)releaseMs glideMs:(float)glideMs
                       sustainDb:(float)sustainDb;
// mode: 0 User, 1 LFO de pitch, 2 Tremolo.
- (BOOL)configureModuleModulation:(NSInteger)moduleIndex mode:(NSInteger)mode rateHz:(float)rateHz;
- (BOOL)configureVelocityLimits:(NSInteger)moduleIndex
                     ignoreAbove:(NSInteger)ignoreAbove
                         ceiling:(NSInteger)ceiling
                oscillator1Limit:(NSInteger)oscillator1Limit
                oscillator2Limit:(NSInteger)oscillator2Limit
                oscillator3Limit:(NSInteger)oscillator3Limit;
- (BOOL)configureGlide:(NSInteger)moduleIndex
             portamento:(BOOL)portamento
      velocityGateEnabled:(BOOL)velocityGateEnabled
     velocityGateInverted:(BOOL)velocityGateInverted
        velocityThreshold:(NSInteger)velocityThreshold;
- (BOOL)configureSynth:(NSInteger)oscillator1
                           oscillator2:(NSInteger)oscillator2
                           oscillator3:(NSInteger)oscillator3
                    oscillator1Enabled:(BOOL)oscillator1Enabled
                    oscillator2Enabled:(BOOL)oscillator2Enabled
                    oscillator3Enabled:(BOOL)oscillator3Enabled
                              voiceMode:(NSInteger)voiceMode
                              lfoTarget:(NSInteger)lfoTarget
                      oscillator1Volume:(float)oscillator1Volume
                      oscillator2Volume:(float)oscillator2Volume
                      oscillator3Volume:(float)oscillator3Volume
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
                      oscillator2Octave:(NSInteger)oscillator2Octave
                      oscillator3Octave:(NSInteger)oscillator3Octave;
- (BOOL)sendMidiFromSlot:(NSInteger)slot
                  status:(NSInteger)status
                   data1:(NSInteger)data1
                   data2:(NSInteger)data2
               timestamp:(uint64_t)timestamp;
- (BOOL)setTempo:(float)bpm;
- (BOOL)setGlobalTranspose:(NSInteger)semitones;
- (BOOL)setMetronomeOutputChannelStart:(NSInteger)channelStart channelCount:(NSInteger)channelCount;
- (BOOL)configureMetronomeEnabled:(BOOL)enabled
                              bpm:(float)bpm
                           volume:(float)volume
                       clickSound:(NSInteger)clickSound
                    accentEnabled:(BOOL)accentEnabled
                doubleTimeEnabled:(BOOL)doubleTimeEnabled
           timeSignatureNumerator:(NSInteger)timeSignatureNumerator;
- (BOOL)setOutputGainDb:(float)db enabled:(BOOL)enabled;
// Músicas no motor. loadTrack devolve a duração em segundos, ou -1.
- (double)loadTrackId:(NSInteger)sourceId path:(NSString *)path;
- (BOOL)controlTrackId:(NSInteger)sourceId action:(NSString *)action seconds:(double)seconds loop:(BOOL)loop;
- (NSDictionary<NSString *, id> *)trackStatus;
- (BOOL)configureTrackOutputChannelStart:(NSInteger)channelStart
                            channelCount:(NSInteger)channelCount
                                  gainDb:(float)gainDb
                                 enabled:(BOOL)enabled;
- (void)setCompatibilityMode:(BOOL)enabled;
- (void)setSeamlessPresetSwitching:(BOOL)enabled;
- (void)stopAllNotes;

@end

NS_ASSUME_NONNULL_END
