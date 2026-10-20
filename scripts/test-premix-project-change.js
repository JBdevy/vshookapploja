const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '../vsdiretor.js'), 'utf8').replace(/\r\n/g, '\n')
function extract(name) {
  const start = source.indexOf(`  function ${name}(`)
  const tail = source.slice(start + 1).search(/\n  (?:async )?function /)
  assert(start >= 0 && tail >= 0, name)
  return source.slice(start, start + 1 + tail)
}
function snapshot(project, song = '12') {
  return { projectPath: `${project}.rpp`, projectTabs: [{ id: project, index: 0, active: true }],
    regions: [{ id: song }], premix: { selectedSongId: song, items: [{ itemId: 'shared-item', name: project }] } }
}
function fixture() {
  const state = { snapshot: snapshot('A'), showPremixScreen: true,
    premixSongId: '12', premixSongName: 'Song A', selectedPremixSongId: '12',
    showTabletSongToolsModal: true, tabletSongToolsTarget: { id: '12' },
    hashRegionDrawerChildren: { old: [{ id: '12' }] } }
  const caches = Object.fromEntries(['premixFullScreenCache', 'premixTrackVolumeHold',
    'premixItemMuteHold', 'premixTrackSoloHold', 'premixUniqueSoloHold',
    'premixUniqueSoloVisualRestore', 'premixItemVolumeHold',
    'premixItemVolumeVisualCache', 'premixItemVolumeLocalUntil'].map(name => [name, new Map([['shared-item', 0.2]])]))
  const sent = []
  const context = vm.createContext({ state, ...caches, IS_MUSICIAN_MONITOR: false,
    premixFaderPointer: {}, premixFaderLastTap: {}, cancelPremixHold: () => {},
    latestVolumeCommands: new Map(), premixStructureSignatureCache: new WeakMap(),
    getAppTheme: () => 'dark', getPlayingId: () => '', now: Date.now,
    withTimeout: () => ({ signal: undefined, done: () => {} }), COMMAND_TIMEOUT_MS: 1000,
    bridgeUrl: path => path, fetch: async (url, options) => {
      sent.push(JSON.parse(options.body)); return { ok: true }
    },
    getPremixEffectiveTarget: () => ({ id: '12', start: 0 }),
    getPremixStructureSignature: () => 'same-items',
  })
  for (const name of ['getProjects', 'getProjectItemId', 'getProjectItemIndex',
    'getSnapshotActiveProjectSelection', 'snapshotConfirmsProjectSelection',
    'getPremixProjectPayload', 'snapshotProjectChanged', 'resetPremixForProjectChange',
    'hasAnyListData', 'mergeWithLastGoodSnapshot', 'getPremixSnapshotSongId',
    'simpleHash', 'getPremixFullScreenCacheKey', 'queueLatestVolumeCommand', 'postCommand']) {
    vm.runInContext(extract(name), context)
  }
  const run = code => vm.runInContext(code, context)
  return { state, context, caches, sent, run }
}

test('a new project never inherits the previous Premix or lists, including standby', () => {
  const f = fixture()
  for (const next of [{ standby: true, projectPath: 'B.rpp' },
    { projectPath: 'B.rpp' }, snapshot('B', '5')]) {
    f.context.next = next
    const merged = f.run('mergeWithLastGoodSnapshot(next, state.snapshot)')
    assert.equal(merged, next)
    assert.notEqual(merged.premix?.items?.[0]?.name, 'A')
  }
})

test('same-project standby retains its confirmed data', () => {
  const f = fixture()
  f.context.next = { standby: true, projectPath: 'A.rpp' }
  const merged = f.run('mergeWithLastGoodSnapshot(next, state.snapshot)')
  assert.equal(merged.premix.items[0].name, 'A')
  assert.equal(merged.listPreservedFromLastGood, true)
})

test('two tabs of the same RPP remain separate projects', () => {
  const f = fixture()
  f.context.next = { ...snapshot('B'), projectPath: 'A.rpp' }
  assert.equal(f.run('snapshotProjectChanged(next, state.snapshot)'), true)
  f.context.next = { ...snapshot('A'), activeProjectTabIndex: 1 }
  assert.equal(f.run('snapshotProjectChanged(next, state.snapshot)'), false)
})

test('a tab change closes old controls and clears volume, mute and solo holds', () => {
  const f = fixture()
  const premixQueue = { pending: { type: 'premix_item_set_volume' } }
  const mixerQueue = { pending: { type: 'mixer_set_volume' } }
  f.context.latestVolumeCommands.set('premix', premixQueue)
  f.context.latestVolumeCommands.set('mixer', mixerQueue)
  f.run('resetPremixForProjectChange()')
  assert.equal(f.state.showPremixScreen, false)
  assert.equal(f.state.premixSongId, '')
  assert.equal(f.state.premixSongName, '')
  assert.equal(f.state.showTabletSongToolsModal, false)
  assert.equal(f.state.tabletSongToolsTarget, null)
  assert.equal(Object.keys(f.state.hashRegionDrawerChildren).length, 0)
  for (const cache of Object.values(f.caches)) assert.equal(cache.size, 0)
  assert.equal(premixQueue.pending, null)
  assert(mixerQueue.pending)
})

test('identical song and item IDs in different projects use different screen caches', () => {
  const f = fixture()
  const first = f.run('getPremixFullScreenCacheKey()')
  f.state.snapshot = snapshot('B')
  assert.notEqual(f.run('getPremixFullScreenCacheKey()'), first)
})

test('Premix commands identify the displayed project', async () => {
  const f = fixture()
  await f.run("postCommand('premix_focus_song', { songId: '12' })")
  assert.equal(f.sent[0].payload.premixProjectId, 'A')
  assert.equal(f.sent[0].payload.premixProjectPath, 'A.rpp')
})

test('Premix commands wait for confirmation of a requested tab switch', async () => {
  const f = fixture()
  f.state.pendingProjectId = 'B'
  f.state.pendingProjectIndex = 1
  const result = await f.run("postCommand('premix_focus_song', { songId: '12' })")
  assert.equal(result.projectSwitchPending, true)
  assert.equal(f.sent.length, 0)
})

test('queued fader commands retain the project where the gesture began', async () => {
  const f = fixture()
  let release
  f.context.fetch = (url, options) => {
    f.sent.push(JSON.parse(options.body))
    return new Promise(resolve => { release = resolve })
  }
  f.run("queueLatestVolumeCommand('item:shared-item', 'premix_item_set_volume', { ratio: 0.2 })")
  f.run("queueLatestVolumeCommand('item:shared-item', 'premix_item_set_volume', { ratio: 0.3 })")
  f.state.snapshot = snapshot('B')
  release({ ok: true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.sent.length, 2)
  assert.equal(f.sent[1].payload.premixProjectId, 'A')
  assert.equal(f.sent[1].payload.premixProjectPath, 'A.rpp')
  release({ ok: true })
})
