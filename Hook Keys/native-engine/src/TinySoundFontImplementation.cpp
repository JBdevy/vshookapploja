#define TSF_IMPLEMENTATION
#include "tsf.h"

extern "C" void hook_keys_tsf_set_volume_envelope(
    tsf* synth, float attackSeconds, float holdSeconds,
    float decaySeconds, float releaseSeconds) noexcept {
  if (synth == nullptr || synth->presetNum <= 0) return;
  auto& preset = synth->presets[0];
  for (int index = 0; index < preset.regionNum; ++index) {
    auto& envelope = preset.regions[index].ampenv;
    if (attackSeconds >= 0.0f) envelope.attack = attackSeconds;
    if (holdSeconds >= 0.0f) { envelope.hold = holdSeconds; envelope.keynumToHold = 0.0f; }
    if (decaySeconds >= 0.0f) { envelope.decay = decaySeconds; envelope.keynumToDecay = 0.0f; }
    if (releaseSeconds >= 0.0f) envelope.release = releaseSeconds;
  }
  for (int index = 0; index < synth->voiceNum; ++index) {
    auto& voice = synth->voices[index];
    if (voice.playingPreset != 0) continue;
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
