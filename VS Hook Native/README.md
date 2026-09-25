# VS Hook nativo

App para iPhone e iPad em SwiftUI e UIKit, com áudio/vídeo em AVKit e PDFKit. O target não usa WebView, Capacitor ou Cordova. A referência visual e de comandos é a versão atual de `../vsdiretor.js` e `../stylediretor-app.css`.

Abra `VSHook.xcodeproj`, selecione o scheme **VSHook** e execute no simulador. O modo Tablet usa paisagem; a escolha de modo e a conexão usam retrato. No simulador, a descoberta procura primeiro o Hook Center do próprio Mac em `127.0.0.1`. Em dispositivo físico, use a rede local do computador.

Depois de adicionar um arquivo Swift, atualize o projeto:

```sh
python3 scripts/generate-project.py
```

Verifique os comandos, autenticação, fila, controles do TCP e preferências de Teleprompt:

```sh
bash scripts/test-core.sh
```

Antes de distribuir uma build de dispositivo, confira o bundle:

```sh
python3 scripts/verify-ios.py '/caminho/VS Hook.app'
```

O mínimo é iOS 15. A compilação resolve os tipos da interface pelo framework público SwiftUI e desativa o autolink direto de SwiftUICore, para evitar a incompatibilidade encontrada no iOS 16. A inspeção do bundle não substitui o teste de abertura no aparelho.

Os testes de rede usam uma ponte simulada; não precisam enviar comandos ao REAPER. Para testes de interface em Debug, `VSHOOK_TEST_BRIDGE` pode apontar para uma ponte local de teste. Essa opção não está disponível em Release.

A revisão do Diretor cobre TCP (alças, cores, mute e waveform ligada ao fader), TP/Config TP, Sessão, RPTS/Preview/COPY, LUPA global, PARTS, painel Grid, cronômetro e menus de PLAY/Premix/Multiloops. Os botões mantêm raio de 6 pontos. As gavetas usam regiões-filhas publicadas pelo bridge e também suportam sessões com músicas representadas por marcadores.

Os testes de interface estão em `Tests/UI/VisualTests.xcodeproj`. Instale primeiro uma build **Debug** do app em um simulador de teste. Inicie a ponte isolada em outro terminal:

```sh
python3 Tests/UI/fixture.py
```

Depois execute (substitua o UDID pelo simulador de teste):

```sh
xcodebuild -project Tests/UI/VisualTests.xcodeproj -scheme VisualTests \
  -destination 'platform=iOS Simulator,id=UDID' \
  -parallel-testing-enabled NO CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES test
```

A ponte escuta somente `127.0.0.1:58150` e não encaminha comandos para o Hook Center. Os testes conferem alças, resposta visual do volume, centralização do TP, navegação dos modais, teclado do timer, toque longo sem disparar PLAY e layout do modo Celular. Capturas ficam nos anexos do resultado do Xcode. A comparação foi feita com os arquivos atuais do repositório; não representa certificação de igualdade de todas as telas ou validação em aparelho físico.

A revisão inclui também LIST/PARTS do TP em tela inteira no celular, entrada TP do músico, navegação por gesto no painel de transporte, Recados (standalone e dentro do Diretor nos dois modos), Chat Hook e Drop Hook. Recados mantém templates em leitura até EDITAR, sincroniza imagens e o relógio de fixar/desafixar; sair retira o recado. O Chat usa avatares, respostas, imagens, player nativo de voz, limite de um minuto na gravação e permissões de administrador. O Drop recebe em blocos HTTP Range e mantém os arquivos disponíveis para salvar/compartilhar.

`Tests/UI/fixture.py` também oferece templates, recados e arquivos de teste. `VSHOOK_TEST_CHAT=1` habilita exclusivamente em Debug uma conversa local sem autenticação nem envio ao servidor. Os testes de interface normais nunca enviam mensagens reais.

O workflow `.github/workflows/ios-ipa.yml` compila este projeto SwiftUI, executa os testes do núcleo e verifica o archive antes de exportar o IPA. O projeto Android mantém seu pipeline próprio.

A revisão de gestos respeita a área segura no modo Tablet usado em iPhone, permite retornar do TP deslizando o transporte e usa pinça de abrir/fechar para tela cheia. Reprodução e fila compartilham gradientes vermelho/laranja e barras verde/amarela nos modos Diretor e Músico. O TCP usa Mixer/Master no cabeçalho, indexa os itens por pista e desenha a agulha com ponta triangular e rastro luminoso. A lista usa reconhecimento nativo de toque/toque longo que deixa a rolagem vertical com o UIScrollView. No Chat, deslizar para a direita prepara uma resposta sem interceptar o slider do áudio.

Os testes de regressão incluem ida/volta do TP, pinça, margem do notch em ambas as orientações, resposta por swipe, seleção e rolagem de 80 músicas e 60 pistas. Esses testes usam o runtime de simulador disponível; a verificação do bundle mantém o mínimo iOS 15, mas não substitui a confirmação do comportamento no iOS 16 físico.
