#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include "hook_keys/DspTypes.hpp"

struct HookKeysGlideVoice {
  unsigned playIndex = 0;
  float startSemitones = 0;
  std::uint32_t remaining = 0;
  std::uint32_t total = 0;
};
// Uma nota SF2 acende uma regiao por camada e por canal do timbre. Um piano
// grande multi-amostrado passa de oito regioes por tecla, e a 256 vozes o
// banco enchia com menos de quarenta notas soando. Dali em diante ou a nota
// nova nao saia, ou uma voz viva era sacrificada para abrir espaco - e o
// resultado soava como pouca polifonia, com o nivel caindo de repente.
inline constexpr std::size_t kHookKeysMaximumVoices = 1024;

struct HookKeysGlideState {
  std::array<HookKeysGlideVoice, kHookKeysMaximumVoices> voices{};
  // Last Note On, the Portamento source; -1 until a note is played.
  int lastNote = -1;
};

struct tsf;
bool hook_keys_tsf_note_on_with_auto_glide(tsf* synth, HookKeysGlideState& state,
    int channel, std::uint8_t note, float velocity, float milliseconds,
    const hook_keys::CutoffConfig* cutoff = nullptr, std::uint8_t filterVelocity = 127,
    hook_keys::GlideBehavior behavior = {}) noexcept;
void hook_keys_tsf_set_cutoff(tsf* synth, const hook_keys::CutoffConfig& config) noexcept;
// Avança o envelope do Cutoff de cada voz ativa por `frames` amostras e
// reaplica o(s) estágio(s) do filtro com a frequência já modulada. Chamado
// pelo módulo uma vez por bloco de renderização (fora do laço interno do
// TinySoundFont): o envelope não precisa de resolução de amostra a amostra.
void hook_keys_tsf_advance_filter_envelope(
    tsf* synth, const hook_keys::CutoffConfig& config, std::size_t frames, float sampleRate) noexcept;
void hook_keys_tsf_steal_note(tsf* synth, HookKeysGlideState& state,
    int channel, std::uint8_t note) noexcept;
void hook_keys_tsf_render_glide(tsf* synth, HookKeysGlideState& state,
    float* output, int frames, bool enabled) noexcept;

// Overrides stay on each playback instance; shared SF2 regions are immutable.
// Must only be called from the audio thread.
// sustain: nível em que a nota segura depois do Decay, de 0 a 1.
extern "C" void hook_keys_tsf_set_volume_envelope(
    tsf* synth, float attackSeconds, float holdSeconds,
    float decaySeconds, float releaseSeconds, float sustain) noexcept;

// Bytes ocupados pelo banco de amostras imutavel deste SoundFont. Instancias
// criadas por tsf_copy compartilham o mesmo banco e relatam o mesmo valor,
// entao um cache que retem instancias conta cada banco uma vez so.
extern "C" std::size_t hook_keys_tsf_sample_bytes(const tsf* synth) noexcept;
