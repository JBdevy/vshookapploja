import { createOrganHeaderControlsMarkup, createOrganMarkup } from '../src/features/player/OrganView';
document.documentElement.dataset.runtime = 'app';
const app = document.getElementById('app')!;
app.className = 'player-modal player-modal--module-organ is-open';
app.innerHTML = `<div class="player-modal__surface">
  <header class="player-modal__header">
    <p class="player-modal__eyebrow">Módulo 07</p>
    <h2>Hook B3</h2>
    ${createOrganHeaderControlsMarkup({ organ: { soundEnabled: false, clickVolumeDb: -12 } })}
    <p class="player-modal__description"></p>
  </header>
  <div class="player-modal__body">${createOrganMarkup({ rotary: {} })}</div>
  <footer class="player-modal__actions"><button class="player-modal__back-button" type="button">Voltar</button></footer>
</div>`;
