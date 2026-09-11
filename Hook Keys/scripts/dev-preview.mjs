import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import QRCode from 'qrcode';
import { createServer as createViteServer, loadEnv } from 'vite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const env = loadEnv('development', projectDirectory, '');

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function isPrivateAddress(address) {
  if (address.startsWith('10.') || address.startsWith('192.168.')) return true;
  const match = /^172\.(\d{1,3})\./.exec(address);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function findLanAddresses() {
  const ignoredAdapter = /loopback|virtual|vmware|hyper-v|vbox|wsl|docker|tailscale/i;
  const candidates = [];

  for (const [adapterName, addresses] of Object.entries(os.networkInterfaces())) {
    if (!addresses || ignoredAdapter.test(adapterName)) continue;

    for (const address of addresses) {
      const isIpv4 = address.family === 'IPv4' || address.family === 4;
      if (!isIpv4 || address.internal || address.address.startsWith('169.254.')) continue;

      candidates.push({
        address: address.address,
        adapterName,
        score:
          (isPrivateAddress(address.address) ? 20 : 0) +
          (/wi-?fi|wireless|wlan|ethernet/i.test(adapterName) ? 10 : 0),
      });
    }
  }

  return candidates.sort((left, right) => right.score - left.score);
}

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeHttpServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function openBrowser(url) {
  const platformCommands = {
    win32: ['cmd.exe', ['/d', '/s', '/c', 'start', '', url]],
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]],
  };
  const selected = platformCommands[process.platform];
  if (!selected) return;

  const child = spawn(selected[0], selected[1], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function launcherHtml(appUrl, qrCodeDataUrl, adapterName, hasLanAddress) {
  const safeUrl = escapeHtml(appUrl);
  const connectionCopy = hasLanAddress
    ? `Conecte o celular à mesma rede deste computador e leia o código.`
    : `Nenhuma rede local foi encontrada. O preview está disponível somente neste computador.`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hook Keys — Preview</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 28px; color: #fff8f2; background: radial-gradient(circle at 15% 15%, #54220d 0, transparent 30%), #070504; }
      main { width: min(100%, 460px); padding: 30px; text-align: center; border: 1px solid #6d2b0d; border-radius: 28px; background: rgba(20, 13, 9, .94); box-shadow: 0 28px 90px #000b, inset 0 1px #ff9b4a22; }
      .eyebrow { margin: 0 0 8px; color: #ff8a2a; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 0; font-size: 36px; letter-spacing: -.04em; }
      p { color: #cdbdb1; line-height: 1.55; }
      img { display: block; width: min(72vw, 290px); margin: 24px auto; padding: 12px; border-radius: 22px; background: #fff; }
      a { display: block; overflow: hidden; padding: 13px 16px; color: #ff9a45; border: 1px solid #673319; border-radius: 14px; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; background: #140d09; }
      small { display: block; margin-top: 14px; color: #806f63; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Preview local</p>
      <h1>Hook Keys</h1>
      <p>${connectionCopy}</p>
      <img src="${qrCodeDataUrl}" alt="QR code para abrir o Hook Keys">
      <a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>
      <small>${hasLanAddress ? `Rede: ${escapeHtml(adapterName)}` : 'Use Ctrl+C para encerrar.'}</small>
    </main>
  </body>
</html>`;
}

async function main() {
  const requestedPort = parsePort(env.HOOK_KEYS_PREVIEW_PORT, 5173);
  const vite = await createViteServer({
    configFile: path.join(projectDirectory, 'vite.config.ts'),
    root: projectDirectory,
    server: {
      host: '0.0.0.0',
      port: requestedPort,
    },
  });

  await vite.listen();
  const viteAddress = vite.httpServer?.address();
  if (!viteAddress || typeof viteAddress === 'string') {
    await vite.close();
    throw new Error('Não foi possível identificar a porta do preview.');
  }

  const lanCandidates = findLanAddresses();
  const selectedLan = lanCandidates[0];
  const previewHost = selectedLan?.address ?? '127.0.0.1';
  const appUrl = `http://${previewHost}:${viteAddress.port}/`;
  const qrCodeDataUrl = await QRCode.toDataURL(appUrl, {
    width: 360,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#120b07', light: '#ffffff' },
  });

  const html = launcherHtml(
    appUrl,
    qrCodeDataUrl,
    selectedLan?.adapterName ?? '',
    Boolean(selectedLan),
  );
  const launcher = http.createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    });
    response.end(html);
  });
  await listen(launcher);

  const launcherAddress = launcher.address();
  if (!launcherAddress || typeof launcherAddress === 'string') {
    await closeHttpServer(launcher);
    await vite.close();
    throw new Error('Não foi possível abrir a tela com o QR code.');
  }

  const launcherUrl = `http://127.0.0.1:${launcherAddress.port}/`;
  console.log(`\nHook Keys disponível em ${appUrl}`);
  console.log('Use Ctrl+C para encerrar o preview.\n');
  if (!/^(1|true|yes)$/i.test(String(process.env.HOOK_KEYS_NO_OPEN || ''))) {
    openBrowser(launcherUrl);
  }

  let isClosing = false;
  const shutdown = async () => {
    if (isClosing) return;
    isClosing = true;
    await Promise.allSettled([closeHttpServer(launcher), vite.close()]);
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('\nNão foi possível iniciar o preview do Hook Keys.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
