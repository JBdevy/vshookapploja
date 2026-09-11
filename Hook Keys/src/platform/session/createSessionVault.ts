import { BrowserSessionVault } from './BrowserSessionVault';
import type { SessionVault } from './SessionVault';

export function createSessionVault(): SessionVault {
  // Nesta etapa, navegador e protótipo nativo compartilham o vault de sessão.
  // A troca pelo vault nativo seguro acontece somente aqui, sem alterar o app.
  return new BrowserSessionVault();
}
