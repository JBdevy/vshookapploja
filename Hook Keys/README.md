# Bronze Keys

Aplicativo móvel da Hook Developer para reprodução de instrumentos SF2 por MIDI. O repositório contém a interface multiplataforma, autenticação, persistência dos presets e o motor C++ ligado aos projetos Android e iOS.

## Desenvolvimento local

1. Copie `.env.example` para `.env` e, se necessário, ajuste o endereço do backend local.
2. Execute `npm install`.
3. Abra `iniciar-preview.bat` ou execute `npm run dev:qr`.
4. No celular ou tablet, use a mesma rede do computador e leia o QR code exibido.

O launcher abre somente uma página auxiliar com o QR code. O endereço lido aponta para o mesmo aplicativo servido pelo Vite; não existe uma segunda implementação da interface.

## Variáveis

- `VITE_HOOK_KEYS_API_URL`: origem HTTPS da API. O build de produção já usa o backend publicado; vazia no desenvolvimento para passar pelo proxy local.
- `HOOK_KEYS_DEV_BACKEND_URL`: destino do proxy `/api` usado apenas no desenvolvimento; por padrão utiliza o backend publicado da Hook Developer.
- `HOOK_KEYS_PREVIEW_PORT`: porta preferida do preview local.

## Contrato de autenticação

- `POST /api/orangekey/auth/start` com `{ "email": "..." }`
- `POST /api/orangekey/auth/verify-code` com `{ "challengeId": "...", "code": "123456" }`
- `POST /api/orangekey/auth/password/setup` para criar a senha no primeiro acesso
- `POST /api/orangekey/auth/password/login` para os acessos seguintes
- `POST /api/orangekey/account/password/reset/*` para redefinir a senha dentro da conta
- `POST /api/orangekey/auth/password/reset/request-code` com `{ "email": "..." }` para recuperar a senha antes do login
- `POST /api/orangekey/auth/password/reset/verify-code` com `{ "challengeId": "...", "code": "123456" }`
- `POST /api/orangekey/auth/password/reset/complete` com `{ "passwordToken": "...", "password": "...", "passwordConfirmation": "..." }` (senhas obrigatórias, iguais e entre 8 e 128 caracteres)
- `GET /api/orangekey/auth/me` com `Authorization: Bearer <token>`
- `POST /api/orangekey/auth/logout` com `Authorization: Bearer <token>`

O token fica atrás da interface `SessionVault`. O preview usa `sessionStorage`, nunca `localStorage`. Antes de qualquer distribuição nas lojas, a fábrica de sessão deve receber uma implementação nativa protegida pelo Keychain no iOS e pelo Keystore no Android.

## Organização

- `src/features/auth`: fluxo e interface de autenticação.
- `src/shared/api`: transporte HTTP e erros padronizados.
- `src/platform`: diferenças entre navegador, iOS e Android.
- `src/platform/native/HookKeysNative.ts`: ponte entre a interface web e o motor C++ no Android/desktop.
- `ios/App/App`: interface SwiftUI/UIKit, controles Skia e motor C++ direto, sem WebView.
- `native-engine`: núcleo C++ compartilhado pelos dois projetos nativos.

O navegador continua sendo o preview visual. Áudio SF2 de baixa latência e entrada MIDI física são executados somente no aplicativo nativo. O motor recebe os três slots MIDI, carrega um SF2 diferente por módulo e aplica faixa, oitava, sustain, modulation, envelope, cutoff, EQ, compressor, delay, reverb, volume do módulo e Master.

## Projetos nativos

Os projetos `android/` e `ios/` fazem parte desta base e devem ser versionados.
Para atualizar a interface web do Android e verificar os recursos do iOS:

```text
npm run native:sync
```

No iOS não se executa `cap sync ios`: o projeto não depende mais de Capacitor.
Use `npm run native:sync:ios` para validar áudio/projeto e
`npm run native:open:ios` no Mac para abrir o Xcode. A lista de recursos já
migrados e os que ainda faltam está em [APPLE_NATIVE.md](APPLE_NATIVE.md).

A inicialização reforça paisagem e tela ativa no runtime nativo. A orientação
também está fixada nos projetos: Android usa as duas posições horizontais e
iPhone/iPad aceitam somente paisagem, com tela cheia obrigatória no iPad. Isso
evita um quadro inicial em retrato antes do runtime carregar.

O iOS é compilado em macOS com Xcode. O Android exige o SDK 36, NDK e CMake 3.22.1 instalados pelo Android Studio; a versão mínima do aparelho é Android 11 (API 30).

## Assinatura do instalador macOS

O workflow desktop está na Hook Center, mas utiliza `scripts/macos-pkg-sign.mjs`
desta fonte. O certificado Installer é testado com um PKG mínimo sem payload e
sem timestamp antes de compilar o aplicativo. Isso diferencia problemas de
assinatura local de lentidão ao empacotar o aplicativo completo. O instalador
distribuído continua exigindo timestamp seguro, assinatura válida e notarização.

A importação inclui os intermediários Developer ID G1/G2 da [Apple PKI](https://www.apple.com/certificateauthority/)
e verifica a cadeia localmente. Timeout, isoladamente, não confirma chave
bloqueada. Em caso de timeout, o watchdog encerra também os helpers e guarda
um stack sample no artifact `Signing-Diagnostics-Hook-Keys-macOS`, separado dos
dois instaladores publicados na release.

`npm run test:macos-pkg-sign` testa identidade, timestamp e watchdog sem precisar
de Mac ou certificado real. A assinatura real só pode ser confirmada no runner
macOS com os secrets configurados.
