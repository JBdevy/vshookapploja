#pragma once

#include "hook_keys/RealtimeCommandQueue.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <thread>

namespace hook_keys {

// Lê uma música já na taxa do motor, em estéreo intercalado. Cada plataforma
// entrega o seu decodificador (ExtAudioFile no iOS); o player só pede quadros.
class TrackDecoder {
public:
  virtual ~TrackDecoder() = default;
  [[nodiscard]] virtual std::uint64_t frameCount() const noexcept = 0;
  [[nodiscard]] virtual bool seek(std::uint64_t frame) noexcept = 0;
  // Devolve quantos quadros leu; 0 é o fim do arquivo.
  [[nodiscard]] virtual std::size_t read(float* stereo, std::size_t frames) noexcept = 0;
};

// Músicas tocando dentro do motor, com saída própria. Uma thread de leitura
// decodifica adiante e entrega blocos ao callback por uma fila sem trava; o
// callback só copia amostras. Cada bloco leva a geração em que foi lido: tocar,
// mover a agulha ou trocar de música muda a geração e o callback descarta o que
// sobrou da anterior, sem precisar esvaziar a fila de outra thread.
class TrackPlayer final {
public:
  static constexpr std::size_t kSourceCount = 4;
  static constexpr std::size_t kBlockFrames = 1024;

  struct Status final {
    std::uint32_t activeId = 0;
    bool playing = false;
    bool ended = false;
    std::uint64_t positionFrames = 0;
  };

  explicit TrackPlayer(double sampleRate) noexcept : sampleRate_(sampleRate > 0.0 ? sampleRate : 48000.0) {
    fadeStep_ = static_cast<float>(1.0 / std::max(1.0, sampleRate_ * 0.008));
    gainStepFrames_ = std::max<std::size_t>(1, static_cast<std::size_t>(sampleRate_ * 0.005));
  }

  ~TrackPlayer() {
    {
      std::scoped_lock lock(mutex_);
      quit_ = true;
    }
    wake_.notify_all();
    if (reader_.joinable()) reader_.join();
  }

  TrackPlayer(const TrackPlayer&) = delete;
  TrackPlayer& operator=(const TrackPlayer&) = delete;

  [[nodiscard]] double sampleRate() const noexcept { return sampleRate_; }

  [[nodiscard]] std::array<float, 2> consumePeaks() noexcept {
    return {peaks_[0].exchange(0.0f, std::memory_order_acq_rel),
        peaks_[1].exchange(0.0f, std::memory_order_acq_rel)};
  }

  // Controle -------------------------------------------------------------------

  [[nodiscard]] bool load(std::uint32_t id, std::unique_ptr<TrackDecoder> decoder) {
    if (id == 0 || !decoder) return false;
    std::scoped_lock lock(mutex_);
    auto* source = findLocked(id);
    if (source == nullptr) {
      for (auto& candidate : sources_) {
        if (candidate.id == 0) { source = &candidate; break; }
      }
    }
    if (source == nullptr) return false;
    if (source == activeLocked()) stopActiveLocked();
    source->id = id;
    source->frameCount = decoder->frameCount();
    source->position = 0;
    source->loop = false;
    source->playbackRate = 1.0f;
    source->decoder = std::move(decoder);
    if (!reader_.joinable()) reader_ = std::thread([this] { readLoop(); });
    return true;
  }

  void unload(std::uint32_t id) {
    std::unique_ptr<TrackDecoder> released;
    {
      std::scoped_lock lock(mutex_);
      auto* source = findLocked(id);
      if (source == nullptr) return;
      if (source == activeLocked()) stopActiveLocked();
      released = std::move(source->decoder);
      *source = Source{};
    }
  }

  [[nodiscard]] bool play(std::uint32_t id, bool syncMetronome = false) {
    {
      std::scoped_lock lock(mutex_);
      auto* source = findLocked(id);
      if (source == nullptr || !source->decoder) return false;
      // Parada, a posição guardada vale (pause ou agulha). Tocando, vale a do
      // callback. Depois do fim, recomeça.
      const bool wasPlaying = playing_.load(std::memory_order_acquire);
      if (auto* previous = activeLocked(); previous == source) {
        const bool ended = endedGeneration_.load(std::memory_order_acquire) ==
            generation_.load(std::memory_order_acquire);
        if (ended) source->position = 0;
        else if (wasPlaying) source->position = publishedPositionLocked(*source);
      } else if (previous != nullptr && wasPlaying) {
        previous->position = publishedPositionLocked(*previous);
      }
      if (source->position >= source->frameCount) source->position = 0;
      activeId_.store(id, std::memory_order_release);
      playbackRate_.store(source->playbackRate, std::memory_order_release);
      restartLocked(*source);
      syncMetronomeOnNextRender_.store(syncMetronome, std::memory_order_release);
      playing_.store(true, std::memory_order_release);
    }
    wake_.notify_all();
    return true;
  }

  [[nodiscard]] bool consumeMetronomeSyncStart() noexcept {
    return syncMetronomeOnNextRender_.exchange(false, std::memory_order_acq_rel);
  }

  void pause(std::uint32_t id) {
    std::scoped_lock lock(mutex_);
    auto* source = findLocked(id);
    if (source == nullptr || source != activeLocked()) return;
    source->position = publishedPositionLocked(*source);
    playing_.store(false, std::memory_order_release);
  }

  [[nodiscard]] bool seek(std::uint32_t id, std::uint64_t frame) {
    {
      std::scoped_lock lock(mutex_);
      auto* source = findLocked(id);
      if (source == nullptr || !source->decoder) return false;
      source->position = std::min(frame, source->frameCount);
      if (source != activeLocked()) return true;
      // Depois do fim a música está parada para quem usa, mas playing_ seguia
      // ligado: mover a agulha voltava a ler blocos e o som saía durante o
      // arraste. Buscar nunca dá play; só play() liga de novo.
      if (endedGeneration_.load(std::memory_order_acquire) == generation_.load(std::memory_order_acquire)) {
        playing_.store(false, std::memory_order_release);
      }
      // Tocando ou parada, a próxima leitura parte da nova posição.
      restartLocked(*source);
    }
    wake_.notify_all();
    return true;
  }

  void setLoop(std::uint32_t id, bool loop) {
    std::scoped_lock lock(mutex_);
    if (auto* source = findLocked(id)) source->loop = loop;
  }

  void setPlaybackRate(std::uint32_t id, float rate) {
    std::scoped_lock lock(mutex_);
    auto* source = findLocked(id);
    if (source == nullptr) return;
    source->playbackRate = std::clamp(std::isfinite(rate) ? rate : 1.0f, 0.5f, 2.5f);
    if (source == activeLocked()) playbackRate_.store(source->playbackRate, std::memory_order_release);
  }

  void setGainDb(float db, bool enabled) noexcept {
    const auto clamped = std::clamp(std::isfinite(db) ? db : 0.0f, -90.0f, 0.0f);
    const auto linear = !enabled || clamped <= -90.0f ? 0.0f : std::pow(10.0f, clamped / 20.0f);
    gainTarget_.store(linear, std::memory_order_release);
  }

  void setOutput(std::uint8_t channelStart, std::uint8_t channelCount) noexcept {
    outputStart_.store(std::min<std::uint8_t>(channelStart, 31), std::memory_order_release);
    outputCount_.store(channelCount == 1 ? 1 : 2, std::memory_order_release);
  }

  [[nodiscard]] std::uint64_t frameCount(std::uint32_t id) {
    std::scoped_lock lock(mutex_);
    const auto* source = findLocked(id);
    return source != nullptr ? source->frameCount : 0;
  }

  [[nodiscard]] bool hasSource(std::uint32_t id) {
    std::scoped_lock lock(mutex_);
    return findLocked(id) != nullptr;
  }

  [[nodiscard]] Status status() {
    std::scoped_lock lock(mutex_);
    Status result;
    auto* source = activeLocked();
    if (source == nullptr) return result;
    const auto generation = generation_.load(std::memory_order_acquire);
    result.activeId = source->id;
    result.ended = endedGeneration_.load(std::memory_order_acquire) == generation;
    result.playing = playing_.load(std::memory_order_acquire) && !result.ended;
    result.positionFrames = result.ended ? source->frameCount : publishedPositionLocked(*source);
    return result;
  }

  // Callback de áudio ----------------------------------------------------------

  // Soma a música nos canais da saída escolhida, depois do master do motor.
  void render(float* output, std::size_t frames, std::size_t channels) noexcept {
    if (output == nullptr || frames == 0 || channels == 0) return;
    const auto generation = generation_.load(std::memory_order_acquire);
    const bool wantsPlay = playing_.load(std::memory_order_acquire);
    if (generation != renderGeneration_) {
      renderGeneration_ = generation;
      hasBlock_ = false;
      playbackPhase_ = 0.0f;
      fade_ = 0.0f;
      // Antes da primeira leitura da nova geração a agulha já mostra o destino.
      renderPosition_ = restartPosition_.load(std::memory_order_acquire);
    }
    if (!wantsPlay && fade_ <= 0.0f) {
      positionFrames_.store(renderPosition_, std::memory_order_release);
      return;
    }
    const auto requested = static_cast<std::size_t>(outputStart_.load(std::memory_order_acquire));
    const auto first = requested < channels ? requested : 0;
    const bool stereo = outputCount_.load(std::memory_order_acquire) == 2 && first + 1 < channels;
    const auto target = gainTarget_.load(std::memory_order_acquire);
    if (target != gainTargetSeen_) {
      gainTargetSeen_ = target;
      gainRampFrames_ = gainStepFrames_;
      gainStep_ = (target - gain_) / static_cast<float>(gainRampFrames_);
    }
    std::array<float, 2> blockPeaks{};
    const auto playbackRate = std::clamp(playbackRate_.load(std::memory_order_acquire), 0.5f, 2.5f);
    for (std::size_t frame = 0; frame < frames; ++frame) {
      if (!hasBlock_ && !nextBlock(generation)) break;
      if (block_.end) {
        endedGeneration_.store(generation, std::memory_order_release);
        hasBlock_ = false;
        fade_ = 0.0f;
        break;
      }
      if (wantsPlay) fade_ = std::min(1.0f, fade_ + fadeStep_);
      else fade_ = std::max(0.0f, fade_ - fadeStep_);
      if (gainRampFrames_ > 0) {
        gain_ += gainStep_;
        if (--gainRampFrames_ == 0) gain_ = gainTargetSeen_;
      }
      const auto amount = gain_ * fade_;
      const auto nextOffset = std::min<std::size_t>(blockOffset_ + 1, block_.frames - 1);
      const auto leftSample = block_.samples[blockOffset_ * 2];
      const auto rightSample = block_.samples[blockOffset_ * 2 + 1];
      const auto left = (leftSample + (block_.samples[nextOffset * 2] - leftSample) * playbackPhase_) * amount;
      const auto right = (rightSample + (block_.samples[nextOffset * 2 + 1] - rightSample) * playbackPhase_) * amount;
      blockPeaks[0] = std::max(blockPeaks[0], std::abs(left));
      blockPeaks[1] = std::max(blockPeaks[1], std::abs(right));
      auto* destination = output + frame * channels;
      if (stereo) {
        destination[first] += left;
        destination[first + 1] += right;
      } else {
        destination[first] += (left + right) * 0.5f;
      }
      playbackPhase_ += playbackRate;
      const auto advance = static_cast<std::size_t>(playbackPhase_);
      playbackPhase_ -= static_cast<float>(advance);
      for (std::size_t skipped = 0; skipped < advance; ++skipped) {
        ++blockOffset_;
        renderPosition_ = block_.startFrame + blockOffset_;
        if (blockOffset_ >= block_.frames) {
          hasBlock_ = false;
          break;
        }
      }
      if (advance == 0) renderPosition_ = block_.startFrame + blockOffset_;
      if (!wantsPlay && fade_ <= 0.0f) break;
    }
    for (std::size_t channel = 0; channel < blockPeaks.size(); ++channel) {
      auto previous = peaks_[channel].load(std::memory_order_relaxed);
      while (blockPeaks[channel] > previous && !peaks_[channel].compare_exchange_weak(
          previous, blockPeaks[channel], std::memory_order_release, std::memory_order_relaxed)) {}
    }
    positionFrames_.store(renderPosition_, std::memory_order_release);
  }

private:
  struct Block final {
    std::uint32_t generation = 0;
    std::uint32_t frames = 0;
    std::uint64_t startFrame = 0;
    bool end = false;
    std::array<float, kBlockFrames * 2> samples{};
  };

  struct Source final {
    std::uint32_t id = 0;
    std::unique_ptr<TrackDecoder> decoder;
    std::uint64_t frameCount = 0;
    std::uint64_t position = 0;   // onde a leitura recomeça
    std::uint64_t readFrame = 0;  // próximo quadro que a thread de leitura decodifica
    bool loop = false;
    float playbackRate = 1.0f;
    bool endQueued = false;
  };

  Source* findLocked(std::uint32_t id) noexcept {
    if (id == 0) return nullptr;
    for (auto& source : sources_) if (source.id == id) return &source;
    return nullptr;
  }

  Source* activeLocked() noexcept { return findLocked(activeId_.load(std::memory_order_acquire)); }

  // A posição que o callback tocou, se ele já chegou à geração atual.
  std::uint64_t publishedPositionLocked(const Source& source) const noexcept {
    return std::min(positionFrames_.load(std::memory_order_acquire), source.frameCount);
  }

  void restartLocked(Source& source) noexcept {
    if (source.decoder) static_cast<void>(source.decoder->seek(source.position));
    source.readFrame = source.position;
    source.endQueued = false;
    restartPosition_.store(source.position, std::memory_order_release);
    positionFrames_.store(source.position, std::memory_order_release);
    generation_.fetch_add(1, std::memory_order_acq_rel);
  }

  void stopActiveLocked() noexcept {
    playing_.store(false, std::memory_order_release);
    activeId_.store(0, std::memory_order_release);
    generation_.fetch_add(1, std::memory_order_acq_rel);
  }

  bool nextBlock(std::uint32_t generation) noexcept {
    while (blocks_.tryPop(block_)) {
      if (block_.generation != generation) continue;
      blockOffset_ = 0;
      hasBlock_ = block_.end || block_.frames > 0;
      if (hasBlock_) return true;
    }
    return false;
  }

  void readLoop() {
    std::unique_lock lock(mutex_);
    Block pending;
    bool hasPending = false;
    while (!quit_) {
      auto* source = activeLocked();
      const auto generation = generation_.load(std::memory_order_acquire);
      if (hasPending && pending.generation != generation) hasPending = false;
      if (!hasPending && source != nullptr && source->decoder && !source->endQueued) {
        pending.generation = generation;
        pending.startFrame = source->readFrame;
        pending.end = false;
        auto read = source->decoder->read(pending.samples.data(), kBlockFrames);
        if (read == 0 && source->loop && source->frameCount > 0 && source->decoder->seek(0)) {
          source->readFrame = 0;
          pending.startFrame = 0;
          read = source->decoder->read(pending.samples.data(), kBlockFrames);
        }
        if (read == 0) {
          pending.end = true;
          pending.frames = 0;
          source->endQueued = true;
        } else {
          pending.frames = static_cast<std::uint32_t>(read);
          source->readFrame += read;
        }
        hasPending = true;
      }
      if (hasPending && blocks_.tryPush(pending)) {
        hasPending = false;
        // Solta a trava entre blocos: um comando da tela não espera a fila encher.
        lock.unlock();
        std::this_thread::yield();
        lock.lock();
        continue;
      }
      // Fila cheia ou nada para ler: espera o callback consumir ou um comando.
      wake_.wait_for(lock, std::chrono::milliseconds(8));
    }
  }

  double sampleRate_;
  std::mutex mutex_;
  std::condition_variable wake_;
  std::thread reader_;
  bool quit_ = false;
  std::array<Source, kSourceCount> sources_{};

  // ~2,7 s adiante em 48 kHz: absorve uma leitura lenta do disco no aparelho antigo.
  RealtimeCommandQueue<Block, 128> blocks_;
  std::atomic<std::uint32_t> activeId_{0};
  std::atomic<std::uint32_t> generation_{1};
  std::atomic<std::uint32_t> endedGeneration_{0};
  std::atomic<bool> playing_{false};
  std::atomic<bool> syncMetronomeOnNextRender_{false};
  std::atomic<std::uint64_t> positionFrames_{0};
  std::atomic<std::uint64_t> restartPosition_{0};
  std::atomic<float> gainTarget_{1.0f};
  std::atomic<float> playbackRate_{1.0f};
  std::atomic<std::uint8_t> outputStart_{0};
  std::atomic<std::uint8_t> outputCount_{2};

  // Somente o callback de áudio.
  Block block_{};
  std::size_t blockOffset_ = 0;
  bool hasBlock_ = false;
  std::uint32_t renderGeneration_ = 0;
  std::uint64_t renderPosition_ = 0;
  float fade_ = 0.0f;
  float playbackPhase_ = 0.0f;
  float fadeStep_ = 0.0f;
  float gain_ = 1.0f;
  float gainTargetSeen_ = 1.0f;
  float gainStep_ = 0.0f;
  std::size_t gainRampFrames_ = 0;
  std::size_t gainStepFrames_ = 1;
  std::array<std::atomic<float>, 2> peaks_{};
};

} // namespace hook_keys
