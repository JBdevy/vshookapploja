#pragma once

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
  virtual void noteOff(std::uint8_t note) noexcept = 0;
  virtual void controlChange(std::uint8_t controller, std::uint8_t value) noexcept = 0;
  virtual void pitchBend(std::uint16_t value) noexcept = 0;
  virtual void allNotesOff() noexcept = 0;

  // Called only from the real-time audio thread. Implementations add their
  // signal to the supplied stereo buffers and must not allocate or lock.
  virtual void renderAdd(float* left, float* right, std::size_t frames, float gainLinear) noexcept = 0;
};

} // namespace hook_keys
