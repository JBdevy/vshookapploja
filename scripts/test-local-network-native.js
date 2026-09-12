const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')

const plugin = path.resolve(__dirname, '../plugins/vshook-local-network')
const javaRoot = path.join(plugin, 'android/src/main/java/com/hookdeveloper/vshook/localnetwork')
const androidSource = fs.readFileSync(path.join(javaRoot, 'VSHookLocalNetworkPlugin.java'), 'utf8')
const iosSource = fs.readFileSync(path.join(plugin, 'ios/Sources/VSHookLocalNetworkPlugin/VSHookLocalNetworkPlugin.swift'), 'utf8')

// Guardas de integração: o coletor precisa usar a máscara do SO e não tratar
// a conexão de internet móvel como a interface LAN do hotspot.
assert.ok(androidSource.includes('TRANSPORT_CELLULAR') && androidSource.includes('TRANSPORT_VPN'))
assert.ok(androidSource.includes('network.getInterfaceAddresses()'))
assert.ok(androidSource.includes('address.getNetworkPrefixLength()'))
assert.ok(!androidSource.includes('network.isVirtual()'))
assert.ok(androidSource.includes('result.put("networks", networks)'))
assert.ok(iosSource.includes('getifaddrs(&firstAddress)'))
assert.ok(iosSource.includes('Self.prefixLength(interface.ifa_netmask)'))
assert.ok(iosSource.includes('IFF_POINTOPOINT'))
assert.ok(iosSource.includes('"pdp_ip"') && iosSource.includes('"utun"'))
assert.ok(iosSource.includes('"networks": networks'))

// Compila e executa a política Java real, sem SDK/emulador ou alterações de rede.
const temporaryRoot = path.resolve(os.tmpdir())
const temporaryBuild = fs.mkdtempSync(path.join(temporaryRoot, 'vshook-local-network-test-'))
function execute(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command}: ${result.stdout}\n${result.stderr}`)
  if (result.stdout) process.stdout.write(result.stdout)
}
try {
  const networkMethods = androidSource.slice(androidSource.indexOf('    public void getAddresses('),
    androidSource.lastIndexOf('\n}'))
  assert.ok(networkMethods.includes('private void addLocalNetwork('))
  const collectorFixture = fs.readFileSync(path.join(__dirname, 'fixtures/LocalNetworkCollectorTest.java.template'), 'utf8')
    .replace('    // ACTUAL_PLUGIN_NETWORK_METHODS', networkMethods)
  const collectorFile = path.join(temporaryBuild, 'LocalNetworkCollectorTest.java')
  fs.writeFileSync(collectorFile, collectorFixture)
  execute('javac', ['-d', temporaryBuild, path.join(javaRoot, 'LocalNetworkPolicy.java'),
    path.join(__dirname, 'fixtures/LocalNetworkPolicyTest.java'), collectorFile])
  execute('java', ['-cp', temporaryBuild, 'com.hookdeveloper.vshook.localnetwork.LocalNetworkPolicyTest'])
  execute('java', ['-cp', temporaryBuild, 'com.hookdeveloper.vshook.localnetwork.LocalNetworkCollectorTest'])
} finally {
  const resolvedBuild = path.resolve(temporaryBuild)
  assert.equal(path.dirname(resolvedBuild), temporaryRoot)
  assert.ok(path.basename(resolvedBuild).startsWith('vshook-local-network-test-'))
  fs.rmSync(resolvedBuild, { recursive: true, force: true })
}
