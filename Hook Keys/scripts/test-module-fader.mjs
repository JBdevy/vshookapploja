import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const handleRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selector]) => selector.trim().endsWith('.player-module__fader-handle'));

test('module fader handles reach the inner edges without protruding in every layout', () => {
  assert(handleRules.length >= 3);
  const offsets = handleRules.filter(([, , declarations]) => /(?:left|right):/.test(declarations));
  assert.equal(offsets.length, 3);
  for (const [, selector, declarations] of offsets) {
    assert.match(declarations, /left:\s*0px;/, selector.trim());
    assert.match(declarations, /right:\s*0px;/, selector.trim());
    assert.doesNotMatch(declarations, /(?:left|right):\s*-/, selector.trim());
  }
  for (const railWidth of [20, 24, 27, 38, 42]) {
    const contentWidth = railWidth - 2; // Shared themed rail has a 1px border.
    const handleWidth = contentWidth;
    assert(handleWidth > 0);
    assert.equal(1 + handleWidth, railWidth - 1);
  }
});

test('all eight modules inherit the same darker Synth gray theme', () => {
  assert.match(css, /--module-accent:\s*#7b8390;/);
  assert.match(css, /--module-surface-a:\s*#1c1e22;/);
  assert.match(css, /--module-surface-b:\s*#0b0c0f;/);
  assert.doesNotMatch(css, /\.player-module:nth-child\(\d\)\s*\{\s*--module-accent:/);
});

test('themed handle retains square corners and its module colors, without an external glow', () => {
  const themed = handleRules.find(([, , declarations]) => declarations.includes('var(--module-accent-hot)'))[2];
  assert.match(themed, /border-radius:\s*0;/);
  assert.match(themed, /linear-gradient\(180deg, var\(--module-accent-hot\)/);
  const shadows = themed.match(/box-shadow:([^;]+);/)[1].split(/,\s*(?![^()]*\))/);
  assert(shadows.every((shadow) => shadow.trim().startsWith('inset ')));
});

test('library default and active module ON/HLD/MOD use darker greens without overwriting timbre colors or OFF red', () => {
  assert.match(css, /--module-button-green-a: #18874e;/);
  assert.match(css, /--module-button-green-b: #064526;/);
  for (const selector of ['.player-module__sound-button', '.player-screen .player-module__power-button.is-on', ':is(.player-screen, .player-modal) .player-module__filter-button:not(.is-blocked)']) {
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, candidate, declarations]) => candidate.trim().endsWith(selector) && declarations.includes('--module-button-green-a'));
    assert(rule, selector);
    assert.match(rule[2], /--button-color-a: var\(--module-button-green-a\) !important;/);
    assert.match(rule[2], /--button-color-b: var\(--module-button-green-b\) !important;/);
  }
  assert.match(css, /\.player-module__sound-button\.has-selected-timbre\s*\{[^}]*var\(--module-sound-color\)/);
  assert.match(css, /\.player-module__power-button\.is-off,[\s\S]*?--button-color-a: #f05a4f !important;/);
  assert.match(css, /\.player-screen \.player-module__action-button\.is-octave-active,\s*\.player-screen \.player-module__power-button\.is-on\s*\{[^}]*--button-color-a: var\(--module-button-green-a\) !important;/);
});

test('module borders retain independent identities without changing the common gray surfaces', () => {
  assert.match(css, /--module-border-color: #ff7900;/);
  assert.match(css, /\.player-module:nth-child\(6\)\s*\{\s*--module-border-color: #a855f7;/);
  assert.match(css, /\.player-module:nth-child\(7\)\s*\{\s*--module-border-color: #ff3434;/);
  assert.match(css, /\.player-module:nth-child\(8\)\s*\{\s*--module-border-color: #3985ff;/);
  assert.match(css, /\.player-module\s*\{\s*border-color: var\(--module-border-color\);/);
  assert.doesNotMatch(css, /\.player-module:nth-child\(\d\)\s*\{[^}]*--module-surface/);
});
