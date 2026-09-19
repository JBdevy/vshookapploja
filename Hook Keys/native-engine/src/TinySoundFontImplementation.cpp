// TinySoundFont's standard 64-sample control block avoids recalculating every
// envelope, filter and LFO for every voice on every sample. Hook Keys linearly
// interpolates the envelope gain inside that block (see tsf.h), so this keeps
// Note Off smooth without overrunning the audio callback on layered chords.
#define TSF_RENDER_EFFECTSAMPLEBLOCK 64
#define TSF_IMPLEMENTATION
#include "tsf.h"
#include "hook_keys/TinySoundFontExtensions.hpp"
#include <algorithm>
#include <cmath>
#include <cstddef>

static void applyFilterStage(tsf_voice_lowpass& filter, float frequency, float sampleRate,
    bool highpass, bool bypass) noexcept {
  const bool active = !bypass;
  if (active != static_cast<bool>(filter.active)) filter.z1 = filter.z2 = 0;
  filter.active = active;
  filter.QInv = 1.4142135623730951;
  if (!active) return;
  const auto normalized = std::min(frequency / sampleRate, 0.45f);
  if (highpass) tsf_voice_highpass_setup(&filter, normalized);
  else tsf_voice_lowpass_setup(&filter, normalized);
}

// LP4/HP4 rodam o mesmo estagio duas vezes (24 dB/oitava); LP2/HP2 deixam o
// segundo estagio sempre em bypass. Lowpass some perto do teto (nada a cortar
// acima); Highpass some perto do piso (nada a cortar abaixo).
static void applyCutoffStages(tsf_voice& voice, const hook_keys::CutoffConfig& config,
    float frequency, float sampleRate) noexcept {
  const bool highpass = hook_keys::filterKindIsHighpass(config.type);
  const bool fourPole = hook_keys::filterKindIsFourPole(config.type);
  const bool bypass = highpass ? frequency <= 20.5f : frequency >= 19999.0f;
  applyFilterStage(voice.hookCutoff, frequency, sampleRate, highpass, bypass);
  applyFilterStage(voice.hookCutoffStage2, frequency, sampleRate, highpass, bypass || !fourPole);
}

// level 0..1: 0 é o ponto mais fechado que o Depth permite, 1 é o Cutoff
// configurado (o comportamento de sempre quando o envelope está desligado).
static float filterEnvelopeFrequency(
    const hook_keys::CutoffConfig& config, float baseFrequency, float level) noexcept {
  const auto& envelope = config.envelope;
  if (!envelope.enabled || envelope.depthOctaves <= 0.0f) return baseFrequency;
  return baseFrequency * std::pow(2.0f, envelope.depthOctaves * (level - 1.0f));
}

static void configureVoiceCutoff(tsf_voice& voice, const hook_keys::CutoffConfig& config,
    float sampleRate, bool resetEnvelope) noexcept {
  if (resetEnvelope) {
    voice.hookFilterEnvLevel = 0.0f;
    voice.hookFilterEnvReachedPeak = 0;
  }
  const auto baseFrequency = config.frequencyForVelocity(voice.hookFilterVelocity);
  const auto frequency = filterEnvelopeFrequency(config, baseFrequency, voice.hookFilterEnvLevel);
  applyCutoffStages(voice, config, frequency, sampleRate);
}

void hook_keys_tsf_set_cutoff(tsf* synth, const hook_keys::CutoffConfig& config) noexcept {
  if (!synth) return;
  for (int i = 0; i < synth->voiceNum; ++i) {
    auto& voice = synth->voices[i];
    // false: uma mudança no Cutoff/Velocity não reinicia o envelope de quem
    // já está soando — só o Note On seguinte começa do zero.
    if (voice.playingPreset >= 0) configureVoiceCutoff(voice, config, synth->outSampleRate, false);
  }
}

void hook_keys_tsf_advance_filter_envelope(
    tsf* synth, const hook_keys::CutoffConfig& config, std::size_t frames, float sampleRate) noexcept {
  if (!synth || !config.envelope.enabled || config.envelope.depthOctaves <= 0.0f) return;
  const auto& envelope = config.envelope;
  const auto blockSeconds = static_cast<float>(frames) / sampleRate;
  const auto attackCoefficient = std::exp(-blockSeconds / std::max(envelope.attackMs * 0.001f, 0.001f));
  const auto decayCoefficient = std::exp(-blockSeconds / std::max(envelope.decayMs * 0.001f, 0.001f));
  const auto releaseCoefficient = std::exp(-blockSeconds / std::max(envelope.releaseMs * 0.001f, 0.001f));
  for (int i = 0; i < synth->voiceNum; ++i) {
    auto& voice = synth->voices[i];
    if (voice.playingPreset < 0) continue;
    const bool released = voice.ampenv.segment >= TSF_SEGMENT_RELEASE;
    float target = 0.0f;
    float coefficient = releaseCoefficient;
    if (!released) {
      if (!voice.hookFilterEnvReachedPeak) { target = 1.0f; coefficient = attackCoefficient; }
      else { target = envelope.sustain; coefficient = decayCoefficient; }
    }
    voice.hookFilterEnvLevel = target + (voice.hookFilterEnvLevel - target) * coefficient;
    if (!released && !voice.hookFilterEnvReachedPeak && voice.hookFilterEnvLevel >= 0.999f) {
      voice.hookFilterEnvLevel = 1.0f;
      voice.hookFilterEnvReachedPeak = 1;
    }
    const auto baseFrequency = config.frequencyForVelocity(voice.hookFilterVelocity);
    const auto frequency = baseFrequency * std::pow(2.0f, envelope.depthOctaves * (voice.hookFilterEnvLevel - 1.0f));
    applyCutoffStages(voice, config, frequency, sampleRate);
  }
}

bool hook_keys_tsf_note_on_with_auto_glide(tsf* synth, HookKeysGlideState& state,
    int channel, std::uint8_t note, float velocity, float milliseconds,
    const hook_keys::CutoffConfig* cutoff, std::uint8_t filterVelocity,
    hook_keys::GlideBehavior behavior) noexcept {
  if (!synth) return false;
  // Capture this Note On's generation before TinySoundFont increments it. This
  // lets every region/voice spawned by this exact note receive its own Auto
  // Glide without looking at any previously played note.
  const auto playIndex = synth->voicePlayIndex;
  if (!tsf_channel_note_on(synth, channel, note, velocity)) return false;
  // Auto starts one whole tone below; Portamento starts at the previous note
  // and has nothing to slide from on the first note.
  const bool glides = milliseconds > 0 && behavior.glidesAt(filterVelocity);
  const float startSemitones = !behavior.portamento ? -2.0f
      : state.lastNote >= 0 ? static_cast<float>(state.lastNote - note) : 0.0f;
  state.lastNote = note;
  const auto count = std::min(synth->voiceNum, static_cast<int>(state.voices.size()));
  for (int i = 0; i < count; ++i) {
    auto& voice = synth->voices[i];
    if (voice.playingPreset < 0 || voice.playingChannel != channel ||
        voice.playingKey != note || voice.playIndex != playIndex) continue;
    voice.hookFilterVelocity = filterVelocity;
    if (cutoff) configureVoiceCutoff(voice, *cutoff, synth->outSampleRate, true);
    auto& glide = state.voices[i];
    if (!glides || startSemitones == 0.0f) {
      glide = {};
      continue;
    }
    glide.playIndex = voice.playIndex;
    glide.startSemitones = startSemitones;
    glide.remaining = glide.total = std::max<std::uint32_t>(1,
        static_cast<std::uint32_t>(milliseconds * synth->outSampleRate / 1000.0f));
  }
  return true;
}

void hook_keys_tsf_steal_note(tsf* synth, HookKeysGlideState& state,
    int channel, std::uint8_t note) noexcept {
  if (!synth) return;
  const auto count = std::min(synth->voiceNum, static_cast<int>(state.voices.size()));
  for (int i = 0; i < count; ++i) {
    auto& voice = synth->voices[i];
    if (voice.playingPreset < 0 || voice.playingChannel != channel || voice.playingKey != note) continue;
    // TinySoundFont's quick end is a 10 ms anti-click release and explicitly
    // bypasses a held sustain pedal for this stolen voice.
    voice.heldSustain = 0;
    tsf_voice_endquick(synth, &voice);
    state.voices[i] = {};
  }
}

bool hook_keys_tsf_legato_retune(tsf* synth, HookKeysGlideState& state,
    int channel, std::uint8_t oldNote, std::uint8_t newNote, float milliseconds,
    const hook_keys::CutoffConfig* cutoff, std::uint8_t filterVelocity,
    hook_keys::GlideBehavior behavior) noexcept {
  if (!synth) return false;
  bool found = false;
  const bool glides = milliseconds > 0.0f && behavior.glidesAt(filterVelocity);
  const auto count = std::min(synth->voiceNum, static_cast<int>(state.voices.size()));
  for (int i = 0; i < count; ++i) {
    auto& voice = synth->voices[i];
    if (voice.playingPreset < 0 || voice.playingChannel != channel || voice.playingKey != oldNote) continue;
    found = true;
    voice.playingKey = newNote;
    voice.hookFilterVelocity = filterVelocity;
    // false: legato não reinicia o envelope do Cutoff, só reaponta o alvo.
    if (cutoff) configureVoiceCutoff(voice, *cutoff, synth->outSampleRate, false);
    auto& glide = state.voices[i];
    if (!glides) {
      glide = {};
      tsf_voice_calcpitchratio(&voice, 0, synth->outSampleRate);
      continue;
    }
    glide.playIndex = voice.playIndex;
    glide.startSemitones = static_cast<float>(oldNote) - static_cast<float>(newNote);
    glide.remaining = glide.total = std::max<std::uint32_t>(1,
        static_cast<std::uint32_t>(milliseconds * synth->outSampleRate / 1000.0f));
  }
  if (found) state.lastNote = newNote;
  return found;
}

void hook_keys_tsf_render_glide(tsf* synth, HookKeysGlideState& state,
    float* output, int frames, bool enabled) noexcept {
  // Small fixed chunks keep portamento smooth without allocation in render.
  const auto count = std::min(synth->voiceNum, static_cast<int>(state.voices.size()));
  for (int offset = 0; offset < frames;) {
    const auto chunk = std::min(32, frames - offset);
    for (int i = 0; i < count; ++i) {
      auto& voice = synth->voices[i];
      auto& glide = state.voices[i];
      if (!glide.total) continue;
      if (voice.playingPreset < 0 || glide.playIndex != voice.playIndex) {
        glide = {};
        continue;
      }
      // Recompute base pitch every chunk so MIDI pitch bend remains additive.
      const auto& channel = synth->channels->channels[voice.playingChannel];
      const auto bend = channel.pitchWheel == 8192 ? channel.tuning
          : channel.pitchWheel / 16383.0f * channel.pitchRange * 2 - channel.pitchRange + channel.tuning;
      const auto shift = enabled ? glide.startSemitones * glide.remaining / glide.total : 0.0f;
      tsf_voice_calcpitchratio(&voice, bend + shift, synth->outSampleRate);
      if (!enabled || glide.remaining == 0) glide = {};
      else glide.remaining -= std::min(glide.remaining, static_cast<std::uint32_t>(chunk));
    }
    tsf_render_float(synth, output + offset * 2, chunk, 0);
    offset += chunk;
  }
}

extern "C" void hook_keys_tsf_set_volume_envelope(
    tsf* synth, float attackSeconds, float holdSeconds,
    float decaySeconds, float releaseSeconds, float sustain) noexcept {
  if (synth == nullptr || synth->presetNum <= 0) return;
  const auto safeSustain = sustain < 0.0f ? 0.0f : sustain > 1.0f ? 1.0f : sustain;
  synth->hookVolumeEnvelopeOverride = 1;
  synth->hookAttackSeconds = attackSeconds;
  synth->hookHoldSeconds = holdSeconds;
  synth->hookDecaySeconds = decaySeconds;
  synth->hookReleaseSeconds = releaseSeconds;
  synth->hookSustain = safeSustain;
  for (int index = 0; index < synth->voiceNum; ++index) {
    auto& voice = synth->voices[index];
    if (voice.playingPreset != 0) continue;
    voice.ampenv.parameters.sustain = safeSustain;
    if (attackSeconds >= 0.0f) voice.ampenv.parameters.attack = attackSeconds;
    if (holdSeconds >= 0.0f) {
      voice.ampenv.parameters.hold = holdSeconds;
      voice.ampenv.parameters.keynumToHold = 0.0f;
    }
    if (decaySeconds >= 0.0f) {
      voice.ampenv.parameters.decay = decaySeconds;
      voice.ampenv.parameters.keynumToDecay = 0.0f;
    }
    if (releaseSeconds >= 0.0f) voice.ampenv.parameters.release = releaseSeconds;
  }
}

extern "C" std::size_t hook_keys_tsf_sample_bytes(const tsf* synth) noexcept {
  if (synth == nullptr) return 0;
  return static_cast<std::size_t>(synth->fontSampleCount) * sizeof(TSF_SAMPLE_TYPE);
}
