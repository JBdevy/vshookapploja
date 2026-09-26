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

### Controles e organização dos editores

Toque curto e toque longo dos bancos, logo, teclado, timbres, metrônomo e
MIDI Learn de botões usam um único par de reconhecedores UIKit. Um hold
concluído não executa a ação de toque ao soltar. Sliders e teclas de performance
mantêm seu tratamento próprio; o host dá prioridade ao toque na borda inferior
quando autenticado. A latência percebida precisa ser conferida no iPad físico.

EQ mantém o gráfico acima de Q/tipo de banda dentro do mesmo card. Velocity
abre apenas a curva e seus limites, com memória separada de User e Fixed;
Glide e Mod conservam seus próprios controles. Pulse distribui os 16 passos
e os seis parâmetros pela área disponível. Organ reserva mais altura aos
drawbars, e Synth usa cinco presets inline, com edição por toque longo.
Presets nativos antigos permanecem preservados no arquivo de sessão.

Menus de saída derivam os canais da rota AVAudioSession e mantêm a instância
UIKit durante atualizações dos medidores. MIDI apresenta somente os três
seletores de dispositivo. RAM exibe a porcentagem de memória ativa, wired e
comprimida do aparelho, excluindo cache inativo. Nenhuma destas telas usa WebView.

### Referência visual compartilhada com Android — 25/09/2026

O Android permanece em WebView. A referência dos ajustes Apple é o código atual
de `src/features/player`, `src/features/tracks` e as regras finais de `styles.css`.
Não substituir essa referência por capturas de versões antigas nem alterar o
Android para acomodar diferenças da implementação nativa.

Os editores Apple agora distribuem os cards pela altura disponível, limitando o
tamanho dos knobs sem reduzir a página inteira. Envelope usa duas linhas de
quatro posições; EQ mantém o gráfico e os cinco controles de banda no mesmo
card, sem Velocity/Glide/Mod abaixo. Efeitos preservam suas cores, divisões e
ações inferiores. Delay reserva espaço para Tap e divisões; Reverb conserva o
Decay solicitado. Config do Glide apresenta o limite de velocity e Inverter;
o filtro apresenta curva arrastável e os controles de Env-Filter. As telas
principais de Organ e Synth não foram redesenhadas nesta revisão.

MIDI mantém três dispositivos em duas colunas. Áudio usa duas colunas e quatro
linhas, com saídas calculadas a partir da rota real do AVAudioSession. Biblioteca
mantém grade 4×4, preview antes do download, Baixar tudo, tamanho e quantidade de
timbres; nomes usam o contraste preto da referência. O gerenciador de músicas
tem All, Add música e criação de playlists normais ou de loop selecionando os
áudios importados. `libraryTracks` é opcional para sessões antigas; playlists
compartilham arquivos por chave, e apagar uma playlist preserva a biblioteca.
Backups também validam arquivos que existem somente em All.

Meters usam a escala de dB e a queda temporal da referência. A suavização é
apenas visual, sem mudar o ganho do áudio. Testes Swift cobrem compatibilidade
das sessões, seleção de All, deduplicação e independência da taxa de atualização
dos meters. Build de dispositivo e inspeção Mach-O validam compilação, mínimo
iOS 15 e ausência de imports diretos de SwiftUICore; isso não substitui a
conferência visual e de toque no iPad/iPhone físicos.

Na revisão seguinte, a logo passou a alternar os 30% com toque simples; o
transporte abre o gerenciador e a tela intermediária de versão foi removida.
O breakpoint vertical depende apenas da altura da tela, não da playlist aberta.
Limite Velocity permanece no Envelope; o editor da curva mantém seu limitador
de saída, que é outro parâmetro.

Knobs abrem um painel nativo transparente com dial, slider vertical relativo e
botões +/− com repetição. Abrir o painel não escreve no parâmetro. Inatividade
por dois segundos ou toque fora fecha o painel; segurar o slider/botões pausa
esse prazo. A apresentação UIKit evita a conversão em sheet no iOS 15/16.

Downloads usam URLSessionDownloadTask com delegate da sessão e arquivo em disco.
O adaptador async com delegate por tarefa não entregou callbacks intermediários
no teste local, por isso foi substituído. Há barra do arquivo, bytes/percentual,
barra geral por quantidade de timbres e erros dentro da biblioteca/preview.
Respostas inválidas, falhas de tamanho/integridade e indisponibilidade do
salvamento não encerram mais a ação sem uma mensagem visível.
Teste local HTTP verificou 1 MiB, progresso intermediário e cancelamento;
o download autenticado de produção ainda exige confirmação no aparelho.

O relato posterior confirmou que o arquivo havia baixado, mas continuava marcado
como não instalado. A consulta do catálogo passou a usar `UUID/arquivo.sf2`, a
mesma chave persistida na sessão, em vez da igualdade entre URLs completas;
aliases `/var` e `/private/var` e mudanças do contêiner após instalar o app não
alteram essa identidade. Entradas de SF2 também normalizam seus URLs na leitura.
O teste de regressão cobre aliases, troca de contêiner e arquivos homônimos em
pastas diferentes. A biblioteca usa quatro colunas e altura fixa de 40/46 pontos
por botão, conforme o CSS atual, sem esticar quatro linhas pela altura da tela.

Com os 30% abertos, o botão Pads–Effects usa a legenda FX e as dimensões do
metrônomo. Os cinco buses mostram nome acima do knob/meter e valor abaixo,
mantendo a altura do cabeçalho e dos módulos. Sem a playlist lateral, a legenda
completa e a distribuição horizontal anterior são mantidas.

O teclado visual agora recebe também Note On/Off do controlador, com estado por
dispositivo/canal: soltar uma nota em um controlador não apaga a mesma nota ainda
pressionada em outro. Canal 10 continua reservado aos Pads/FX. Panic, reconexão,
logout e CC120/123 limpam os destaques correspondentes; o modo Lite continua sem
iluminação. Esse caminho não reenvia notas ao áudio.

A queda visual dos meters segue os 3 dB por 90 ms da versão web móvel, calculada
pelo tempo decorrido (antes eram 90 dB/s). Download ativo substitui a área de
transporte por nome, contador x/x e progresso do arquivo; ao encerrar, o transporte
retorna. O último timbre instalado pulsa na biblioteca até tocar em outro timbre,
com destaque estático quando Reduzir Movimento ou Lite estão ativos.

Buffer Size mantém a preferência escolhida e exibe separadamente as amostras e
milissegundos efetivos reportados por AVAudioSession após a mudança e na troca
de rota. Uma preferência aceita pela API não garante que a rota use esse valor.

Snapshots nativos adiam a preparação dos efeitos copiados até aplicar os efeitos
do destino, evitando construir primeiro a IR do preset anterior. A API comum
mantém o comportamento anterior por padrão. Os testes C++ comparam áudio amostra
por amostra entre a preparação anterior e a adiada, incluindo caudas, bypass,
mudança de IR/Decay e cancelamento. Testes Swift cobrem notas MIDI sobrepostas e
a velocidade dos meters. Build de desenvolvimento para teste físico compilada
com otimização C++/Swift; sensação de latência e aparência precisam ser conferidas
com o controlador e os timbres reais no aparelho.

A investigação seguinte usou a sessão real do iPad: sem corte estava ativo, mas
S6 Grand (260.942.190 bytes) e Felt Upright (226.943.806 bytes) excediam o teto por
banco do cache fixo de 384 MiB (metade desse orçamento), causando releitura a cada
alternância. O host iOS agora informa aproximadamente 1/4 da RAM física,
arredondado para cima em blocos de 64 MiB e limitado a 128–768 MiB;
no iPad de 2 GiB são 512 MiB, suficientes para os dois bancos, com amostras
compartilhadas entre cache e vozes.

Com sem corte ativo, os SF2 dos presets do banco selecionado são preparados em
uma fila separada ao restaurar a sessão, selecionar banco, salvar preset ou
ativar a opção. O carregamento preventivo não muda o preset ativo, não segura o
mutex de configuração durante leitura e não remove outro timbre pronto para
abrir espaço. Lite/desativar sem corte cancelam a sequência. Uma indicação de
carregamento só aparece se a operação ultrapassar 300 ms, evitando um flash nas
trocas já prontas.

Teste C++ carrega dois bancos preventivamente, remove os arquivos temporários e
confirma seis alternâncias pelo cache; verifica limite, ausência de áudio na
preparação e liberação ao desligar sem corte. Teste offline no Mac com os dois
SF2 reais mediu 31–76 ms no caminho antigo versus 0,63–0,70 ms na preparação da
camada/carga/commit com cache aquecido. Isso não mede a latência física do iPad
nem toda a apresentação SwiftUI. O primeiro preparo e bancos fora do orçamento
ainda exigem leitura; a fila antecipada reduz essa espera durante o uso normal.


### Mac Catalyst e controles de configuração (25/09/2026)

O target App também compila para Mac Catalyst com as mesmas telas SwiftUI/UIKit
usadas no iPad e o mesmo motor C++. `Abrir Bronze Keys no Mac.command` compila
Release assinado para uso local, instala em `~/Applications/Bronze Keys.app` e
abre o app, sem publicar no Git. Exige a conta de desenvolvimento no Xcode.
O Keychain do Catalyst usa entitlement próprio e perfil de desenvolvimento;
a execução de diagnóstico confirmou gravação/leitura e saída de áudio ativa.
Esta compilação usa os controles CoreGraphics nativos; a biblioteca Skia macOS
existente não é um slice Catalyst. O fluxo Tauri e seus artifacts de release
continuam separados desta compilação nativa local.

Clique direito substitui o long press nos controles de edição no Mac. Pads FX
só oferecem mapeamento MIDI em Edit. A lateral de playlist no Mac mantém todos
os controles, sem usar a compactação do iPad. Os cinco knobs de buses usam
sempre título acima e valor abaixo.

Configurações expõe Keyboard com MIDI 1/2/3 e Default/Black/Bronze. A entrada
selecionada determina o roteamento e a iluminação do teclado; sem dispositivos,
a entrada virtual continua tocando todos os módulos. Note-off preserva a entrada
do note-on, inclusive se um dispositivo desconectar. Lite e Compatibilidade usam
a área inteira do card como botão, mantendo o estado persistente e sua aplicação
ao motor. Compilação iOS 15+, verificação de bundle e testes de sessão passaram;
a validação final de toque físico fica no aparelho.

No Mac, Tab e Shift+Tab percorrem explicitamente os campos de cada etapa do
login (incluindo senha visível/oculta); o comando é desativado após autenticar.
O cabeçalho do player usa 56 pontos de altura e botões OCT/TRS/Stereo/Panic
de largura igual, adaptada à janela (64–100 pontos), com fonte de 13 pontos.
O transporte ocupa o espaço restante. As dimensões do iPad não mudam.

Meters: a interpolação visual agora acompanha os 90 ms lineares do CSS atual,
com verde #00e568–#79f52a até 76,7%, amarelo #ffe633 até 88,3% e laranja
#ff981a no topo. A paleta foi intensificada a pedido do usuário e o sombreado
lateral reduzido para não apagar barras estreitas. As cores permanecem fixas na
escala; somente a janela de nível se move. Mantido o polling de áudio a 30 Hz.

No Catalyst, os presets e o teclado de 88 teclas permanecem juntos (presets acima),
inclusive na página de Pads/Effects. O botão de alternância fica somente no
iPhone/iPad. Modulation recupera o preenchimento proporcional laranja
#e95b08–#ffad45; Pitch continua com retorno ao centro. Ambos os botões móveis ocupam toda a
largura do trilho, sem recuo lateral.

Na troca de preset, a faixa de módulos bloqueia hit testing enquanto aplica
o snapshot, em vez de propagar `disabled` aos controles. Isso preserva as
cores e elimina o flash cinza do estilo desabilitado durante a troca.

Config MIDI: os knobs abrem o Learn específico via clique direito no Mac e
long press no iPad; clique normal mantém o ajuste com slider/−/+. Inclui
Envelope, Filter, Reverb, Delay, processadores, Arp, Pulse, Mod, Glide, Rotary
e Synth. Foram registrados os targets adicionais e seus destinos no motor.
O modal compacto oferece badge CC/NOTE, estado, Clean com confirmação e OK;
contínuos têm Inverter e duas alças de limite. Captura MIDI é provisória até OK;
Voltar descarta sem alterar a configuração persistida. O editor de preset tem
nome, prévia, paleta, Learn CC/Clean e Voltar/OK.

Validação: fixture de sessão cobre persistência dos novos targets e extremos
invertidos; o smoke nativo Catalyst injeta callbacks MIDI na sessão de teste e
verifica captura sem salvar, cancelar, confirmar, limite invertido aplicado ao
Attack e captura Note cancelada sem alterar mapeamentos. Log:
MIDI_DRAFT_CANCEL_CONFIRM_RANGE_AND_ROUTING_OK. Capturas da própria janela
confirmaram os modais sobre o player e as 88 teclas abaixo dos presets.

Atualização de paridade — 25/09/2026:
- Catalyst aplica Buffer Frame Size no Core Audio e mostra a leitura efetiva.
  RemoteIO segue a saída padrão quando não expõe CurrentDevice. Troca preserva
  runtime/SF2; recusa aparece em Config. Smoke confirmou 64/128/256/512 e restaurou
  o valor anterior.
- Organ gira volume/estéreo/balanço das bandas sem Doppler, atrasos móveis ou
  filtro de fase modulada. Slow/Fast a Depth máximo mediram menos de 1 cent nas
  senoides de 220, 800 e 2500 Hz. Demais rotarys preservam processamento anterior.
- FX: pads contínuos menores, slider individual abaixo de cada efeito, ganho
  das vozes em andamento com rampa e editor sem knob de volume. Editor/Mapear
  exige Edit. Church mantém nomes de fábrica.
- Config: Default/User alinhados, polifonia numérica 1–128, MIDI por dispositivo,
  saída Padrão seguindo bus Módulos, Portamento ligado a Mono/Poly e Sync seguindo
  os limites de BPM da referência web.
- Clique contextual Catalyst usa UIContextMenuInteraction nos controles tap/hold.
  Transporte: toque abre playlists; hold/clique direito abre posição com agulha.
  Play respeita posição escolhida quando parado. Presets inativos ficam cinza;
  cor salva aparece apenas no selecionado, no nativo e web.

Android/Windows permanecem WebView. Fonte compartilhada ganhou sliders FX
(ajustam vozes já tocando e salvam por banco), logo abre/fecha 30%, transporte
abre gerenciador e preserva hold/clique direito da agulha. Decay do Reverb
10–100% guarda cauda independente nos quatro ambientes de convolução. O campo
legado reverbDecay do bridge web entrega essa fração à propriedade tail em
Android/Windows. Sem valor salvo, 100% preserva a IR completa.
Validação: test-performance-parity.mjs cobre volume em execução/isolamento de
bancos, Decay por ambiente e gestos do transporte. TypeScript, Vite, testes de
sessão e motor C++ passaram. Assets copiados para Android; APK/Windows não foram
empacotados neste Mac. Nativo instalado no iPad via USB e em
~/Applications/Bronze Keys.app; sem Git push ou acompanhamento de CI.

Transporte contextual: no Catalyst, marcador da área do transporte instala
UITapGestureRecognizer com buttonMaskRequired=.secondary na janela e filtra
pela área visível. Isso evita depender do menu contextual e de acertar apenas
o texto. Nome e relógio mantêm clique primário para playlists; Play/Stop mantém
sua ação primária. Modal da agulha abre também vazio com orientação para escolher
música. iOS mantém hold no conjunto nome/relógio. Web Windows recebe contextmenu
em toda .track-transport. Teste DOM despacha botão direito sobre nome, relógio e
Play e confirma abertura sem disparar reprodução; clique no relógio abre lista.

Drawbars nativas espelham OrganView.ts/styles.css atuais: régua com laterais
claras e centro preto revelada apenas acima da ponteira, mesma ordem numérica
do markup web, cores #7a1f1f/#c7c7c7/#17161a e base arredondada. Dezesseis LEDs
quadrados verdes, dois por estágio, acendem de cima para baixo. Web já tinha
esse comportamento e permanece como referência.

Bancos A–F: apenas o banco selecionado usa a paleta colorida; inativos usam
cinza neutro (#616161/#424242), tanto no nativo quanto na WebView compartilhada
por Android/Windows. Drawbars nativas agora respeitam o limite de 760 pt de
largura, espaçamento de 1–3 pt e teto de altura de 470 pt da referência CSS;
ponteira e LEDs têm proporções compactas no celular. VST3 não faz parte do escopo.

Na tela Pads/Effects, presets e teclado ficam ocultos também no Mac; retornam
ao voltar aos módulos. Pads 1 e Pads 2 ficam empilhados, com Low/High lado a
lado abaixo deles, no nativo e na WebView. Cada módulo nativo volta a ter
contorno bronze de 1,5 pt com opacidade 78%, conforme a referência web.
Os nomes dos presets e dos bancos inativos usam sua cor sobre o fundo cinza;
selecionados mantêm o fundo colorido. A coleção incluída se chama Loops Gospel.
Segurar os knobs de Playlist a Módulos (clique direito no Mac) abre o
mapeamento MIDI; o menu de ligar/desligar saída foi removido desses controles.
O modal do metrônomo segue a WebView: A-B, compasso editável, 2x, Click 1–5,
Learn CC ON/OFF e Clean. Acento e tempo duplo são enviados ao motor e salvos
na sessão como campos opcionais, mantendo leitura de backups anteriores.

Playlists de loop (incluídas ou do usuário) substituem Repeat/Auto/Add-BL/Edit
no painel de 30% por Click ON/OFF. ON preserva L/R; OFF envia somente R aos
dois canais, sem somar L e sem reiniciar a faixa. A preferência é salva e não
altera músicas de playlists normais. Selecionar uma playlist de loop desliga
e deixa o metrônomo normal em preto e branco. O toque mostra “Saia da playlist
de loops para usar o metrônomo”; o Play de loops não inicia nem sincroniza seu
relógio. Enquanto um loop toca, MIDI também não pode ligar o metrônomo.
Android/Windows usam o mesmo roteamento no grafo Web Audio. Toggle Rotary
abre Learn no long press/clique direito e conserva Slow/Fast no toque simples.

Repeat/Auto/Add-BL/Edit no painel de 30% usam altura de 48 pt/px no nativo
e na WebView, mantendo os quatro controles na mesma linha.

O gerenciador usa cartões de música retangulares de 44–56 pt, sem esticar
quatro linhas até a altura total. Nomes ficam à esquerda com até duas linhas,
com o mesmo padrão na seleção de músicas para playlists. Pads 1/2 empilhados
usam altura de 32 pt no compacto e 38 pt nas telas maiores.

Desktop: tamanho inicial externo de 1128 × 673 pontos lógicos, medido na
janela do Mac em uso. Catalyst aplica a geometria uma vez por abertura da
janela; Windows desconta bordas/barra de título conforme o DPI ao configurar
a área interna. Redimensionamento durante o uso continua disponível.

Seletor de áudio: Catalyst lista saídas Core Audio com UID/nome/canais,
incluindo USB. O motor RemoteIO segue a saída padrão do macOS (CurrentDevice
retorna -10879); por isso a escolha altera a saída do sistema, informado no
próprio campo. Smoke com o motor compilado enumerou Scarlett 8i6 USB (6 canais)
e alto-falantes internos (2), e confirmou seleção do UID atual sem mudar a rota.
No iPad/iPhone o campo inteiro aciona AVRoutePickerView, com nome/canais da rota
atualizados após mudanças. A seleção de rotas continua sob controle do iPadOS.
A retomada de áudio pausa/reabre o grafo preservando o runtime e os SF2.
