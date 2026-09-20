const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8')
const swift = fs.readFileSync(path.join(
  root, 'plugins', 'vshook-local-network', 'ios', 'Sources',
  'VSHookLocalNetworkPlugin', 'VSHookLocalNetworkPlugin.swift'), 'utf8')
const configureIos = fs.readFileSync(path.join(root, 'scripts', 'configure-local-network.py'), 'utf8')

assert(shell.includes('id="applePeerConnectBtn"'), 'Botão manual de conexão direta ausente')
assert(shell.includes("discoverApplePeers({ timeoutMs: 4500 })"), 'Descoberta Apple manual ausente')
assert(shell.includes("transport: 'apple-peer'"), 'Projetos diretos não identificam o transporte')
assert(shell.includes("project.transport === 'apple-peer'"), 'Monitor LAN não ignora transporte direto')
assert(!/discoverProjectsFromActiveNetwork[\s\S]{0,600}discoverApplePeers/.test(shell),
  'Conexão direta não pode ser fallback automático da busca Wi-Fi')

for (const token of [
  'NWBrowser', 'includePeerToPeer = true', '_vshook._tcp',
  'discoverApplePeers', 'connectApplePeer', 'stopApplePeerBridge',
  'VSHOOK/1 \\(self.channel)'
]) {
  assert(swift.includes(token), `Plugin iOS sem ${token}`)
}
assert(configureIos.includes('NSBonjourServices'), 'Info.plist não declara Bonjour')
assert(configureIos.includes('_vshook._tcp'), 'Serviço Bonjour VS Hook ausente')

console.log('Conexão direta Apple do app validada.')
