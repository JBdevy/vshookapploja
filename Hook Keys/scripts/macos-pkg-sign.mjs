import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function selectInstallerIdentity(output, requestedIdentity) {
  const identities = Array.from(output.matchAll(/^\s*\d+\)\s+([a-f\d]{40})\s+"(Developer ID Installer:[^"]+)"/gim),
    ([, hash, name]) => ({ hash: hash.toUpperCase(), name }))
    .filter(({ hash, name }) => !requestedIdentity || name === requestedIdentity || hash === requestedIdentity.toUpperCase())
  if (identities.length !== 1) {
    throw new Error(`Esperava uma identidade Installer válida com chave privada; encontrei ${identities.length}. Confira o P12 Installer, sua validade e a cadeia de certificados.`)
  }
  return identities[0]
}

export function productBuildArguments({ identity, keychain, input, output, timestamp }) {
  return [timestamp ? '--timestamp' : '--timestamp=none', '--sign', identity,
    '--keychain', keychain, '--package', input, output]
}

export function runTool(command, args, {
  timeoutMs = 60_000, platform = process.platform, onTimeout = () => {},
  write = (chunk) => process.stdout.write(chunk), spawnProcess = spawn, killProcess = process.kill,
} = {}) {
  return new Promise((resolve, reject) => {
    const detached = platform === 'darwin'
    const child = spawnProcess(command, args, { detached, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let timedOut = false
    const consume = (chunk) => {
      const text = String(chunk)
      output = (output + text).slice(-64_000)
      write(text)
    }
    child.stdout?.on('data', consume)
    child.stderr?.on('data', consume)
    const timer = setTimeout(() => {
      timedOut = true
      try { onTimeout(child.pid) } catch (error) { write(`Diagnóstico indisponível: ${error.message}\n`) }
      try {
        // Mata o grupo deste comando, inclusive helpers; não deixa uma tentativa
        // presa no keychain enquanto a tentativa seguinte já está rodando.
        if (detached && child.pid > 0) killProcess(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch (error) {
        if (error.code !== 'ESRCH') child.kill('SIGKILL')
      }
    }, timeoutMs)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) {
        const error = new Error(`${path.basename(command)} não concluiu em ${timeoutMs / 1000}s. Timeout não comprova que a chave esteja bloqueada.`)
        error.exitCode = 124
        reject(error)
      } else if (code !== 0) {
        const error = new Error(`${path.basename(command)} falhou (${code ?? signal}).\n${output}`)
        error.exitCode = code || 1
        reject(error)
      } else resolve(output)
    })
  })
}

function collectDiagnostics(pid, mode) {
  if (!Number.isInteger(pid) || pid <= 0) return
  const directory = path.join(process.env.RUNNER_TEMP, 'hook-keys-signing-diagnostics')
  mkdirSync(directory, { recursive: true })
  const report = path.join(directory, `productbuild-${mode}.sample.txt`)
  // Apenas nome/estado do processo, nunca argumentos de importação ou senhas.
  const state = spawnSync('/bin/ps', ['-o', 'pid,ppid,state,comm', '-p', String(pid)],
    { encoding: 'utf8', timeout: 2000 })
  if (state.stdout) process.stdout.write(state.stdout)
  spawnSync('/usr/bin/sample', [String(pid), '1', '1', '-file', report],
    { encoding: 'utf8', timeout: 3000 })
  process.stdout.write(`Diagnóstico do processo: ${report}\n`)
}

export async function main(args = process.argv.slice(2)) {
  if (process.platform !== 'darwin') throw new Error('Assinatura de PKG exige macOS.')
  const [mode, input, output] = args
  if (!['probe', 'release'].includes(mode) || !input || !output) {
    throw new Error('Uso: node scripts/macos-pkg-sign.mjs probe|release entrada.pkg saída.pkg')
  }
  const keychain = process.env.HOOK_KEYS_KEYCHAIN_PATH
  if (!keychain || !process.env.RUNNER_TEMP) throw new Error('Keychain/temporário do job não configurados.')
  const identities = await runTool('/usr/bin/security', ['find-identity', '-v', keychain])
  const identity = selectInstallerIdentity(identities, process.env.HOOK_KEYS_INSTALLER_IDENTITY)
  const size = statSync(input).size
  if (mode === 'probe' && size > 1024 * 1024) throw new Error('O teste da chave deve usar um PKG mínimo, não o aplicativo completo.')
  console.log(`Assinando ${mode === 'probe' ? 'teste mínimo sem timestamp' : 'instalador com timestamp seguro'}: ${size} bytes; ${identity.name}`)
  try {
    await runTool('/usr/bin/productbuild', productBuildArguments({
      identity: identity.hash, keychain, input, output, timestamp: mode === 'release',
    }), { timeoutMs: mode === 'probe' ? 60_000 : 120_000,
      onTimeout: (pid) => collectDiagnostics(pid, mode) })
  } catch (error) {
    if (error.exitCode === 124 && mode === 'probe') {
      console.error('O PKG mínimo sem timestamp também travou. Verifique acesso à chave, cadeia de confiança e o diagnóstico do runner; não atribua isso ao servidor de timestamp.')
    }
    throw error
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = error.exitCode || 1
  })
}
