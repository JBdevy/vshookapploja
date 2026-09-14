interface TauriWindowGlobals {
  __TAURI_INTERNALS__?: unknown;
}

export async function installDesktopCloseConfirmation(): Promise<void> {
  if (!(window as unknown as TauriWindowGlobals).__TAURI_INTERNALS__) return;

  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ]);
  let dialog: HTMLElement | null = null;

  const dismiss = (): void => {
    dialog?.remove();
    dialog = null;
  };

  const show = (): void => {
    if (dialog) {
      dialog.querySelector<HTMLButtonElement>('[data-desktop-close="cancel"]')?.focus();
      return;
    }

    const overlay = document.createElement('section');
    overlay.className = 'desktop-close-confirmation';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'desktop-close-title');
    overlay.setAttribute('aria-describedby', 'desktop-close-description');
    overlay.innerHTML = `
      <div class="desktop-close-confirmation__surface">
        <div class="desktop-close-confirmation__brand" aria-hidden="true">
          <img src="/assets/icons/256x256.png" alt="">
          <span><strong>HOOK KEYS</strong><small>PERFORMANCE INSTRUMENT</small></span>
        </div>
        <div class="desktop-close-confirmation__message">
          <span class="desktop-close-confirmation__warning" aria-hidden="true">!</span>
          <div>
            <p>CONFIRMAR SAÍDA</p>
            <h2 id="desktop-close-title">Fechar o Hook Keys?</h2>
            <span id="desktop-close-description">Sua performance será interrompida e todas as notas em reprodução serão encerradas.</span>
          </div>
        </div>
        <div class="desktop-close-confirmation__actions">
          <button type="button" data-desktop-close="cancel">Continuar no app</button>
          <button type="button" data-desktop-close="confirm">Fechar Hook Keys</button>
        </div>
      </div>
    `;

    overlay.addEventListener('click', (event) => {
      const action = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-desktop-close]')?.dataset.desktopClose
        : null;
      if (action === 'cancel') {
        dismiss();
        return;
      }
      if (action !== 'confirm') return;
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-desktop-close="confirm"]')
        : null;
      if (button) button.disabled = true;
      void invoke('confirm_app_close').catch(() => {
        if (button) button.disabled = false;
      });
    });

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
    });

    dialog = overlay;
    document.body.append(overlay);
    window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
    overlay.querySelector<HTMLButtonElement>('[data-desktop-close="cancel"]')?.focus();
  };

  await listen('hook-keys://close-requested', () => {
    show();
  });
}
