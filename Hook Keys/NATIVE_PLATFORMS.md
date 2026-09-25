# Bronze Keys: plataformas nativas e transferência

## O que existe hoje

| Plataforma | Interface atual | Áudio/MIDI a preservar |
| --- | --- | --- |
| iOS/iPadOS | SwiftUI/UIKit e controles Skia; sem WebView | `ios/App/App/HookKeysNativeEngine.mm`, CoreMIDI e AVAudioEngine |
| Android | Capacitor/WebView, ainda necessário para abrir a UI | `android/app/src/main/cpp/HookKeysNativeBridge.cpp`, JNI e AAudio; AAudio já solicita baixa latência |
| Windows | Tauri/WebView2, ainda necessário para abrir a UI | `src-tauri/src`, runtime C++, CPAL, Midir e proteção do callback |
| macOS | Desktop Tauri; host SwiftUI/AppKit ainda pendente | Motor C++ e integração de áudio/MIDI a adaptar ao novo host |

`native-engine/include`, `src`, `tests`, `assets` e `third_party` são a base
compartilhada. Não são sobras da WebView. Licenças e dependências do DSP devem
acompanhar o código. Os SF2, IRs, loops, FX e imagens também são recursos reais,
não caches.

O usuário confirmou abertura, áudio do B3, FX e pads no iPad. Isso não valida
todos os fluxos de conta, biblioteca, presets, backup, MIDI e transporte. O estado
detalhado do iOS está em `APPLE_NATIVE.md`.

## Próximas interfaces, sem WebView

Direção de implementação, ainda não entregue:

- Android: host e telas nativas, separando o serviço de áudio/MIDI da classe de
  plugin Capacitor. Reutilizar JNI/AAudio e o runtime; nenhum evento MIDI crítico
  deve precisar atravessar JavaScript. Knobs e faders devem usar desenho nativo
  integrado à UI, mantendo a direção Skia do projeto.
- Windows: janela e controles nativos, com desenho Skia. Primeiro extrair os
  serviços de áudio/MIDI, arquivos e estado atualmente acoplados a comandos Tauri;
  só então substituir o host. A escolha do toolkit da UI ainda precisa ser feita.
- macOS: adaptar o host Apple, modelo e serviços de plataforma para SwiftUI/AppKit.
  O XCFramework Skia já prevê macOS, mas sozinho não implementa um aplicativo.

Não mover pastas ou renomear identificadores apenas para dar aparência de
migração. As referências de CMake, Gradle/JNI, Rust, Xcode e CI precisam continuar
resolvendo os mesmos recursos. Bundle IDs, rotas de API e chaves internas não são
alterados por esta limpeza.

Remover Tauri/Capacitor e `src/` somente quando os hosts substitutos cobrirem
login, biblioteca, módulos, presets, conta, backup, pads/FX, playlists/transporte,
MIDI Learn, áudio/MIDI e distribuição. Nessa etapa, remover também dependências,
lockfiles exclusivos, comandos web e referências de CI que ficarem sem uso.
Não adicionar camadas de migração de dados antigos apenas por precaução.

O callback continua consumindo comandos limitados do motor. UI, rede, decodificação
e disco ficam fora dele. Validar especialmente troca de preset com sustain,
sobreposição de pads/FX e loop/click; remover WebView não prova esses comportamentos.

## O que levar para o Mac

Copiar o repositório **`apploja` inteiro**, incluindo `.git` e alterações ainda não
commitadas. Copiar só `Hook Keys` perde workflows e o contexto Git da pasta pai.
Não usar `git archive` ou um clone isolado como única transferência: arquivos novos
e edições locais ainda não commitados não estarão lá.

Preservar todos os fontes, testes, projetos, lockfiles, scripts, assets e arquivos
de configuração necessários. Configurações locais e credenciais não devem ser
publicadas em Git nem incluídas em arquivos de transferência públicos.

Não é necessário transferir estes diretórios gerados:

- `node_modules` (na raiz e nas subpastas; reinstalar no destino);
- `Hook Keys/src-tauri/target` e `src-tauri/gen`;
- `Hook Keys/dist`, `native-engine/build` e `.apple-build`;
- caches `.gradle`, `.cxx` e saídas `build` do Android;
- `Pods`, `DerivedData`, `xcuserdata` e artefatos Skia gerados do iOS;
- `*.tsbuildinfo`, que podem ser regenerados.

`Hook Keys/build/release` pode conter instaladores: não é fonte, mas preserve uma
cópia se quiser guardar releases. Archives, dSYMs e logs de uma build com crash
também merecem cópia separada, pois reconstruir não garante símbolos idênticos.
Não levar `android/local.properties` como configuração válida: aponta para o SDK
da máquina anterior. Não apagar `native-engine/assets` nem `public/assets`.

Antes de abrir no Mac, confirme que a cópia contém inclusive os arquivos Swift
novos e a imagem `BronzeBrand`. Compare `git status --short` entre as máquinas.

No Mac, instalar Node 22 ou superior e as ferramentas Apple. Na pasta `Hook Keys`:

```bash
npm ci
npm run native:sync:ios
open ios/App/App.xcodeproj
```

O primeiro comando instala dependências locais, o segundo valida fontes/recursos
sem Vite/Capacitor iOS. Preparar Skia seguindo `APPLE_NATIVE.md` para a entrega;
o fallback Core Graphics é somente de desenvolvimento. Em seguida compilar e
testar no Xcode: testes Node não substituem compilação Swift/Objective-C++.
