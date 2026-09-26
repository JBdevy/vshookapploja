import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const compiled = await build({
  stdin: { contents: "export * from './src/features/tracks/TracksPanelController'; export * from './src/features/tracks/TrackTransport'; export * from './src/features/tracks/BundledLoops';", resolveDir: '.', loader: 'ts' },
  bundle: true, write: false, format: 'iife', globalName: 'Loops', platform: 'browser',
});
const window = new Window({ url: 'http://localhost', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
window.eval(compiled.outputFiles[0].text);
const { TracksPanelController, createTracksSplitPanelMarkup, FIXED_LOOPS_PLAYLIST, TrackTransportController } = window.Loops;
const root = window.document.createElement('div');
root.innerHTML = createTracksSplitPanelMarkup();
window.document.body.append(root);
const kinds = [], clicks = [];
const panel = new TracksPanelController(root, {}, {
  onLoopPlaylistChanged: value => kinds.push(value), onLoopClickChanged: value => clicks.push(value),
});
panel.playlists = [FIXED_LOOPS_PLAYLIST, { id: 'user-loop', kind: 'loop', name: 'Meu loop' }, { id: 'normal', kind: 'normal', name: 'Músicas' }];
root.addEventListener('click', panel.handleClick);
const controls = [...root.querySelectorAll('.tracks-split-controls button')];
const click = root.querySelector('[data-tracks-action="toggle-loop-click"]');
for (const id of [FIXED_LOOPS_PLAYLIST.id, 'user-loop']) {
  panel.setActivePlaylist(id); panel.renderSplitControlState();
  assert.equal(kinds.at(-1), true);
  assert.equal(controls.filter(button => !button.hidden).length, 1);
  assert.equal(click.hidden, false);
  click.click();
  assert.equal(click.textContent, clicks.at(-1) ? 'Click ON' : 'Click OFF');
}
for (const id of ['normal', null]) {
  panel.setActivePlaylist(id); panel.renderSplitControlState();
  assert.equal(kinds.at(-1), false);
  assert.equal(click.hidden, true);
  assert.equal(controls.filter(button => !button.hidden).length, 4);
}

// Inspect the actual Web Audio graph used on Android/Windows.
const nodes = [];
class Node {
  constructor(kind) { this.kind = kind; this.connections = []; this.gain = { value: 1, setTargetAtTime(value) { this.value = value; } }; nodes.push(this); }
  connect(node, output = 0, input = 0) { this.connections.push({ node, output, input }); return node; }
  disconnect() {}
}
class Context {
  constructor() { this.destination = new Node('destination'); this.state = 'running'; this.currentTime = 0; }
  createGain() { return new Node('gain'); }
  createChannelSplitter() { return new Node('split'); }
  createChannelMerger() { return new Node('merge'); }
  createAnalyser() { return new Node('analyser'); }
  createMediaElementSource() { return new Node('source'); }
}
window.AudioContext = Context;
const transport = new TrackTransportController(root, {}, () => {}, () => {}, () => {});
const loop = { loopSourceBpm: 120 };
transport.applyPlaybackRate(transport.audio, loop);
await transport.prepareAudioOutput(transport.audio);
const route = transport.channelRoutes.get(transport.audio);
const split = nodes.find(node => node.kind === 'split' && node.connections.some(c => c.node === route.left));
const merge = route.left.connections[0].node;
assert(split.connections.some(c => c.output === 0 && c.node === route.left));
assert(split.connections.some(c => c.output === 1 && c.node === route.rightToLeft));
assert(split.connections.some(c => c.output === 1 && c.node === merge && c.input === 1));
assert.equal(route.rightToLeft.connections[0].input, 0);
transport.setLoopClickEnabled(false);
assert.equal(route.left.gain.value, 0);
assert.equal(route.rightToLeft.gain.value, 1);
transport.setLoopClickEnabled(true);
assert.equal(route.left.gain.value, 1);
assert.equal(route.rightToLeft.gain.value, 0);
transport.setLoopClickEnabled(false);
transport.applyPlaybackRate(transport.audio, {});
assert.equal(route.left.gain.value, 1, 'normal tracks retain L');
assert.equal(route.rightToLeft.gain.value, 0, 'normal tracks never duplicate R');
await window.happyDOM.abort();
console.log('LOOP_CLICK_ROUTING_OK: official/user loop controls, normal controls, stereo and R-to-both Web Audio routing');
