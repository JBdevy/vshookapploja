const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname, '../vsdiretor.js'), 'utf8').replace(/\r\n/g, '\n')
function extract(name) {
  const start = source.indexOf(`  function ${name}(`)
  assert(start >= 0, name)
  const end = source.indexOf('\n  function ', start + 1)
  return source.slice(start, end)
}
const context = vm.createContext({state: {snapshot: {}, pendingLoop: null}, now: () => 0,
  firstFiniteNumber: values => values.find(value => typeof value === 'number' && Number.isFinite(value)) ?? null})
vm.runInContext(['getLoopActive', 'getLoopRange', 'getMixerLoopGeometry', 'getMixerLoopGeometries', 'renderMixerLoopLimits', 'syncMixerLoopLimitsDom'].map(extract).join('\n'), context)
const data = {loopEnabled: true, loopStartPos: 120, loopEndPos: 180}
const bounds = {start: 100, end: 200}
const geometry = context.getMixerLoopGeometry(bounds, data)
assert.equal(geometry.start, .2)
assert.equal(geometry.end, .8)
assert.equal(context.getMixerLoopGeometry(bounds, {...data, loopEnabled: false}), null)
assert.equal(context.getMixerLoopGeometry({start: 0, end: 100}, data), null)
assert.equal(context.getMixerLoopGeometry(bounds, {...data, loopEndPos: 110}), null)
const clipped = context.getMixerLoopGeometry({start: 140, end: 200}, data)
assert.equal(clipped.start, null)
assert.equal(clipped.left, 0)
assert.equal(clipped.end, 2 / 3)
const html = context.renderMixerLoopLimits(bounds, data, true)
assert.match(html, /<b>LOOP<\/b>/)
assert.match(html, /<b>LOOP<\/b>/)
assert.match(html, /left:20.0000%/)
let writes = 0
const overlay = {dataset: {}, set innerHTML(value) { writes++; this.html = value }}
const container = {querySelector: () => overlay}
context.syncMixerLoopLimitsDom(container, null, bounds, data)
context.syncMixerLoopLimitsDom(container, null, bounds, data)
assert.equal(writes, 1, 'unchanged playback frames do not rebuild loop DOM')
context.syncMixerLoopLimitsDom(container, null, bounds, {...data, loopEnabled: false})
assert.equal(overlay.html, '', 'turning repeat off removes existing markers without rebuilding track rows')
const configured = {loopActive: false, tcpMultiLoopRanges: [{songId: 'song', slot: 2, startPos: 120, endPos: 180}]}
assert.equal(context.getMixerLoopGeometries(bounds, configured).length, 1, 'enabled multiloop is visible before playback reaches it')
assert.match(context.renderMixerLoopLimits(bounds, configured, true), /<b>LOOP<\/b>/)
assert.equal(context.getMixerLoopGeometries(bounds, {...configured, ...data}).length, 1, 'active Repeat does not duplicate configured boundaries')
assert.equal(context.getMixerLoopGeometries(bounds, {...configured, tcpMultiLoopRanges: []}).length, 0, 'disabled slots disappear')
console.log('TCP_LOOP_LIMITS_OK: active range, clipping, labels and incremental updates')

const existing = {loopActive: false, markers: [{name: '*1', pos: 11760.64}, {name: '*1', pos: 11768.32}]}
const songBounds = {start: 11728, end: 11906.56}
assert.equal(context.getMixerLoopGeometries(songBounds, existing).length, 1, 'existing Grid markers draw TCP pair without a new extension field')
assert.match(context.renderMixerLoopLimits(songBounds, existing, true), /<b>LOOP<\/b>/)
assert.match(context.renderMixerLoopLimits(songBounds, existing, true), /<b>LOOP<\/b>/)
assert.equal(context.getMixerLoopGeometries(songBounds, {...existing, tcpMultiLoopRanges: []}).length, 0, 'explicit slot settings override marker compatibility fallback')
