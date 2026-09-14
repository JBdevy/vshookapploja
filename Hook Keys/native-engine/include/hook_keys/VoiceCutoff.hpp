#pragma once

#include <algorithm>
#include <cmath>

namespace hook_keys {
// Independent state per voice; new notes cannot change a held note's filter.
class VoiceCutoff final {
public:
  void reset() noexcept { z1_ = z2_ = 0; }
  void configure(float frequency, double sampleRate) noexcept {
    const bool active = frequency < 19999.0f;
    if (active != active_) reset();
    active_ = active;
    if (!active) return;
    const double k = std::tan(3.141592653589793 * std::min<double>(frequency / sampleRate, 0.45));
    const double norm = 1.0 / (1.0 + k * 1.4142135623730951 + k * k);
    a0_ = k * k * norm;
    a1_ = 2.0 * a0_;
    b1_ = 2.0 * (k * k - 1.0) * norm;
    b2_ = (1.0 - k * 1.4142135623730951 + k * k) * norm;
  }
  float process(float sample) noexcept {
    if (!active_) return sample;
    const double output = sample * a0_ + z1_;
    z1_ = sample * a1_ + z2_ - b1_ * output;
    z2_ = sample * a0_ - b2_ * output;
    return static_cast<float>(output);
  }
private:
  bool active_ = false;
  double a0_ = 1, a1_ = 0, b1_ = 0, b2_ = 0, z1_ = 0, z2_ = 0;
};
}
