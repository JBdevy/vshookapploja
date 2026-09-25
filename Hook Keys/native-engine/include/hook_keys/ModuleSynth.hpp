#pragma once

#include "hook_keys/DspTypes.hpp"

#include <cstddef>
#include <cstdint>

namespace hook_keys {

class ModuleSynth {
public:
  virtual ~ModuleSynth() = default;

  // Called at the beginning of the real-time callback, before MIDI commands
  // are dispatched. Implementations may only perform bounded, lock-free work.
  virtual void beginBlock() noexcept {}

  virtual void noteOn(std::uint8_t note, std::uint8_t velocity) noexcept = 0;
  // Raw key velocity drives the filter independently of the amplitude curve.
  virtual void noteOnWithFilterVelocity(std::uint8_t note, std::uint8_t velocity,
      std::uint8_t /*filterVelocity*/) noexcept { noteOn(note, velocity); }
  virtual void setCutoffConfig(CutoffConfig) noexcept {}
  // No Sens: toda nota soa no ganho pleno da wave, ignorando o velocity da
  // tecla. Precisa ser retroativo, afetando as vozes ja soando na hora.
  virtual void setNoVelocitySensitivity(bool) noexcept {}
  // Mono: uma nota nova substitui a que estiver soando; soltar essa nota
  // volta pra tecla anterior ainda pressionada, se houver. Legato: só a
  // primeira nota depois do silêncio reinicia o envelope — as demais so
  // deslizam o pitch da voz já soando. O Synth (AnalogSynthModule) já tem seu
  // próprio controle de voz e ignora isto.
  virtual void setVoiceMode(bool /*mono*/, bool /*legato*/) noexcept {}
  // Control thread; the next Note On uses it.
  virtual void setGlideBehavior(GlideBehavior) noexcept {}
  virtual void noteOff(std::uint8_t note) noexcept = 0;
  // Voice stealing must release the selected note even while sustain is down.
  // The default keeps simple/test synths source-compatible.
  virtual void stealNote(std::uint8_t note) noexcept { noteOff(note); }
  virtual void controlChange(std::uint8_t controller, std::uint8_t value) noexcept = 0;
  virtual void pitchBend(std::uint16_t value) noexcept = 0;
  virtual void allNotesOff() noexcept = 0;
  virtual bool hasActiveVoices() const noexcept { return false; }
  // O banco interno de vozes esta perto de encher. Uma unica nota SF2 acende
  // varias regioes, entao o motor precisa perguntar em vez de estimar: e esse
  // aviso que faz uma nota presa so pelo pedal ceder lugar, e so quando
  // realmente falta espaco.
  virtual bool isVoicePoolNearlyFull() const noexcept { return false; }
  // Implementações reais que garantem silêncio sem vozes podem evitar todo o
  // DSP do módulo enquanto estiverem ociosas. O padrão conservador mantém
  // sintetizadores de teste/customizados renderizando.
  virtual bool canSkipRenderingWhenIdle() const noexcept { return false; }

  // Called only from the real-time audio thread. Implementations add their
  // signal to the supplied stereo buffers and must not allocate or lock.
  virtual void renderAdd(float* left, float* right, std::size_t frames, float gainLinear) noexcept = 0;
};

} // namespace hook_keys
