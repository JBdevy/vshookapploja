#pragma once

struct tsf;

// Implemented beside TinySoundFont's implementation so the vendor header stays
// untouched. Must only be called from the audio thread.
extern "C" void hook_keys_tsf_set_volume_envelope(
    tsf* synth, float attackSeconds, float holdSeconds,
    float decaySeconds, float releaseSeconds) noexcept;
