#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace hook_keys {

struct NativeArpeggiatorConfig final {
  bool enabled = false;
  // 0 up, 1 down, 2 up/down, 3 played, 4 random.
  std::uint8_t mode = 0;
  std::uint8_t octaves = 1;
  float beatMultiplier = 0.25f;
  float measureBeats = 4.0f; // zero: free-running sequence
  float gate = 0.72f;
  float swing = 0.0f;
  bool autoFaderEnabled = false;
  float autoFaderBeats = 4.0f;
  float autoFaderDepthDb = 5.0f;

  bool valid() const noexcept {
    return mode <= 4 && octaves >= 1 && octaves <= 4 &&
        std::isfinite(beatMultiplier) && beatMultiplier >= 0.02f && beatMultiplier <= 10.0f &&
        std::isfinite(measureBeats) && measureBeats >= 0 && measureBeats <= 32 &&
        std::isfinite(gate) && gate >= 0.1f && gate <= 1 &&
        std::isfinite(swing) && swing >= 0 && swing <= 0.75f &&
        std::isfinite(autoFaderBeats) && autoFaderBeats >= 0.125f && autoFaderBeats <= 32 &&
        std::isfinite(autoFaderDepthDb) && autoFaderDepthDb >= 0 && autoFaderDepthDb <= 40;
  }
};

// All methods belong to the audio thread. Fixed storage, no timers, locks or
// allocations. Sustain holds source keys; CC64 never reaches generated voices.
class NativeArpeggiator final {
public:
  void note(std::uint8_t input, std::uint8_t channel, std::uint8_t key,
      std::uint8_t velocity) noexcept {
    if (input >= 4 || channel >= 16 || key >= 128) return;
    const auto source = input * 16u + channel;
    auto& state = notes_[source][key];
    if (velocity) {
      state = velocity;
      orders_[key] = ++serial_;
    } else if (state) {
      state = pedal_[source] ? static_cast<std::uint8_t>((state & 127u) | 128u) : 0;
    }
    rebuild();
  }

  void sustain(std::uint8_t input, std::uint8_t channel, bool down) noexcept {
    if (input >= 4 || channel >= 16) return;
    const auto source = input * 16u + channel;
    pedal_[source] = down;
    if (!down) {
      for (auto& state : notes_[source]) if (state & 128u) state = 0;
      rebuild();
    }
  }

  void releasePedals() noexcept {
    pedal_.fill(false);
    for (auto& source : notes_) for (auto& state : source) if (state & 128u) state = 0;
    rebuild();
  }

  template<class Emit> void reset(Emit emit) noexcept {
    release(emit);
    for (auto& source : notes_) source.fill(0);
    pedal_.fill(false);
    velocities_.fill(0);
    count_ = 0;
    resetClock();
  }

  bool active() const noexcept { return count_ != 0 || sounding_ >= 0; }

  // Process events at the start of a slice, then return its safe sample count.
  template<class Emit> std::size_t begin(const NativeArpeggiatorConfig& config,
      double sampleRate, float bpm, std::size_t limit, Emit emit) noexcept {
    if (count_ == 0) { release(emit); resetClock(); return limit; }
    const auto beatsPerSample = static_cast<double>(bpm) / (60.0 * sampleRate);
    if (sounding_ >= 0 && gateRemaining_ <= 1e-9) release(emit);
    if (stepRemaining_ <= 1e-9) {
      release(emit);
      if (config.measureBeats > 0 && measurePosition_ >= config.measureBeats - 1e-7) {
        measurePosition_ = std::max(0.0, measurePosition_ -
            std::floor((measurePosition_ + 1e-7) / config.measureBeats) * config.measureBeats);
        step_ = 0;
      }
      std::array<std::uint8_t, 512> sequence{};
      std::array<std::uint8_t, 512> sourceKeys{};
      std::array<std::uint8_t, 128> keys{};
      std::size_t keyCount = 0, sequenceCount = 0;
      for (std::size_t key = 0; key < 128; ++key) if (velocities_[key]) keys[keyCount++] = static_cast<std::uint8_t>(key);
      if (config.mode == 3) {
        std::sort(keys.begin(), keys.begin() + keyCount,
            [this](auto a, auto b) { return orders_[a] < orders_[b]; });
      }
      for (std::size_t octave = 0; octave < config.octaves; ++octave) {
        for (std::size_t k = 0; k < keyCount; ++k) {
          const auto key = keys[k] + octave * 12;
          if (key > 127) continue;
          sequence[sequenceCount] = static_cast<std::uint8_t>(key);
          sourceKeys[sequenceCount++] = keys[k];
        }
      }
      std::size_t position = step_ % sequenceCount;
      if (config.mode == 1) position = sequenceCount - 1 - position;
      if (config.mode == 2 && sequenceCount > 1) {
        const auto phase = step_ % (sequenceCount * 2 - 2);
        position = phase < sequenceCount ? phase : sequenceCount * 2 - 2 - phase;
      }
      if (config.mode == 4) {
        random_ ^= random_ << 13; random_ ^= random_ >> 17; random_ ^= random_ << 5;
        position = random_ % sequenceCount;
      }
      sounding_ = sequence[position];
      emit(static_cast<std::uint8_t>(sounding_), velocities_[sourceKeys[position]]);
      auto duration = config.beatMultiplier * (1.0 + (step_ % 2 == 0 ? config.swing : -config.swing));
      if (config.measureBeats > 0) duration = std::min(duration, config.measureBeats - measurePosition_);
      // Add, rather than assign, to retain fractional sample overshoot.
      stepRemaining_ += duration;
      gateRemaining_ = duration * config.gate;
      ++step_;
    }
    auto untilEvent = stepRemaining_;
    if (sounding_ >= 0) untilEvent = std::min(untilEvent, gateRemaining_);
    return std::min(limit, static_cast<std::size_t>(std::max(1.0, std::ceil(untilEvent / beatsPerSample - 1e-7))));
  }

  void advance(std::size_t frames, double sampleRate, float bpm) noexcept {
    if (!count_) return;
    const auto beats = frames * static_cast<double>(bpm) / (sampleRate * 60.0);
    stepRemaining_ -= beats; gateRemaining_ -= beats; measurePosition_ += beats;
  }

private:
  template<class Emit> void release(Emit emit) noexcept {
    if (sounding_ >= 0) emit(static_cast<std::uint8_t>(sounding_), std::uint8_t{0});
    sounding_ = -1;
  }
  void resetClock() noexcept { step_ = 0; stepRemaining_ = 0; gateRemaining_ = 0; measurePosition_ = 0; }
  void rebuild() noexcept {
    const bool wasEmpty = count_ == 0;
    velocities_.fill(0);
    for (const auto& source : notes_) for (std::size_t key = 0; key < 128; ++key)
      velocities_[key] = std::max(velocities_[key], static_cast<std::uint8_t>(source[key] & 127u));
    count_ = 0;
    for (const auto velocity : velocities_) if (velocity) ++count_;
    if (wasEmpty && count_) resetClock();
  }
  std::array<std::array<std::uint8_t, 128>, 64> notes_{};
  std::array<bool, 64> pedal_{};
  std::array<std::uint8_t, 128> velocities_{};
  std::array<std::uint64_t, 128> orders_{};
  std::size_t count_ = 0;
  std::uint64_t serial_ = 0, step_ = 0;
  std::uint32_t random_ = 0x6b726f6eu;
  int sounding_ = -1;
  double stepRemaining_ = 0, gateRemaining_ = 0, measurePosition_ = 0;
};

} // namespace hook_keys
