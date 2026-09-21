const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8')

const appShell = read('app-shell.js')
const chat = read('chat.js')
const recados = read('recados.js')
const director = read('vsdiretor.js')
const musicians = read('vsmusicos.js')
const transferHook = read('transfer-hook.js')
const index = read('index.html')
const shippedFiles = [
  'app-shell.js',
  'chat.js',
  'recados.js',
  'vsdiretor.js',
  'vsmusicos.js',
  'transfer-hook.js',
  'index.html',
]
const builtSources = shippedFiles
  .map((name) => path.join('dist', name))
  .filter((name) => fs.existsSync(path.join(root, name)))
  .map(read)
const visibleSources = [
  appShell,
  chat,
  recados,
  director,
  musicians,
  transferHook,
  index,
  ...builtSources,
].join('\n')

assert.doesNotMatch(
  visibleSources,
  /e-mail informado na compra|e-mail da compra|licen[cç]a inativa|comprar acesso|adquirir licen[cç]a|renovar licen[cç]a/i,
  'O app ainda contém linguagem visível de compra ou licença externa.',
)
assert.doesNotMatch(
  visibleSources,
  /\b(?:comprar|adquirir|renovar)\b.{0,40}\b(?:acesso|licen[cç]a|assinatura)\b/i,
  'O app ainda contém uma chamada para adquirir acesso digital fora da App Store.',
)
assert.doesNotMatch(
  visibleSources,
  /https?:\/\/(?:www\.)?(?:wa\.me|whatsapp\.com|kiwify\.com|hotmart\.com)|checkout/i,
  'O app ainda contém link ou chamada para compra externa.',
)
assert.doesNotMatch(
  visibleSources,
  /\bREAPER\b/i,
  'O nome do software de áudio ainda aparece no conteúdo entregue ao usuário.',
)
assert.match(appShell, /Entre com a sua conta do Chat Hook\./)
assert.match(appShell, /placeholder="E-mail da conta"/)
assert.match(appShell, /Não foi possível entrar\. Confira o e-mail da conta e tente novamente\./)
assert.match(
  appShell,
  /Conecte-se ao VS Hook\/Hook Center na mesma rede para utilizar este recurso\./,
  'O estado companion sem computador não possui orientação neutra.',
)
assert.match(recados, /Conecte-se ao VS Hook\/Hook Center na mesma rede para utilizar este recurso\./)

const transferUnavailableStart = appShell.indexOf('function enterStandaloneTransferHook()')
const transferUnavailableEnd = appShell.indexOf('\nfunction attachStandaloneTransferHookHandler', transferUnavailableStart)
const transferUnavailable = appShell.slice(transferUnavailableStart, transferUnavailableEnd)
assert(transferUnavailableStart > 0 && transferUnavailableEnd > transferUnavailableStart)
assert.doesNotMatch(transferUnavailable, /window\.prompt|vshook_transfer_host/,
  'Drop Hook ainda tenta entrar usando host antigo ou pedir IP sem computador conectado.')
assert.match(transferUnavailable, /dropHookUnavailableSearchBtn/)

assert.match(chat, /post\('\/chat\/avatar'/,
  'O envio da foto deixou de usar a rota persistente do perfil.')
assert.match(chat, /applyState\(result, true\)/,
  'A foto enviada não atualiza o estado retornado pelo servidor.')

for (const forbiddenDirectory of ['Hook Keys', 'android', 'ios', 'node_modules', 'plugins']) {
  assert.equal(fs.existsSync(path.join(root, 'dist', forbiddenDirectory)), false,
    `${forbiddenDirectory} não pode ser copiado para o pacote web do VS Hook.`)
}

console.log('APPLE_REVIEW_COMPLIANCE_OK: companion neutro, sem CTA externo e sem referência visível ao software de áudio.')
