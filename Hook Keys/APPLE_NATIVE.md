# Bronze Keys nativo para Apple

O app iOS inicia exclusivamente em `BronzeNativeHostingController`.
Capacitor, Cordova, plugins JavaScript, storyboard da bridge e fallback web
foram removidos do target e do código iOS. Não há flag para voltar à WebView.
Android e desktop ainda mantêm suas implementações atuais; esta remoção é iOS.
O mapa de dependências, próximas interfaces e instruções para levar a pasta ao
Mac estão em [NATIVE_PLATFORMS.md](NATIVE_PLATFORMS.md).

`npm run native:sync:ios` valida o projeto e seus recursos sem Vite ou Capacitor.
Loops e Church são referências diretas às pastas de áudio em `public/assets`,
empacotadas como `loops` e `fx-1`, sem HTML, JavaScript ou CSS. SF2 continuam
referenciados em `native-engine/assets`. A tela permanece ligada pelo UIKit,
sem o antigo plugin KeepAwake. Orientação é controlada pelo host nativo.

CoreMIDI, AVFoundation e AudioToolbox são vinculados explicitamente na fase
Frameworks do target, tanto em Debug quanto Release. A remoção da dependência
transitiva anterior deixou essa fase vazia e causou `symbol(s) not found for
architecture arm64`. O verificador agora exige as referências SDKROOT e sua
inclusão efetiva na fase de linkagem; os testes também removem cada ligação
para comprovar que a ausência é detectada antes de iniciar o archive.

O caminho de performance já é direto:

`Core MIDI -> HookKeysNativeEngine -> NativeEngineRuntime C++ -> AVAudioSourceNode -> Core Audio`

Pads contínuos e FX aprendidos no canal MIDI 10 também entram no runtime C++.
Os FX são decodificados uma vez para PCM fora do callback e tocados pela thread
de áudio, sem `HTMLAudioElement`.

## Skia

`BronzeSkiaControlView` é a superfície usada por knobs e faders. Para gerar o
artefato Apple universal, execute num Mac:

```bash
bash scripts/build-skia-apple.sh
```

O script produz `ios/App/Vendor/Skia.xcframework` para iPhone/iPad, simulador e
macOS, além de `ios/Skia.generated.xcconfig`. A revisão fica fixada em
`scripts/skia-apple.revision` para que
uma atualização futura do Skia não altere uma build antiga. Sem esse artefato,
o desenho usa um fallback Core Graphics apenas no desenvolvimento; ao gerar o
xcconfig, `BRONZE_KEYS_REQUIRE_SKIA=1` impede uma entrega silenciosa sem Skia.

O script usa o Ninja do Homebrew por caminho absoluto, sem o wrapper Python do
depot_tools. O cache de CI inclui a revisão e o script de compilação. O teste
`test-skia-apple-build.mjs` executa a receita com ferramentas simuladas para
verificar os cinco destinos, diretórios com espaços e empacotamento. Ele não
substitui a compilação real no macOS.

A receita desativa explicitamente `skia_use_libpng_decode` e
`skia_use_libpng_encode` (não existe `skia_use_libpng` nesta revisão). Knobs e
faders são desenhados, sem codecs externos. `--fail-on-unused-args` rejeita
argumentos obsoletos. O patch versionado `skia-apple-arm64.patch` limita as
slices iOS a arm64: o upstream adicionava também arm64e, incompatível com o
simulador e com os caminhos previstos do XCFramework. O deployment macOS usa
as flags do compilador em `extra_cflags/extra_asmflags/extra_ldflags`.

## Estado da migração

### Diagnóstico de abertura no iPad

O registro recebido da build 98 (1.0.0), iPad6,12 com iOS 16.7.16, identifica
SIGABRT/DYLD `Library missing`: o executável exige SwiftUICore.framework,
ausente nesse sistema. A falha ocorre antes de executar a interface e o áudio.
O mesmo registro lista Capacitor.framework e Cordova.framework no pacote antigo;
não corresponde ao target atual sem essas dependências. Isso não demonstra
que o motor de áudio ou a WebView tenha provocado este encerramento.

Debug e Release agora explicitam `-weak_framework SwiftUICore`, mantendo
`$(inherited)` para não perder as flags Skia, e o deployment target iOS 15.
O verificador usa `otool -l` no archive e na IPA efetivamente exportada: rejeita
SwiftUICore obrigatório em qualquer binário, dependências web, executável ausente,
plataforma de simulador/macOS e mínimo acima de iOS 15.0. Testes simulam os
comandos Mach-O da falha e a ligação opcional. Windows não valida a execução
Apple. Após essas correções, o usuário confirmou que uma build posterior abriu
no iPad, com áudio do B3, FX e pads. Isso não substitui testes dos demais fluxos
nem valida alterações posteriores a essa build.

A entrada `startWithBufferFrames` agora trata exceções Objective-C do grafo
Core Audio e exceções C++ recuperáveis, além dos NSError já tratados. A UI
pode apresentar a etapa/motivo e tentar novamente. Isso não captura aborts,
acessos inválidos, falhas anteriores ao início do áudio nem encerramentos
por memória (Jetsam). Não é uma confirmação de correção do crash relatado.
O console registra as etapas com `[BronzeStartup]`, incluindo SF2 e grafo.

O Actions guarda `Bronze-Keys-iOS-diagnostics` por 30 dias com o resultado
Xcode, Info.plist e dSYMs, separado do IPA distribuído. Para investigar,
usar o `.ips` e os dSYMs **da mesma build**; um simulador recente não
substitui o teste no iPadOS 16. No dispositivo, procurar o registro do app
ou JetsamEvent em Ajustes > Privacidade e Segurança > Análise e Melhorias
> Dados de Análise.

A interface nativa ainda não tem paridade funcional com o app anterior.
A remoção do fallback web foi solicitada antes da paridade. Recursos ainda
não migrados não voltam pela tela antiga; precisam de implementação nativa.
A remoção das dependências web não confirma a causa do crash no iPadOS 16.

Interface do player restaurada em SwiftUI/UIKit: barra de transporte, mixer de
cinco saídas, oito módulos, bancos A–F, 16 cores de presets, teclado, Pads/FX,
playlist (inclusive lateral ao segurar a marca), biblioteca, configurações,
perfil e backup. A fonte JetBrains Mono ExtraBold acompanha sua licença OFL.
Os controles usam o motor C++ existente; nenhuma página web é embarcada.
Login permanece em retrato. Depois da autenticação, o carregamento aguarda o
motor e precede as boas-vindas com digitação incremental do nome.

Preferências locais de teclado, Lite, MIDI, buffer e troca sem corte ficam no
UserDefaults. Volumes, mute, roteamento de saídas, oitava e transpose globais
ficam no workspace da sessão/backup, com defaults para arquivos anteriores.

Implementado nesta etapa:

- ON/OFF e Solo dos oito módulos usam um comando C++ único que altera somente
  a admissão de novas notas. Mantém caudas, note-off e pedal sustain. Sair de
  Solo restaura os ON/OFF anteriores.
- Biblioteca local User nos módulos 1–6: importação pelo seletor de documentos,
  cópia privada de SF2, nome automático do arquivo e seleção sem JavaScript.
  Arquivos e atribuições aos módulos permanecem no dispositivo.
- Seleção e transporte dos três Beats fixos, loop contínuo, velocidade relativa
  a 120 BPM e progresso. Cada Play parte do início. O click roda silencioso
  enquanto o loop toca; ON/OFF muda o volume sem reiniciar a fase. O início
  do loop solicita o reset do click no callback de áudio.
- Dois bancos de pads contínuos, filtros Low/High em knobs Skia e notas
  relativas menores. Os FX Church não redisparam ao mover o dedo durante um toque.
- Bancos A–F com 16 posições, salvar/renomear/cor e seleção com borda RGB
  pulsante (respeita Reduzir Movimento). Segurar abre o menu de edição; substituir
  um preset existente exige confirmação. Os snapshots guardam SF2, ON/OFF,
  faders, envelopes, EQ, reverb, Delay, Compressor, Chorus, Vibes, Pulse e
  controles do Synth disponíveis na UI, não efeitos ainda não migrados.
- Sessão local em Application Support/BronzeKeys/native-session.json, escrita
  atômica fora da thread principal, com debounce. Guarda também Solo, BPM,
  compasso/click, filtros/banco dos pads e seleção do loop. Ao reabrir não toca
  automaticamente notas, loops ou click. SF2 usa UUID/nome relativo ao sandbox.
- Drawbars, Brake/Slow/Fast, velocidades, aceleração, profundidade e Gabinet são globais, fora dos presets. Os dados são
  validados antes de restaurar; falha suspende autosave para não sobrescrever o
  arquivo anterior. Uma troca que falha cancela a camada preparada no C++, sem
  cortar o preset atual. Sustain continua sendo propagado pelo runtime.
- EQ nativo por módulo: cinco bandas, ON/OFF explícito, Bell/Shelves/Cuts,
  frequência, ganho, Q e inclinação dos cortes. Os pontos editam frequência e
  ganho durante o arraste, sobre uma curva de resposta calculada com as mesmas
  fórmulas da interface anterior. Knobs nativos e botões +/− com repetição moderada; Gain/Q
  ficam indisponíveis nos cortes, cuja inclinação determina os polos.
  `setModuleEqualizer` altera exclusivamente o EQ, preservando rotary e demais
  efeitos. Usa a suavização de coeficientes já existente no DSP. Reset exige
  confirmação e restaura somente o EQ. Estado incluído na sessão e presets.

- Reverb por convolução nos oito módulos: Room 1, Room 2, Hall 1 e Hall 2,
  cada um com Mix e Decay independentes, ON/OFF e selo Convolution. Knobs Skia
  e +/− de 1 ponto percentual. Sessão e presets guardam os quatro Mix/Decay e
  a seleção. Decay vai de 10% a 100% da duração do IR: 100% mantém exatamente
  o arquivo original; abaixo disso o IR é encurtado com fade cosseno no quarto
  final da cauda mantida, sem reamostragem nem mudança de afinação. Não é RT60
  em segundos e não estende o IR além da duração gravada.
  A preparação dos IRs acontece na fila de controle, fora da thread da UI e
  do callback de áudio. Arrastes acumulam apenas o último valor pendente por
  módulo; falhas restauram o último ajuste confirmado. Trocar/salvar presets
  aguarda o término dessa fila. O comando dedicado preserva EQ, rotary e
  demais efeitos, usando a suavização de Mix existente no DSP.
  Cada IR guarda somente a versão mais recente de Decay. Ponteiros protegidos
  mantêm a versão em reprodução até a troca; versões antigas são recolhidas
  na thread de controle, sem alocação/liberação nem espera no callback. A troca
  reinicia o histórico do IR, assim como a troca Room/Hall; a transição precisa
  também de avaliação auditiva no dispositivo. Faders/EQ enfileiram configurações
  já preparadas e não disputam o mutex que monta a nova convolução.
- Delay nativo nos oito módulos: ON/OFF, Sync, Tap, sete divisões (incluindo
  pontuada e tercina), Feedback, Mix e tempo manual de 1 a 2000 ms. Knobs Skia
  e +/− com repetição; tempo avança 10 ms abaixo de 1 s e 100 ms acima.
  Sync usa BPM fracionário e preserva o tempo manual. A divisão multiplica
  tanto o tempo manual quanto a batida em Sync; o display de eco respeita
  o limite de 4 s da linha C++. Estado incluído na sessão e presets. Preparação
  e ajustes coalescidos usam a fila de controle, sem substituir outros efeitos.

- Compressor, Chorus e Vibes têm editores nativos, knobs Skia e +/− com
  repetição. Vibes usa Rate, Amount de 0 a 100 cents, Vinyl ON/OFF e ruído
  de −36 a 0 dB, sem Mix. Desligar Vibes desliga também o vinil. Compressor
  e Vibes são recusados no B3 tanto na UI quanto no comando C++ dedicado.
  O comando preserva EQ, Rotary, Reverb, Delay e Pulse; alterações são
  coalescidas na fila de controle e participam da sessão e dos presets.
- Editor Synth: OSC 1/2/3, quatro formas de onda, ON/OFF, volume independente,
  Detune, oitava, Poly/Mono/Legato, Cutoff, Resonance, Filter Env, LFO e Glide.
  Página OSC selecionada tem destaque animado. Envelope usa a página já
  existente e a configuração do synth é salva somente no módulo 8. O envio
  de synth preserva os valores atuais do envelope, e restauração aplica o
  synth na camada preparada antes de confirmar a troca.
- Pulse nativo nos oito módulos: 16 passos, comprimento, Gate, Depth, Attack,
  Release e Swing; Rate livre 20–2000 ms ou oito divisões discretas em Sync.
  Sync usa o compasso do metrônomo. Atualizar BPM reaplica a conversão de ms
  dos Pulses livres, preservando seu tempo. Sessão/preset guardam o padrão.
  O limite C++ foi ampliado para representar todo o Rate livre entre 60 e
  300 BPM, sem encurtar 2000 ms ou alongar 20 ms silenciosamente.

- Arpeggiator executado na thread de áudio C++, sem temporizador da UI:
  Up, Down, Up/Down, Played e Random, 1–4 oitavas, Gate, Swing e oito divisões
  em Sync; Rate livre de 20–2000 ms. Em Sync reinicia a sequência no compasso
  do metrônomo. Auto Fader acompanha 1/1 ou 1/2 desse compasso e fica inativo
  quando o Arpeggiator está desligado. B3 não oferece Arpeggiator.
  Sustain mantém as teclas de origem, sem segurar as vozes geradas e sem
  deixar o acorde polifônico passar. Estado físico do pedal é lembrado por
  entrada e canal MIDI, incluindo a transferência para novos presets.
- Config nativa por módulo: entrada MIDI, faixa de notas, oitava, polifonia,
  modos Poly/Mono/Legato quando disponíveis, sustain/modulação, canal de saída
  e Stereo/Mono. Velocity oferece presets, cinco pontos, No Sens e limites.
  Modulação tem seleção de modo, Rate e intensidade; Glide dos SF2 tem tempo,
  Sync, Auto/Portamento e gate por velocity. B3 mantém Wheel Rotary disponível
  e No Sens obrigatório. O Synth usa seu próprio editor de LFO/Glide.
- Filtro dos SF2: LP12/LP24/HP12/HP24, Cutoff, curva de velocity e envelope
  ADSR/Depth. Gain de −36 a +12 dB em todos os módulos. Comandos dedicados
  preservam efeitos, fader e ON/OFF; todos os novos parâmetros participam da
  sessão e dos snapshots. Knobs Skia com +/− e repetição.

Implementados nesta etapa, ainda sem validação em Xcode/dispositivo:
presets próprios do synth; conta com Keychain e catálogo com download manual;
playlists normais e de loops do usuário; edição/importação dos bancos FX;
MIDI Learn com limites e modo compatibilidade; backup local UserBK em streaming
com verificação de integridade antes da restauração. Os testes de sessão e
workspace usam Foundation nos hosts com Swift; os testes do backup exigem
CryptoKit e são obrigatórios no CI macOS.

Catálogo nativo: categorias/timbres respeitam a ordem do backend com desempate
estável; IDs duplicados, hashes e metadados inválidos são recusados. A versão
instalada e a chave do objeto acompanham a sessão e o backup. Um SF2 atualizado
oferece botão Atualizar sem apagar a versão referenciada por presets anteriores;
a seleção da cópia existente continua disponível offline. Importação concluída
ou recusada limpa a cópia temporária do download, sem remover documentos do
usuário. Respostas de catálogo/download/validação de sessão de uma conta anterior
não podem reativar essa conta depois de logout. Os testes de parsing e atualização
fazem parte da fixture Foundation, sem exigir CryptoKit no Linux.
Esta etapa não converte nem aplica `moduleSettings`/`defaultSettings` do catálogo:
a escolha de timbre ainda preserva os ajustes atuais do módulo.

Ainda pendentes: validação de todos esses fluxos na IPA, paridade completa das
configurações do catálogo/backend e da interface anterior, e host nativo macOS.
A preparação do Skia macOS não cria, por si só, um app macOS nativo. Model,
importação/exportação e controles também precisam de adaptação de plataforma.
Não considerar a migração concluída enquanto essas etapas não forem verificadas.

O Release baixa por nome apenas Bronze-Keys-Android e Bronze-Keys-iOS. O artifact
Bronze-Keys-iOS-diagnostics fica separado, com dSYM e resultado do archive para
investigar falhas. O diagnóstico da build 98 e a correção de ligação estão na
seção de abertura acima; aprovação dos testes locais não demonstra que a nova
IPA iniciou no aparelho.

Validação local: testes do motor C++ compilados em Windows/MSVC, testes Node
e receita Skia simulada. Compilação Swift/Objective-C++, desenho Skia real,
gestos e sincronismo audível precisam ser verificados em Xcode/IPA e iPad.
`test-native-session.mjs` compila e executa testes Foundation com `swiftc` no
Linux e no macOS. Somente no macOS inclui `BronzeNativeBackup.swift` e executa
os testes CryptoKit: o runner exige o marcador de conclusão do backup e falha
se ele não executar. No job Android/Linux, não tenta importar o SDK Apple e
informa que apenas o backup foi omitido. Em máquinas não Apple sem Swift,
registra explicitamente que nenhuma fixture Swift executou. Falta de Swift no
macOS, falha de compilação ou de execução continuam bloqueando o Release.
O teste de integração Xcode rejeita UUIDs duplicados: `BronzeNativeSession.swift`
não pode compartilhar o identificador de `common.xcconfig`. A validação SwiftUI
completa ainda exige a build Apple; testes de texto não substituem o compilador.
