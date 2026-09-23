import { spawnSync } from 'node:child_process';

const tests = [
  ['scripts/test-password-recovery.mjs'],
  ['--test', 'scripts/test-local-backup.mjs'],
  ['scripts/test-sf2-flow.mjs'],
  ['scripts/test-synth-controls.mjs'],
  ['scripts/test-pattern-modules.mjs'],
  ['scripts/test-library-module-visibility.mjs'],
  ['scripts/test-module-fader.mjs'],
  ['scripts/test-processor-reset.mjs'],
  ['scripts/test-player-startup.mjs'],
  ['scripts/test-performance-keyboard.mjs'],
  ['scripts/test-keyboard-midi-router.mjs'],
  ['scripts/test-playlist-queue.mjs'],
  ['scripts/test-native-tracks.mjs'],
  ['scripts/test-loop-metronome.mjs'],
  ['scripts/test-keyboard-style.mjs'],
  ['scripts/test-input-keyboard.mjs'],
  ['scripts/test-loading-transition.mjs'],
  ['scripts/test-desktop-browser-shortcuts.mjs'],
  ['scripts/test-rotary-expression.mjs'],
  ['scripts/test-macos-pkg-sign.mjs'],
  ['scripts/verify-desktop-assets.mjs'],
];

for (const args of tests) {
  const label = args.at(-1);
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\nRELEASE_TESTS_OK: ${tests.length} suítes passaram.`);
