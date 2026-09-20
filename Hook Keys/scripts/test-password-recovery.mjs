import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class Element {
  constructor(tag, attributes = '', text = '') {
    this.tag = tag;
    this.attributes = Object.fromEntries([...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((match) => [match[1], match[2] ?? '']));
    this.textContent = text;
    this.value = '';
    this.disabled = 'disabled' in this.attributes;
    this.dataset = {};
    this.handlers = new Map();
    this.classList = { toggle() {}, remove() {}, add() {} };
  }
  addEventListener(type, callback) { this.handlers.set(type, callback); }
  async dispatch(type) { return this.handlers.get(type)?.({ preventDefault() {} }); }
  focus() { this.focused = true; }
  checkValidity() {
    return (!('required' in this.attributes) || this.value.length > 0)
      && (!this.attributes.minlength || this.value.length >= Number(this.attributes.minlength))
      && (!this.attributes.maxlength || this.value.length <= Number(this.attributes.maxlength));
  }
  reportValidity() { this.reported = true; return this.checkValidity(); }
  matches(selector) {
    if (selector.startsWith('#')) return this.attributes.id === selector.slice(1);
    if (selector.startsWith('.')) return (this.attributes.class || '').split(' ').includes(selector.slice(1));
    const match = selector.match(/^(\w+)(?:\[([\w-]+)="([^"]+)"\])?$/);
    return match && this.tag === match[1] && (!match[2] || this.attributes[match[2]] === match[3]);
  }
}

class FormContent {
  set innerHTML(markup) {
    this.markup = markup;
    this.elements = [...markup.matchAll(/<(input|button|p|span|strong)\b([^>]*)(?:>([^<]*)|>)/g)]
      .map((match) => new Element(match[1], match[2], match[3] || ''));
    const formMarkup = markup.match(/<form\b[^>]*>([\s\S]*?)<\/form>/)?.[1] || '';
    this.form = new Element('form');
    this.form.querySelector = (selector) => this.elements.find((element) => element.matches(selector)
      && formMarkup.includes(element.attributes.id ? `id="${element.attributes.id}"` : `class="${element.attributes.class}"`)) || null;
  }
  querySelector(selector) {
    return selector === 'form' ? this.form : this.elements.find((element) => element.matches(selector)) || null;
  }
}

const windowStub = { setTimeout() {}, setInterval() {}, clearInterval() {} };
const load = (relativePath, modules = {}) => {
  const source = readFileSync(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');
  const context = {
    exports: {}, window: windowStub, navigator: { userAgent: 'test desktop' },
    require: (name) => {
      assert(name in modules, `Unexpected runtime import: ${name}`);
      return modules[name];
    },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
};

const authScreenSource = readFileSync(new URL('../src/features/auth/AuthScreen.ts', import.meta.url), 'utf8');
assert.doesNotMatch(authScreenSource, /Comprar acesso|login-purchase-button|login-support-button/,
  'a tela de login não pode exibir compra externa nem suporte durante a revisão das lojas');
assert.doesNotMatch(authScreenSource, /requestPasswordRecovery|verifyPasswordRecoveryCode|completePasswordRecovery/,
  'a recuperação de senha não deve usar código de verificação');

const apiErrorModule = load('shared/api/ApiError.ts');
const { AuthScreen } = load('features/auth/AuthScreen.ts', {
  '../../shared/api/ApiError': apiErrorModule,
});

const createScreen = (sessions) => {
  const screen = Object.create(AuthScreen.prototype);
  Object.assign(screen, {
    content: new FormContent(), sessions, email: 'cliente@exemplo.com', countdownTimer: null, resendBusy: false,
  });
  screen.onAuthenticated = () => assert.fail('A recuperação não deve autenticar automaticamente.');
  return screen;
};

test('esqueci minha senha solicita uma senha temporária e mantém o login aberto', async () => {
  const calls = [];
  const screen = createScreen({
    async requestTemporaryPassword(email) {
      calls.push(email);
      return { ok: true, temporaryPasswordSent: true, message: 'Nova senha enviada.' };
    },
  });
  screen.renderPasswordLogin();
  assert.match(screen.content.markup, /Esqueci minha senha/);
  await screen.content.querySelector('.password-recovery-button').dispatch('click');
  assert.deepEqual(calls, ['cliente@exemplo.com']);
  assert.match(screen.content.markup, /Nova senha enviada\./);
  assert(screen.content.querySelector('#account-password'));
});

test('falha ao enviar senha temporária reabilita os controles', async () => {
  const screen = createScreen({
    async requestTemporaryPassword() { throw new apiErrorModule.ApiError('Envio indisponível.', 503); },
  });
  screen.renderPasswordLogin();
  await screen.content.querySelector('.password-recovery-button').dispatch('click');
  assert.equal(screen.content.querySelector('.form-error').textContent, 'Envio indisponível.');
  for (const selector of ['.primary-button', '.password-recovery-button', '.back-button', '#account-password']) {
    assert.equal(screen.content.querySelector(selector).disabled, false);
  }
});

test('API usa senha temporária pública e troca direta autenticada', async () => {
  const calls = [];
  const { AuthApi } = load('features/auth/AuthApi.ts');
  const api = new AuthApi({ async request(path, options) { calls.push({ path, ...options }); return { ok: true }; } });
  await api.requestTemporaryPassword('cliente@exemplo.com');
  await api.changePassword('sessao', 'nova-senha', 'nova-senha');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { path: '/api/orangekey/auth/password/forgot', method: 'POST', body: { email: 'cliente@exemplo.com' } },
    { path: '/api/orangekey/account/password/change', method: 'POST', token: 'sessao', body: { password: 'nova-senha', passwordConfirmation: 'nova-senha' } },
  ]);
});

test('serviço normaliza o e-mail e repassa a sessão na troca de senha', async () => {
  const { AuthSessionService } = load('features/auth/AuthSessionService.ts', {
    '../../shared/api/ApiError': apiErrorModule,
  });
  const calls = [];
  const api = {
    async requestTemporaryPassword(...args) { calls.push(['forgot', ...args]); return { ok: true }; },
    async changePassword(...args) { calls.push(['change', ...args]); return { ok: true }; },
  };
  const sessions = new AuthSessionService(api, {}, {});
  await sessions.requestTemporaryPassword(' CLIENTE@Exemplo.com ');
  await sessions.changePassword({ token: 'sessao' }, 'nova-senha', 'nova-senha');
  assert.deepEqual(calls, [
    ['forgot', 'cliente@exemplo.com'],
    ['change', 'sessao', 'nova-senha', 'nova-senha'],
  ]);
});

test('texto do primeiro acesso explica a senha recebida na compra', () => {
  assert.match(authScreenSource, /senha inicial de 8 caracteres é enviada no e-mail da compra/i);
});
