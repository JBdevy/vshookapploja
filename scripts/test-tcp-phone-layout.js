const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname, '../vsdiretor.js'), 'utf8').replace(/\r\n/g, '\n')
const root = { querySelector: () => null, querySelectorAll: () => [], clientWidth: 390 }
const context = vm.createContext({
  console, URL, URLSearchParams, setTimeout, clearTimeout, navigator: { userAgent: 'Android' },
  document: { getElementById: () => root, documentElement: { dataset: { directorDevice: 'phone' }, classList: { remove() {} } }, body: root },
  window: { innerWidth: 390, matchMedia: () => ({ matches: false }), location: { search: '', origin: 'http://fixture.invalid' } },
  localStorage: { getItem: () => null, setItem() {} },
})
const testSource = source.replace('  start()\n})()', `  window.tcpTest = {
  state, renderApp, renderMixerPage, getMixerTracks, renderMixerViewButtons,
  handleMixerGridPinchStart, handleMixerGridPinchMove, handleMixerGridPointer,
  getMixerTrackWidthPercent, getMixerListWidthPercent,
  handleMixerTrackWidthResize, handleMixerListWidthResize,
}\n})()`)
assert.notEqual(testSource, source)
vm.runInContext(testSource, context)
const api = context.window.tcpTest
const song = { id: 'song', name: 'SONG', startPos: 100, endPos: 200 }
const tracks = [{ id: 'folder', name: 'DRUMS', folderDepth: 1 }, { id: 'kick', name: 'KICK', folderDepth: -1 }]
const items = [{ itemId: 'clip', trackId: 'kick', trackName: 'KICK', name: 'Kick take', startPos: 100, endPos: 200 }]
Object.assign(api.state, { activeTab: 'mixer', bridgeOnline: true, authAuthenticated: true, selectedPlaylistSongId: 'song', snapshot: {
  regions: [song], playlists: [{ id: 'list', name: 'SETLIST', songs: [song] }], activePlaylistId: 'list',
  mixerTracks: tracks, mixerGroups: [tracks[0]], mixerMaster: { id: 'master', name: 'MASTER' },
  premix: { items, timelineItems: items }, directorAuthEnabled: false,
} })
for (const mode of ['phone', 'tablet']) {
  context.document.documentElement.dataset.directorDevice = mode
  api.state.mixerView = 'tracks'
  const navigation = api.renderMixerViewButtons()
  assert.match(navigation, />MIXER<\/button>/)
  assert.match(navigation, />MASTER<\/button>/)
  assert.doesNotMatch(navigation, /GRUPOS|TRACKS/)
  api.state.mixerView = 'groups'
  assert.equal(api.getMixerTracks().length, 2, 'old groups state retains folders and child tracks together')
  api.state.mixerView = 'tracks'
  for (const listOpen of [false, true]) {
    api.state.mixerListOpen = listOpen
    const page = api.renderMixerPage()
    assert.match(page, /mixerTabletGridViewport/)
    assert.match(page, /data-premix-item-id="clip"/)
    assert.match(page, /data-mixer-timeline-start="100" data-mixer-timeline-end="200"/)
    assert.match(page, /class="mixerTrackWidthHandle"/)
    assert.equal(page.includes('class="mixerListWidthHandle"'), listOpen)
    assert.doesNotMatch(page, /mixerTopControls/, 'no duplicate MIXER/MASTER row below navigation')
  }
  api.state.mixerView = 'master'
  assert.doesNotMatch(api.renderMixerPage(), /mixerTabletGridViewport/)
}
context.document.documentElement.dataset.directorDevice = 'phone'
api.state.mixerView = 'tracks'
api.state.mixerListOpen = false
const app = api.renderApp()
assert.match(app, /topStatusRow mixerTopStatusRow/)
assert.match(app, /mixerHeaderViewControls/)
assert.match(app, /data-action="go-playlist">REPERTÓRIO/)
assert.doesNotMatch(app, /class="topTimerBtn|class="topPlaylistButton|mixerTopControls/)
// A phone pinch cannot even inspect/mutate the grid. Native page zoom is
// separately disabled by preventAppZoom; the TCP has no zoom feature here.
const forbiddenTarget = { closest() { throw new Error('phone cannot begin grid zoom/pan') } }
api.handleMixerGridPinchStart({ target: forbiddenTarget, touches: [{}, {}] })
api.handleMixerGridPinchMove({ target: forbiddenTarget, touches: [{}, {}] })
api.handleMixerGridPointer({ target: forbiddenTarget, type: 'pointerdown', pointerType: 'mouse', button: 0 })
api.state.mixerTrackWidthPercent = 10
assert.equal(api.getMixerTrackWidthPercent(), 25)
api.state.mixerTrackWidthPercent = 120
assert.equal(api.getMixerTrackWidthPercent(), 100)
api.state.mixerTrackWidthPercent = 40
api.state.mixerListWidthPercent = 80
assert.equal(api.getMixerListWidthPercent(), 60, 'LIST can fill remaining width without displacing track strip')
console.log('TCP_PHONE_LAYOUT_OK: MIXER/MASTER header, clip grid, both dividers, LIST, width limits, no phone zoom')
