import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Component tests execute the real handlers with a minimal form DOM, without
// contacting the live backend or sending password-recovery emails to customers.
class Element {
  constructor(tag, attributes = '', text = '') {
    this.tag = tag;
    this.attributes = Object.fromEntries([...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((match) => [match[1], match[2] ?? '']));
    this.textContent = text;
    this.value = '';
    this.disabled = 'disabled' in this.attributes;
    this.dataset = {};
    this.handlers = new Map();
    this.classList = { toggle() {} };
  }
  addEventListener(type, callback) { this.handlers.set(type, callback); }
  async dispatch(type) { return this.handlers.get(type)?.({ preventDefault() {} }); }
  focus() { this.focused = true; }
  checkValidity() {
    return (!('required' in this.attributes) || this.value.length > 0)
      && (!this.attributes.minlength || this.value.length >= Number(this.attributes.minlength))
      && (!this.attributes.maxlength || this.value.length <= Number(this.attributes.maxlength))
      && (!this.attributes.pattern || new RegExp(`^(?:${this.attributes.pattern})$`).test(this.value));
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
    this.form.querySelector = (selector) => this.elements.find((element) => element.matches(selector) && formMarkup.includes(element.attributes.id ? `id="${element.attributes.id}"` : `class="${element.attributes.class}"`)) || null;
  }
  querySelector(selector) { return selector === 'form' ? this.form : this.elements.find((element) => element.matches(selector)) || null; }
}

const timers = new Set();
const windowStub = {
  setTimeout() {},
  setInterval(callback) { timers.add(callback); return callback; },
  clearInterval(callback) { timers.delete(callback); },
};
const load = (relativePath, modules = {}) => {
  const source = readFileSync(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');
  const context = { exports: {}, window: windowStub, navigator: { userAgent: 'test desktop' }, require: (name) => {
    assert(name in modules, `Unexpected runtime import: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
};
const apiErrorModule = load('shared/api/ApiError.ts');
const { AuthScreen } = load('features/auth/AuthScreen.ts', {
  '../../shared/api/ApiError': apiErrorModule,
  '../../shared/platform/WhatsAppSupport': {},
});
const challenge = () => ({ ok: true, verificationRequired: true, challengeId: 'challenge-1', expiresInSeconds: 600, resendAfterSeconds: 60 });
const createScreen = (sessions) => {
  const screen = Object.create(AuthScreen.prototype);
  Object.assign(screen, { content: new FormContent(), sessions, email: 'cliente@exemplo.com', countdownTimer: null, resendBusy: false });
  screen.onAuthenticated = () => assert.fail('Recovery must return to password login, not create a session');
  return screen;
};

test('forgotten password follows email code, double password entry and return to login', async () => {
  const calls = [];
  const screen = createScreen({
    async requestPasswordRecovery(email) { calls.push(['request', email]); return challenge(); },
    async verifyPasswordRecoveryCode(id, code) { calls.push(['verify', id, code]); return { passwordToken: 'verified-token' }; },
    async completePasswordRecovery(...args) { calls.push(['complete', ...args]); return { ok: true }; },
  });
  screen.renderPasswordLogin();
  assert(screen.content.markup.indexOf('Redefinir senha') > screen.content.markup.indexOf('>Entrar<'));
  await screen.content.querySelector('.password-recovery-button').dispatch('click');
  assert.equal(screen.content.querySelector('.primary-button').textContent, 'Confirmar código');
  assert.equal(screen.content.querySelector('.primary-button').disabled, true);
  const codeInput = screen.content.querySelector('#access-code');
  codeInput.value = '123456';
  await codeInput.dispatch('input');
  await screen.content.form.dispatch('submit');
  assert.match(screen.content.markup, /Defina sua nova senha/);
  screen.content.querySelector('#new-account-password').value = 'nova-senha';
  screen.content.querySelector('#confirm-account-password').value = 'nova-senha';
  await screen.content.form.dispatch('submit');
  assert.match(screen.content.markup, /Senha redefinida\. Entre com sua nova senha/);
  assert.equal(screen.content.querySelector('#account-password').value, '');
  assert.equal(screen.challenge, null);
  assert.deepEqual(calls, [['request', 'cliente@exemplo.com'], ['verify', 'challenge-1', '123456'], ['complete', 'verified-token', 'nova-senha', 'nova-senha']]);
  assert.equal(timers.size, 0, 'Leaving the code screen clears its timer');
});

test('empty, too short or mismatched confirmation does not call the backend', async () => {
  const calls = [];
  const screen = createScreen({ async completePasswordRecovery(...args) { calls.push(args); } });
  screen.renderPasswordSetup('token', true);
  const password = screen.content.querySelector('#new-account-password');
  const confirmation = screen.content.querySelector('#confirm-account-password');
  await screen.content.form.dispatch('submit');
  assert(password.reported);
  password.value = 'nova-senha';
  await screen.content.form.dispatch('submit');
  assert(confirmation.reported);
  confirmation.value = 'curta';
  await screen.content.form.dispatch('submit');
  confirmation.value = 'outra-senha';
  await screen.content.form.dispatch('submit');
  assert.equal(screen.content.querySelector('.form-error').textContent, 'As senhas não são iguais.');
  assert.equal(calls.length, 0);
  assert(confirmation.focused);
});

test('request and verification failures preserve recovery controls for retry', async () => {
  const screen = createScreen({
    async requestPasswordRecovery() { throw new apiErrorModule.ApiError('Envio indisponível.', 503); },
    async verifyPasswordRecoveryCode() { throw new apiErrorModule.ApiError('Código incorreto.', 400); },
  });
  screen.renderPasswordLogin();
  await screen.content.querySelector('.password-recovery-button').dispatch('click');
  assert.equal(screen.content.querySelector('.form-error').textContent, 'Envio indisponível.');
  for (const selector of ['.primary-button', '.password-recovery-button', '.back-button', '#account-password']) {
    assert.equal(screen.content.querySelector(selector).disabled, false);
  }
  screen.activateChallenge(challenge());
  screen.renderCode(true);
  const codeInput = screen.content.querySelector('#access-code');
  codeInput.value = '123456';
  await codeInput.dispatch('input');
  await screen.content.form.dispatch('submit');
  assert.equal(screen.content.querySelector('.form-error').textContent, 'Código incorreto.');
  assert.equal(codeInput.value, '');
  assert.equal(codeInput.disabled, false);
  assert.equal(screen.content.querySelector('.back-button').disabled, false);
  screen.renderPasswordLogin();
});

test('recovery resend requests another reset code instead of going through startLogin', async () => {
  let requests = 0;
  const screen = createScreen({ async requestPasswordRecovery() { requests++; return { ...challenge(), challengeId: 'challenge-2' }; } });
  screen.activateChallenge(challenge());
  screen.renderCode(true);
  screen.challenge.resendAt = Date.now() - 1;
  await screen.resendCode(screen.content.querySelector('#access-code'), screen.content.querySelector('.primary-button'), screen.content.querySelector('#resend-button'), screen.content.querySelector('#code-expiration'), true);
  assert.equal(requests, 1);
  assert.equal(screen.challenge.data.challengeId, 'challenge-2');
  assert.match(screen.content.markup, /Redefinir senha/);
  await screen.content.querySelector('.back-button').dispatch('click');
  assert.match(screen.content.markup, /Digite sua senha/);
});

test('expired code cannot advance the recovery flow', async () => {
  let verifies = 0;
  const screen = createScreen({ async verifyPasswordRecoveryCode() { verifies++; return { passwordToken: 'token' }; } });
  screen.activateChallenge(challenge());
  screen.renderCode(true);
  const codeInput = screen.content.querySelector('#access-code');
  codeInput.value = '123456';
  screen.challenge.expiresAt = Date.now() - 1;
  await codeInput.dispatch('input');
  await screen.content.form.dispatch('submit');
  assert.equal(verifies, 0);
  screen.renderPasswordLogin();
});

test('pending requests block duplicate verification and password submission', async () => {
  let finishVerification;
  let finishPassword;
  let verifies = 0;
  let saves = 0;
  const screen = createScreen({
    verifyPasswordRecoveryCode() { verifies++; return new Promise((resolve) => { finishVerification = resolve; }); },
    completePasswordRecovery() { saves++; return new Promise((resolve) => { finishPassword = resolve; }); },
  });
  screen.activateChallenge({ ...challenge(), resendAfterSeconds: 0 });
  screen.renderCode(true);
  const codeInput = screen.content.querySelector('#access-code');
  codeInput.value = '123456';
  await codeInput.dispatch('input');
  const pendingVerification = screen.content.form.dispatch('submit');
  await screen.content.form.dispatch('submit');
  assert.equal(verifies, 1);
  assert.equal(screen.content.querySelector('.back-button').disabled, true);
  assert.equal(screen.content.querySelector('#resend-button').disabled, true);
  finishVerification({ passwordToken: 'token' });
  await pendingVerification;
  screen.content.querySelector('#new-account-password').value = 'nova-senha';
  screen.content.querySelector('#confirm-account-password').value = 'nova-senha';
  const pendingSave = screen.content.form.dispatch('submit');
  await screen.content.form.dispatch('submit');
  assert.equal(saves, 1);
  assert.equal(screen.content.querySelector('.back-button').disabled, true);
  finishPassword({ ok: true });
  await pendingSave;
});

test('keyboard-open login uses a lower safe gap while keeping the card inside the visual viewport', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /--login-keyboard-top-gap: clamp\(16px, calc\(var\(--app-viewport-height\) \* 0\.045\), 32px\)/);
  assert(css.includes('max-height: calc(var(--app-viewport-height) - max(var(--login-keyboard-top-gap), env(safe-area-inset-top)) - 8px)'));
  for (const viewportHeight of [160, 300, 450, 700]) {
    const topGap = Math.max(16, Math.min(viewportHeight * 0.045, 32));
    assert(topGap > 8, 'Keyboard-open card should sit below the previous 8px gap');
    assert(viewportHeight - topGap - 8 > 0, 'Card retains scrollable space above the keyboard');
  }
});

test('API recovery endpoints are unauthenticated and include both passwords', async () => {
  const calls = [];
  const { AuthApi } = load('features/auth/AuthApi.ts');
  const api = new AuthApi({ async request(path, options) { calls.push({ path, ...options }); return { ok: true }; } });
  await api.requestPasswordRecovery('cliente@exemplo.com');
  await api.verifyPasswordRecoveryCode('id', '123456');
  await api.completePasswordRecovery('token', 'nova-senha', 'nova-senha');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { path: '/api/orangekey/auth/password/reset/request-code', method: 'POST', body: { email: 'cliente@exemplo.com' } },
    { path: '/api/orangekey/auth/password/reset/verify-code', method: 'POST', body: { challengeId: 'id', code: '123456' } },
    { path: '/api/orangekey/auth/password/reset/complete', method: 'POST', body: { passwordToken: 'token', password: 'nova-senha', passwordConfirmation: 'nova-senha' } },
  ]);
});

test('session service forwards recovery without reading or writing a login token', async () => {
  const { AuthSessionService } = load('features/auth/AuthSessionService.ts', { '../../shared/api/ApiError': apiErrorModule });
  const calls = [];
  const api = Object.fromEntries(['requestPasswordRecovery', 'verifyPasswordRecoveryCode', 'completePasswordRecovery'].map((name) => [name, async (...args) => calls.push([name, ...args])]));
  const sessions = new AuthSessionService(api, {}, {});
  await sessions.requestPasswordRecovery(' CLIENTE@exemplo.com ');
  await sessions.verifyPasswordRecoveryCode('id', '123456');
  await sessions.completePasswordRecovery('token', 'nova-senha', 'nova-senha');
  assert.deepEqual(calls, [['requestPasswordRecovery', 'cliente@exemplo.com'], ['verifyPasswordRecoveryCode', 'id', '123456'], ['completePasswordRecovery', 'token', 'nova-senha', 'nova-senha']]);
});
