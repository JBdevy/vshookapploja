# Audio audit — CatLive 1.29

Date: 2026-11-06. Scope: release Windows engine, shared macOS/iPad playback,
Apple audio units, MIDI, streaming, recording, plugins and device lifecycle.
Minimum supported Mac remains macOS 12.0, including Intel x86_64.

## Evidence status

This pass is a source audit and implementation review. No local builds, audio
tests, device changes or GitHub runs were performed. Shell syntax, YAML syntax
and diff whitespace were checked. New regression assertions are **pending**;
their presence is not evidence that they pass. No claim of zero dropouts is made.

## Corrections

| Area | Confirmed risk | Change | Pending regression |
| --- | --- | --- | --- |
| Windows routing | Callback deduplicated destinations into a 513-entry stack array without a matching project limit; repeated searches were quadratic | Traverse unique, latency-compensated routes prepared outside the callback | `Windows/Source/Tests.cpp`: 520 destinations with duplicate parent/send/receive connections |
| Apple device binding | Checking `isRunning` before rebinding could return success after the binding operation stopped the engine | Confirm binding before the fast path and check the engine after startup | Physical output rebinding, particularly macOS 12 Intel |
| Apple scheduling | Failure before enqueue left reserved voices that never started; one invalid source could abort healthy stems | Roll back uncommitted reservations, isolate live media failures, continue prewarming valid media, retry after Stop/edit; keep export failures explicit | `PlaybackMediaIsolationTests.swift`, 44.1/48 kHz, current/legacy routing policies, cold/warm sources and recovery |
| Apple VST3 | Preparing a large parameter batch used quadratic searches inside processing | Append directly into preallocated parameter queues; use a prepared ID index for individual edits | `VST3/StateStreamTests.mm`, 32,768 parameters, unordered IDs, coalesced edits and next-block state |
| Apple state lifetime | Allocating retirement storage after publication could release state still used by a reader if allocation failed | Reserve retirement ownership before publishing VST3 chains, tempo maps and MIDI sequences | VST3 state/concurrency suite and MIDI sequence suite; allocation-failure path reviewed, not fault-injected |
| Apple numerical state | Direct sources lacked the effects' denormal protection; plugin changes must not escape a block | Shared Intel FTZ/DAZ and ARM FPCR guard across PCM, SF2, VST3 and metronome; restore the full original control word | Nested guards including entry with flush already enabled and a simulated plugin change |
| Apple metronome | Hazard acquisition retried without a bound while the UI published programs | Atomic reader admission, quiescent retirement and preservation of still-sounding click tails | Concurrent preset publication and tail lifetime in `MetronomeRenderTests.mm` |
| Apple idle preparation | Opening media, converting movie audio and reading onsets blocked MainActor; old requests could outlive the project | One cancellable serial worker for independently owned readers/buffers, project generation checks; conversion locks only cache publication | `AudioMediaPreparationTests.swift`: worker bounds, cancellation, failure recovery and project replacement PCM |
| Apple streaming | One cache could hold the worker for six reads or wait on a preparation lock; fixed lookahead omitted the spectral cursor at high rates | Try-lock busy decoders, one page per cache per sweep, immediate fair continuation, failed-read backoff and rate-dependent lookahead | `PreparedClipAudioTests.swift`: 24 stems, 192 kHz/32×, stream/loop continuity |
| Apple preparation retry | A failed new source could retain old successful preparation metadata and be reused or started | Explicit preparation-valid state, cleared before a fresh attempt and set only after successful prime | Two injected read failures, forbidden start, then correct-source PCM after repair |
| Windows VST3 | Dirty batches and ID lookup were quadratic; 2048 extra queue slots were insufficient for 2080 MIDI mappings | Preallocated ID index and slots for actual hidden mappings | 32768 parameters, 2080 MIDI mappings, coalescing and block reset |
| Windows recording | Device input channel count could differ from the writer's fixed count after restart | Bound reads by supplied channels and write silence for absent inputs | Mono → zero inputs → stereo without shortening the recording |
| Native FX UI | EQ response rebuilt biquad coefficients per pixel; each knob event reapplied all track chains | Prepare response coefficients once; apply preview only to the target and its recording mirror | Response equivalence and unrelated automation/PCM preservation |
| EQ RTA | PCM snapshots were captured before checking worker availability; strict timer gating could skip alternating ticks | Lazy capture, bounded rate-map cache and timer-jitter tolerance | Busy capture rejection, rate-map parity and existing UI refresh fixture |
| Native DSP | EQ invalid dry input survived its recovery blend; compressor/reverb invalid values could poison persistent state | Contain invalid samples and Float32 overflow; validate compressor/reverb parameters; preserve valid transfer math | `EQIntelStabilityTests.swift`, `DynamicsStabilityTests.swift` |
| Reverb | Rate/room/decay/filter exponentials and delay lengths were recomputed every block | Cache render-owned values until their inputs change | PCM parity across block sizes, settings changes and reset |

Apple engine fixes and regression sources are synchronized to the separate
`catlive-app-1.29` worktree. Existing app-specific CatStem model changes are
preserved. Remote clients do not render the desktop project's PCM; they control
the host. The iPad Nativo does render PCM using the shared Apple engine.

## Verified structure and remaining risks

- Core queues and Apple render scalar atomics use bounded/preallocated storage.
  Build-time assertions reject non-lock-free scalar implementations on Apple.
  PCM decoding/prefetch and recording file writes are outside their callbacks.
  This does not prove that framework or third-party plugin internals never lock.
- **Windows release still defaults to JUCE device management.**
  `Windows/CMakeLists.txt` sets `CATLIVE_NATIVE_DEVICE_HOST=OFF`; the release
  builder does not override it. The native ASIO/WASAPI implementation is optional
  and requires an externally supplied ASIO SDK. The diagnostic field
  `nativeDeviceHost` now identifies the path actually running. The native backend
  was not enabled without driver/hardware validation.
- Windows prepares sources in workers, but voice/bus/plugin DSP is still serial
  within its callback. It is not a parallel DSP graph or anticipative FX engine.
- Apple `StemAudioPlayback` is `@MainActor`: rendering is separate, but scheduling
  new media and jumps still relies on the main thread and about two seconds of
  lookahead. Idle reader/onset work now leaves MainActor, but a live cold cache
  miss and `JarasPreparedClip.prepare` (prefetch and FFT priming) still run there.
  Moving the live prepare blindly would introduce contention with Play/teardown.
  A long main-thread stall can still exhaust the scheduling horizon.
- Movie conversion no longer holds a global lock for the whole conversion.
  The serial idle/prepared-PCM workers still cannot preempt an individual stuck
  physical file read. Cloud or slow-storage stalls remain a limitation.
- Native FX preview still validates/serializes the target's settings for each
  editor event. The expensive full-mixer traversal has been removed, but editor
  responsiveness under large-project load still needs measurement on Intel.
- Streaming caches and recording queues are finite. Cloud-only/unavailable
  files, storage latency, memory pressure and over-budget plugin DSP can still
  produce missing audio. Plugins execute third-party code in the render path.
- Hardware rate changes and route recreation can require a device restart.
  Source checks cannot establish continuous output through every driver change.

## Prepared validation, not executed

- Desktop 1.29 release defaults audio/FX tests to enabled because this release
  changes the engine. Existing policy remains: disable them for later releases
  only when audio/DSP/recording/export are unchanged.
- `catlive-audio-audit.yml` runs Intel and optionally Apple Silicon. The desktop
  release calls its Intel job as a publication gate when audio/FX checks are
  enabled. It covers queues, prepared PCM, mobile clock/output mapping,
  rendering, automation, failed-media isolation, EQ, native FX, SF2, VST3 and
  metronome. Synthetic SF2 data avoids dependencies on private sound libraries.
- Audio fixture scripts target macOS 12.0. Multiple `test-audio.sh` fixture
  arguments reuse compiled bridges instead of recompiling them for each fixture.
- Apps CI runs media isolation/preparation, EQ/dynamics, effect UI, SF2,
  metronome and MIDI sequence checks with the audio-change detector in addition
  to mobile synchronization. Repeated fixtures reuse bridge compilation.
- Hosted Intel execution does **not** validate macOS 12 runtime behavior. The
  [GitHub runner catalog](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
  supplies the Intel runner used here; physical Monterey testing remains pending.

## Open issue: reported EQ hiss on Intel

The user reports continuous noise when audio passes through the native track EQ,
even with its controls untouched and editor closed. This excludes RTA drawing as
the sole explanation. Source inspection has **not established the root cause**.
The finite-value containment fix is a separate confirmed defensive defect, not
proof that it caused this report. The settled filter equations and Intel denormal
mode do not currently demonstrate a failure for valid ordinary PCM/settings.

`EQIntelStabilityTests.swift` compares actual AU output against independent
double-precision direct-form-I and analytic steady-tone references, with RTA
open/closed and callback partitions from 64 to 4096 frames at 44.1/48/96 kHz.
It includes a locally saved 10-section steep-cut preset and a separate downstream
limiter case, without personal paths or media. This suite is prepared, **not run**.
The reported hiss remains unresolved until reproduced/validated on Intel,
including a physical macOS 12.7.6 system.

## Physical release checks still required

On an Intel Mac with macOS 12.7.6, an Apple Silicon Mac, Windows ASIO/WASAPI and
an iPad: test cold/warm Play, immediate Stop/Play across songs/tabs, queue and
Subplay transitions, loops and cut seams, recording then immediate playback,
live output/send changes, plugin preset/UI operations, and device reconnection.
Use the sample rates, channel counts and buffer sizes actually advertised by
each device. Most offline coverage uses 44.1/48 kHz, with new EQ/dynamics cases
at 96 kHz and prepared-PCM stress at 192 kHz;
it does not certify all hardware rates or buffers. Repeat under UI/CPU/storage
load and inspect PCM continuity, onset alignment, underrun/overflow counters and
callback deadlines; a moving cursor or meter alone does not prove continuity.
