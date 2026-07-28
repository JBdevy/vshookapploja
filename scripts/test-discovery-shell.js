const fs = require('fs')
const path = require('path')
const vm = require('vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'app-shell.js'), 'utf8')
const storage = new Map()
const orientationCalls = []
const fastDiscovery = {
  app: 'VS Hook',
  appName: 'VS Hook Diretor',
  projects: [{ name: 'Teste', index: 0, active: true }],
}

function mockFetch(url, options = {}) {
  const port = Number(new URL(url).port)
  const delay = port === 47831 ? 5 : 500
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve({
        ok: port === 47831,
        json: async () => fastDiscovery,
      })
    }, delay)
    options.signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }, { once: true })
  })
}

const context = {
  console,
  setTimeout,
  clearTimeout,
  AbortController,
  URL,
  URLSearchParams,
  fetch: mockFetch,
  navigator: {},
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  document: {
    getElementById: () => ({}),
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: {
      appendChild: () => {},
      classList: { toggle: () => {} },
    },
    documentElement: {
      dataset: {},
      classList: {
        contains: () => false,
        toggle: () => {},
      },
      style: {
        removeProperty: () => {},
        setProperty: () => {},
      },
    },
  },
  window: {
    location: {
      protocol: 'capacitor:',
      hostname: 'localhost',
      port: '',
      search: '',
    },
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        VSHookLocalNetwork: {
          getAddresses: async () => ({ addresses: ['192.168.77.42'] }),
        },
        ScreenOrientation: {
          lock: async (options) => orientationCalls.push(`lock:${options?.orientation || ''}`),
          unlock: async () => orientationCalls.push('unlock'),
        },
      },
    },
    addEventListener: () => {},
  },
}
vm.createContext(context)
vm.runInContext(source, context)

async function run() {
  const addresses = await vm.runInContext('getNativeLocalNetworkAddresses()', context)
  if (addresses.length !== 1 || addresses[0] !== '192.168.77.42') {
    throw new Error(`O bridge nativo nao entregou o IP esperado: ${JSON.stringify(addresses)}`)
  }

  const candidates = vm.runInContext('buildCandidateIps(["192.168.77.42"])', context)
  if (!candidates.slice(0, 254).every((ip) => ip.startsWith('192.168.77.'))) {
    throw new Error('A faixa da rede ativa nao ficou em primeiro lugar.')
  }

  const startedAt = Date.now()
  const projects = await vm.runInContext('fetchDiscovery("192.168.77.10", 800)', context)
  const elapsed = Date.now() - startedAt
  if (!Array.isArray(projects) || projects[0]?.projectName !== 'Teste') {
    throw new Error('A primeira porta valida nao retornou a sessao.')
  }
  if (elapsed >= 200) {
    throw new Error(`A descoberta esperou a segunda porta (${elapsed} ms).`)
  }

  await vm.runInContext('syncNativeDirectorOrientation("tablet")', context)
  await vm.runInContext('syncNativeDirectorOrientation("phone")', context)
  if (orientationCalls.join('|') !== 'lock:landscape|unlock') {
    throw new Error(`Rotacao nativa incorreta: ${orientationCalls.join('|')}`)
  }

  console.log(`Discovery ok: ${addresses[0]}, resposta em ${elapsed} ms; rotacao nativa ok.`)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
