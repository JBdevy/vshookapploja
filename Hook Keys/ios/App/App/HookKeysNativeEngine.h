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
- (BOOL)beginNativePresetTransition;
- (void)cancelPresetTransition;
- (BOOL)configureTranceGate:(NSInteger)moduleIndex enabled:(BOOL)enabled steps:(NSInteger)steps length:(NSInteger)length beatMultiplier:(float)beatMultiplier measureBeats:(float)measureBeats gate:(float)gate depth:(float)depth attackMs:(float)attackMs releaseMs:(float)releaseMs swing:(float)swing;

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
- (BOOL)applyOrganFactoryDefaults;
- (BOOL)setOrganRotaryFast:(BOOL)fast;
- (BOOL)setOrganCabinetEnabled:(BOOL)enabled;
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
 drumZeroReleaseMask0:(NSInteger)drumZeroReleaseMask0
 drumZeroReleaseMask1:(NSInteger)drumZeroReleaseMask1
 drumZeroReleaseMask2:(NSInteger)drumZeroReleaseMask2
 drumZeroReleaseMask3:(NSInteger)drumZeroReleaseMask3
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
- (BOOL)setModuleEnabledMask:(NSInteger)mask NS_SWIFT_NAME(setModuleEnabledMask(_:));
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
                  reverbImpulse:(NSInteger)reverbImpulse
                  rotaryEnabled:(BOOL)rotaryEnabled
                    rotarySpeed:(NSInteger)rotarySpeed
                   rotarySlowHz:(float)rotarySlowHz
                   rotaryFastHz:(float)rotaryFastHz
              rotaryRampSeconds:(float)rotaryRampSeconds
                    rotaryDepth:(float)rotaryDepth
                      rotaryMix:(float)rotaryMix
        rotaryModulationEnabled:(BOOL)rotaryModulationEnabled
           rotaryCabinetEnabled:(BOOL)rotaryCabinetEnabled
                  chorusEnabled:(BOOL)chorusEnabled
                   chorusRateHz:(float)chorusRateHz
                    chorusDepth:(float)chorusDepth
                      chorusMix:(float)chorusMix
                  loFiEnabled:(BOOL)loFiEnabled
                 loFiBitDepth:(float)loFiBitDepth
             loFiSampleRateHz:(float)loFiSampleRateHz
                       loFiMix:(float)loFiMix
              loFiVinylEnabled:(BOOL)loFiVinylEnabled
                     loFiNoise:(float)loFiNoise
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
- (BOOL)configureEqualizer:(NSInteger)moduleIndex enabled:(BOOL)enabled
                    types:(NSArray<NSNumber *> *)types frequencies:(NSArray<NSNumber *> *)frequencies
                    gains:(NSArray<NSNumber *> *)gains qualities:(NSArray<NSNumber *> *)qualities
                cutStages:(NSArray<NSNumber *> *)cutStages
    NS_SWIFT_NAME(configureEqualizer(_:enabled:types:frequencies:gains:qualities:cutStages:));
- (BOOL)configureReverb:(NSInteger)moduleIndex enabled:(BOOL)enabled impulse:(NSInteger)impulse mix:(float)mix decay:(float)decay
    NS_SWIFT_NAME(configureReverb(_:enabled:impulse:mix:decay:));
- (BOOL)configureDelay:(NSInteger)moduleIndex enabled:(BOOL)enabled sync:(BOOL)sync
          milliseconds:(float)milliseconds beatMultiplier:(float)beatMultiplier
              feedback:(float)feedback mix:(float)mix
    NS_SWIFT_NAME(configureDelay(_:enabled:sync:milliseconds:beatMultiplier:feedback:mix:));
// mode: 0 User, 1 LFO de pitch, 2 Tremolo.
- (BOOL)configureModuleModulation:(NSInteger)moduleIndex
                              mode:(NSInteger)mode
                            rateHz:(float)rateHz
                         intensity:(float)intensity;
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
                 oscillator1DetuneCents:(float)oscillator1DetuneCents
                 oscillator2DetuneCents:(float)oscillator2DetuneCents
                 oscillator3DetuneCents:(float)oscillator3DetuneCents
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
- (BOOL)setPadNote:(NSInteger)note bankIndex:(NSInteger)bankIndex
            enabled:(BOOL)enabled velocity:(NSInteger)velocity;
- (BOOL)setPadOutputGainDb:(float)db enabled:(BOOL)enabled
             channelStart:(NSInteger)channelStart channelCount:(NSInteger)channelCount
                   lowCutHz:(float)lowCutHz highCutHz:(float)highCutHz;
// Pads e FX aprendidos no canal MIDI 10 são resolvidos no runtime C++.
// A thread Core MIDI não atravessa Swift/JavaScript para disparar áudio.
- (void)clearPerformanceMappings;
- (void)setPerformanceMappingForNote:(NSInteger)midiNote
                                kind:(NSInteger)kind
                           bankIndex:(NSInteger)bankIndex
                           itemIndex:(NSInteger)itemIndex
                                mode:(NSInteger)mode
                              gainDb:(float)gainDb;
- (BOOL)loadEffectAtPath:(NSString *)path
               bankIndex:(NSInteger)bankIndex
               itemIndex:(NSInteger)itemIndex
    NS_SWIFT_NAME(loadEffect(path:bankIndex:itemIndex:));
- (BOOL)triggerEffectBankIndex:(NSInteger)bankIndex
                      itemIndex:(NSInteger)itemIndex
                        enabled:(BOOL)enabled
                         gainDb:(float)gainDb
    NS_SWIFT_NAME(triggerEffect(bankIndex:itemIndex:enabled:gainDb:));
- (BOOL)setEffectOutputGainDb:(float)db enabled:(BOOL)enabled
                 channelStart:(NSInteger)channelStart channelCount:(NSInteger)channelCount;
- (NSArray<NSNumber *> *)effectMeterLevels;
- (BOOL)setTempo:(float)bpm;
- (BOOL)setGlobalTranspose:(NSInteger)semitones;
- (BOOL)setMetronomeOutputChannelStart:(NSInteger)channelStart channelCount:(NSInteger)channelCount;
- (BOOL)configureMetronomeEnabled:(BOOL)enabled
                              bpm:(float)bpm
                           volume:(float)volume
                       clickSound:(NSInteger)clickSound
                    accentEnabled:(BOOL)accentEnabled
                doubleTimeEnabled:(BOOL)doubleTimeEnabled
           timeSignatureNumerator:(NSInteger)timeSignatureNumerator
         timeSignatureDenominator:(NSInteger)timeSignatureDenominator
                          restart:(BOOL)restart;
- (BOOL)setOutputGainDb:(float)db enabled:(BOOL)enabled
       channelStart:(NSInteger)channelStart channelCount:(NSInteger)channelCount;
// Músicas no motor. loadTrack devolve a duração em segundos, ou -1.
- (double)loadTrackId:(NSInteger)sourceId path:(NSString *)path;
- (BOOL)controlTrackId:(NSInteger)sourceId action:(NSString *)action seconds:(double)seconds
                  loop:(BOOL)loop playbackRate:(double)playbackRate
       syncMetronome:(BOOL)syncMetronome;
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
