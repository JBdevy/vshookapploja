#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <type_traits>

namespace hook_keys {

template <typename Value, std::size_t Capacity>
class RealtimeCommandQueue final {
  static_assert(Capacity >= 2, "The queue needs at least two slots");
  static_assert((Capacity & (Capacity - 1)) == 0, "Queue capacity must be a power of two");
  static_assert(std::is_trivially_copyable_v<Value>, "Realtime commands must be trivially copyable");

public:
  RealtimeCommandQueue() noexcept {
    for (std::size_t index = 0; index < Capacity; ++index) cells_[index].sequence.store(index, std::memory_order_relaxed);
  }

  RealtimeCommandQueue(const RealtimeCommandQueue&) = delete;
  RealtimeCommandQueue& operator=(const RealtimeCommandQueue&) = delete;

  // Multiple producer threads are supported. This lets the UI and the three
  // MIDI input callbacks enqueue commands without a mutex.
  [[nodiscard]] bool tryPush(const Value& value) noexcept {
    auto position = writePosition_.load(std::memory_order_relaxed);
    Cell* cell = nullptr;

    for (;;) {
      cell = &cells_[position & kIndexMask];
      const auto sequence = cell->sequence.load(std::memory_order_acquire);
      const auto difference = static_cast<std::intptr_t>(sequence) - static_cast<std::intptr_t>(position);
      if (difference == 0) {
        if (writePosition_.compare_exchange_weak(
                position, position + 1, std::memory_order_relaxed, std::memory_order_relaxed)) {
          break;
        }
      } else if (difference < 0) {
        return false;
      } else {
        position = writePosition_.load(std::memory_order_relaxed);
      }
    }

    cell->value = value;
    cell->sequence.store(position + 1, std::memory_order_release);
    return true;
  }

  // Exactly one consumer is allowed: the real-time audio callback.
  [[nodiscard]] bool tryPop(Value& value) noexcept {
    auto& cell = cells_[readPosition_ & kIndexMask];
    const auto sequence = cell.sequence.load(std::memory_order_acquire);
    const auto difference = static_cast<std::intptr_t>(sequence) - static_cast<std::intptr_t>(readPosition_ + 1);
    if (difference < 0) return false;
    if (difference > 0) return false;

    value = cell.value;
    cell.sequence.store(readPosition_ + Capacity, std::memory_order_release);
    ++readPosition_;
    return true;
  }

private:
  static constexpr std::size_t kIndexMask = Capacity - 1;

  struct Cell final {
    std::atomic<std::size_t> sequence{0};
    Value value{};
  };

  alignas(64) std::array<Cell, Capacity> cells_{};
  alignas(64) std::atomic<std::size_t> writePosition_{0};
  alignas(64) std::size_t readPosition_ = 0;
};

} // namespace hook_keys
