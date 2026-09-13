import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const player = readFileSync(new URL('../src/features/player/PlayerScreen.ts', import.meta.url), 'utf8');
const resilientTap = readFileSync(new URL('../src/shared/gestures/ResilientTapController.ts', import.meta.url), 'utf8');

function method(name, nextName) {
  const start = player.indexOf(`  private ${name}`);
  const end = player.indexOf(`  private ${nextName}`, start + 1);
  assert(start >= 0 && end > start, `Método ${name} não encontrado`);
  return player.slice(start, end);
}

const add = method('async importUserSoundfont', 'async renderUserSoundfonts');
assert.match(add, /soundLibrary\.addUser\(name, file, restoredId\)/);
assert.doesNotMatch(add, /moduleState|timbreId\s*=/,
  'Adicionar à biblioteca não pode selecionar o SF2 automaticamente');
assert.match(add, /Toque no timbre para selecionar neste módulo/);

const select = method('async selectUserSoundfont', 'async loadAcquireLicenseUrl');
assert.match(select, /moduleState\.timbreId\s*=\s*`user:/);
assert.match(select, /await this\.syncNativeEngine\(\)/,
  'A seleção deve aguardar o SF2 chegar ao motor');
assert(select.indexOf('await this.syncNativeEngine()') < select.lastIndexOf('this.closeModal()'),
  'O modal só pode fechar depois do carregamento');

assert.match(player,
  /Capacitor\.isNativePlatform\(\) \? 'application\/octet-stream,\.sf2' : '\.sf2'/,
  'iOS/Android precisam solicitar um documento, sem oferecer câmera ou fotos');
assert.match(player, /function moduleEmptySoundName[\s\S]*?return 'Sem timbre'/,
  'Arpeggiator e Sequencer não devem ocupar o botão da biblioteca');
assert.match(player, /classList\.toggle\('has-selected-timbre'/,
  'O botão do módulo deve receber a cor do timbre escolhido');

assert.match(resilientTap, /addEventListener\('scroll', this\.onScroll, true\)/,
  'Uma rolagem real precisa cancelar o toque');
assert.match(resilientTap, /elementFromPoint\(event\.clientX, event\.clientY\)/,
  'A soltura precisa terminar sobre o mesmo botão');
assert.match(resilientTap, /pending\.control\.click\(\)/,
  'O pointerup precisa executar o botão quando o WebView perder o click');
assert.match(resilientTap, /event\.stopImmediatePropagation\(\)/,
  'O click nativo posterior precisa ser deduplicado');

console.log('SF2_FLOW_AND_RESILIENT_TAPS_OK');
