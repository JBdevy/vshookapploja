const fs = require('fs')
const path = require('path')
const vm = require('vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'app-shell.js'), 'utf8')
const storage = new Map()
const fastDiscovery = {
  app: 'VS Hook',
  appName: 'VS Hook Diretor',
  projects: [{ name: 'Teste', index: 0, active: true }],
}
let localNetworkAddressReads = 0
let activeLocalAddresses = ['192.168.77.42']
let respondingHost = '192.168.77.10'
let requestedHosts = []

function mockFetch(url, options = {}) {
  const parsedUrl = new URL(url)
  const port = Number(parsedUrl.port)
  requestedHosts.push(parsedUrl.hostname)
  const responds = parsedUrl.hostname === respondingHost && port === 47831
  const delay = responds ? 5 : 500
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve({
        ok: responds,
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
          getAddresses: async () => {
            localNetworkAddressReads += 1
            return { addresses: activeLocalAddresses }
          },
        },
      },
    },
    addEventListener: () => {},
  },
}
vm.createContext(context)
vm.runInContext(source, context)

async function run() {
  const addresses = await vm.runInContext('getVshookStoreLocalNetworkAddresses()', context)
  if (addresses.length !== 1 || addresses[0] !== '192.168.77.42') {
    throw new Error(`O bridge nativo nao entregou o IP esperado: ${JSON.stringify(addresses)}`)
  }

  const candidates = vm.runInContext('buildVshookStoreCandidateIps(["192.168.77.42"])', context)
  if (!candidates.slice(0, 254).every((ip) => ip.startsWith('192.168.77.'))) {
    throw new Error('A faixa da rede ativa nao ficou em primeiro lugar.')
  }

  storage.set('vshook_director_url', 'http://10.0.0.8:47831')
  storage.set('vshook_musicians_url', 'http://192.168.77.99:47832')
  const candidatesWithHistory = vm.runInContext(
    'buildVshookStoreCandidateIps(["192.168.77.42"])',
    context,
  )
  if (candidatesWithHistory[0] !== '192.168.77.99' ||
      candidatesWithHistory.indexOf('10.0.0.8') < 254) {
    throw new Error('Um IP antigo de outra rede passou na frente do Wi-Fi atual.')
  }
  storage.delete('vshook_director_url')
  storage.delete('vshook_musicians_url')

  const startedAt = Date.now()
  const projects = await vm.runInContext('fetchDiscovery("192.168.77.10", 800)', context)
  const elapsed = Date.now() - startedAt
  if (!Array.isArray(projects) || projects[0]?.projectName !== 'Teste') {
    throw new Error('A primeira porta valida nao retornou a sessao.')
  }
  if (elapsed >= 200) {
    throw new Error(`A descoberta esperou a segunda porta (${elapsed} ms).`)
  }

  const batchStartedAt = Date.now()
  const batchProjects = await vm.runInContext(
    'scanInBatches(["192.168.77.2", "192.168.77.10", "192.168.77.200"])',
    context,
  )
  const batchElapsed = Date.now() - batchStartedAt
  if (!Array.isArray(batchProjects) || batchProjects[0]?.projectName !== 'Teste') {
    throw new Error('A busca em lote não retornou a primeira sessão encontrada.')
  }
  if (batchElapsed >= 200) {
    throw new Error(`A busca em lote esperou os outros IPs (${batchElapsed} ms).`)
  }

  vm.runInContext(`vshookDiscoveredProjects = [{
    projectName: 'Projeto aberto',
    directorUrl: 'http://192.168.77.10:47831',
    musiciansUrl: 'http://192.168.77.10:47832',
    projectTabIndex: 0
  }]`, context)
  vm.runInContext('prepareVSHookModeSelectionAfterReload()', context)
  const restoredProjects = vm.runInContext('consumeVSHookForcedModeSelection()', context)
  if (!Array.isArray(restoredProjects) || restoredProjects[0]?.projectName !== 'Projeto aberto') {
    throw new Error('A saída do app não preservou a tela dos cinco modos.')
  }
  if (vm.runInContext('consumeVSHookForcedModeSelection()', context) !== null) {
    throw new Error('A restauração da tela dos modos deveria ser usada uma única vez.')
  }

  const hasStoreDiscoveryOverride = vm.runInContext(
    'startDiscovery !== vshookStoreDefaultDiscovery',
    context,
  )
  if (!hasStoreDiscoveryOverride) {
    throw new Error('A descoberta automatica exclusiva do app da loja nao foi instalada.')
  }

  activeLocalAddresses = ['192.168.88.42']
  respondingHost = '192.168.88.10'
  requestedHosts = []
  const refreshedProjects = await vm.runInContext(
    'discoverProjectsFromActiveNetwork()',
    context,
  )
  if (!Array.isArray(refreshedProjects) || refreshedProjects[0]?.projectName !== 'Teste') {
    throw new Error('O Atualizar nao repetiu a descoberta pela rede ativa.')
  }
  if (localNetworkAddressReads < 2) {
    throw new Error('O Atualizar nao consultou novamente o endereco do Wi-Fi conectado.')
  }
  if (!requestedHosts.length || requestedHosts.some((host) => !host.startsWith('192.168.88.'))) {
    throw new Error('O Atualizar nao iniciou a busca pela nova faixa do Wi-Fi conectado.')
  }

  console.log(`Discovery automática ok: ${addresses[0]}, resposta em ${batchElapsed} ms.`)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
