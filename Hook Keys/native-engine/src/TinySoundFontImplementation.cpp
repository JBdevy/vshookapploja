// TinySoundFont's standard 64-sample control block avoids recalculating every
// envelope, filter and LFO for every voice on every sample. Hook Keys linearly
// interpolates the envelope gain inside that block (see tsf.h), so this keeps
// Note Off smooth without overrunning the audio callback on layered chords.
#define TSF_RENDER_EFFECTSAMPLEBLOCK 64
#define TSF_IMPLEMENTATION
#include "tsf.h"
#include "hook_keys/TinySoundFontExtensions.hpp"
#include <algorithm>
#include <cstddef>

static void configureVoiceCutoff(tsf_voice& voice, const hook_keys::CutoffConfig& config,
    float sampleRate) noexcept {
  const auto frequency = config.frequencyForVelocity(voice.hookFilterVelocity);
  auto& filter = voice.hookCutoff;
  const bool active = frequency < 19999.0f;
  if (active != static_cast<bool>(filter.active)) filter.z1 = filter.z2 = 0;
  filter.active = active;
  filter.QInv = 1.4142135623730951;
  if (active) tsf_voice_lowpass_setup(&filter, std::min(frequency / sampleRate, 0.45f));
}

void hook_keys_tsf_set_cutoff(tsf* synth, const hook_keys::CutoffConfig& config) noexcept {
  if (!synth) return;
  for (int i = 0; i < synth->voiceNum; ++i) {
    auto& voice = synth->voices[i];
    if (voice.playingPreset >= 0) configureVoiceCutoff(voice, config, synth->outSampleRate);
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
    if (cutoff) configureVoiceCutoff(voice, *cutoff, synth->outSampleRate);
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
