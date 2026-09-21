const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const sourcePath = path.resolve(__dirname, '..', 'vsdiretor.js')
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')

function extractFunction(name) {
  const match = new RegExp('  (?:async )?function ' + name + '\\(').exec(source)
  assert(match, 'funcao ausente: ' + name)
  const startAt = match.index
  const next = /\n  (?:async )?function /.exec(source.slice(startAt + 1))
  assert(next, 'fim da funcao ausente: ' + name)
  return source.slice(startAt, startAt + 1 + next.index)
}

function extractCase(name, nextName) {
  const marker = "      case '" + name + "':"
  const nextMarker = "      case '" + nextName + "':"
  const startAt = source.indexOf(marker)
  const endAt = source.indexOf(nextMarker, startAt + marker.length)
  assert(startAt >= 0, 'handler ausente: ' + name)
  assert(endAt > startAt, 'fim do handler ausente: ' + name)
  return source.slice(startAt, endAt)
}

function countCalls(block, name) {
  return (block.match(new RegExp('\\b' + name + '\\s*\\(', 'g')) || []).length
}
const start = source.indexOf('  function scheduleRender(force = false) {')
const end = source.indexOf('  function focusPendingTabletSearchResultDom()', start)
const block = source.slice(start, end)
const signatureAt = block.indexOf('const sig =')
const changedAt = block.indexOf('if (sig !== state.lastHtmlSignature)')
const renderAt = block.indexOf('const html = renderApp()')

if (start < 0 || end < 0 || signatureAt < 0 || changedAt < 0 || renderAt < 0 ||
    !(signatureAt < changedAt && changedAt < renderAt)) {
  throw new Error('renderApp voltou a ser executado antes de confirmar mudança visual')
}
if (!source.includes('const htmlWithoutPreservedStyles = html.replace(') ||
    !source.includes('template.innerHTML = htmlWithoutPreservedStyles')) {
  throw new Error('CSS preservado voltou a ser enviado ao parser em cada render')
}
if (!source.includes('const DIRECTOR_VISUAL_FRAME_MS = 50') ||
    source.includes('IS_LEGACY_IOS')) {
  throw new Error('cadencia visual deixou de ser unica entre as plataformas')
}
if (!source.includes('const transportAnimating =') ||
    !source.includes('isPlaying(state.snapshot) && !isPaused(state.snapshot)')) {
  throw new Error('loop visual voltou a trabalhar continuamente com o transporte parado')
}
if (!source.includes('syncPlaybackProgressDom(sampledAt, true)') ||
    !source.includes('if (!dynamicOnly) syncPlaybackQueueHeaderDom(data)')) {
  throw new Error('loop visual voltou a recalcular o cabecalho estatico em cada quadro')
}
if (!source.includes("state.settingsSection = 'teleprompt-hub'\n        mountSettingsModalInPlace()") ||
    !source.includes("state.settingsSection = 'recados'\n        armAppConfigColorGuard()\n        mountSettingsModalInPlace()")) {
  throw new Error('navegacao interna de Config voltou a reconstruir a interface inteira')
}

// No Android o WebView entrega um clique sintetico depois do pointerup que
// abriu a tela de Config, e sem esta guarda ele cai sozinho no campo de cor e
// escancara o seletor nativo. Ela ja se perdeu uma vez numa sincronizacao
// entre as duas copias do app.
for (const parte of [
  "document.addEventListener('pointerdown', trackAppConfigColorPointerDown, true)",
  "document.addEventListener('click', guardAppConfigColorClick, true)",
]) {
  assert(source.includes(parte),
    'a guarda do seletor de cores do Android perdeu um registro: ' + parte)
}

const renderSignatureBlock = extractFunction('getAppRenderSignature')
for (const requiredPart of [
  'state.activeTab',
  'state.telepromptListOpen',
  'state.telepromptPartsOpen',
  'getHashDrawersRenderSignature()',
  'compactRenderState()',
]) {
  assert(renderSignatureBlock.includes(requiredPart),
    'assinatura visual perdeu componente: ' + requiredPart)
}
const scheduleRenderBlock = extractFunction('scheduleRender')
const pollBridgeBlock = extractFunction('pollBridge')
assert.match(pollBridgeBlock,
  /hadRenderableListContent[\s\S]*?gainedRenderableListContent[\s\S]*?musicPaneCache\.clear\(\)[\s\S]*?scheduleRender\(true\)/,
  'primeiro snapshot completo deve montar a lista mesmo se o app abrir durante a reprodução')
const playbackProgressBlock = extractFunction('syncPlaybackProgressDom')
assert.match(playbackProgressBlock,
  /mountedListReady[\s\S]*?state\.lastHtmlSignature = ''[\s\S]*?scheduleRender\(true\)/,
  'loop da agulha não deve confirmar uma tela inicial que ainda está sem linhas')
assert.match(scheduleRenderBlock,
  /const sig\s*=\s*getAppRenderSignature\s*\([^)]*\)/,
  'scheduleRender deve obter a assinatura pelo helper dedicado')
assert.doesNotMatch(scheduleRenderBlock,
  /const sig\s*=\s*`\$\{state\.activeTab\}/,
  'assinatura visual voltou a ficar inline em scheduleRender')

extractFunction('syncSongRowsDom')
const finishSongInteractionBlock = extractFunction('finishSongInteractionDom')
assert.match(finishSongInteractionBlock, /\bsyncSongRowsDom\s*\(/,
  'interacao comum deve sincronizar as linhas no DOM local')
assert.match(finishSongInteractionBlock, /\bgetAppRenderSignature\s*\(/,
  'interacao comum deve manter a assinatura visual sincronizada')
assert.doesNotMatch(finishSongInteractionBlock,
  /\b(?:renderApp|updateAppHtmlPreservingTopStatus)\s*\(/,
  'interacao comum voltou a reconstruir o app inteiro')
const finishSyncAt = finishSongInteractionBlock.indexOf('syncSongRowsDom(')
const finishFallbackAt = finishSongInteractionBlock.indexOf('scheduleRender(true)')
const finishSignatureAt = finishSongInteractionBlock.indexOf('getAppRenderSignature(')
assert(finishSignatureAt > finishSyncAt,
  'assinatura deve ser atualizada depois da sincronizacao DOM local')
if (finishFallbackAt >= 0) {
  assert(finishFallbackAt > finishSyncAt && finishFallbackAt < finishSignatureAt,
    'render forcado deve ficar isolado antes do caminho simples')
  assert(finishSongInteractionBlock.slice(finishFallbackAt, finishSignatureAt).includes('return'),
    'fallback estrutural deve encerrar antes do caminho simples')
  assert.match(finishSongInteractionBlock.slice(finishSyncAt, finishFallbackAt),
    /\b(?:structural|isPartsInterfaceVisible)\b/,
    'render forcado deve possuir uma guarda estrutural explicita')
}
assert.equal((finishSongInteractionBlock.match(/scheduleRender\s*\(\s*true\s*\)/g) || []).length,
  finishFallbackAt >= 0 ? 1 : 0,
  'interacao comum nao deve possuir outros renders forcados')

const handleItemSelectBlock = extractFunction('handleItemSelect')
const playlistFlowAt = handleItemSelectBlock.indexOf("\n    if (type === 'playlist') {")
const regionFlowAt = handleItemSelectBlock.indexOf("\n    if (type === 'region') {", playlistFlowAt + 1)
assert(playlistFlowAt >= 0 && regionFlowAt > playlistFlowAt,
  'fluxos comuns de selecao nao foram encontrados')
const playlistFlow = handleItemSelectBlock.slice(playlistFlowAt, regionFlowAt)
const regionFlow = handleItemSelectBlock.slice(regionFlowAt)
for (const [name, flow] of [['playlist', playlistFlow], ['regions', regionFlow]]) {
  const simpleFlowAt = flow.indexOf('const alreadySelected')
  assert(simpleFlowAt >= 0, 'fluxo simples ausente: ' + name)
  const simpleFlow = flow.slice(simpleFlowAt)
  assert(countCalls(simpleFlow, 'finishSongInteractionDom') >= 1,
    'selecao comum deve finalizar pelo DOM local: ' + name)
  assert.equal(countCalls(simpleFlow, 'scheduleRender'), 0,
    'selecao comum nao deve agendar render global: ' + name)
}

extractFunction('renderMusicPane')
const createMusicPaneNodeBlock = extractFunction('createMusicPaneNode')
assert.match(createMusicPaneNodeBlock, /\brenderMusicPane\s*\(/,
  'montagem do painel deve renderizar somente o conteudo musical')
assert.doesNotMatch(createMusicPaneNodeBlock, /\brenderApp\s*\(/,
  'montagem do painel musical voltou a renderizar o app inteiro')
const swapMusicPaneBlock = extractFunction('swapMusicPaneDom')
assert.match(swapMusicPaneBlock, /\bcreateMusicPaneNode\s*\(/,
  'troca de aba deve montar somente o painel musical')
assert.doesNotMatch(swapMusicPaneBlock,
  /\b(?:renderApp|updateAppHtmlPreservingTopStatus|scheduleRender)\s*\(/,
  'troca do painel central voltou a reconstruir o app inteiro')
for (const tab of ['mixer', 'premix']) {
  assert(source.includes(`data-main-pane-tab="${tab}"`),
    `painel ${tab} deve participar do cache central`)
}
const cachedTabBlock = extractFunction('isCachedMainPaneTab')
for (const tab of ['playlist', 'regions', 'mixer', 'premix']) {
  assert(cachedTabBlock.includes(`activeTab === '${tab}'`),
    `cache central perdeu a tela ${tab}`)
}
const premixFullRenderBlock = extractFunction('renderPremixFullScreen')
assert.match(premixFullRenderBlock, /data-premix-screen-cache-placeholder/,
  'Premix de tela cheia deve reutilizar a superficie pronta')
assert.match(extractFunction('reuseCachedPremixFullScreen'),
  /premixFullScreenCache[\s\S]*replaceChild\(cached, placeholder\)/,
  'Premix de tela cheia deve preservar e recolocar o mesmo DOM')

const renderMusicianMonitorBlock = extractFunction('renderMusicianMonitorContent')
for (const [name, renderBlock] of [
  ['Diretor', extractFunction('renderMusicPane')],
  ['Musicos', renderMusicianMonitorBlock],
]) {
  assert.match(renderBlock, /\brenderCachedMusicList\s*\(/,
    `lista do ${name} deve usar o cache de DOM compartilhado`)
}
const reuseListsBlock = extractFunction('reuseStableListBoxes')
assert.match(reuseListsBlock, /data-music-list-cache-key/,
  'cache deve reconhecer a arvore de musicas ja montada')
assert.match(reuseListsBlock, /replaceChild\(currentList, nextList\)/,
  'cache deve reaproveitar o mesmo DOM da lista')
const renderCachedListBlock = extractFunction('renderCachedMusicList')
assert.match(renderCachedListBlock, /const rows = canReuseMounted \? '' : renderRows\(items, type\)/,
  'lista ja montada nao deve ser reconstruida nem fora da tela')
assert.match(renderCachedListBlock, /mounted\.querySelector\('\.item'\)/,
  'marcador vazio de cache nunca deve ocultar uma lista que possui itens')
assert.match(scheduleRenderBlock, /restoreListScrollState\(scrollState\)[\s\S]{0,100}?syncSongRowsDom\(\)/,
  'estado dinamico deve ser sincronizado depois de recuperar a lista do cache')
const mountMainBlock = extractFunction('mountMainContentPanelDom')
assert.match(mountMainBlock, /reuseMatchingCachedMusicList\(current, next\)/,
  'Parts deve transportar a lista pronta para o painel dividido')
assert.match(mountMainBlock,
  /movedMusicList[\s\S]{0,220}?musicPaneCache\.delete\(currentMusicTab\)/,
  'Parts deve invalidar o painel antigo depois de mover a lista')
assert.match(mountMainBlock, /isUsableCachedMainPane\(state\.activeTab, cached\.node\)/,
  'retorno do Parts deve rejeitar um painel em cache sem a lista')
const usablePaneBlock = extractFunction('isUsableCachedMainPane')
for (const requiredList of [
  "activeTab !== 'playlist' && activeTab !== 'regions'",
  "activeTab === 'playlist' ? 'playlist' : 'region'",
]) {
  assert(usablePaneBlock.includes(requiredList),
    'protecao do Parts deve cobrir Repertorio e Musicas: ' + requiredList)
}

const stylePath = path.resolve(__dirname, '..', 'stylediretor-app.css')
const styles = fs.readFileSync(stylePath, 'utf8').replace(/\r\n/g, '\n')
assert.match(styles, /\.musicListRenderCache\s*\{[\s\S]{0,180}?will-change:\s*scroll-position/,
  'lista em cache deve manter a superficie de rolagem preparada')

const setTabBlock = extractFunction('setTab')
assert.match(source,
  /mixerListOpen:\s*readLocal\('vshook_director_mixer_list_open', '0'\) === '1'/,
  'estado aberto ou fechado do LIST deve ser recuperado ao entrar no app')
assert.match(extractCase('mixer-list-toggle', 'mixer-item-mute'),
  /writeLocal\('vshook_director_mixer_list_open', state\.mixerListOpen \? '1' : '0'\)/,
  'mudança do LIST deve ser persistida')
assert.doesNotMatch(setTabBlock, /state\.mixerTimelineItems\s*=\s*\[\]/,
  'abrir o TCP nao deve apagar os itens ja carregados')
assert.match(setTabBlock, /applyCachedMixerTimelineProject\(\)/,
  'abrir o TCP deve aplicar imediatamente o catalogo local do projeto')
const paneSwapAt = setTabBlock.indexOf('swapMusicPaneDom(')
const structuralFallbackAt = setTabBlock.indexOf('scheduleRender(true)', paneSwapAt + 1)
assert(paneSwapAt >= 0, 'setTab deve trocar localmente playlist/regions')
assert(structuralFallbackAt > paneSwapAt,
  'render completo de setTab deve existir somente depois do caminho local')
assert.equal(countCalls(setTabBlock, 'swapMusicPaneDom'), 1,
  'setTab deve ter um unico ponto de troca do painel musical')
assert.equal((setTabBlock.match(/scheduleRender\s*\(\s*true\s*\)/g) || []).length, 1,
  'setTab deve reservar um unico render forcado para o fallback estrutural')
const pathSeparator = setTabBlock.slice(paneSwapAt, structuralFallbackAt)
assert(/\b(?:else|return)\b/.test(pathSeparator),
  'o caminho local de setTab deve encerrar ou separar o fallback estrutural')

assert.match(swapMusicPaneBlock,
  /rememberMusicPaneScroll\(previousTab,\s*current\)/,
  'troca de aba deve guardar a posicao da lista que esta saindo')
assert.match(swapMusicPaneBlock,
  /restoreMusicPaneScroll\(activeTab,\s*cached\.node\)/,
  'troca de aba deve restaurar a posicao propria da lista que esta voltando')
const songListScrollBlock = extractFunction('handleDirectorSongListScroll')
assert.match(songListScrollBlock,
  /rememberMusicPaneScroll\(scrollKey,\s*list\)/,
  'rolagem deve atualizar a memoria independente de Repertorio e Musicas')
assert(source.includes('const musicPaneScrollState = new Map()'),
  'cache deve manter posicao por aba mesmo quando o painel for recriado')

for (const [action, nextAction, tab] of [
  ['go-playlist', 'go-regions', 'playlist'],
  ['go-regions', 'go-markers', 'regions'],
]) {
  const handler = extractCase(action, nextAction)
  assert(handler.includes("setTab('" + tab + "')"),
    action + ' deve delegar a troca para setTab')
  assert.equal(countCalls(handler, 'scheduleRender'), 0,
    action + ' nao deve duplicar o render de setTab')
}

// A faixa de rolagem dedicada na linha da musica foi retirada junto com a sua
// opcao em Config. A lista volta a ser rolada pela propria linha, e nenhuma
// preferencia local sobra para reaparecer sozinha num aparelho ja usado.
for (const vestigio of [
  'songScrollLane',
  'directorSongScrollLaneEnabled',
  'song-scroll-lane-toggle',
  'vshook_director_tablet_song_scroll_lane',
  'data-song-scroll-lane',
]) {
  assert(!source.includes(vestigio),
    'a faixa de rolagem da linha voltou ao codigo: ' + vestigio)
}

// Uma selecao normal muda apenas o estado visual da linha. Nenhum caminho
// geral de render pode voltar a seguir a selecao alterando o scrollTop.
for (const [name, selectionBlock] of [
  ['handleItemSelect', handleItemSelectBlock],
  ['syncSharedInterfaceState', extractFunction('syncSharedInterfaceState')],
]) {
  assert.doesNotMatch(selectionBlock,
    /\b(?:scrollTop|scrollTo|scrollIntoView|queueDirectorSelectionScroll)\b/,
    name + ' nao deve reposicionar a lista por causa de selecao comum')
}
assert.equal(countCalls(scheduleRenderBlock, 'focusPendingDirectorSelectionDom'), 0,
  'render geral nao deve executar foco automatico de selecao comum')
for (const obsoleteSelectionFocus of [
  'queueDirectorSelectionScroll',
  'focusPendingDirectorSelectionDom',
  'directorSelectionScrollPending',
]) {
  assert(!source.includes(obsoleteSelectionFocus),
    'foco automatico de selecao voltou ao codigo: ' + obsoleteSelectionFocus)
}
const playlistScrollGestureBlock = extractFunction('handlePlaylistScrollGesture')
assert.match(playlistScrollGestureBlock,
  /event\.type\s*===\s*'pointerdown'[\s\S]*?gestureGuardUntil[\s\S]*?directorListScrollingUntil/,
  'pointerdown da lista deve impedir render antes do primeiro movimento')
assert.match(playlistScrollGestureBlock,
  /closest\?\.\('\.listBox'\)[\s\S]*?directorListPointerActive\s*=\s*true/,
  'tocar qualquer espaço da lista deve bloquear a restauração do scroll')
assert.match(extractFunction('isDirectorListScrolling'),
  /directorListPointerActive\s*===\s*true/,
  'o render deve permanecer suspenso enquanto o dedo controla a lista')
assert.match(styles,
  /\.musicListRenderCache\s*\{[\s\S]{0,100}?overflow-anchor:\s*none/,
  'lista musical nao deve ancorar novamente a linha selecionada')
assert.match(styles,
  /\.listBox\s*\{[\s\S]{0,160}?overscroll-behavior-y:\s*none\s*!important/,
  'as extremidades da lista nao devem prender o primeiro gesto de retorno')

const onTapBlock = extractFunction('onTap')
assert.doesNotMatch(onTapBlock,
  /directorSongListScrollingUntil/,
  'um novo toque na musica nao pode ser bloqueado pela rolagem anterior')
assert.match(onTapBlock, /event\.type === 'click'[\s\S]*?playlistScrollSuppressClickUntil/,
  'somente o click sintetico posterior a rolagem deve ser bloqueado')
assert.match(onTapBlock, /event\.pointerId === playlistScrollSuppressedPointerId/,
  'uma linha musical arrastada deve continuar sendo tratada como scroll')
assert.match(playlistScrollGestureBlock, /Math\.hypot\(dx, dy\) > 10/,
  'a lista musical deve usar touch slop antes de assumir que o gesto e scroll')
assert.doesNotMatch(playlistScrollGestureBlock, /state\.ignoreTapUntil\s*=/,
  'o scroll da lista nao pode bloquear globalmente os demais botoes')

const partsSnapshotBlock = extractFunction('syncPartsMarkerStateFromSnapshot')
assert.match(partsSnapshotBlock,
  /if\s*\(!state\.partsArmedOwnerSongId\s*&&\s*hasReachedPartsArmedTarget\(data\)\)\s*\{\s*clearReachedPartsArmedTarget\(data\)/,
  'Parts deve limpar o alvo mesmo enquanto o Bridge ainda repete armedMarkerId')
const clearReachedPartsBlock = extractFunction('clearReachedPartsArmedTarget')
for (const requiredClear of [
  "state.partsArmedMarkerId = ''",
  "state.partsLocalSelectedMarkerId = ''",
  'syncMarkerSelectionDom()',
]) {
  assert(clearReachedPartsBlock.includes(requiredClear),
    'limpeza visual do alvo Parts incompleta: ' + requiredClear)
}

// A Lupa e a unica excecao: ela cria um alvo explicito, consumido pelo foco
// dedicado depois que a tela de busca fecha e a lista de destino reaparece.
const tabletSearchResultBlock = extractFunction('handleTabletSearchResult')
assert.match(tabletSearchResultBlock,
  /state\.tabletSearchPendingFocus\s*=\s*\{/,
  'resultado da Lupa deve criar tabletSearchPendingFocus')
for (const field of ['id', 'itemType', 'destinationTab', 'scheduled']) {
  assert.match(tabletSearchResultBlock, new RegExp('\\b' + field + '\\s*:'),
    'tabletSearchPendingFocus perdeu o campo ' + field)
}
assert(countCalls(scheduleRenderBlock, 'focusPendingTabletSearchResultDom') >= 1,
  'render deve continuar consumindo o foco explicito criado pela Lupa')

// CONFIG ABA TP controla somente a presença dos botões e começa toda
// desligada. A ordem declarada é também a ordem do rodapé.
assert.match(source,
  /\{ id: 'play'[\s\S]*?\{ id: 'list'[\s\S]*?\{ id: 'auto1'[\s\S]*?\{ id: 'auto2'[\s\S]*?\{ id: 'loop'[\s\S]*?\{ id: 'parts'[\s\S]*?\{ id: 'stopBreak'/,
  'ordem do rodapé do Teleprompt foi alterada')
const compactTpControls = extractFunction('getAvailableTelepromptTabControls')
for (const id of ['play', 'auto1', 'loop']) {
  assert(compactTpControls.includes(`control.id === '${id}'`),
    'modo compacto perdeu o controle ' + id)
}
for (const id of ['auto2', 'stopBreak']) {
  assert(!compactTpControls.includes(`control.id === '${id}'`),
    'modo compacto não pode mostrar ' + id)
}
assert.match(compactTpControls, /filter\(\(control\) => control\.id !== 'loop'\)/,
  'no Tablet o PARTS deve ocupar o lugar do LOOP')
assert.match(extractFunction('getTelepromptTabControls'),
  /saved\?\.\[control\.id\]\s*===\s*true/,
  'controles do rodapé devem iniciar desligados')

// LIST e PARTS podem coexistir: 40% em cada lateral e 20% para o TP.
const telepromptRenderBlock = extractFunction('renderDirectorTelepromptScreen')
assert(telepromptRenderBlock.indexOf('<div class="directorTpControls">') <
  telepromptRenderBlock.indexOf('<div class="directorTpWorkspace"'),
  'barra superior do TP deve ficar fixa acima de LIST/TP/PARTS')
assert.match(telepromptRenderBlock,
  /getHideTelepromptTransport\(slot\)\s*\|\|\s*listOpen/,
  'abrir LIST deve ocultar temporariamente o transporte do TP')
assert(telepromptRenderBlock.indexOf('renderTelepromptTabFooterControls(data)') >
  telepromptRenderBlock.lastIndexOf('renderTelepromptPartsSide(data)'),
  'rodape do TP deve ficar abaixo de LIST/TP/PARTS, ocupando a largura total')
for (const requiredPart of [
  'renderTelepromptPlaylistSide(data)',
  'renderTelepromptPartsSide(data)',
  'data-list-open=',
  'data-parts-open=',
]) {
  assert(telepromptRenderBlock.includes(requiredPart),
    'layout lateral do TP perdeu: ' + requiredPart)
}
assert.match(styles,
  /\.directorTpWorkspace\[data-list-open="1"\]\[data-parts-open="1"\]\s*\{[^}]*grid-template-columns:\s*40%\s+minmax\(0,\s*20%\)\s+40%/,
  'LIST + TP + PARTS devem ocupar exatamente 40/20/40')
assert.match(styles,
  /\.directorTpPanel\s*>\s*\.directorTpFooterControls\s*\{[^}]*margin:\s*0\s+10px\s+10px/,
  'rodape do TP deve permanecer abaixo das colunas')
assert.match(styles,
  /\.directorTpPanel\s*>\s*\.directorTpControls\s*\{[^}]*margin:\s*10px\s+10px\s+0/,
  'barra superior do TP deve respeitar o contorno como o rodape')
assert.match(styles,
  /\.directorTpPanel\s*>\s*\.directorTpControls\s*>\s*\.directorTpTab\s*\{[^}]*height:\s*30px\s*!important[^}]*max-height:\s*30px\s*!important/,
  'botoes CONFIG/TP, TP/1, TP/2 e VOLTAR devem permanecer compactos')
assert.match(styles,
  /\.directorTpWorkspace\[data-list-open="1"\]\[data-parts-open="1"\]\s+\.directorTpClock,[\s\S]{0,300}?width:\s*calc\(50%\s*-\s*7px\)\s*!important[\s\S]{0,120}?height:\s*30px\s*!important[\s\S]{0,120}?max-height:\s*30px\s*!important/,
  'cronometro e horario local devem dividir o TP com o mesmo tamanho quando LIST e PARTS abrirem juntos')
assert.match(styles,
  /\.directorTpContent\s*>\s*\.playbackQueueHeader\s+\.playbackQueueNow,[\s\S]{0,260}?grid-template-columns:\s*max-content\s+22px\s+minmax\(0,\s*1fr\)\s+max-content\s*!important/,
  'rotulo, seta, nome e tempo do transporte do TP devem ocupar colunas independentes')
assert.match(source,
  /playbackQueueLabel">REPRODUZINDO<\/span>\s*<span class="playbackQueueStateArrow/,
  'seta do transporte deve ser irma do rotulo, nunca ficar sobre o nome')
const telepromptPartsSyncBlock = extractFunction('syncTelepromptPartsSideDom')
assert.match(telepromptPartsSyncBlock, /\brenderTelepromptPartsSide\s*\(/,
  'PARTS do TP deve ser remontado com a musica selecionada')
assert.match(telepromptPartsSyncBlock, /\bcurrent\.replaceWith\(next\)/,
  'PARTS do TP deve trocar somente sua lateral')
assert(!extractFunction('renderTelepromptPartsSide').includes('directorTpSideTitle">PARTS'),
  'lateral PARTS do TP nao deve manter cabecalho sem utilidade')
assert.match(source,
  /state\.showTelepromptScreen\s*&&\s*root\.querySelector\('\.directorTpOverlay'\)[\s\S]{0,420}?syncTelepromptPartsSideDom\(\)/,
  'snapshot de reproducao/fila deve atualizar imediatamente a lateral PARTS do TP')
assert.match(source,
  /case 'parts-song-playing':[\s\S]{0,420}?syncTelepromptPartsSideDom\(\)/,
  'botao da musica tocando deve atualizar a cor e a lista PARTS no proprio toque')
assert.match(source,
  /case 'parts-song-queued':[\s\S]{0,420}?syncTelepromptPartsSideDom\(\)/,
  'botao da musica na fila deve atualizar a cor e a lista PARTS no proprio toque')
assert.match(finishSongInteractionBlock, /\bsyncTelepromptPartsSideDom\s*\(/,
  'selecao na LIST deve sincronizar PARTS imediatamente')
assert.match(finishSongInteractionBlock, /isPartsInterfaceVisible\(\)\s*&&\s*!telepromptPartsSynced/,
  'PARTS lateral sincronizado nao deve provocar render geral do TP')
assert.match(extractFunction('isPartsInterfaceVisible'), /\bisTelepromptPartsSideVisible\s*\(/,
  'PARTS aberto dentro do TP deve contar como interface visivel')
assert.match(styles,
  /\.directorTpFooterControls\s*>\s*\.btnConfigOffRed\s*\{[^}]*#dc2626/,
  'LIST/PARTS fechados devem aparecer em vermelho')
assert.match(styles,
  /\.directorTpFooterControls\s*>\s*\.btnConfigOnGreen\s*\{[^}]*#22c55e/,
  'LIST/PARTS abertos devem aparecer em verde')
assert.match(styles,
  /\.directorTpSidePane \.item\.numberedItem\s*\{[^}]*grid-template-columns:\s*38px/,
  'lista lateral de 40% deve usar proporcoes completas de linha e numeracao')
const tpControlsConfigBlock = extractFunction('renderTelepromptTabControlsConfig')
assert.match(tpControlsConfigBlock,
  /telepromptTransportVisibilityButton[\s\S]*?teleprompt-transport-visibility-toggle/,
  'opcao de ocultar transporte deve ficar dentro de CONFIG ABA TP')
assert.match(extractFunction('renderSettingsModal'),
  /settingsMainTransportVisibilityButton[\s\S]*?main-transport-visibility-toggle/,
  'Config deve oferecer ocultacao independente do transporte da tela principal')
for (const mainScreenBlock of [
  extractFunction('renderMusicPane'),
  extractFunction('renderMusicianMonitorContent'),
  extractFunction('renderTabletTunerUnifiedContent'),
  extractFunction('renderTabletBpmUnifiedContent'),
]) {
  assert.match(mainScreenBlock, /renderMainPlaybackQueueHeader\s*\(/,
    'telas principais devem respeitar sua preferencia independente de transporte')
}
const autoBlockVisualBlock = extractFunction('isAutoBlocoBoundaryVisualTarget')
assert.doesNotMatch(autoBlockVisualBlock, /queuedManual|manualQueue/,
  'AT/BL ligado nao pode manter tarja laranja manual na primeira musica do proximo bloco')
assert.match(autoBlockVisualBlock, /nextBlockIndex[\s\S]*?isPlayable\(item\)/,
  'AT/BL deve esconder somente a primeira musica tocavel do proximo bloco')
const atBlToggleBlock = extractCase('atbl-toggle', 'play')
for (const syncCall of [
  'syncSongRowsDom()',
  'syncPlaybackQueueHeaderDom()',
  'syncPlaybackProgressDom()',
]) {
  assert(atBlToggleBlock.includes(syncCall),
    'AT/BL deve sincronizar localmente no mesmo toque: ' + syncCall)
}
const syncSongRowsBlock = extractFunction('syncSongRowsDom')
assert.match(syncSongRowsBlock, /const playingRowAppliedByList = new Set\(\)/,
  'cada lista visivel deve conservar sua propria tarja de reproducao')
assert.match(syncSongRowsBlock, /row\.closest\('\.listBox'\)/,
  'tarja tocando deve ser limitada por lista, nao pela interface inteira')
assert.match(extractFunction('syncSharedInterfaceState'),
  /localQueueHeld[\s\S]*?if\s*\(!localQueueHeld\)/,
  'fila local deve permanecer autoritativa enquanto o Bridge confirma')
const optimisticPositionBlock = extractFunction('getOptimisticPlayingVisualPosition')
assert.match(optimisticPositionBlock, /optimisticPlayingAnchorPos/,
  'inicio local da musica deve possuir ancora propria')
assert.match(optimisticPositionBlock, /locallyPaused/,
  'progresso local nao pode herdar o pausado antigo do Bridge')
const ensureSongRowProgressBlock = extractFunction('ensureSongRowProgress')
assert.match(ensureSongRowProgressBlock, /bar\.style\.transform\s*=\s*nextScale/,
  'barra nova deve nascer na escala correta, sem piscar cheia')
assert.doesNotMatch(ensureSongRowProgressBlock, /bar\.style\.width\s*=/,
  'largura inline era ignorada pelo CSS e fazia a barra aparecer cheia')
assert(source.includes("showPopup('APENAS COM A MÚSICA PARADA'"),
  'aviso do Grid deve informar que a operacao exige musica parada')
const stoppedTransportBlock = extractFunction('bridgeExplicitlyStopped')
assert.match(stoppedTransportBlock, /hasStoppedFlag/,
  'flags booleanas de STOP devem vencer IDs antigos de reproducao')
assert.doesNotMatch(stoppedTransportBlock,
  /!data\.(?:playingId|playingSongId|currentSongId)/,
  'STOP nao pode depender da limpeza tardia dos IDs da musica anterior')
const initializeSeekBlock = extractFunction('initializeTransportSeekTargetCursor')
assert.match(initializeSeekBlock,
  /const stopped\s*=\s*!getTransportSeekPlaying[\s\S]*?!isPaused/,
  'Grid deve distinguir selecao parada de Play e Pause')
assert.match(initializeSeekBlock,
  /transportSeekCursorPos\s*=\s*start[\s\S]*?transportSeekPauseVisualHoldPos\s*=\s*start/,
  'nova selecao parada deve nascer e permanecer no inicio da musica')
assert.match(extractFunction('focusOpenTabletTransportPanel'),
  /initializeTransportSeekTargetCursor\(target, state\.snapshot\)/,
  'troca de selecao com o Grid aberto deve zerar seu cursor localmente')
const seekCursorBlock = extractFunction('getTransportSeekCursorPos')
assert.match(seekCursorBlock,
  /transportSeekLocalCursorHeld[\s\S]*?return pauseHold/,
  'posição escolhida localmente deve vencer snapshots antigos com a música parada')
const mixerCursorBlock = extractFunction('syncMixerTimelineCursorDom')
assert.match(mixerCursorBlock,
  /getSmoothSeekPlayPositionSec\(state\.snapshot, sampledAt/,
  'agulha do Mixer deve usar o mesmo relógio suave e monotônico do painel Grid')
assert.match(extractFunction('renderMixerPage'),
  /const focusItem = getMixerFocusItem\(data\)/,
  'Mixer deve priorizar a região realmente em reprodução ao abrir')
assert.match(extractFunction('handleDirectorSongListScroll'),
  /mixerListScrollTop\s*=\s*Math\.max\(0, Number\(list\.scrollTop\)/,
  'Mixer deve memorizar continuamente a posição vertical da lista')
assert.match(extractFunction('rememberMixerVerticalScrollDom'),
  /if \(trackPane\)[\s\S]*?mixerTrackScrollTop\s*=\s*top[\s\S]*?mixerListScrollTop\s*=\s*top[\s\S]*?else if \(list\)/,
  'ao fechar LIST, a rolagem interna deve prevalecer sobre o listBox externo parado em zero')
assert.match(extractFunction('restoreMixerVerticalScrollDom'),
  /mixerTrackScrollTop[\s\S]*?requestAnimationFrame\(apply\)/,
  'Mixer deve restaurar a pista visível também após o layout do WebView')
assert.match(extractFunction('carryMixerVerticalScrollAcrossListLayout'),
  /mixerListOpen[\s\S]*?mixerListScrollTop\s*=\s*top[\s\S]*?mixerTrackScrollTop\s*=\s*top/,
  'abrir ou fechar LIST deve transferir a mesma posição entre os dois layouts')
assert.match(extractCase('mixer-list-toggle', 'mixer-item-mute'),
  /carryMixerVerticalScrollAcrossListLayout\(\)[\s\S]*?mixerListOpen\s*=\s*!state\.mixerListOpen/,
  'posição das pistas deve ser capturada antes de alternar o LIST')
assert.match(styles,
  /\.mixerItemModalOverlay\s*\{[^}]*background:\s*transparent\s*!important/,
  'modal flutuante do item não deve escurecer o Mixer por baixo')
assert.match(styles,
  /\.app\[data-theme="light"\] \.mixerItemModalOverlay\s*\{[^}]*background:\s*transparent\s*!important/,
  'modal flutuante do item também deve ficar sem sombra no tema claro')
assert.match(extractFunction('closeNavigationModalsInPlace'),
  /closeSettingsModalInPlace\(\)[\s\S]*?showProjectModal\s*=\s*false[\s\S]*?showPlaylistModal\s*=\s*false[\s\S]*?showTimerModal\s*=\s*false/,
  'navegação deve fechar CONFIG, SESSÃO, RPTS e cronômetro')
assert.match(extractFunction('setTab'),
  /closeNavigationModalsInPlace\(\)[\s\S]*?if \(state\.activeTab === tab\) return/,
  'qualquer troca ou toque de aba deve fechar os modais de navegação antes de continuar')
assert.match(styles,
  /\[data-director-platform="ios"\]\[data-director-device="tablet"\][^\{]*\[data-active-tab="mixer"\][^\{]*\.mixerListBox\s*\{[^}]*padding-bottom:\s*0\s*!important[^}]*scroll-padding-bottom:\s*0\s*!important/,
  'Mixer no iPad não deve herdar a faixa inferior de 76 px das listas comuns')
assert.match(styles,
  /\.mixerItemModalBox\s*\{[^}]*box-shadow:\s*none\s*!important/,
  'modal flutuante do item não deve projetar sombra preta')
assert.match(extractFunction('markPressedFeedbackDom'),
  /data-action'\) === 'mixer-grid-seek'/,
  'tocar no Grid não deve acender todos os itens através do brilho do contêiner')
assert.match(source,
  /\.mixerTabletGridItemName\{[^}]*color:#050505!important[^}]*text-shadow:none!important/,
  'nome de cada item do Grid deve permanecer preto e sem sombra')
assert.match(source,
  /\.mixerTabletGridWaveform>i\{[^}]*background:#6b7280!important/,
  'ondas gráficas dos itens do Mixer devem permanecer cinza')
assert.match(source,
  /\.mixerTabletGridItemMuted\{[^}]*background:#050505!important/,
  'item mutado do Mixer deve ficar preto')
assert.match(source,
  /\.mixerTabletGridItemMuted \.mixerTabletGridItemName\{color:#ef4444!important/,
  'nome do item mutado deve ficar vermelho')
assert.match(source,
  /\.mixerTabletGridItemMuted \.mixerTabletGridMuteLabel\{[^}]*background:#dc2626!important/,
  'selo Mute do item deve ficar vermelho')
assert.match(source,
  /\.mixerTabletGrid\{[^}]*background-image:none!important/,
  'Grid do Mixer não deve desenhar linhas decorativas de subdivisão')
assert.match(source,
  /\.mixerListBox\{[^}]*padding-bottom:0!important[^}]*scroll-padding-bottom:0!important/,
  'Mixer não deve herdar a reserva preta de rodapé das listas comuns')
assert.match(source,
  /\.mixerTabletTimeline\{[^}]*align-items:stretch!important[^}]*min-height:0!important/,
  'colunas do Mixer devem preencher o painel sem faixa preta quando houver poucas pistas')
assert.match(source,
  /\.mixerListBox\.mixerUnifiedScroll\{[^}]*display:flex!important[^}]*flex-direction:column!important/,
  'Mixer sem LIST deve distribuir o grid ate o fim da altura visivel')
assert.match(source,
  /\.mixerTrackGridPane\{[^}]*display:flex!important[^}]*flex-direction:column!important/,
  'Mixer com LIST deve distribuir o grid ate o fim da altura visivel')
assert.match(source,
  /\.mixerTabletTimelineUnified \.mixerTabletGrid\{[^}]*height:100%!important/,
  'canvas real do grid deve ocupar toda a altura do painel')
assert.match(extractFunction('getMixerPremixItemGeometry'),
  /const inset\s*=\s*0/,
  'itens do Mixer devem começar sem margem antes da linha inicial da região')
assert.match(extractFunction('renderMixerTimelineRegions'),
  /const inset\s*=\s*0/,
  'faixas superiores do Mixer devem começar na linha vertical inicial')
assert.match(extractFunction('renderMixerTimelineRegionGuides'),
  /const inset\s*=\s*0/,
  'linhas verticais devem continuar visíveis sem margem lateral artificial')
assert.match(source,
  /\.mixerTimelineFixedTrackCap\{[^}]*border-right:0!important/,
  'cabeçalho não deve criar linha cinza antes do início da região')
assert.match(source,
  /\.mixerTabletTrackRows\{[^}]*border-right:0!important/,
  'coluna de pistas não deve criar linha cinza antes do início da região')
assert.match(source,
  /mixerTimelineTrackCapLane">Músicas\/Blocos<\/span><span class="mixerTimelineTrackCapLane">Músicas\/Filhos/,
  'cabeçalho das pistas deve identificar as faixas de blocos e filhos')
assert.match(source,
  /\.mixerTimelineTrackCapLane\+ \.mixerTimelineTrackCapLane\{[^}]*border-top:1px solid #263241!important/,
  'rótulos das duas faixas devem ter uma linha divisória')
assert.match(source,
  /\.mixerRow\.mixerInlineRow\{[^}]*border-bottom:1px solid #7c3aed!important/,
  'separador das pistas deve ser fino e roxo')
assert.match(source,
  /\.mixerRow\.mixerInlineRow::after\{display:none!important/,
  'pista não deve sobrepor um segundo separador que engrosse a linha')
assert.match(source,
  /\.mixerTabletGridRow\{[^}]*border-bottom:1px solid #7c3aed!important/,
  'separador do grid deve manter a mesma espessura e cor das pistas')
assert.match(source,
  /\.mixerTabletGridWaveform>i\{[^}]*border-radius:999px!important/,
  'waveform falsa dos itens deve usar barras arredondadas como o painel Grid')
assert.match(extractFunction('renderMixerViewButtons'),
  /tablet \? 'MIXER' : 'TRACKS'[\s\S]*?tablet \? '' : `[\s\S]*?data-action="mixer-groups">GRUPOS<\/button>`/,
  'celular deve manter TRACKS, GRUPOS e MASTER; tablet deve manter MIXER e MASTER')
assert.match(extractFunction('getMixerTracks'),
  /!isTabletMixerLayout\(\) && state\.mixerView === 'groups'[\s\S]*?data\?\.mixerGroups/,
  'GRUPOS do celular deve usar a lista separada sem alterar o tablet')
assert.match(extractFunction('getMusicPaneStructureSignature'),
  /getMixerFocusItem\(data\)[\s\S]*?state\.mixerTimelineLoadedRevision/,
  'cache do TCP deve atualizar quando a musica ou o catalogo de itens muda')
assert.match(extractFunction('applyCachedMixerTimelineProject'),
  /return entry\.items\.length > 0/,
  'catalogo vazio nao pode impedir a consulta viva dos itens')
assert.doesNotMatch(extractFunction('getMixerTimelinePremixItems'),
  /if \(hasCachedTimeline && !timelineItems\.length\) return \[\]/,
  'catalogo vazio nao pode ocultar itens compactos do TCP')
assert.match(extractFunction('renderTelepromptHighlightedText'),
  /directorTpTextContent[\s\S]*?content\.appendChild\(highlight\)[\s\S]*?element\.replaceChildren\(content\)/,
  'trecho colorido do teleprompt deve permanecer no mesmo bloco de texto')
assert.match(extractFunction('getMixerGroupShadowItems'),
  /folderDepth[\s\S]*?remainingDepth[\s\S]*?getMixerItemsForTrack/,
  'pistas de grupo sem item devem reunir as waveforms de suas pistas filhas')
assert.match(extractFunction('renderMixerTabletGridRow'),
  /mixerTabletGroupWaveShadow[\s\S]*?renderMixerPremixWaveform/,
  'grupo sem item deve desenhar somente a waveform sombra no grid')
assert.match(source,
  /\.mixerTabletGroupWaveShadow\{[^}]*pointer-events:none!important[^}]*opacity:\.52!important/,
  'waveform de referência do grupo deve ser leve e não interativa')
assert.match(source,
  /\.mixerHeaderViewControls\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,
  'MIXER e MASTER devem dividir igualmente a linha superior')
assert.match(source,
  /\.mixerTabletTimelineUnified\{[^}]*grid-template-columns:var\(--mixer-track-width,30%\) minmax\(0,1fr\)!important/,
  'coluna das pistas deve usar a largura ajustável do TCP')
assert.match(source,
  /\.mixerTimelineUnifiedHeader\{[^}]*grid-template-columns:var\(--mixer-track-width,30%\) minmax\(0,1fr\)!important/,
  'cabeçalho do TCP deve acompanhar a largura ajustável das pistas')
assert.match(source,
  /class="mixerTrackWidthHandle"[^>]*aria-valuemin="25"[^>]*aria-valuemax="100"/,
  'cabeçalho deve oferecer controle de largura entre 25% e 100%')
assert.match(source,
  /\.mixerTrackWidthHandle\{[^}]*width:24px!important/,
  'alça de largura deve ter uma área de toque confortável')
assert.match(source,
  /\.mixerTrackWidthHandle\{[^}]*right:0!important/,
  'alça das pistas deve permanecer do lado esquerdo da divisão, sem entrar no grid')
assert.match(source,
  /\.mixerTrackWidthHandle::before\{[^}]*width:14px!important[^}]*border:1px solid #9ca3af!important[^}]*repeating-linear-gradient\(90deg,#9ca3af/,
  'ícone da alça deve agrupar as três linhas dentro de um único botão')
assert.match(extractFunction('getMixerWaveformVolumeScale'),
  /ratio \/ MIXER_ZERO_DB_RATIO[\s\S]*?\* \.35/,
  'waveform falsa deve diminuir abaixo de 0 dB e crescer acima de 0 dB')
assert.match(extractFunction('setPremixItemRatio'),
  /premixItemVolumeVisualCache\.set\(String\(id\), nextRatio\)[\s\S]*?syncMixerItemWaveformVolumeDom\(id, nextRatio\)/,
  'waveform deve responder imediatamente enquanto o volume do item é alterado')
assert.match(extractFunction('getPremixItemVolumeState'),
  /premixItemVolumeVisualCache[\s\S]*?fallback[\s\S]*?volumeState\.remote\.known/,
  'grid deve preservar por item o último volume conhecido quando uma cópia chega sem volume')
assert.doesNotMatch(extractFunction('getPremixItemVolumeState'),
  /item\?\.ratio/,
  'ratio geométrico do item não pode ser interpretado como volume')
assert.match(extractFunction('syncMixerRowsDom'),
  /mixerTimelineItems[\s\S]*?\.\.\.getPremixAllItemRows\(\)/,
  'item completo do Premix deve prevalecer sobre a cópia parcial da timeline')
assert.match(extractFunction('syncPremixVolumeControlsDom'),
  /premixFullSlider[\s\S]*?document\.activeElement !== input/,
  'poll do Bridge não pode mover o fader de item enquanto o dedo está nele')
assert.match(extractFunction('holdPremixItemVolumeDuringStateChange'),
  /confirmAfter:\s*now\(\) \+ 1200[\s\S]*?syncMixerItemWaveformVolumeDom/,
  'mute deve preservar fader e waveform enquanto o estado intermediário é confirmado')
assert.match(extractFunction('getActivePartsRegion'),
  /partsStableTarget[\s\S]*?isPartsInterfaceVisible\(\)[\s\S]*?isPlaying\(data\)[\s\S]*?<= 3000/,
  'Parts deve preservar o alvo durante a transição entre selecionada e tocando')
assert.match(extractFunction('syncMixerRowsDom'),
  /data-mixer-wave-item-id[\s\S]*?getMixerWaveformVolumeScale\(item\)/,
  'waveform deve acompanhar alterações de volume recebidas pelo snapshot')
assert.match(source,
  /\.mixerTabletGridWaveform>i\{[^}]*transform:scaleY\(var\(--mixer-wave-volume-scale,1\)\)/,
  'barras da waveform devem aplicar a escala visual de volume')
assert.match(extractFunction('handleMixerTrackWidthResize'),
  /MIXER_TRACK_WIDTH_MIN[\s\S]*?MIXER_TRACK_WIDTH_MAX[\s\S]*?syncMixerTrackWidthDom\(\)[\s\S]*?writeLocal\('vshook_director_mixer_track_width'/,
  'arraste da divisória deve atualizar e persistir a largura escolhida')
assert.match(extractFunction('syncMixerTrackWidthDom'),
  /panelWidth[\s\S]*?headerWidth[\s\S]*?desiredTrackWidth\s*=\s*panelWidth \* \(percent \/ 100\)[\s\S]*?desiredTrackWidth \/ headerWidth/,
  'LIST deve preservar a largura absoluta das pistas e retirar espaço somente do grid')
assert.match(extractFunction('handleMixerListWidthResize'),
  /rect\.right - Number\(event\.clientX\)[\s\S]*?MIXER_LIST_WIDTH_MIN[\s\S]*?getMixerListWidthMaxPercent\(\)[\s\S]*?syncMixerListWidthDom\(\)/,
  'arrastar a segunda alça para a esquerda deve expandir o LIST')
assert.match(extractFunction('renderMixerPlaylistSide'),
  /class="mixerListWidthHandle"[^>]*aria-label="Ajustar largura da lista"/,
  'LIST deve possuir sua própria alça de largura')
assert.match(extractFunction('renderMixerPage'),
  /const timelineHeader = tracks\.length && showTimelineGrid[\s\S]*?hasFocusedRegion \? renderMixerTimelineRegions[\s\S]*?: ''/,
  'TCP deve manter cabeçalho e alça esquerda mesmo sem música selecionada')
assert.match(extractFunction('renderMixerPlaylistSide'),
  /renderRows\(items, 'playlist', \{ hideRowNumber: true \}\)/,
  'LIST do TCP não deve renderizar a coluna numérica')
assert.match(extractFunction('renderMixerPlaylistSide'),
  /\|mixer-no-number/,
  'LIST do TCP deve ter cache próprio e nunca herdar a coluna numérica da lista principal')
assert.match(extractFunction('renderTelepromptPlaylistSide'),
  /renderRows\(items, 'playlist', \{ hideRowNumber: true \}\)/,
  'LIST do TP não deve renderizar a coluna numérica no celular nem no tablet')
assert.match(extractFunction('renderRows'),
  /options\.hideRowNumber !== true/,
  'renderização compartilhada deve permitir remover a coluna sem afetar listas principais')
assert.match(source,
  /\.mixerTabletListWorkspace\{[^}]*var\(--mixer-list-width,34%\)/,
  'largura ajustada do LIST deve retirar espaço do grid')
assert.match(extractFunction('getMixerListWidthMaxPercent'),
  /100 - getMixerTrackWidthPercent\(\)/,
  'LIST deve poder crescer até ocultar somente o grid e preservar as pistas')
assert.match(source,
  /\.mixerTrackWidthHandle::before\{[^}]*top:0!important[^}]*bottom:0!important[^}]*width:14px!important[^}]*border:1px solid #9ca3af!important/,
  'alça das pistas deve ser um único botão vertical contínuo')
assert.match(source,
  /\.mixerTrackWidthHandle\{[^}]*height:100%!important[^}]*cursor:ew-resize!important/,
  'toda a faixa vertical das pistas deve funcionar como alça')
assert.match(extractFunction('syncMixerTrackWidthDom'),
  /style\.setProperty\('height', `\$\{Math\.max\(1, Math\.floor\(availableHeight\) - 1\)\}px`, 'important'\)/,
  'alça esquerda deve compensar somente a borda inferior do painel')
assert.match(source,
  /\.mixerListWidthHandle\{[^}]*height:100%!important[^}]*cursor:ew-resize!important/,
  'toda a faixa vertical do LIST deve funcionar como alça')
assert.match(source,
  /\.mixerListWidthHandle::before\{[^}]*top:0!important[^}]*bottom:0!important[^}]*width:14px!important[^}]*border:1px solid #9ca3af!important/,
  'alça do LIST deve ser um único botão vertical contínuo')
assert.match(source,
  /\.mixerTrackWidthHandle::before\{[^}]*border-radius:0!important/,
  'alça das pistas deve ter cantos retos')
assert.match(source,
  /\.mixerListWidthHandle::before\{[^}]*border-radius:0!important/,
  'alça do LIST deve ter cantos retos e a mesma terminação inferior')
assert.match(source,
  /html\[data-director-device="tablet"\] \.app:not\(\.musicianMonitor\)>\.container,html\[data-director-device="phone"\] \.app:not\(\.musicianMonitor\)>\.container,\.app\.musicianMonitor>\.container\{padding:4px!important\}/,
  'contorno deve usar o mesmo espaço compacto no tablet, celular e app dos músicos')
assert.match(extractFunction('renderTabletTopBar'),
  /tabletTopBarTcpRpts[^>]*>RPTS<\/button>[\s\S]*?tabletTopBarTcpSearch[^>]*>LUPA<\/button>/,
  'TCP deve trocar TUNER e BPM pelos atalhos RPTS e LUPA')
assert.match(source,
  /\.tabletTopBarTcpRpts\{[^}]*justify-content:center!important[^}]*background:linear-gradient\(180deg,#fde047,#d9a600\)!important/,
  'RPTS deve ficar centralizado e amarelo')
assert.match(source,
  /\.tabletTopBarTcpSearch\{[^}]*justify-content:center!important[^}]*background:linear-gradient\(180deg,#9333ea,#6d28d9\)!important/,
  'LUPA deve ficar centralizada e roxa')
assert.match(extractFunction('getPartsMarkers'),
  /partsSongStart:\s*true,[\s\S]*?partsDisplayName:\s*songName,/,
  'Part fixa deve mostrar somente o nome da música no corpo')
assert.match(extractFunction('renderRows'),
  /partsSongStartBadge[\s\S]*?<span class="partsSongStartBadge">INÍCIO<\/span>/,
  'Part fixa deve identificar o início por um selo separado')
assert.doesNotMatch(source,
  /\.mixer(?:Track|List)WidthHandle::after\{/,
  'alça não deve ser dividida em botão superior e faixa inferior')
assert.match(source,
  /html\.mixerTrackWidthResizing \.mixerTrackWidthHandle::before[^\{]*\{[^}]*border-color:#fde047!important[^}]*box-shadow:0 0 12px rgba\(250,204,21,\.98\)!important/,
  'alça deve acender em amarelo enquanto estiver sendo tocada ou arrastada')
assert.match(source,
  /\.mixerRow\.mixerInlineRow\{[^}]*padding:5px 19px 5px 44px!important/,
  'controles das pistas devem reservar espaço para a faixa interativa')
assert.match(source,
  /\.mixerPlaylistRows\{[^}]*padding-left:16px!important/,
  'conteúdo do LIST não deve ficar escondido sob sua faixa interativa')
assert.doesNotMatch(source,
  /mixerTabletTimelineUnified\$\{listOpen \? ' mixerTabletTimelineCompact'/,
  'LIST não deve trocar o TCP para um layout compacto diferente')
assert.doesNotMatch(source,
  /\.mixerContentListOpen \.mixerTabletTrackRows \.mixerRow\.mixerInlineRow\{/,
  'LIST deve preservar o mesmo conteúdo e layout das pistas')
assert.match(source,
  /data-action="tablet-mixer">TCP<\/button>/,
  'aba Mixer deve ser exibida ao usuário com o nome TCP')
assert.doesNotMatch(source,
  /data-action="(?:tablet-mixer|go-mixer)">MIXER<\/button>/,
  'navegação não deve continuar exibindo o nome antigo MIXER')
const mixerSetTabBlock = extractFunction('setTab')
assert.match(mixerSetTabBlock,
  /tab === 'mixer'[\s\S]*?transportSeekHiddenByMixer\s*=\s*true[\s\S]*?showTransportSeekModal\s*=\s*false/,
  'painel Grid deve ser ocultado temporariamente ao entrar no Mixer')
assert.match(mixerSetTabBlock,
  /previousTab === 'mixer'[\s\S]*?showTransportSeekModal\s*=\s*true[\s\S]*?transportSeekHiddenByMixer\s*=\s*false/,
  'painel Grid deve voltar ao sair do Mixer quando já estava aberto')
for (const headerBlock of [
  extractFunction('renderPlaybackQueueHeader'),
  extractFunction('syncPlaybackQueueHeaderDom'),
]) {
  assert.match(headerBlock,
    /const playbackActive\s*=\s*isPlaying\(data\)\s*\|\|\s*isPaused\(data\)/,
    'barra de transporte deve depender do estado ativo, nao do ID antigo')
}

// O horário local vem sempre do relógio do aparelho e possui um tique próprio,
// independente dos snapshots e do estado de reprodução do Bridge.
const localClockBlock = extractFunction('syncDirectorLocalClockDom')
assert.match(localClockBlock, /deviceDate\.getTime\(\)/,
  'horario local deve usar a data do proprio aparelho')
assert.doesNotMatch(localClockBlock, /state\.snapshot|Bridge/,
  'horario local nao pode depender do snapshot do Bridge')
const animateBlock = extractFunction('animateDirectorProgress')
assert(animateBlock.indexOf('syncDirectorLocalClockDom(new Date())') <
  animateBlock.indexOf('const transportAnimating ='),
  'horario local deve atualizar mesmo com transporte parado ou Bridge offline')

// A pinça amplia somente a área do TP e a pinça inversa devolve o layout.
const pinchMoveBlock = extractFunction('handleTelepromptPinchMove')
assert.match(pinchMoveBlock, /ratio\s*>=\s*1\.16/,
  'pinça para ampliar o TP perdeu o limiar')
assert.match(pinchMoveBlock, /ratio\s*<=\s*0\.86/,
  'pinça inversa para sair do TP cheio perdeu o limiar')
assert.match(pinchMoveBlock, /state\.telepromptFullscreen\s*=\s*shouldEnter/,
  'pinça não atualiza mais o modo de tela cheia')
const mouseDoubleClickBlock = extractFunction('handleTelepromptMouseDoubleClick')
assert.match(mouseDoubleClickBlock, /\[data-director-tp-viewport\]/,
  'duplo clique deve agir somente dentro da area de leitura do TP')
assert.match(mouseDoubleClickBlock, /any-hover:\s*hover[\s\S]*?any-pointer:\s*fine/,
  'duplo clique do TP deve ficar restrito a dispositivos com mouse')
assert.match(mouseDoubleClickBlock, /state\.telepromptFullscreen\s*=\s*!state\.telepromptFullscreen/,
  'duplo clique do mouse deve alternar a tela cheia do TP')
assert.match(source,
  /document\.addEventListener\('dblclick', handleTelepromptMouseDoubleClick, true\)/,
  'evento de duplo clique do TP nao foi instalado')
assert.match(styles,
  /\.directorTpFullscreen[\s\S]*?\.directorTpContent\s*>\s*\.playbackQueueHeader[\s\S]*?display:\s*none\s*!important/,
  'tela cheia do TP deve ocultar transporte e controles')
assert.match(styles,
  /\.directorTpFullscreen \.directorTpSidePane\s*\{[^}]*display:\s*none\s*!important/,
  'tela cheia do TP deve ocultar LIST e PARTS')

// No Tablet a busca usa uma entrada somente de leitura e o teclado do app.
const tabletSearchRenderBlock = extractFunction('renderTabletSearchScreen')
assert.match(tabletSearchRenderBlock, /inputmode="\$\{ownKeyboard \? 'none' : 'search'\}"/,
  'Lupa do Tablet voltou a chamar o teclado nativo')
assert.match(tabletSearchRenderBlock, /readonly aria-readonly="true"/,
  'entrada da Lupa do Tablet deve permanecer somente de leitura')
assert.match(styles,
  /directorSearchPortraitMode \.tabletSearchScreen\s*\{[\s\S]{0,500}?inset:\s*0\s*!important/,
  'Lupa do Tablet deve ocupar a tela inteira do app')
assert.match(styles,
  /html body #app \.app \.modalOverlay,[\s\S]{0,180}?background:\s*transparent\s*!important/,
  'modais flutuantes nao devem criar uma camada preta sobre a interface')
assert.match(styles,
  /html body #app \.app \.item\.partsSongStartPart,[\s\S]{0,260}?border-radius:\s*3px\s*!important/,
  'item fixo de inicio em Parts deve ter o mesmo arredondamento leve dos blocos')
assert.match(styles,
  /\.item\.partsSongStartPart::after\s*\{[\s\S]{0,180}?content:\s*none\s*!important;[\s\S]{0,180}?box-shadow:\s*none\s*!important/,
  'item fixo de inicio em Parts nao deve manter o contorno colorido especial')
assert.match(styles,
  /@keyframes partsArmedConfirmedBlink[\s\S]{0,260}?partsMarkerArmed[\s\S]{0,180}?animation:\s*partsArmedConfirmedBlink \.8s steps\(1, end\) infinite\s*!important/,
  'Part verde confirmada deve piscar enquanto estiver engatilhada')
assert.match(styles,
  /\.mixerItemModalOverlay\s*\{[^}]*pointer-events:\s*none\s*!important[^}]*\}[\s\S]{0,100}?\.mixerItemModalBox\s*\{[^}]*pointer-events:\s*auto\s*!important/,
  'modal de item deve permitir rolar as pistas por trás sem fechar')
assert.match(source,
  /data-mixer-focus-id="\$\{escapeHtml\(getId\(focusItem\) \|\| ''\)\}"/,
  'grid TCP deve registrar a regiao usada para desenhar seus limites')
assert.match(extractFunction('syncMixerTimelineCursorDom'),
  /staleGrid[\s\S]*?cursor\.style\.display\s*=\s*'none'[\s\S]*?scheduleRender\(true\)/,
  'agulha nao pode usar os limites antigos enquanto o grid troca de musica')


// Um quadro pinta uma unica vez e o rAF roda antes dessa pintura. Se o render
// pesado voltar a entrar direto no rAF, tudo que a acao mudou no DOM (a marca
// do toque, a classe do proprio botao) volta a aparecer so junto com o render
// pronto — que e o toque parecendo ignorado no aparelho antigo.
const scheduleRenderTail = scheduleRenderBlock.slice(
  scheduleRenderBlock.indexOf('const runRender'))
assert.doesNotMatch(scheduleRenderTail,
  /requestAnimationFrame\(\s*runRender\s*\)/,
  'o render pesado voltou a entrar no mesmo quadro da acao')
assert.match(scheduleRenderTail,
  /requestAnimationFrame\([\s\S]{0,200}?setTimeout\(\s*runRender/,
  'o render pesado deve ser agendado para depois da pintura')

console.log(`DIRECTOR_PERFORMANCE_OK: ${sourcePath}`)
