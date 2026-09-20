#include "hook_keys/NativeEngineRuntime.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <new>

namespace {
hook_keys::NativeEngineRuntime* runtime(void* handle) noexcept {
  return static_cast<hook_keys::NativeEngineRuntime*>(handle);
}
}

extern "C" {

void* hk_runtime_create(double sampleRate, std::size_t maximumBlockFrames) noexcept {
  try { return new hook_keys::NativeEngineRuntime(sampleRate, maximumBlockFrames); }
  catch (...) { return nullptr; }
}

void hk_runtime_destroy(void* handle) noexcept { delete runtime(handle); }

int hk_runtime_begin_preset_transition(void* handle) noexcept {
  return handle && runtime(handle)->beginPresetTransition() ? 1 : 0;
}

int hk_runtime_commit_preset_transition(void* handle) noexcept {
  return handle && runtime(handle)->commitPresetTransition() ? 1 : 0;
}

void hk_runtime_set_compatibility_mode(void* handle, int enabled) noexcept {
  if (handle) runtime(handle)->setCompatibilityMode(enabled != 0);
}

void hk_runtime_set_seamless_preset_switching(
    void* handle, int enabled, std::size_t cacheBudgetBytes) noexcept {
  if (handle) runtime(handle)->setSeamlessPresetSwitching(enabled != 0, cacheBudgetBytes);
}

void hk_runtime_set_midi_input_enabled(void* handle, int enabled) noexcept {
  if (handle) runtime(handle)->setMidiInputEnabled(enabled != 0);
}

int hk_runtime_set_trance_gate(void* handle, std::size_t moduleIndex, int enabled, int steps,
    int length, float beatMultiplier, float gate, float depth, float attackMs, float releaseMs, float swing) noexcept {
  if (!handle || moduleIndex >= hook_keys::kModuleCount) return 0;
  hook_keys::ModuleEffectsConfig::TranceGateConfig config;
  config.enabled = enabled != 0;
  config.steps = static_cast<std::uint16_t>(steps);
  config.length = static_cast<std::uint8_t>(std::clamp(length, 1, 16));
  config.beatMultiplier = beatMultiplier;
  config.gate = gate;
  config.depth = depth;
  config.attackMs = attackMs;
  config.releaseMs = releaseMs;
  config.swing = swing;
  return runtime(handle)->setTranceGate(moduleIndex, config) ? 1 : 0;
}

int hk_runtime_load_soundfont(void* handle, std::size_t moduleIndex, const char* path) noexcept {
  return handle && path && runtime(handle)->loadSoundFont(moduleIndex, path) ? 1 : 0;
}

int hk_runtime_load_organ_voice(
    void* handle, std::size_t drawbarIndex, const char* path) noexcept {
  return handle && path && runtime(handle)->loadOrganVoice(drawbarIndex, path) ? 1 : 0;
}

void hk_runtime_set_organ_drawbar(
    void* handle, std::size_t drawbarIndex, int position) noexcept {
  if (handle) {
    runtime(handle)->setOrganDrawbarPosition(
        drawbarIndex, static_cast<std::uint8_t>(std::clamp(position, 0, 8)));
  }
}

int hk_runtime_clone_soundfont(
    void* handle, std::size_t sourceModuleIndex, std::size_t targetModuleIndex) noexcept {
  return handle && runtime(handle)->cloneSoundFont(sourceModuleIndex, targetModuleIndex) ? 1 : 0;
}

void hk_runtime_unload_soundfont(void* handle, std::size_t moduleIndex) noexcept {
  if (handle) runtime(handle)->unloadSoundFont(moduleIndex);
}

int hk_runtime_send_midi(void* handle, std::uint8_t inputSlot, std::uint8_t status,
                         std::uint8_t data1, std::uint8_t data2) noexcept {
  return handle && runtime(handle)->sendMidi(inputSlot, status, data1, data2) ? 1 : 0;
}

int hk_runtime_configure_module(
    void* handle, std::size_t moduleIndex, int enabled, int inputSlot, int lowNote,
    int highNote, int octave, int sustain, int modulation, float volumeDb,
    int gmDrumHiHatChoke, int polyphony, int velocityCurve0, int velocityCurve1, int velocityCurve2,
    int velocityCurve3, int velocityCurve4, int noVelocitySensitivity, int mono, int legato,
    int outputChannelStart, int outputChannelCount, int outputDualMono) noexcept {
  if (!handle || moduleIndex >= hook_keys::kModuleCount) return 0;
  hook_keys::ModuleConfig config;
  config.enabled = enabled != 0;
  config.midiInputSlot = inputSlot == static_cast<int>(hook_keys::kArpeggiatorInput)
      ? static_cast<std::uint8_t>(inputSlot)
      : inputSlot >= 0 && inputSlot < static_cast<int>(hook_keys::kMidiInputCount)
          ? static_cast<std::uint8_t>(inputSlot) : hook_keys::kAllMidiInputs;
  config.lowNote = static_cast<std::uint8_t>(std::clamp(lowNote, 0, 127));
  config.highNote = static_cast<std::uint8_t>(std::clamp(highNote, 0, 127));
  config.octaveShift = static_cast<std::int8_t>(std::clamp(octave, -3, 3));
  config.sustainInputEnabled = sustain != 0;
  config.modulationInputEnabled = modulation != 0;
  config.gmDrumHiHatChoke = gmDrumHiHatChoke != 0;
  config.gainLinear = volumeDb <= -90.0f ? 0.0f : std::pow(10.0f, volumeDb / 20.0f);
  config.polyphony = static_cast<std::uint16_t>(std::clamp(polyphony, 1, 128));
  config.velocityCurve = {
      static_cast<std::uint8_t>(std::clamp(velocityCurve0, 0, 127)),
      static_cast<std::uint8_t>(std::clamp(velocityCurve1, 0, 127)),
      static_cast<std::uint8_t>(std::clamp(velocityCurve2, 0, 127)),
      static_cast<std::uint8_t>(std::clamp(velocityCurve3, 0, 127)),
      static_cast<std::uint8_t>(std::clamp(velocityCurve4, 0, 127))};
  config.noVelocitySensitivity = noVelocitySensitivity != 0;
  config.mono = mono != 0;
  config.legato = legato != 0;
  config.outputChannelStart = static_cast<std::uint8_t>(std::clamp(outputChannelStart, 0, 31));
  config.outputChannelCount = outputChannelCount == 1 ? 1 : 2;
  config.outputDualMono = outputDualMono != 0;
  return runtime(handle)->setModuleConfig(moduleIndex, config) ? 1 : 0;
}

int hk_runtime_set_module_gain(
    void* handle, std::size_t moduleIndex, float db) noexcept {
  return handle && runtime(handle)->setModuleGainDb(moduleIndex, db) ? 1 : 0;
}

int hk_runtime_configure_velocity_limits(
    void* handle, std::size_t moduleIndex, int ignoreAbove, int ceiling,
    int oscillator1Limit, int oscillator2Limit, int oscillator3Limit) noexcept {
  return handle && runtime(handle)->setVelocityLimits(moduleIndex,
      static_cast<std::uint8_t>(std::clamp(ignoreAbove, 0, 127)), static_cast<std::uint8_t>(std::clamp(ceiling, 0, 127)),
      static_cast<std::uint8_t>(std::clamp(oscillator1Limit, 0, 127)), static_cast<std::uint8_t>(std::clamp(oscillator2Limit, 0, 127)),
      static_cast<std::uint8_t>(std::clamp(oscillator3Limit, 0, 127))) ? 1 : 0;
}

int hk_runtime_configure_glide(
    void* handle, std::size_t moduleIndex, int portamento, int velocityGateEnabled,
    int velocityGateInverted, int velocityThreshold) noexcept {
  if (!handle) return 0;
  hook_keys::GlideBehavior behavior;
  behavior.portamento = portamento != 0;
  behavior.velocityGateEnabled = velocityGateEnabled != 0;
  behavior.velocityGateInverted = velocityGateInverted != 0;
  behavior.velocityThreshold = static_cast<std::uint8_t>(std::clamp(velocityThreshold, 0, 127));
  return runtime(handle)->setGlideBehavior(moduleIndex, behavior) ? 1 : 0;
}

// mode: 0 User, 1 LFO de pitch, 2 Tremolo.
int hk_runtime_configure_module_modulation(
    void* handle, std::size_t moduleIndex, int mode, float rateHz) noexcept {
  return handle && runtime(handle)->setModuleModulationMode(
      moduleIndex, static_cast<std::uint8_t>(std::clamp(mode, 0, 3)), rateHz) ? 1 : 0;
}

int hk_runtime_configure_effects(
    void* handle, std::size_t moduleIndex, float cutoffHz, const int* cutoffVelocity,
    int cutoffFilterType, int cutoffEnvelopeEnabled, float cutoffEnvelopeAttackMs,
    float cutoffEnvelopeDecayMs, float cutoffEnvelopeSustain, float cutoffEnvelopeReleaseMs,
    float cutoffEnvelopeDepthOctaves,
    const int* eqTypes,
    const float* eqFrequencies, const float* eqGains, const float* eqQualities,
    const int* eqCutStages, float compressorThresholdDb, float compressorRatio,
    float compressorAttackMs, float compressorReleaseMs, float compressorGainDb,
    float compressorMix, int delaySync, float delayMs, float delayBeatMultiplier,
    float delayFeedback, float delayMix, float reverbDecay, float reverbDampen,
    float reverbMod, float reverbSize, float reverbMix, int rotaryEnabled, int rotarySpeed,
    float rotarySlowHz, float rotaryFastHz, float rotaryRampSeconds,
    float rotaryDepth, float rotaryMix, int rotaryModulationEnabled,
    int chorusEnabled, float chorusRateHz, float chorusDepth, float chorusMix,
    int autoFaderEnabled, float autoFaderBeats, float autoFaderDepthDb,
    float inputGainDb) noexcept {
  if (!handle || moduleIndex >= hook_keys::kModuleCount || !cutoffVelocity || !eqTypes || !eqFrequencies ||
      !eqGains || !eqQualities || !eqCutStages) return 0;
  hook_keys::ModuleEffectsConfig effects;
  effects.cutoff.enabled = true;
  effects.cutoff.frequencyHz = cutoffHz;
  effects.cutoff.type = static_cast<hook_keys::FilterKind>(std::clamp(cutoffFilterType, 0, 3));
  effects.cutoff.envelope.enabled = cutoffEnvelopeEnabled != 0;
  effects.cutoff.envelope.attackMs = cutoffEnvelopeAttackMs;
  effects.cutoff.envelope.decayMs = cutoffEnvelopeDecayMs;
  effects.cutoff.envelope.sustain = cutoffEnvelopeSustain;
  effects.cutoff.envelope.releaseMs = cutoffEnvelopeReleaseMs;
  effects.cutoff.envelope.depthOctaves = cutoffEnvelopeDepthOctaves;
  for (std::size_t index = 0; index < effects.cutoff.velocityCurve.size(); ++index) {
    effects.cutoff.velocityCurve[index] = static_cast<std::uint8_t>(std::clamp(cutoffVelocity[index], 0, 127));
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
  effects.delay = {delayMix > 0.0001f, delaySync != 0, delayMs, delayBeatMultiplier, delayFeedback, delayMix};
  effects.reverb = {reverbMix > 0.0001f, reverbDecay, reverbDampen, reverbSize, reverbMix, reverbMod};
  effects.rotary = {rotaryEnabled != 0, static_cast<std::uint8_t>(std::clamp(rotarySpeed, 0, 2)),
                    rotarySlowHz, rotaryFastHz, rotaryRampSeconds, rotaryDepth, rotaryMix,
                    rotaryModulationEnabled != 0};
  effects.chorus = {chorusEnabled != 0, chorusRateHz, chorusDepth, chorusMix};
  effects.autoFader = {autoFaderEnabled != 0, autoFaderBeats, autoFaderDepthDb};
  effects.inputGainDb = inputGainDb;
  return runtime(handle)->setModuleEffects(moduleIndex, effects) ? 1 : 0;
}

int hk_runtime_configure_envelope(void* handle, std::size_t moduleIndex, float attackMs,
                                  float holdMs, float decayMs, float releaseMs, float glideMs,
                                  float sustainDb) noexcept {
  return handle && runtime(handle)->setModuleEnvelope(
      moduleIndex, attackMs, holdMs, decayMs, releaseMs, glideMs, sustainDb) ? 1 : 0;
}

int hk_runtime_configure_synth(
    void* handle, int oscillator1, int oscillator2, int oscillator3, int oscillator1Enabled,
    int oscillator2Enabled, int oscillator3Enabled, int voiceMode, int lfoTarget,
    float oscillator1Volume, float oscillator2Volume, float oscillator3Volume, float detuneCents, float attackMs, float holdMs,
    float decayMs, float sustain, float releaseMs, float filterCutoffHz,
    float filterResonance, float filterEnvelope, float lfoRateHz, float lfoDepth,
    float glideMs, int oscillator1Octave, int oscillator2Octave, int oscillator3Octave) noexcept {
  if (!handle) return 0;
  hook_keys::AnalogSynthConfig config;
  config.oscillator1 = static_cast<std::uint8_t>(std::clamp(oscillator1, 0, 3));
  config.oscillator2 = static_cast<std::uint8_t>(std::clamp(oscillator2, 0, 3));
  config.oscillator3 = static_cast<std::uint8_t>(std::clamp(oscillator3, 0, 3));
  config.oscillator1Enabled = oscillator1Enabled != 0;
  config.oscillator2Enabled = oscillator2Enabled != 0;
  config.oscillator3Enabled = oscillator3Enabled != 0;
  config.voiceMode = static_cast<std::uint8_t>(std::clamp(voiceMode, 0, 2));
  config.lfoTarget = static_cast<std::uint8_t>(std::clamp(lfoTarget, 0, 2));
  config.oscillator1Volume = oscillator1Volume;
  config.oscillator2Volume = oscillator2Volume;
  config.oscillator3Volume = oscillator3Volume;
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
  config.oscillator1Octave = static_cast<std::int8_t>(std::clamp(oscillator1Octave, -3, 3));
  config.oscillator2Octave = static_cast<std::int8_t>(std::clamp(oscillator2Octave, -3, 3));
  config.oscillator3Octave = static_cast<std::int8_t>(std::clamp(oscillator3Octave, -3, 3));
  return runtime(handle)->setSynthConfig(config) ? 1 : 0;
}

int hk_runtime_set_tempo(void* handle, float bpm) noexcept {
  return handle && runtime(handle)->setTempo(bpm) ? 1 : 0;
}

int hk_runtime_set_global_transpose(void* handle, int semitones) noexcept {
  return handle && runtime(handle)->setGlobalTranspose(semitones) ? 1 : 0;
}

void hk_runtime_set_metronome_output(void* handle, int channelStart, int channelCount) noexcept {
  if (!handle) return;
  runtime(handle)->setMetronomeOutput(
      static_cast<std::uint8_t>(std::clamp(channelStart, 0, 31)), channelCount == 1 ? 1 : 2);
}

void hk_runtime_configure_metronome(
    void* handle, int enabled, float bpm, float volume, int clickSound,
    int accentEnabled, int doubleTimeEnabled, int numerator) noexcept {
  if (!handle) return;
  runtime(handle)->setMetronome(
      enabled != 0, bpm, volume,
      static_cast<std::uint8_t>(std::clamp(clickSound, 1, 3)),
      accentEnabled != 0, doubleTimeEnabled != 0,
      static_cast<std::uint8_t>(std::clamp(numerator, 1, 16)));
}

void hk_runtime_set_output_gain(void* handle, float db, int enabled) noexcept {
  if (handle) runtime(handle)->setOutputGainDb(db, enabled != 0);
}

void hk_runtime_stop_all_notes(void* handle) noexcept {
  if (handle) runtime(handle)->stopAllNotes();
}

void hk_runtime_render(void* handle, float* output, std::size_t frames,
                       std::size_t channels) noexcept {
  if (handle) runtime(handle)->renderInterleaved(output, frames, channels);
}

// [0] pior bloco desde a ultima leitura, [1] media suavizada, [2] estouros.
// 1.0 significa que o callback consumiu o prazo inteiro do bloco.
void hk_runtime_audio_load(void* handle, float* output) noexcept {
  if (!handle || !output) return;
  const auto load = runtime(handle)->consumeAudioLoad();
  output[0] = load.peak;
  output[1] = load.smoothed;
  output[2] = static_cast<float>(load.overruns);
}

void hk_runtime_module_peaks(void* handle, float* output) noexcept {
  if (!handle || !output) return;
  const auto peaks = runtime(handle)->consumeModulePeaks();
  std::copy(peaks.begin(), peaks.end(), output);
}

void hk_runtime_module_analysis(
    void* handle, std::size_t module_index, float* output) noexcept {
  if (!handle || !output) return;
  const auto analysis = runtime(handle)->consumeModuleAnalysis(module_index);
  std::copy(analysis.begin(), analysis.end(), output);
}

}
