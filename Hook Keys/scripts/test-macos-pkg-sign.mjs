import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { runTool, productBuildArguments, selectInstallerIdentity } from './macos-pkg-sign.mjs'

const installerHash = 'A'.repeat(40)
const applicationHash = 'B'.repeat(40)
const identityName = 'Developer ID Installer: Hook Test (TESTTEAM)'
const identities = `  1) ${applicationHash} "Developer ID Application: Hook Test (TESTTEAM)"\n  2) ${installerHash} "${identityName}"\n     2 valid identities found`
assert.deepEqual(selectInstallerIdentity(identities, identityName), { hash: installerHash, name: identityName })
assert.equal(selectInstallerIdentity(identities, installerHash.toLowerCase()).name, identityName)
assert.throws(() => selectInstallerIdentity('0 valid identities found', identityName), /chave privada/)
assert.throws(() => selectInstallerIdentity(identities, 'Developer ID Installer: Outro'), /encontrei 0/)
assert.throws(() => selectInstallerIdentity(identities + `\n  3) ${'C'.repeat(40)} "${identityName}"`, identityName), /encontrei 2/)

const options = { identity: installerHash, keychain: '/tmp/hook keys.keychain-db',
  input: '/tmp/input pkg.pkg', output: '/tmp/output pkg.pkg' }
const probeArgs = productBuildArguments({ ...options, timestamp: false })
const releaseArgs = productBuildArguments({ ...options, timestamp: true })
assert.equal(probeArgs[0], '--timestamp=none')
assert.equal(releaseArgs[0], '--timestamp')
assert.ok(!releaseArgs.includes('--timestamp=none'))
assert.equal(releaseArgs[2], installerHash)
assert.equal(releaseArgs[4], options.keychain)
assert.equal(releaseArgs[6], options.input)
assert.equal(releaseArgs[7], options.output)

function fakeProcess() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = 12345
  child.kill = () => { throw new Error('No macOS deve encerrar o grupo, não apenas o pai.') }
  return child
}
const success = fakeProcess()
let streamed = ''
const operation = runTool('/usr/bin/productbuild', releaseArgs, {
  platform: 'darwin', timeoutMs: 1000, write: (chunk) => { streamed += chunk },
  spawnProcess: (command, args, spawnOptions) => {
    assert.equal(command, '/usr/bin/productbuild')
    assert.deepEqual(args, releaseArgs)
    assert.equal(spawnOptions.detached, true)
    assert.equal(spawnOptions.stdio[0], 'ignore')
    return success
  },
})
success.stdout.emit('data', 'assinando...')
success.stderr.emit('data', 'concluído')
success.emit('close', 0, null)
assert.equal(await operation, 'assinando...concluído')
assert.equal(streamed, 'assinando...concluído')

const failure = fakeProcess()
const failed = runTool('productbuild', [], { timeoutMs: 1000, write: () => {}, spawnProcess: () => failure })
failure.stderr.emit('data', 'identidade inválida')
failure.emit('close', 9, null)
await assert.rejects(failed, (error) => error.exitCode === 9 && error.message.includes('identidade inválida'))

const stuck = fakeProcess()
const calls = []
const timeout = runTool('productbuild', [], {
  platform: 'darwin', timeoutMs: 10, write: () => {}, spawnProcess: () => stuck,
  onTimeout: (pid) => { calls.push(['diagnostic', pid]) },
  killProcess: (group, signal) => {
    calls.push(['kill', group, signal])
    stuck.emit('close', null, 'SIGKILL')
  },
})
await assert.rejects(timeout, (error) => error.exitCode === 124 && error.message.includes('não comprova'))
assert.deepEqual(calls, [['diagnostic', 12345], ['kill', -12345, 'SIGKILL']])

const missing = fakeProcess()
const notFound = runTool('inexistente', [], { timeoutMs: 1000, spawnProcess: () => missing })
missing.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }))
await assert.rejects(notFound, { code: 'ENOENT' })
console.log('MACOS_PKG_SIGN_OK: identidade, timestamp obrigatório, saída, falhas e encerramento dos helpers no timeout.')
